import { useEffect, useRef } from 'react';
import { TENANT } from '../config/tenant';

/**
 * AdSense component for displaying Google AdSense ads
 * Only renders ads for tenants that should have ads (excludes nlquotes/northernlion)
 * 
 * @param {Object} props
 * @param {string} props.slotId - AdSense ad slot ID (optional, uses auto-ads if not provided)
 * @param {string} props.format - Ad format (e.g., 'auto', 'horizontal', 'vertical')
 * @param {string} props.style - Additional CSS styles
 * @param {string} props.className - Additional CSS classes
 */
export const AdSense = ({ slotId, format = 'auto', style = {}, className = '' }) => {
  const adRef = useRef(null);
  const scriptLoaded = useRef(false);
  
  // Don't render ads for nlquotes/northernlion tenant
  const shouldShowAds = TENANT.id !== 'northernlion' && TENANT.id !== 'nlquotes';
  
  useEffect(() => {
    if (!shouldShowAds) {
      return;
    }
    
    // Load AdSense script if not already loaded
    if (!scriptLoaded.current && !window.adsbygoogle) {
      const script = document.createElement('script');
      script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3762231556668854';
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.setAttribute('data-ad-client', 'ca-pub-3762231556668854');
      document.head.appendChild(script);
      scriptLoaded.current = true;
      
      // Initialize adsbygoogle array if it doesn't exist
      window.adsbygoogle = window.adsbygoogle || [];
    }
    
    // Initialize ad if we have a ref
    if (adRef.current) {
      try {
        // Wait for the script to load if needed
        const initAd = () => {
          if (window.adsbygoogle && adRef.current) {
            try {
              window.adsbygoogle.push({});
            } catch (error) {
              console.error('Error pushing ad to adsbygoogle:', error);
            }
          } else {
            // Retry after a short delay if script isn't loaded yet
            setTimeout(initAd, 100);
          }
        };
        
        // Give it a moment for the script to load
        setTimeout(initAd, 500);
      } catch (error) {
        console.error('Error initializing AdSense ad:', error);
      }
    }
  }, [shouldShowAds]);
  
  if (!shouldShowAds) {
    return null;
  }
  
  return (
    <div 
      className={`adsense-container ${className}`}
      style={{
        minHeight: format === 'horizontal' ? '90px' : format === 'vertical' ? '250px' : 'auto',
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        margin: '1rem 0',
        ...style
      }}
    >
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{
          display: 'block',
          width: '100%',
          maxWidth: format === 'horizontal' ? '728px' : format === 'vertical' ? '300px' : '100%',
          minHeight: format === 'horizontal' ? '90px' : format === 'vertical' ? '250px' : '100px'
        }}
        data-ad-client="ca-pub-3762231556668854"
        data-ad-slot={slotId}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
};

export default AdSense;
