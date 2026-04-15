import { useEffect, useRef } from 'react';
// Function to generate a unique session ID
function generateSessionId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Function to send analytics data
const sendAnalytics = (type, data) => {
  void type;
  void data;
};

export function useAnalyticsTracker() {
  const startTimeRef = useRef(Date.now());
  const startTimeISORef = useRef(new Date().toISOString());
  const hasSentAnalyticsRef = useRef(false);
  const sessionIdRef = useRef(generateSessionId());

  useEffect(() => {
    // Update refs when the component mounts
    startTimeRef.current = Date.now();
    startTimeISORef.current = new Date().toISOString();

    function handleUnload() {
      // Prevent duplicate sends
      if (hasSentAnalyticsRef.current) {
        return;
      }
      hasSentAnalyticsRef.current = true;

      const duration = Math.round((Date.now() - startTimeRef.current) / 1000);

      // Get current URL and parameters at unload time
      const currentUrl = new URL(window.location.href);
      // const query = parseQueryParams(currentUrl.search); // Don't use query params for unload

      // Only send analytics if the user spent at least 1 second on the page
      if (duration >= 1) {
        sendAnalytics('ending_session', {
          path: currentUrl.pathname,
          query_params: {}, // No query params on unload
          referrer: document.referrer,
          start_time: startTimeISORef.current,
          duration_seconds: duration,
          session_id: sessionIdRef.current,
          event: 'unload' // Mark this as a page unload event
        });
      }
    }

    // Only use beforeunload event
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []); // Empty dependency array since we're using refs

  // Return the session ID for use in other components
  return sessionIdRef.current;
}

// Export the sendAnalytics function for use in other components
export { sendAnalytics }; 