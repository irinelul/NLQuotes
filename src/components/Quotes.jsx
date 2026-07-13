import React, { useState, useEffect } from 'react';
import { pauseOtherPlayers } from '../services/youtubeApiLoader';
import DOMPurify from 'dompurify';
import { YouTubePlayer } from './YoutubePlayer';
import { FlagModal } from './Modals/FlagModal';
import { backdateTimestamp, formatDate, formatTimestamp } from '../services/dateHelpers';
import { TENANT } from '../config/tenant';
import query from '../services/quotes';
import { track } from '../services/analytics';
import styles from './Quotes.module.css';

// `b` is returned from ts_headline when a match is found
const ALLOWED_TAGS = ['b'];

export const Quotes = ({ quotes = [], searchTerm, totalQuotes = 0, loading = false }) => {
  const [flagging, setFlagging] = useState({});
  const [modalState, setModalState] = useState({
      isOpen: false,
      quote: null,
      videoId: null,
      title: null,
      channel: null,
      timestamp: null
  });
  const [activeTimestamp, setActiveTimestamp] = useState({ videoId: null, timestamp: null });
  const [showEmbeddedVideos] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768);
  
  // Get tenant-aware site URL (hard-bound at import time, no flickering)
  const siteUrl = TENANT.hostnames?.[0] ? `https://${TENANT.hostnames[0]}` : 'https://nlquotes.com';

  // Reset active timestamp when quotes change (new search) to prevent old videos from playing
  useEffect(() => {
    // Only reset if we have new quotes and the active timestamp doesn't match any current quote
    if (quotes && quotes.length > 0) {
      const currentVideoIds = new Set(quotes.map(q => q.video_id || (q.quotes && q.quotes[0]?.video_id)).filter(Boolean));
      // If active timestamp is for a video not in current results, reset it
      if (activeTimestamp.videoId && !currentVideoIds.has(activeTimestamp.videoId)) {
        pauseOtherPlayers(null);
        setActiveTimestamp({ videoId: null, timestamp: null });
      }
    } else if (quotes && quotes.length === 0 && activeTimestamp.videoId) {
      // If quotes are cleared, reset active timestamp
      pauseOtherPlayers(null);
      setActiveTimestamp({ videoId: null, timestamp: null });
    }
  }, [quotes, searchTerm]); // Reset when quotes or searchTerm changes

  // Effect to handle video loading retry
  useEffect(() => {
      if (showEmbeddedVideos && retryCount < 1) {
          const timer = setTimeout(() => {
              setRetryCount(prev => prev + 1);
          }, 500);
          return () => clearTimeout(timer);
      }
  }, [showEmbeddedVideos, retryCount]);

  // Effect to handle responsive layout
  useEffect(() => {
      const handleResize = () => {
          setIsMobileView(window.innerWidth <= 768);
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  const trackQuoteEvent = (eventType, videoId, seconds, props) => {
      track(eventType, {
          video_id: videoId,
          quote_timestamp: Number.isFinite(Number(seconds)) ? Math.floor(Number(seconds)) : null,
          search_term: searchTerm ? searchTerm.toLowerCase() : null,
          ...(props ? { props } : {})
      });
  };

  // Engagement timing/depth per result set: when results render, remember the
  // moment so the first play can report time-to-first-play, and re-arm the
  // scroll-depth thresholds (each fires once per search).
  const resultsShownAtRef = React.useRef(null);
  const firstPlayFiredRef = React.useRef(false);
  const scrollDepthsFiredRef = React.useRef(new Set());

  useEffect(() => {
      if (quotes && quotes.length > 0) {
          resultsShownAtRef.current = Date.now();
          firstPlayFiredRef.current = false;
          scrollDepthsFiredRef.current = new Set();
      }
  }, [quotes]);

  useEffect(() => {
      if (!quotes || quotes.length === 0) return;
      const onScroll = () => {
          const doc = document.documentElement;
          const scrollable = doc.scrollHeight - window.innerHeight;
          if (scrollable <= 0) return;
          const pct = (window.scrollY / scrollable) * 100;
          for (const depth of [25, 50, 75, 100]) {
              if (pct >= depth && !scrollDepthsFiredRef.current.has(depth)) {
                  scrollDepthsFiredRef.current.add(depth);
                  track('scroll_depth', {
                      search_term: searchTerm ? searchTerm.toLowerCase() : null,
                      props: { depth }
                  });
              }
          }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
  }, [quotes, searchTerm]);

  const handleTimestampClick = (videoId, timestamp) => {
      let playProps;
      if (!firstPlayFiredRef.current && resultsShownAtRef.current) {
          firstPlayFiredRef.current = true;
          playProps = { seconds_to_first_play: Math.round((Date.now() - resultsShownAtRef.current) / 1000) };
      }
      trackQuoteEvent('quote_play', videoId, timestamp, playProps);
      // Always pause all other players before starting a new video
      // This ensures only one video plays at a time, especially important on mobile
      pauseOtherPlayers(null); // Passing null to pause all players
      
      // Always set the active timestamp - this will trigger video loading/change
      // The YouTubePlayer component will handle stopping previous videos
      setActiveTimestamp({ videoId, timestamp });
  };

  const handleFlagClick = (quote, videoId, title, channel, timestamp) => {
      trackQuoteEvent('quote_flag', videoId, timestamp);
      setModalState({
          isOpen: true,
          quote,
          videoId,
          title,
          channel,
          timestamp
      });
  };

  const handleFlagSubmit = async (reason) => {
      try {
          setFlagging(prev => ({ ...prev, [`${modalState.videoId}-${modalState.timestamp}`]: true }));
          await query.flagQuote({
              quote: modalState.quote,
              searchTerm,
              timestamp: modalState.timestamp,
              videoId: modalState.videoId,
              title: modalState.title,
              channel: modalState.channel,
              reason
          });
          trackQuoteEvent('flag_submit', modalState.videoId, modalState.timestamp);
          alert('Quote flagged successfully!');
          setModalState(prev => ({ ...prev, isOpen: false }));
      } catch (error) {
          console.error('Error flagging quote:', error);
          alert(`Unable to flag quote due to database connection issues. If you're on the deployed site, please try the main site at ${siteUrl}.`);
      } finally {
          setFlagging(prev => ({ ...prev, [`${modalState.video_id}-${modalState.timestamp}`]: false }));
      }
  };

  // Desktop layout
  const renderDesktopLayout = () => {

    return (
      <table className={styles.quotesTable}>
          <thead>
              <tr>
                  <th>Video</th>
                  <th>Quotes with Timestamps</th>
              </tr>
          </thead>
          <tbody>
              {quotes.map((quoteGroup, index) => (
                  <React.Fragment key={quoteGroup.video_id || `quote-group-${index}`}>
                      <tr className={styles.videoRow}>
                      <td className={styles.videoCell}>
                          <div className={styles.videoInfoContainer}>
                              <div className={styles.videoInfoTitle}>
                                  {quoteGroup.quotes[0]?.title || 'N/A'}
                              </div>
                              <YouTubePlayer
                                  key={`${quoteGroup.video_id}-${retryCount}`}
                                  videoId={quoteGroup.video_id}
                                  timestamp={activeTimestamp.videoId === quoteGroup.video_id ? activeTimestamp.timestamp : null}
                                  onTimestampClick={handleTimestampClick}
                              />
                              <div>
                                  {quoteGroup.quotes[0]?.channel_source || 'N/A'} - {quoteGroup.quotes[0]?.upload_date
                                      ? formatDate(quoteGroup.quotes[0].upload_date)
                                      : 'N/A'}
                              </div>
                          </div>
                      </td>
                      <td className={styles.quotesCell}>
                          <div className={`${styles.quotesScroller} ${quoteGroup.quotes?.length > 2 ? styles.scrollable : ''}`}>
                              {quoteGroup.quotes?.map((quote, index) => (
                                  <div className={`${styles.quoteItem} ${index === quoteGroup.quotes.length - 1 ? styles.quoteItemLast : ''}`} key={index}>
                                      <button
                                          onClick={() => handleTimestampClick(quoteGroup.video_id, backdateTimestamp(quote.timestamp_start))}
                                          className={styles.quoteItemButton}
                                      >
                                          <span className={styles.quoteText} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(quote.text, { ALLOWED_TAGS }) }} />
                                          <span className={styles.quoteTimestamp}>
                                              ({formatTimestamp(backdateTimestamp(quote.timestamp_start))})
                                          </span>
                                      </button>

                                      <div className={styles.actionButtons}>
                                          <button
                                              onClick={(e) => {
                                                  const button = e.currentTarget;
                                                  trackQuoteEvent('quote_copy', quoteGroup.video_id, backdateTimestamp(quote.timestamp_start));
                                                  const textToCopy = quote.text.replace(/<[^>]*>/g, '');
                                                  navigator.clipboard.writeText(textToCopy).then(() => {
                                                      const originalText = button.innerHTML;
                                                      button.innerHTML = '✓';
                                                      button.classList.add(styles.copied);
                                                      setTimeout(() => {
                                                          button.innerHTML = originalText;
                                                          button.classList.remove(styles.copied);
                                                      }, 1000);
                                                  }).catch(() => {});
                                              }}
                                              className={styles.actionButton}
                                              title="Copy quote to clipboard" aria-label="Copy quote to clipboard"
                                          >
                                              📋
                                          </button>

                                          <button
                                              onClick={() => {
                                                  trackQuoteEvent('youtube_open', quoteGroup.video_id, backdateTimestamp(quote.timestamp_start));
                                                  window.open(`https://www.youtube.com/watch?v=${quoteGroup.video_id}&t=${Math.floor(backdateTimestamp(quote.timestamp_start))}`, '_blank');
                                              }}
                                              className={styles.actionButton}
                                              title="Open quote in YouTube" aria-label="Open quote in YouTube"
                                          >
                                              ↗
                                          </button>

                                          <button
                                              onClick={() => {
                                                  trackQuoteEvent('tweet_share', quoteGroup.video_id, backdateTimestamp(quote.timestamp_start));
                                                  const videoUrl = `https://youtu.be/${quoteGroup.video_id}?t=${Math.floor(backdateTimestamp(quote.timestamp_start))}`;
                                                  const pageUrl = window.location.href;
                                                  const cleanSearchTerm = searchTerm.replace(/"/g, '');
                                                  const tweetText = totalQuotes === 1 
                                                      ? `The only quote mentioning "${cleanSearchTerm}": ${videoUrl}\n\nFound on: ${pageUrl}`
                                                      : `Just one of ${totalQuotes} quotes mentioning "${cleanSearchTerm}": ${videoUrl}\n\nSee them all here! ${pageUrl}`;
                                                  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`, '_blank');
                                              }}
                                              className={styles.actionButton}
                                              title="Share quote on X" aria-label="Share quote on X"
                                          >
                                              𝕏
                                          </button>

                                          <button
                                              onClick={() => handleFlagClick(
                                                  quote.text,
                                                  quoteGroup.video_id,
                                                  quoteGroup.quotes[0]?.title,
                                                  quoteGroup.quotes[0]?.channel_source,
                                                  quote.timestamp_start
                                              )}
                                              disabled={flagging[`${quoteGroup.video_id}-${quote.timestamp_start}`]}
                                              className={`${styles.actionButton} ${styles.flagButton}`}
                                              title="Flag quote as invalid" aria-label="Flag quote as invalid"
                                          >
                                              {flagging[`${quoteGroup.video_id}-${quote.timestamp_start}`] ? '⏳' : '🚩'}
                                          </button>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </td>
                  </tr>
                  </React.Fragment>
              ))}
          </tbody>
      </table>
    );
  };

  // Mobile layout
  const renderMobileLayout = () => {

    return (
      <div className={styles.mobileQuotesContainer}>
          {quotes.map((quoteGroup, index) => (
              <React.Fragment key={quoteGroup.video_id || `quote-group-${index}`}>
                  <div className={styles.mobileQuoteGroup}>
                  <div className={styles.mobileVideoTitle}>
                      {quoteGroup.quotes[0]?.title || 'N/A'}
                  </div>

                  <div className={styles.mobileVideoContainer}>
                      <YouTubePlayer
                          key={`${quoteGroup.video_id}-${retryCount}`}
                          videoId={quoteGroup.video_id}
                          timestamp={activeTimestamp.videoId === quoteGroup.video_id ? activeTimestamp.timestamp : null}
                          onTimestampClick={handleTimestampClick}
                      />
                  </div>

                  <div className={styles.mobileVideoInfo}>
                      {quoteGroup.quotes[0]?.channel_source || 'N/A'} - {quoteGroup.quotes[0]?.upload_date
                          ? formatDate(quoteGroup.quotes[0].upload_date)
                          : 'N/A'}
                  </div>

                  <div className={styles.mobileQuotesList}>
                      {quoteGroup.quotes?.map((quote, index) => (
                          <div className={`${styles.mobileQuoteItem} ${index === quoteGroup.quotes.length - 1 ? styles.mobileQuoteItemLast : ''}`} key={index}>
                              <button
                                  onClick={() => handleTimestampClick(quoteGroup.video_id, backdateTimestamp(quote.timestamp_start))}
                                  className={styles.mobileQuoteButton}
                              >
                                  <span className={styles.quoteText} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(quote.text, { ALLOWED_TAGS }) }} />
                                  <span className={styles.quoteTimestamp}>
                                      ({formatTimestamp(backdateTimestamp(quote.timestamp_start))})
                                  </span>
                              </button>

                              <div className={styles.mobileActionButtons}>
                                  <button
                                      onClick={(e) => {
                                          const button = e.currentTarget;
                                          trackQuoteEvent('quote_copy', quoteGroup.video_id, backdateTimestamp(quote.timestamp_start));
                                          const textToCopy = quote.text.replace(/<[^>]*>/g, '');
                                          navigator.clipboard.writeText(textToCopy).then(() => {
                                              const originalText = button.innerHTML;
                                              button.innerHTML = '✓';
                                              button.classList.add(styles.copied);
                                              setTimeout(() => {
                                                  button.innerHTML = originalText;
                                                  button.classList.remove(styles.copied);
                                              }, 1000);
                                          }).catch(() => {});
                                      }}
                                      className={styles.mobileActionButton}
                                      title="Copy quote to clipboard" aria-label="Copy quote to clipboard"
                                  >
                                      📋
                                  </button>

                                  <button
                                      onClick={() => {
                                          trackQuoteEvent('youtube_open', quoteGroup.video_id, backdateTimestamp(quote.timestamp_start));
                                          window.open(`https://www.youtube.com/watch?v=${quoteGroup.video_id}&t=${Math.floor(backdateTimestamp(quote.timestamp_start))}`, '_blank');
                                      }}
                                      className={styles.mobileActionButton}
                                      title="Open quote in YouTube" aria-label="Open quote in YouTube"
                                  >
                                      ↗
                                  </button>

                                  <button
                                      onClick={() => {
                                          trackQuoteEvent('tweet_share', quoteGroup.video_id, backdateTimestamp(quote.timestamp_start));
                                          const videoUrl = `https://youtu.be/${quoteGroup.video_id}?t=${Math.floor(backdateTimestamp(quote.timestamp_start))}`;
                                          const pageUrl = window.location.href;
                                          const cleanSearchTerm = searchTerm.replace(/"/g, '');
                                          const tweetText = totalQuotes === 1 
                                              ? `The only quote mentioning "${cleanSearchTerm}": ${videoUrl}\n\nFound on: ${pageUrl}`
                                              : `Just one of ${totalQuotes} quotes mentioning "${cleanSearchTerm}": ${videoUrl}\n\nSee them all here! ${pageUrl}`;
                                          window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`, '_blank');
                                      }}
                                      className={styles.mobileActionButton}
                                      title="Share quote on X" aria-label="Share quote on X"
                                  >
                                      𝕏
                                  </button>

                                  <button
                                      onClick={() => handleFlagClick(
                                          quote.text,
                                          quoteGroup.video_id,
                                          quoteGroup.quotes[0]?.title,
                                          quoteGroup.quotes[0]?.channel_source,
                                          quote.timestamp_start
                                      )}
                                      disabled={flagging[`${quoteGroup.video_id}-${quote.timestamp_start}`]}
                                      className={`${styles.mobileActionButton} ${styles.flagButton}`}
                                      title="Flag quote as invalid" aria-label="Flag quote as invalid"
                                  >
                                      {flagging[`${quoteGroup.video_id}-${quote.timestamp_start}`] ? '⏳' : '🚩'}
                                  </button>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
              </React.Fragment>
          ))}
      </div>
    );
  };

  return (
      <div>
          {quotes.length > 0 ? (
              <>
                  {isMobileView ? renderMobileLayout() : renderDesktopLayout()}
              </>
          ) : loading ? null : (
              <div className={styles.noQuotes}>
                  No quotes found
              </div>
          )}
          <FlagModal
              isOpen={modalState.isOpen}
              onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))}
              onSubmit={handleFlagSubmit}
              quote={modalState.quote}
          />
      </div>
  );
};