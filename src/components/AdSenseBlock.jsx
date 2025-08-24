import React from 'react';

export const AdSenseBlock = ({ 
  className = '', 
  style = {}, 
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
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '20px auto',
        ...style
      }}
    >
      {/* AdSense ad will be placed here */}
    </div>
  );
};
