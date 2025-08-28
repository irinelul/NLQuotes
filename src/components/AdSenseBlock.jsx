import React, { useEffect, useRef } from 'react';

export const AdSenseBlock = ({
  className = '',
  style = {},
  size = 'responsive',
  client,
  slot,
  format = 'auto',
  fullWidthResponsive = true
}) => {
  const adRef = useRef(null);

  // Load AdSense script once with the provided client ID
  useEffect(() => {
    if (!client) return;

    const scriptSrc = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    const existing = document.querySelector(`script[src^="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?"]`);
    if (!existing) {
      const s = document.createElement('script');
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = scriptSrc;
      document.head.appendChild(s);
    }
  }, [client]);

  // Request ad after mount
  useEffect(() => {
    if (!window.adsbygoogle) {
      window.adsbygoogle = [];
    }
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      // Ignore if not ready yet; AdSense will try again later
    }
  }, [slot]);

  // Map size to basic container height hints (not required for responsive ads)
  const adHeights = {
    small: '250px',
    medium: '90px',
    large: '250px',
    responsive: 'auto'
  };

  const containerHeight = adHeights[size] || adHeights.responsive;

  return (
    <div
      className={`adsense-block ${className}`}
      style={{
        width: '100%',
        minHeight: containerHeight === 'auto' ? undefined : containerHeight,
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: '8px',
        display: 'block',
        margin: '20px auto',
        ...style
      }}
    >
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={fullWidthResponsive ? 'true' : 'false'}
      />
    </div>
  );
};
