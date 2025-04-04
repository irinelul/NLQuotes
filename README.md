# Northernlion Quote Aggregator

A system that processes Northernlion's YouTube videos to extract, transcribe, and serve memorable quotes.

## Features

- Extracts audio from YouTube videos
- Generates accurate transcriptions
- Identifies games from video titles
- Stores quotes in a searchable database
- Provides access to quotes through database sharing

## Database Backups

We store database backups in this repository using Git LFS (Large File Storage).
Feel free to download them, and create amazing things!

### Retrieving Backups

1. **Clone the Repository**
   ```bash
   git clone https://github.com/your-username/your-repository-name.git
1. **Install Git LFS**
   ```bash
   git lfs install

1. **Download Backup Files**
   ```bash
   git pull origin main
1. **Locate Backup Files**
   ```bash
   backup
    ├── 4apr_backup.dump  # Custom format database dump (compressed)
    └── 4apr_backup.sql   # Plain SQL format dump (human-readable)


## Workflow Overview

1. **Audio Extraction**
    - Uses `yt-dlp` to download audio from YouTube videos.
    - Saves audio as WAV files, mono channel at 16kHz

2. **Speech-to-Text Processing**
    - Processes the audio through `faster-whisper` and `Whispers2t` for transcription.

3. **Game Identification**
    - Uses a local LLM (Gemma3 12B Q8_0) to determine the game from video titles.
    - List of videos titles are fed to the model, prompting and guiding to infer the game being played, surprisingly good accuracy (90%+)

4. **Data Processing**
    - Parses and cleans transcriptions.
    - Performs hard coded text swaps, for edge-case scenarios.
        - Examples, "Mardi" transcribed instead of "Mahdi". But, don't replace it in "Mardi Gras" context.

5. **Database Storage**
    - Loads processed data into Postgres.
    - We are taking advantage of Postgres [tsvector](https://www.postgresql.org/docs/current/datatype-textsearch.html#DATATYPE-TSVECTOR) and this allows us super fast searches.
    - The vector is set to `simple` instead of `english`, results were more accurate with the simple version.
    - Schema is still WIP and rough around the edges, but it works. 

6. **Database Sharing**
    - Provides access to the quote database, in a dump format. 
    - Will be scheduled at a later date on a cron for daily backups, or even finding a better method to share this.
