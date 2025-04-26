import { useEffect, useRef } from 'react';
import getUserHash from '../utils/userHash';

function parseQueryParams(search) {
  const params = {};
  new URLSearchParams(search).forEach((v, k) => { params[k] = v; });
  return params;
}

// Function to generate a unique session ID
function generateSessionId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Function to parse timezone into region and city
function parseTimezone(timezone) {
  const [region, city] = timezone.split('/');
  return {
    region: region || 'Unknown',
    city: city || 'Unknown'
  };
}

// Function to detect device type
function detectDevice() {
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

// Function to detect OS
function detectOS() {
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'MacOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iOS')) return 'iOS';
  return 'Unknown';
}

// Function to detect browser
function detectBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  if (ua.includes('Opera')) return 'Opera';
  return 'Unknown';
}

// Function to get screen size
function getScreenSize() {
  return {
    width: window.screen.width,
    height: window.screen.height,
    pixelRatio: window.devicePixelRatio
  };
}

// Function to send analytics data
const sendAnalytics = (type, data) => {
  console.log('sendAnalytics called:', type, data);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { region, city } = parseTimezone(timezone);

  const payload = {
    type,
    ...data,
    user_hash: getUserHash(),
    timestamp: new Date().toISOString(),
    device: detectDevice(),
    os: detectOS(),
    browser: detectBrowser(),
    screen: getScreenSize(),
    language: navigator.language,
    timezone,
    region,
    city
  };

  const getAnalyticsUrl = () => {
    if (
      window.location.hostname === 'localhost' &&
      window.location.port === '5173'
    ) {
      return 'http://localhost:3001/analytics';
    }
    return '/analytics';
  };

  // TEMP: Use fetch instead of sendBeacon for debugging
  fetch(getAnalyticsUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true
  }).then(res => {
    console.log('Analytics POST response:', res.status);
  }).catch(err => {
    console.error('Analytics POST error:', err);
  });

  // navigator.sendBeacon(
  //   getAnalyticsUrl(),
  //   new Blob([JSON.stringify(payload)], { type: 'application/json' })
  // );
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