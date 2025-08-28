import React, { useEffect, useRef } from 'react';

// Loads the Google AdSense script once per page
function ensureAdSenseScriptLoaded(clientId) {
  const existing = document.querySelector('script[src^="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');
  if (existing) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
}

export const AdSenseBlock = ({ 
  className = '', 
  style = {}, 
  size = 'responsive',
  adClient = 'ca-pub-3762231556668854',
  adSlot,
  fullWidthResponsive = true
}) => {
  const insRef = useRef(null);

  useEffect(() => {
    if (!adClient || !adSlot) return;
    ensureAdSenseScriptLoaded(adClient);
    const pushAd = () => {
      try {
        if (window.adsbygoogle && insRef.current) {
          window.adsbygoogle.push({});
        }
      } catch (e) {
        // Ignore errors during initial fill
      }
    };
    // Try immediately and after a short delay in case script loads late
    pushAd();
    const t = setTimeout(pushAd, 500);
    return () => clearTimeout(t);
  }, [adClient, adSlot]);

  // Visual size hints (not enforced for responsive ads)
  const adSizes = {
    small: { width: '300px', height: '250px' },
    medium: { width: '728px', height: '90px' },
    large: { width: '970px', height: '250px' },
    responsive: { width: '100%', height: 'auto' }
  };
  const adSize = adSizes[size] || adSizes.responsive;

  return (
    <ins
      ref={insRef}
      className={`adsbygoogle ${className}`}
      style={{
        display: 'block',
        width: adSize.width,
        height: adSize.height,
        margin: '16px auto',
        ...style
      }}
      data-ad-client={adClient}
      data-ad-slot={adSlot}
      data-ad-format="auto"
      data-full-width-responsive={fullWidthResponsive ? 'true' : 'false'}
    />
  );
};
