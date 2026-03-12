import { useState, useEffect } from 'react';

/**
 * Hook to manage analytics opt-out across both in-house analytics
 * and Umami tracking.
 *
 * When the user opts out:
 *   - localStorage 'analytics_opt_out' is set to 'true' (in-house, legacy)
 *   - localStorage 'umami.disabled' is set to '1'    (Umami standard)
 *
 * When the user opts back in:
 *   - Both keys are removed so tracking resumes on next page load.
 */
export function useAnalyticsOptOut() {
  const [isOptedOut, setIsOptedOut] = useState(() => {
    return localStorage.getItem('analytics_opt_out') === 'true';
  });

  useEffect(() => {
    if (isOptedOut) {
      localStorage.setItem('analytics_opt_out', 'true');
      // Umami checks this key — '1' disables tracking
      localStorage.setItem('umami.disabled', '1');
    } else {
      localStorage.removeItem('analytics_opt_out');
      localStorage.removeItem('umami.disabled');
    }
  }, [isOptedOut]);

  const toggleOptOut = () => {
    setIsOptedOut(prev => !prev);
  };

  return { isOptedOut, toggleOptOut };
}
