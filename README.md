# NLQuotes
An aggregator for quotes by Northernlion

I am using several tools to 
-> Extract videos from different Youtube channel sources
-> Insert the scraped video into a reference table on a local postgres instance
-> Save the video into a raw container locally
-> Use a python script that's using DirectML and Whisper to transcribe the speech to text with timestamps.
-> A third python script inserts the quotes into postgres
  -> I was able to run Whisper directly using CPU but the speeds would be terrible
  -> As such, due to me not having a Nvidia GPU I have to use DirectML

-> Wrote a simple website with JS that would allow the user to search for a specific quote.
-> JS queries the local postgres mentioned earlier
