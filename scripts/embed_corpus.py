"""
Batch-embed the quotes corpus with Voyage voyage-3-large (1024-dim).

Intended to run on Google Colab (or anywhere with internet + Python).

SETUP (Colab):
    1. Runtime -> change to CPU (GPU not needed; this is all API-bound)
    2. Add two secrets under the key icon in the left sidebar:
         - DATABASE_URL   (full postgres:// URL to your NLQuotes DB)
         - VOYAGE_API_KEY
    3. Run this cell:

        !pip install -q voyageai psycopg2-binary tqdm
        !curl -o embed_corpus.py https://raw.githubusercontent.com/<you>/<repo>/<branch>/scripts/embed_corpus.py
        # or just paste the file contents into a cell

        from google.colab import userdata
        import os
        os.environ["DATABASE_URL"]   = userdata.get("DATABASE_URL")
        os.environ["VOYAGE_API_KEY"] = userdata.get("VOYAGE_API_KEY")

        !python embed_corpus.py

PRE-FLIGHT (run these once in psql BEFORE starting the job):
    CREATE EXTENSION IF NOT EXISTS vector;

    -- if your column already exists as vector(1024), just wipe it:
    UPDATE quotes SET embedding = NULL;

    -- if dim is wrong or column type is off, recreate it:
    -- ALTER TABLE quotes DROP COLUMN IF EXISTS embedding;
    -- ALTER TABLE quotes ADD  COLUMN embedding vector(1024);

The script is resumable: it only embeds rows where embedding IS NULL, so
you can stop it any time and restart — it picks up where it left off.

After it finishes, build an ANN index for fast query-time lookups:
    CREATE INDEX IF NOT EXISTS quotes_embedding_hnsw
        ON quotes USING hnsw (embedding vector_cosine_ops);
"""

import os
import sys
import time
import math
import psycopg2
import psycopg2.extras
import voyageai
from tqdm import tqdm

MODEL       = os.environ.get("EMBEDDING_MODEL", "voyage-3-large")
BATCH_SIZE  = int(os.environ.get("BATCH_SIZE", "64"))   # texts per API call
FETCH_SIZE  = int(os.environ.get("FETCH_SIZE", "2000"))  # rows per DB fetch
MAX_CHARS   = int(os.environ.get("MAX_CHARS", "8000"))   # hard cap per text
MAX_RETRIES = 6

DATABASE_URL   = os.environ["DATABASE_URL"]
VOYAGE_API_KEY = os.environ["VOYAGE_API_KEY"]

vo = voyageai.Client(api_key=VOYAGE_API_KEY)


def to_vector_literal(vec):
    # pgvector text format: "[v1,v2,...]"
    return "[" + ",".join(f"{x:.6f}" for x in vec) + "]"


def embed_with_retry(texts):
    """Call Voyage with exponential backoff on transient errors."""
    delay = 2.0
    for attempt in range(MAX_RETRIES):
        try:
            result = vo.embed(texts, model=MODEL, input_type="document")
            return result.embeddings
        except Exception as e:
            msg = str(e)
            is_rate = "429" in msg or "rate" in msg.lower()
            is_5xx  = any(code in msg for code in ("500", "502", "503", "504"))
            if attempt == MAX_RETRIES - 1 or not (is_rate or is_5xx):
                raise
            print(f"  [retry {attempt+1}/{MAX_RETRIES}] {msg[:120]} — sleeping {delay:.1f}s")
            time.sleep(delay)
            delay = min(delay * 2, 60.0)
    raise RuntimeError("unreachable")


def main():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM quotes WHERE embedding IS NULL")
        remaining = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM quotes")
        total = cur.fetchone()[0]

    print(f"Corpus size: {total:,} rows")
    print(f"To embed:    {remaining:,} rows (resumable — skips rows with non-NULL embedding)")
    print(f"Model:       {MODEL}")
    print(f"Batch size:  {BATCH_SIZE} per API call, {FETCH_SIZE} per DB fetch")

    if remaining == 0:
        print("Nothing to do.")
        return

    pbar = tqdm(total=remaining, unit="row", smoothing=0.02)

    while True:
        # Pull a chunk of rows needing embeddings. Ordering by id gives a
        # stable resume point and plays nice with an index scan.
        with conn.cursor(name="embed_cursor") as cur:
            cur.itersize = FETCH_SIZE
            cur.execute(
                "SELECT id, text FROM quotes "
                "WHERE embedding IS NULL AND text IS NOT NULL AND length(text) > 0 "
                "ORDER BY id "
                f"LIMIT {FETCH_SIZE}"
            )
            rows = cur.fetchall()

        if not rows:
            break

        for i in range(0, len(rows), BATCH_SIZE):
            chunk = rows[i:i + BATCH_SIZE]
            ids   = [r[0] for r in chunk]
            texts = [(r[1] or "")[:MAX_CHARS] for r in chunk]

            vectors = embed_with_retry(texts)

            # Write back in one round-trip using UPDATE ... FROM (VALUES ...)
            payload = [(id_, to_vector_literal(v)) for id_, v in zip(ids, vectors)]
            with conn.cursor() as wcur:
                psycopg2.extras.execute_values(
                    wcur,
                    "UPDATE quotes AS q SET embedding = v.emb::vector "
                    "FROM (VALUES %s) AS v(id, emb) "
                    "WHERE q.id = v.id",
                    payload,
                    template="(%s, %s)",
                    page_size=len(payload),
                )
            conn.commit()
            pbar.update(len(chunk))

    pbar.close()
    conn.close()
    print("Done. Now build the ANN index:")
    print("  CREATE INDEX IF NOT EXISTS quotes_embedding_hnsw")
    print("      ON quotes USING hnsw (embedding vector_cosine_ops);")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted — safe to re-run; job is resumable.")
        sys.exit(130)
