this is a northernlion quote aggregator

the current workflow is
1. extract audio from all videos using yt-dlp 
2. save them as webm
3. process through faster-whisper
4. process through local llm to guess game from title
6. parse transcription
7. load to mongo db
8. serve
