"""
Stage 1 of the movie-recommendation pipeline.

Collects quotes that *might* be about movies, by unioning:
  (a) pgvector nearest neighbours of a curated set of seed phrases
      ("best movie of all time", "classic comedy film", director names, etc.)
  (b) literal ILIKE matches on movie-vocabulary keywords

Outputs JSONL — one quote per line — to be fed into stage 2 (local Qwen
extraction of {movie, sentiment, tags, rating, comparisons}).

Setup:
    pip install voyageai psycopg2-binary tqdm
    export DATABASE_URL=postgres://...
    export VOYAGE_API_KEY=...
    python scripts/collect_movie_candidates.py > candidates.jsonl

Tune SEED_TOPK and the seed lists below to widen or narrow the funnel.
"""

import json
import os
import sys
import httpx
import psycopg2
import psycopg2.extras
from tqdm import tqdm

DATABASE_URL   = os.environ["DATABASE_URL"]
VOYAGE_API_KEY = os.environ["VOYAGE_API_KEY"]

MODEL       = os.environ.get("EMBEDDING_MODEL", "voyage-4-large")
OUTPUT_DIM  = int(os.environ["EMBEDDING_OUTPUT_DIM"]) if os.environ.get("EMBEDDING_OUTPUT_DIM") else 1024
SEED_TOPK   = int(os.environ.get("SEED_TOPK", "500"))
EF_SEARCH   = int(os.environ.get("EF_SEARCH", "200"))

SEED_PHRASES = [
    # Opinion / quality
    "best movie of all time",
    "worst movie I have ever seen",
    "this movie was incredible",
    "this film is overrated",
    "this film is underrated",
    "I cried watching this movie",
    "movie I would recommend to everyone",
    "movie I would never watch again",
    "favourite movie",
    "classic movie everyone should see",
    # Comparisons
    "this movie is better than",
    "this movie is worse than",
    "I prefer this film over",
    # Genre framing
    "great comedy movie",
    "best horror film",
    "good drama film",
    "action movie I enjoyed",
    "animated movie I loved",
    "documentary film",
    "sci-fi movie",
    "romantic comedy",
    # Activity framing — catches "watched X last night"-style mentions
    "I watched a movie last night",
    "went to the cinema",
    "saw a film recently",
    # Directors NL talks about often (extend as needed)
    "Christopher Nolan film",
    "Quentin Tarantino movie",
    "Martin Scorsese film",
    "Stanley Kubrick movie",
    "Wes Anderson movie",
    "Coen Brothers film",
    "Pixar movie",
    "A24 movie",
]

# Literal keyword sweep — anything matching one of these gets pulled in.
# Kept tight on purpose (no bare "the" etc.) so the candidate set stays small.
KEYWORD_PATTERNS = [
    r"\mmovie\M",
    r"\mmovies\M",
    r"\mfilm\M",
    r"\mfilms\M",
    r"\mcinema\M",
    r"\mdirector\M",
    r"\mscreenplay\M",
    r"\msoundtrack\M",
    r"\mblockbuster\M",
]


def embed_seeds(phrases):
    """Hit Voyage's REST endpoint directly so we don't depend on a specific
    SDK version supporting output_dimension."""
    print(f"Embedding {len(phrases)} seed phrases with {MODEL}...", file=sys.stderr)
    body = {"input": phrases, "model": MODEL, "input_type": "query"}
    if OUTPUT_DIM:
        body["output_dimension"] = OUTPUT_DIM
    r = httpx.post(
        "https://api.voyageai.com/v1/embeddings",
        headers={"Authorization": f"Bearer {VOYAGE_API_KEY}"},
        json=body,
        timeout=60.0,
    )
    r.raise_for_status()
    return [d["embedding"] for d in r.json()["data"]]


def to_vector_literal(vec):
    return "[" + ",".join(f"{x:.6f}" for x in vec) + "]"


def main():
    seed_vectors = embed_seeds(SEED_PHRASES)

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    candidate_ids = set()

    with conn.cursor() as cur:
        cur.execute(f"SET hnsw.ef_search = {EF_SEARCH}")

        # Stage A: pgvector neighbours per seed phrase.
        for phrase, vec in tqdm(list(zip(SEED_PHRASES, seed_vectors)),
                                desc="seed phrases", file=sys.stderr):
            cur.execute(
                "SELECT id FROM quotes "
                "WHERE embedding IS NOT NULL "
                "ORDER BY embedding <=> %s::vector "
                "LIMIT %s",
                (to_vector_literal(vec), SEED_TOPK),
            )
            for (qid,) in cur.fetchall():
                candidate_ids.add(qid)

        # Stage B: regex keyword sweep. Cheap with the GIN/fts index path,
        # but here we just use ~* for clarity — re-tune if too slow.
        for pat in tqdm(KEYWORD_PATTERNS, desc="keywords", file=sys.stderr):
            cur.execute("SELECT id FROM quotes WHERE text ~* %s", (pat,))
            for (qid,) in cur.fetchall():
                candidate_ids.add(qid)

        print(f"Total unique candidates: {len(candidate_ids):,}", file=sys.stderr)

        # Hydrate the candidate rows with the fields stage 2 needs.
        cur.execute(
            "SELECT id, video_id, line_number, timestamp_start, "
            "       upload_date, title, channel_source, text "
            "FROM quotes WHERE id = ANY(%s) ORDER BY upload_date, id",
            (list(candidate_ids),),
        )
        for row in cur:
            (qid, video_id, line_number, ts_start,
             upload_date, title, channel, text) = row
            print(json.dumps({
                "id": qid,
                "video_id": video_id,
                "line_number": line_number,
                "timestamp_start": ts_start,
                "upload_date": upload_date.isoformat() if upload_date else None,
                "title": title,
                "channel_source": channel,
                "text": text,
            }, ensure_ascii=False))

    conn.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
