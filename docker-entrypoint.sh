#!/bin/sh

# SKIP_STATIC_TOPICS=true is set in the Dockerfile to suppress generation at
# build time (no network access). At runtime we override it if UMAMI_DATABASE_URL
# is available so the script actually runs.
if [ -n "$UMAMI_DATABASE_URL" ]; then
  echo "[entrypoint] Starting static topic generation in background..."
  SKIP_STATIC_TOPICS=false node scripts/generate_static_topics.js &
else
  echo "[entrypoint] Skipping static topic generation (UMAMI_DATABASE_URL not set)"
fi

echo "[entrypoint] Starting server..."
exec node --trace-warnings index.js
