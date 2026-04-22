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

GENRE_TAGS = [
    "comedy", "drama", "horror", "action", "sci-fi", "fantasy",
    "romance", "thriller", "mystery", "documentary", "animated",
    "musical", "war", "western", "crime", "biopic",
]
QUALITY_TAGS = [
    "classic", "blockbuster", "indie", "foreign", "cult",
    "guilty-pleasure", "underrated", "overrated",
]

EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "mentions_movie": {
            "type": "boolean",
            "description": "True only if the quote explicitly discusses a specific film/movie."
        },
        "movie_title": {
            "type": ["string", "null"],
            "description": "Canonical title of the movie being discussed, or null if not identifiable."
        },
        "sentiment": {
            "type": "string",
            "enum": ["love", "like", "neutral", "dislike", "hate", "unclear"]
        },
        "rating_out_of_10": {
            "type": ["number", "null"],
            "minimum": 0,
            "maximum": 10,
            "description": "Numeric rating only if the speaker gives one explicitly."
        },
        "tags": {
            "type": "array",
            "items": {"type": "string", "enum": GENRE_TAGS + QUALITY_TAGS},
            "description": "Genre and quality descriptors mentioned or strongly implied."
        },
        "is_best_claim": {
            "type": "boolean",
            "description": "True if the speaker calls this the best of all time / their favourite."
        },
        "is_worst_claim": {
            "type": "boolean",
            "description": "True if the speaker calls this the worst they have seen."
        },
        "comparison": {
            "type": ["object", "null"],
            "properties": {
                "vs_movie": {"type": "string"},
                "direction": {"type": "string", "enum": ["better", "worse", "similar"]}
            },
            "required": ["vs_movie", "direction"],
            "additionalProperties": False,
        },
        "confidence": {
            "type": "number", "minimum": 0, "maximum": 1,
            "description": "How confident you are in this extraction."
        }
    },
    "required": ["mentions_movie", "sentiment", "tags", "is_best_claim",
                 "is_worst_claim", "confidence"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """You extract structured movie opinions from short transcript quotes spoken by a YouTuber (Northernlion).

Rules:
- Only set mentions_movie=true if the quote is clearly about a specific FILM. Video games, TV shows, and generic chatter do NOT count, even if they mention the word "movie".
- If the quote is too short or ambiguous to identify a specific movie, set mentions_movie=false and movie_title=null.
- "best of all time" / "favourite ever" / "no movie tops this" -> is_best_claim=true.
- A comparison must reference TWO concrete films. "Better than most movies" is not a comparison.
- Only put a numeric rating_out_of_10 if the speaker says a number ("8 out of 10", "I'd give it a 9").
- Be conservative with confidence — 0.9+ only if the title and opinion are unambiguous.
- Output ONLY the JSON object matching the schema. No prose."""

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
                "strict": True,
                "schema": EXTRACTION_SCHEMA,
            },
        },
    }
    r = client.post("/chat/completions", json=payload, timeout=TIMEOUT)
    r.raise_for_status()
    content = r.json()["choices"][0]["message"]["content"]
    return json.loads(content)


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
