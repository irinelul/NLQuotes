import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { YouTubePlayer } from './YoutubePlayer';
import { formatDate } from '../services/dateHelpers';
import { pauseOtherPlayers } from '../services/youtubeApiLoader';
import styles from './TopicPage.module.css';

export const TopicPage = () => {
  const { term } = useParams();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalQuotes, setTotalQuotes] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(10);
  const [activeTimestamp, setActiveTimestamp] = useState({ videoId: null, timestamp: null });

  // Track the previous topic term. A NEW topic clears results (first-load
  // skeleton, no stale cross-topic cards dimmed) while a same-topic page
  // change keeps the previous page mounted and dimmed.
  const prevTermRef = useRef(term);

  useEffect(() => {
    const fetchTopicQuotes = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/topic/${encodeURIComponent(term)}?page=${page}&limit=${limit}`);
        if (!response.ok) {
          throw new Error('Failed to fetch topic quotes');
        }
        const data = await response.json();
        setQuotes(data.data || []);
        setTotalQuotes(data.totalQuotes || 0);
        setTotalPages(data.totalPages || 1);
      } catch (err) {
        console.error('Error fetching topic quotes:', err);
        setError('Failed to load quotes for this topic');
      } finally {
        setLoading(false);
      }
    };

    if (term) {
      // New topic: previous data belongs to a different query → clear so the
      // first-load skeleton shows (no stale cross-topic results dimmed).
      // Same-topic page change: keep the previous page mounted (dimmed on
      // render) instead of swapping to the skeleton (avoids CLS on paginate).
      if (term !== prevTermRef.current) {
        setQuotes([]);
      }
      prevTermRef.current = term;
      fetchTopicQuotes();
    }
  }, [term, page, limit]);

  const handleTimestampClick = (videoId, timestamp) => {
    // Always pause all other players before starting a new video
    pauseOtherPlayers(null);
    
    // Set the active timestamp which will trigger video loading
    setActiveTimestamp({ videoId, timestamp });
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    window.scrollTo(0, 0);
  };

  if (loading && quotes.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingSection} role="status" aria-live="polite">
          <div className={styles.spinner}></div>
          <p className={styles.loadingText}>Loading quotes about &quot;{term}&quot;...</p>
        </div>
        {/* Skeleton card list reserves the space the real list will fill, so
            the spinner→content swap does not shift the layout. Card count
            matches the page limit so it never under-reserves (grow-shift).
            Decorative. */}
        <div className={styles.quotesList} aria-hidden="true">
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className={`${styles.videoCard} ${styles.skeletonCard}`}>
              <div className={styles.skeletonHeader}>
                <div className={`${styles.skeletonLine} ${styles.skeletonShimmer}`} />
                <div className={`${styles.skeletonLine} ${styles.skeletonShimmer}`} />
              </div>
              <div className={`${styles.skeletonPlayer} ${styles.skeletonShimmer}`} />
              <div className={styles.skeletonQuoteSection}>
                <div className={`${styles.skeletonLine} ${styles.skeletonShimmer}`} />
                <div className={`${styles.skeletonLine} ${styles.skeletonShimmer}`} />
                <div className={`${styles.skeletonLine} ${styles.skeletonShimmer}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={`${styles.loadingSection} ${styles.errorText}`}>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className={styles.retryButton}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const decodedTerm = decodeURIComponent(term);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.headerSection}>
        <h1 className={styles.pageTitle}>
          Quotes about &quot;{decodedTerm}&quot;
        </h1>
        <p className={styles.pageDescription}>
          Discover memorable moments and quotes featuring &quot;{decodedTerm}&quot;. 
          Click on any timestamp to jump directly to that moment in the video.
        </p>
        <div className={styles.pageMetadata}>
          Found {totalQuotes} quotes across {totalPages} pages
        </div>
      </div>

      {/* Top Pagination */}
      {totalPages > 1 && (
        <div className={styles.paginationContainer}>
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
            className={styles.paginationButton}
          >
            Previous
          </button>
          
          <span className={styles.paginationText}>
            Page {page} of {totalPages}
          </span>
          
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page === totalPages}
            className={styles.paginationButton}
          >
            Next
          </button>
        </div>
      )}

      {/* Quotes List. On pagination (loading with previous data) the previous
          page stays mounted and dims instead of swapping to the full skeleton
          — avoids the height collapse/CLS the skeleton caused mid-pagination.
          First load returns the skeleton above, so reaching here while loading
          always means "refetch with previous data". */}
      {quotes.length > 0 ? (
        <div
          className={loading ? `${styles.quotesList} ${styles.resultsStale}` : styles.quotesList}
          aria-busy={loading}
        >
          {loading && (
            <span role="status" aria-live="polite" className={styles.srOnly}>
              Loading more quotes about &quot;{decodeURIComponent(term)}&quot;...
            </span>
          )}
          {quotes.map((videoGroup) => (
            <div key={videoGroup.video_id} className={styles.videoCard}>
              {/* Video Header */}
              <div className={styles.videoHeader}>
                <h3 className={styles.videoTitle}>
                  {videoGroup.title}
                </h3>
                <div className={styles.videoMetadata}>
                  <span>Channel: {videoGroup.channel_source}</span>
                  <span>Uploaded: {formatDate(videoGroup.upload_date)}</span>
                </div>
              </div>

              {/* Video Player */}
              <div className={styles.playerContainer}>
                <YouTubePlayer 
                  videoId={videoGroup.video_id}
                  timestamp={activeTimestamp.videoId === videoGroup.video_id ? activeTimestamp.timestamp : null}
                />
              </div>

              {/* Quotes List */}
              <div className={styles.quotesSection}>
                <h4 className={styles.quotesHeading}>
                  Quotes featuring &quot;{decodedTerm}&quot; ({videoGroup.quotes.length})
                </h4>
                <div className={styles.quoteItems}>
                  {videoGroup.quotes.map((quote) => (
                    <div key={`${videoGroup.video_id}-${quote.line_number}`} className={styles.quoteItem}>
                      {/* Timestamp Button */}
                      <button
                        onClick={() => handleTimestampClick(videoGroup.video_id, quote.timestamp_start)}
                        className={styles.timestampButton}
                      >
                        {quote.timestamp_start}
                      </button>
                      
                      {/* Quote Text */}
                      <div className={styles.quoteText}>
                        <p>
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
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>
            No quotes found for &quot;{decodedTerm}&quot;. Try a different search term.
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={styles.paginationContainer}>
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
            className={styles.paginationButton}
          >
            Previous
          </button>
          
          <span className={styles.paginationText}>
            Page {page} of {totalPages}
          </span>
          
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page === totalPages}
            className={styles.paginationButton}
          >
            Next
          </button>
        </div>
      )}

      {/* Navigation Links */}
      <div className={styles.navigationLinks}>
        <Link
          to="/"
          className={styles.backToSearchButton}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Back to Search
        </Link>
      </div>
    </div>
  );
};
