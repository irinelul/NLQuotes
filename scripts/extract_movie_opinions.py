"""
Stage 2 of the movie-recommendation pipeline.

Reads candidate quotes (JSONL from collect_movie_candidates.py) and runs
each one through a local Qwen3-14B served by LM Studio, asking for a
structured opinion blob: { movie_title, sentiment, rating, tags, comparison }.

LM Studio's OpenAI-compatible API supports JSON-schema-constrained output,
so the model cannot drift off-format.

Setup:
    pip install httpx tqdm
    # Start LM Studio's local server (default http://127.0.0.1:1234)
    # Load Qwen3-14B (Q6_K is plenty), enable Structured Output

    python scripts/extract_movie_opinions.py \\
        --in candidates.jsonl --out extractions.jsonl

Resumable: skips ids already present in the output file.
"""

import argparse
import json
import os
import sys
import time
import httpx
from tqdm import tqdm

LMSTUDIO_URL = os.environ.get("LMSTUDIO_URL", "http://127.0.0.1:1234/v1")
MODEL        = os.environ.get("LMSTUDIO_MODEL", "qwen/qwen3-14b")
TIMEOUT      = float(os.environ.get("REQUEST_TIMEOUT", "120"))

EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "movie_title": {
            "type": ["string", "null"],
            "description": "Canonical title of a film actually being discussed, or null."
        },
        "sentiment": {
            "type": "string",
            "enum": ["love", "like", "neutral", "dislike", "hate", "unclear"]
        },
        "note": {
            "type": "string",
            "description": "A short paraphrase (max ~15 words) of what the speaker says about the movie. Empty string if no movie."
        }
    },
    "required": ["movie_title", "sentiment", "note"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """You read short transcript quotes from the YouTuber Northernlion and extract any FILM he is talking about.

Output exactly three fields:
- movie_title: the film's canonical title, or null if the quote isn't actually about a specific film. Passing references (level names, casual mentions, "I saw X recently") with no opinion count as null. Video games and TV shows are always null.
- sentiment: one of love / like / neutral / dislike / hate / unclear. Pick the strongest fit. "favourite", "incredible", "I cried" -> love. "good", "enjoyed" -> like. "mid", "meh" -> dislike. "worst", "terrible" -> hate. unclear = movie named but no opinion in this quote. Do not default to neutral when sentiment is detectable.
- note: a short paraphrase (max ~15 words) of what he actually says about the movie. Empty string when movie_title is null.

Output ONLY the JSON object. No prose, no thinking."""

USER_TEMPLATE = """Quote: "{text}"

Video title: {title}
Date: {upload_date}

Extract the structured opinion."""


def already_processed(out_path):
    if not os.path.exists(out_path):
        return set()
    seen = set()
    with open(out_path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                seen.add(json.loads(line)["id"])
            except Exception:
                continue
    return seen


def call_lmstudio(client, candidate):
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_TEMPLATE.format(
                text=candidate["text"],
                title=candidate.get("title") or "(unknown)",
                upload_date=candidate.get("upload_date") or "(unknown)",
            )},
        ],
        "temperature": 0.1,
        "max_tokens": 400,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "movie_opinion",
                "schema": EXTRACTION_SCHEMA,
            },
        },
    }
    r = client.post("/chat/completions", json=payload, timeout=TIMEOUT)
    r.raise_for_status()
    content = r.json()["choices"][0]["message"]["content"] or ""
    # Qwen3 thinking models sometimes emit <think>...</think> before the JSON.
    if "<think>" in content:
        content = content.split("</think>", 1)[-1].strip()
    try:
        return normalize(json.loads(content))
    except json.JSONDecodeError:
        print(f"\n[debug] raw response (first 400 chars): {content[:400]!r}",
              file=sys.stderr)
        raise


def normalize(ext):
    """If no movie is identified, force sentiment=unclear and empty note."""
    if not ext.get("movie_title"):
        ext["movie_title"] = None
        ext["note"] = ""
        ext["sentiment"] = "unclear"
    return ext


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True, help="candidates.jsonl from stage 1")
    ap.add_argument("--out", required=True, help="extractions.jsonl (append, resumable)")
    args = ap.parse_args()

    seen = already_processed(args.out)
    print(f"Already processed: {len(seen):,}", file=sys.stderr)

    candidates = []
    with open(args.inp, "r", encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            if row["id"] not in seen:
                candidates.append(row)

    print(f"To extract: {len(candidates):,}", file=sys.stderr)
    if not candidates:
        return

    client = httpx.Client(base_url=LMSTUDIO_URL, timeout=TIMEOUT)

    with open(args.out, "a", encoding="utf-8") as out:
        for cand in tqdm(candidates, unit="quote", smoothing=0.02, file=sys.stderr):
            for attempt in range(3):
                try:
                    extraction = call_lmstudio(client, cand)
                    break
                except (httpx.HTTPError, json.JSONDecodeError) as e:
                    if attempt == 2:
                        print(f"\nFailed id={cand['id']}: {e}", file=sys.stderr)
                        extraction = {"error": str(e)[:200]}
                    else:
                        time.sleep(2 ** attempt)

            record = {
                "id": cand["id"],
                "video_id": cand["video_id"],
                "timestamp_start": cand["timestamp_start"],
                "upload_date": cand["upload_date"],
                "text": cand["text"],
                "extraction": extraction,
            }
            out.write(json.dumps(record, ensure_ascii=False) + "\n")
            out.flush()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted — safe to re-run; resumes from output file.", file=sys.stderr)
        sys.exit(130)
