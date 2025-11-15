import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const BASE_URL = 'https://nlquotes.com';

/**
 * Hook to manage SEO meta tags dynamically based on route and content
 */
export const useSEO = ({ 
  title, 
  description, 
  keywords,
  image = `${BASE_URL}/NLogo.png`,
  type = 'website',
  noindex = false,
  canonical
}) => {
  const location = useLocation();
  
  useEffect(() => {
    // Get current URL
    const currentUrl = `${BASE_URL}${location.pathname}${location.search}`;
    const canonicalUrl = canonical || `${BASE_URL}${location.pathname}`;
    
    // Update or create title
    document.title = title || 'Northernlion Quotes, Moments & Videos – Northernpedia (NL Archive Search)';
    
    // Helper function to update or create meta tag
    const updateMetaTag = (selector, attribute, value) => {
      let element = document.querySelector(selector);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute.split(':')[0], attribute.split(':')[1] || attribute);
        document.head.appendChild(element);
      }
      element.setAttribute('content', value);
    };
    
    // Update description
    updateMetaTag('meta[name="description"]', 'name', description || 'Search Northernlion (NL) quotes, iconic moments, and video clips with Northernpedia. Instantly find highlights from Northernlion\'s YouTube videos and Twitch streams using AI-powered transcription.');
    
    // Update keywords if provided
    if (keywords) {
      updateMetaTag('meta[name="keywords"]', 'name', keywords);
    }
    
    // Update or create canonical URL
    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', canonicalUrl);
    
    // Update Open Graph tags
    updateMetaTag('meta[property="og:title"]', 'property', title || 'Northernlion Quotes & NL Moments – Northernpedia');
    updateMetaTag('meta[property="og:description"]', 'property', description || 'Northernpedia is the ultimate archive of Northernlion\'s videos and streams. Search NL quotes, find memorable moments, discover classic clips, and explore highlights using advanced AI transcription.');
    updateMetaTag('meta[property="og:url"]', 'property', currentUrl);
    updateMetaTag('meta[property="og:type"]', 'property', type);
    updateMetaTag('meta[property="og:image"]', 'property', image);
    
    // Update Twitter Card tags
    updateMetaTag('meta[name="twitter:title"]', 'name', title || 'Northernlion Quotes & NL Moments – Northernpedia');
    updateMetaTag('meta[name="twitter:description"]', 'name', description || 'Search Northernlion (NL) quotes, clips, and moments using Northernpedia\'s AI-powered archive of YouTube and Twitch content.');
    updateMetaTag('meta[name="twitter:url"]', 'name', currentUrl);
    updateMetaTag('meta[name="twitter:image"]', 'name', image);
    
    // Handle robots meta tag for noindex
    if (noindex) {
      updateMetaTag('meta[name="robots"]', 'name', 'noindex, nofollow');
    } else {
      // Remove noindex if it exists
      const robotsMeta = document.querySelector('meta[name="robots"]');
      if (robotsMeta && robotsMeta.content.includes('noindex')) {
        robotsMeta.remove();
      }
    }
    
  }, [title, description, keywords, image, type, noindex, canonical, location]);
};

