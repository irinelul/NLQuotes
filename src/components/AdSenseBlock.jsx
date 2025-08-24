import React from 'react';

export const AdSenseBlock = ({ 
  className = '', 
  style = {}, 
  placeholder = 'AdSense Ad Placeholder',
  size = 'medium' 
}) => {
  // Define different ad sizes
  const adSizes = {
    small: { width: '300px', height: '250px' },
    medium: { width: '728px', height: '90px' },
    large: { width: '970px', height: '250px' },
    responsive: { width: '100%', height: '90px' }
  };

  const adSize = adSizes[size] || adSizes.medium;

  return (
    <div 
      className={`adsense-block ${className}`}
      style={{
        width: adSize.width,
        height: adSize.height,
        backgroundColor: '#f5f5f5',
        border: '2px dashed #ccc',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '20px auto',
        color: '#666',
        fontSize: '14px',
        fontWeight: '500',
        textAlign: 'center',
        ...style
      }}
    >
      <div>
        <div style={{ fontSize: '12px', marginBottom: '4px', color: '#999' }}>
          AdSense Advertisement
        </div>
        <div>{placeholder}</div>
        <div style={{ fontSize: '11px', marginTop: '4px', color: '#999' }}>
          {adSize.width} × {adSize.height}
        </div>
      </div>
    </div>
  );
};
