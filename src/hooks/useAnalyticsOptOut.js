import { useState, useEffect } from 'react';

export function useAnalyticsOptOut() {
  const [isOptedOut, setIsOptedOut] = useState(() => {
    const stored = localStorage.getItem('analytics_opt_out');
    return stored === 'true';
  });

  useEffect(() => {
    localStorage.setItem('analytics_opt_out', isOptedOut.toString());
    // Umami's own kill switch, so opting out disables both systems
    if (isOptedOut) {
      localStorage.setItem('umami.disabled', '1');
    } else {
      localStorage.removeItem('umami.disabled');
    }
  }, [isOptedOut]);

  const toggleOptOut = () => {
    setIsOptedOut(prev => !prev);
  };

  return { isOptedOut, toggleOptOut };
}
