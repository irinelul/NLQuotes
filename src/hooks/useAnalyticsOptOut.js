import { useState, useEffect } from 'react';

export function useAnalyticsOptOut() {
  const [isOptedOut, setIsOptedOut] = useState(() => {
    const stored = localStorage.getItem('analytics_opt_out');
    return stored === 'true';
  });

  useEffect(() => {
    localStorage.setItem('analytics_opt_out', isOptedOut.toString());
  }, [isOptedOut]);

  const toggleOptOut = () => {
    setIsOptedOut(prev => !prev);
  };

  return { isOptedOut, toggleOptOut };
} 