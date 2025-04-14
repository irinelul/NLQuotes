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
   git clone https://github.com/irinelul/NLQuotes.git
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
    ├── 4apr_backup.csv   # Plain csv dump of main table format. It contains 50,000 lines.
    └── 14apr_backup.dump  # This is the entire database, with 20,000+ videos transcribed. It's 800MB large. For local development, use the 4apr backups. For new projects, use this one.


## Importing Database Backups

Once you have retrieved the backup files using Git LFS, you can restore the database locally. These instructions assume you have PostgreSQL installed.

**Prerequisites:**

1.  **PostgreSQL Installed:** You need a working PostgreSQL installation. Version 17 is recommended, as the backups might rely on features or have been created with this version. Using older versions might lead to errors during import if specific features (like aspects of `tsvector` used) are not available.
2.  **PostgreSQL Command-Line Tools:** Ensure `pg_restore` command is available in your terminal (it usually comes with the standard PostgreSQL installation). `psql` is also needed for verification.
3.  **Database User:** You need a PostgreSQL user (role) with privileges to create databases and restore data. For local development, the default `postgres` user often suffices.
4.  **Backup Files Downloaded:** Make sure you have followed the "Retrieving Backups" steps and have the `.dump` files available locally in the `backup` directory.

**Steps to Import (Command Line)**

The available backup files are in `.dump` format, which is a compressed, custom-format archive created by `pg_dump`. You will use the `pg_restore` tool for these.

* The `14apr_backup.dump` file contains the full dataset but is large (~800MB).
* The `4apr_backup.dump` file is smaller and suitable for quick local development or testing.

**Command-Line Method (using `pg_restore`)**

This method uses the `pg_restore` command-line tool.

1.  **Create an Empty Database:**
    Open your terminal or command prompt and use the `createdb` command. Replace `your_username` with your PostgreSQL username and `nlquotes_db` with your desired database name.
    ```bash
    createdb -U your_username nlquotes_db
    ```
    *(You might be prompted for your PostgreSQL user password)*

2.  **Restore the Database:**
    Use the `pg_restore` command. We include the `-c` (`--clean`) flag as good practice; it tells `pg_restore` to drop any existing database objects in `nlquotes_db` before restoring them. This ensures a clean slate. You might see some harmless "does not exist" notices if the database was already empty.

    Replace `your_username`, `nlquotes_db`, and the path to the `.dump` file as needed.
    ```bash
    # To restore the full database (large file)
    pg_restore -c -U your_username -d nlquotes_db backup/14apr_backup.dump

    # Or, to restore the smaller April 4th dump
    pg_restore -c -U your_username -d nlquotes_db backup/4apr_backup.dump
    ```
    *(Again, you might be prompted for the password. This process can take some time, especially for the larger dump file.)*

    *Optional flags:* You can add `-v` for verbose output: `pg_restore -c -v -U your_username -d nlquotes_db path/to/your_dumpfile.dump` *(adjust path)*

**Alternative: Using pgAdmin 4 (GUI Method)**

If you prefer using a graphical interface, you can restore the `.dump` backups using pgAdmin 4:

* **Connect:** Connect to your PostgreSQL server instance in pgAdmin 4.
* **Create Database (if needed):** Right-click on "Databases" -> "Create" -> "Database...". Name it (e.g., `nlquotes_db`) and set the owner (e.g., `your_username`). Click "Save".
* **Initiate Restore:** Right-click on the new database (`nlquotes_db`) -> "Restore...".
* **Configure Restore Dialog:**
    * **Format:** Choose "Custom or Tar".
    * **Filename:** Browse (...) and select your `.dump` file (e.g., `backup/14apr_backup.dump` or `backup/4apr_backup.dump`).
    * **Role:** Select the appropriate user (`your_username`).
    * **Restore Options tab:**
        * Enable **"Clean before restore"** (equivalent to `-c`).
        * Review other options if needed.
* **Run Restore:** Click the "Restore" button. Monitor progress via the 'Processes' tab or notifications.

**Important Note on pgAdmin Setup:** For the Restore function to work, pgAdmin needs the PostgreSQL binary path configured correctly (`File -> Preferences -> Paths -> Binary paths`).

**Verification**

After the import process completes without errors (using any method), you can connect to your new database using `psql` or a GUI tool like pgAdmin 4 or DBeaver to verify the contents.


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
