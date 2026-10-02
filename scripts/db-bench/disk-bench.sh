#!/usr/bin/env bash
# scripts/db-bench/disk-bench.sh
#
# Raw storage benchmark shaped like Postgres I/O. Run it ON the database host,
# against the filesystem that holds (or will hold) the data directory, on both
# the current server and the SSD candidate.
#
#   sudo ./disk-bench.sh /var/lib/postgresql/fio-test   [runtime_seconds]
#
# The directory must be on the same mount as PGDATA. It writes one 4 GB test
# file there and deletes it at the end; make sure there is room. Uses
# O_DIRECT so the OS page cache does not flatter the numbers.
#
# What each test stands for:
#   randread  8k qd1   one backend doing a cold index probe / heap fetch. This
#                      is the latency behind "~25 ms per cold random read" in
#                      ChatAudit's partition probes and NLQuotes' cold /api/games.
#   randread  8k qd16  many backends (or a bitmap heap scan with prefetch) at once
#   seqread   1M       a seq scan / VACUUM / pg_dump
#   randwrite 8k qd4   checkpoint + bgwriter flushing dirty pages (ingest, ChatAudit
#                      COPY into 7-index messages partitions)
#   WAL fdatasync 8k   commit latency with synchronous_commit = on (every
#                      NLQuotes analytics INSERT)
set -euo pipefail

DIR="${1:?usage: $0 <dir-on-pgdata-mount> [runtime_seconds]}"
RUNTIME="${2:-30}"
SIZE="${FIO_SIZE:-4G}"
mkdir -p "$DIR"
FILE="$DIR/pgbench-fio.dat"
trap 'rm -f "$FILE"' EXIT

command -v fio >/dev/null || { echo "fio not installed (apt install fio / dnf install fio)"; exit 1; }

echo "host=$(hostname)  dir=$DIR  fs=$(df -hT "$DIR" | awk 'NR==2{print $2" on "$1}')  runtime=${RUNTIME}s"
lsblk -d -o NAME,ROTA,SIZE,MODEL 2>/dev/null || true
echo

run() {
  local name="$1"; shift
  local out
  out=$(fio --name="$name" --filename="$FILE" --size="$SIZE" --direct=1 \
            --ioengine=libaio --time_based --runtime="$RUNTIME" --ramp_time=3 \
            --group_reporting --output-format=json "$@")
  # Pull iops / mean / p99 latency (usec) for whichever direction ran.
  printf '%s' "$out" | python3 -c '
import json, sys
j = json.load(sys.stdin)["jobs"][0]
name = sys.argv[1]
for d in ("read", "write"):
    s = j[d]
    if s["io_bytes"] == 0:
        continue
    lat = s.get("clat_ns") or s.get("lat_ns")
    p = lat.get("percentile", {})
    p99 = p.get("99.000000", 0) / 1000
    sync = j.get("sync", {}).get("lat_ns", {})
    extra = ""
    if sync.get("mean"):
        sp = sync.get("percentile", {})
        extra = "  fdatasync mean %.0f us p99 %.0f us" % (sync["mean"] / 1000, sp.get("99.000000", 0) / 1000)
    print("%-22s %-5s %9.0f IOPS %9.1f MB/s   lat mean %8.0f us  p99 %8.0f us%s" % (
        name, d, s["iops"], s["bw_bytes"] / 1e6, lat["mean"] / 1000, p99, extra))
' "$name"
}

# Lay the file out once so the read tests read real blocks.
fio --name=prep --filename="$FILE" --size="$SIZE" --rw=write --bs=1M --direct=1 \
    --ioengine=libaio --iodepth=8 --output=/dev/null

run "randread-8k-qd1"   --rw=randread  --bs=8k --iodepth=1
run "randread-8k-qd16"  --rw=randread  --bs=8k --iodepth=16
run "seqread-1M"        --rw=read      --bs=1M --iodepth=8
run "randwrite-8k-qd4"  --rw=randwrite --bs=8k --iodepth=4
run "wal-8k-fdatasync"  --rw=write     --bs=8k --iodepth=1 --fdatasync=1 --size=512M

if command -v pg_test_fsync >/dev/null || ls /usr/lib/postgresql/*/bin/pg_test_fsync >/dev/null 2>&1; then
  echo
  echo "--- pg_test_fsync (what Postgres itself sees for WAL flushes) ---"
  PTF=$(command -v pg_test_fsync || ls /usr/lib/postgresql/*/bin/pg_test_fsync | tail -1)
  "$PTF" -s 5 -f "$DIR/pg_test_fsync.tmp" | sed -n '/Compare file sync methods using one 8kB write/,/^$/p'
  rm -f "$DIR/pg_test_fsync.tmp"
fi
