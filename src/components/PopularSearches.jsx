import React, { useState, useEffect } from 'react';
import { AdSenseBlock } from './AdSenseBlock';
import { Link } from 'react-router-dom';
import styles from './PopularSearches.module.css';

export const PopularSearches = () => {
  const [popularTerms, setPopularTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('7d');

  useEffect(() => {
    const fetchPopularTerms = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/popular-searches?timeRange=${timeRange}`);
        if (!response.ok) {
          throw new Error('Failed to fetch popular searches');
        }
        const data = await response.json();
        setPopularTerms(data.terms || []);
      } catch (err) {
        console.error('Error fetching popular searches:', err);
        setError('Failed to load popular searches');
      } finally {
        setLoading(false);
      }
    };

    fetchPopularTerms();
  }, [timeRange]);

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p className={styles.loadingText}>Loading popular searches...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <p className={styles.errorText}>{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className={styles.retryButton}
        >
          Try Again
        </button>
      </div>
    );
  }

  // Calculate total searches and max count for popularity bars
  const totalSearches = popularTerms.reduce((sum, term) => sum + parseInt(term.count), 0);
  const maxCount = Math.max(...popularTerms.map(term => parseInt(term.count)));

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Popular Searches</h1>
        <p className={styles.subtitle}>
          Discover the most searched quotes and topics from Northernlion's content. 
          Click on any term to explore related quotes and moments.
        </p>
        
                 {/* Time Range Selector */}
         <div className={styles.timeSelector}>
           <label htmlFor="timeRange" className={styles.timeLabel}>Time Range:</label>
           <select
             id="timeRange"
             value={timeRange}
             onChange={(e) => setTimeRange(e.target.value)}
             className={styles.timeSelect}
           >
             <option value="1d">Last 24 Hours</option>
             <option value="2d">Last 2 Days</option>
             <option value="7d">Last 7 Days</option>
             <option value="30d">Last 30 Days</option>
             <option value="90d">Last 90 Days</option>
             <option value="all">All Time</option>
           </select>
         </div>
         
         {/* Stats Bar */}
         <div className={styles.statsBar}>
           <div className={styles.statItem}>
             <span className={styles.statNumber}>{popularTerms.length}</span>
             <span className={styles.statLabel}>Topics</span>
           </div>
           <div className={styles.statItem}>
             <span className={styles.statNumber}>{totalSearches.toLocaleString()}</span>
             <span className={styles.statLabel}>Total Searches</span>
           </div>
           <div className={styles.statItem}>
             <span className={styles.statNumber}>{Math.round(totalSearches / popularTerms.length)}</span>
             <span className={styles.statLabel}>Avg. Searches</span>
           </div>
         </div>
             </div>

       {/* Top AdSense Block */}
       <div className={styles.adsenseTop}>
        <AdSenseBlock 
          size="responsive"
          client="ca-pub-3762231556668854"
          slot="4150404435"
          format="auto"
          fullWidthResponsive={true}
        />
       </div>

       {/* Popular Terms Grid */}
      <div className={styles.termsGrid}>
        {popularTerms.map((term, index) => {
          const count = parseInt(term.count);
          const popularityPercentage = (count / maxCount) * 100;
          
          return (
            <div key={term.search_term} className={styles.termCard}>
              {/* Rank Badge */}
              <div className={`${styles.rankBadge} ${
                index === 0 ? styles.rank1 : 
                index === 1 ? styles.rank2 : 
                index === 2 ? styles.rank3 : 
                styles.rankOther
              }`}>
                {index + 1}
              </div>

              {/* Search Count */}
              <div className={styles.searchCount}>
                {count.toLocaleString()} searches
              </div>

              {/* Term Text */}
              <h3 className={styles.termText}>
                {term.search_term}
              </h3>

              {/* Popularity Bar */}
              <div className={styles.popularityBar}>
                <div 
                  className={styles.popularityFill}
                  style={{ '--popularity-width': `${popularityPercentage}%` }}
                ></div>
              </div>

                             {/* Term Description */}
               <p className={styles.termDescription}>
                 Click to search for quotes about "{term.search_term}"
               </p>

                             {/* Explore Button */}
               <Link
                 to={`/search?q=${encodeURIComponent(term.search_term)}`}
                 className={styles.exploreButton}
               >
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                 </svg>
                 Explore Quotes
               </Link>
            </div>
          );
                 })}
       </div>

       {/* Bottom AdSense Block */}
       <div className={styles.adsenseBottom}>
        <AdSenseBlock 
          size="responsive"
          client="ca-pub-3762231556668854"
          slot="4150404435"
          format="auto"
          fullWidthResponsive={true}
        />
       </div>

       {/* Back to Search Link */}
      <div className="text-center mt-8">
        <Link
          to="/search"
          className={styles.backButton}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Back to Search
        </Link>
      </div>
    </div>
  );
};
