import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AdSenseBlock } from './AdSenseBlock';
import { YouTubePlayer } from './YoutubePlayer';
import { formatDate } from '../services/dateHelpers';

export const TopicPage = () => {
  const { term } = useParams();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalQuotes, setTotalQuotes] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [activeTimestamp, setActiveTimestamp] = useState({ videoId: null, timestamp: null });

  useEffect(() => {
    const fetchTopicQuotes = async () => {
      try {
        setLoading(true);
        const response = await fetch(`http://localhost:8080/api/topic/${encodeURIComponent(term)}?page=${page}`);
        if (!response.ok) {
          throw new Error('Failed to fetch topic quotes');
        }
        const data = await response.json();
        setQuotes(data.data || []);
        setTotalQuotes(data.totalQuotes || 0);
        setTotalPages(data.total || 1);
      } catch (err) {
        console.error('Error fetching topic quotes:', err);
        setError('Failed to load quotes for this topic');
      } finally {
        setLoading(false);
      }
    };

    if (term) {
      fetchTopicQuotes();
    }
  }, [term, page]);

  const handleTimestampClick = (videoId, timestamp) => {
    // If clicking a quote from a different video, stop the current video
    if (activeTimestamp.videoId && activeTimestamp.videoId !== videoId) {
      // This would need to be implemented with your video player management
      console.log('Pausing other videos');
    }

    // Set the active timestamp which will trigger video loading
    setActiveTimestamp({ videoId, timestamp });
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    window.scrollTo(0, 0);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading quotes about "{term}"...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-red-600">
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const decodedTerm = decodeURIComponent(term);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Quotes about "{decodedTerm}"
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Discover memorable moments and quotes featuring "{decodedTerm}" from Northernlion's content. 
          Click on any timestamp to jump directly to that moment in the video.
        </p>
        <div className="mt-4 text-sm text-gray-500">
          Found {totalQuotes} quotes across {totalPages} pages
        </div>
      </div>

      {/* Top AdSense Block */}
      <AdSenseBlock 
        size="large" 
        placeholder="Top Banner Advertisement"
        style={{ marginBottom: '40px' }}
      />

      {/* Quotes List */}
      {quotes.length > 0 ? (
        <div className="space-y-6 mb-8">
          {quotes.map((videoGroup, videoIndex) => (
            <div key={videoGroup.video_id} className="bg-white rounded-lg shadow-md overflow-hidden">
              {/* Video Header */}
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {videoGroup.title}
                </h3>
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                  <span>Channel: {videoGroup.channel_source}</span>
                  <span>Uploaded: {formatDate(videoGroup.upload_date)}</span>
                </div>
              </div>

              {/* Video Player */}
              <div className="p-6">
                <YouTubePlayer 
                  videoId={videoGroup.video_id}
                  timestamp={activeTimestamp.videoId === videoGroup.video_id ? activeTimestamp.timestamp : null}
                />
              </div>

              {/* Quotes List */}
              <div className="px-6 pb-6">
                <h4 className="text-md font-medium text-gray-700 mb-4">
                  Quotes featuring "{decodedTerm}" ({videoGroup.quotes.length})
                </h4>
                <div className="space-y-4">
                  {videoGroup.quotes.map((quote, quoteIndex) => (
                    <div key={`${videoGroup.video_id}-${quote.line_number}`} className="flex items-start space-x-4">
                      {/* Timestamp Button */}
                      <button
                        onClick={() => handleTimestampClick(videoGroup.video_id, quote.timestamp_start)}
                        className="flex-shrink-0 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors duration-200"
                      >
                        {quote.timestamp_start}
                      </button>
                      
                      {/* Quote Text */}
                      <div className="flex-1">
                        <p className="text-gray-800 leading-relaxed">
                          {quote.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-600 text-lg">
            No quotes found for "{decodedTerm}". Try a different search term.
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center space-x-2 mb-8">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
          >
            Previous
          </button>
          
          <span className="px-4 py-2 text-gray-700">
            Page {page} of {totalPages}
          </span>
          
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page === totalPages}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
          >
            Next
          </button>
        </div>
      )}

      {/* Bottom AdSense Block */}
      <AdSenseBlock 
        size="medium" 
        placeholder="Bottom Advertisement"
        style={{ marginTop: '40px' }}
      />

      {/* Navigation Links */}
      <div className="flex justify-center space-x-4 mt-8">
        <Link
          to="/popular-searches"
          className="inline-flex items-center px-4 py-2 bg-green-600 text-white font-medium rounded hover:bg-green-700 transition-colors duration-200"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          Popular Searches
        </Link>
        
        <Link
          to="/search"
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 transition-colors duration-200"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Back to Search
        </Link>
      </div>
    </div>
  );
};
