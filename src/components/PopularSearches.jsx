import React, { useState, useEffect } from 'react';
import { AdSenseBlock } from './AdSenseBlock';
import { Link } from 'react-router-dom';

export const PopularSearches = () => {
  const [popularTerms, setPopularTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPopularTerms = async () => {
      try {
        setLoading(true);
        const response = await fetch('http://localhost:8080/api/popular-searches');
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
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading popular searches...</p>
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

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Popular Searches
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Discover the most searched quotes and topics from Northernlion's content. 
          Click on any term to explore related quotes and moments.
        </p>
      </div>

      {/* Top AdSense Block */}
      <AdSenseBlock 
        size="large" 
        placeholder="Top Banner Advertisement"
        style={{ marginBottom: '40px' }}
      />

      {/* Popular Terms Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {popularTerms.map((term, index) => (
          <Link
            key={term.search_term}
            to={`/topic/${encodeURIComponent(term.search_term)}`}
            className="group block p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-200 hover:border-blue-300"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl font-bold text-blue-600">
                #{index + 1}
              </span>
              <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                {term.count} searches
              </span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors duration-200 mb-2">
              {term.search_term}
            </h3>
            <p className="text-sm text-gray-600">
              Click to explore quotes about "{term.search_term}"
            </p>
          </Link>
        ))}
      </div>

      {/* Bottom AdSense Block */}
      <AdSenseBlock 
        size="medium" 
        placeholder="Bottom Advertisement"
        style={{ marginTop: '40px' }}
      />

      {/* Back to Search Link */}
      <div className="text-center mt-8">
        <Link
          to="/search"
          className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors duration-200"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Back to Search
        </Link>
      </div>
    </div>
  );
};
