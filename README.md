this is a northernlion quote aggregator

the current workflow is
1. extract audio from all videos using yt-dlp (3k videos from https://www.youtube.com/@TheLibraryofLetourneau ) - main channel and older videos NOT available
2. save them in gdrive as webm
3. process through whisper
4. parse transcription
5. load to mongo db
6. serve
