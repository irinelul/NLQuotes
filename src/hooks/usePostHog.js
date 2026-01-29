import { useEffect } from 'react';
import posthog from 'posthog-js';
import { IS_NORTHERNLION, TENANT_ID, TENANT } from '../config/tenant';
import { useAnalyticsOptOut } from './useAnalyticsOptOut';

// Initialize PostHog at module load time (build-time decision)
// This way, PostHog code can be tree-shaken for NL builds
let posthogInstance = null;

if (!IS_NORTHERNLION) {
  // Only initialize PostHog for non-NL tenants (determined at build time)
  const posthogKey = import.meta.env.VITE_POSTHOG_KEY || import.meta.env.POSTHOG_KEY;
  const posthogHost = import.meta.env.VITE_POSTHOG_HOST || import.meta.env.POSTHOG_HOST || 'https://app.posthog.com';

  if (posthogKey) {
    try {
      posthog.init(posthogKey, {
        api_host: posthogHost,
        loaded: (ph) => {
          // Set user properties based on tenant (build-time config)
          ph.identify(TENANT_ID, {
            tenant: TENANT_ID,
            tenant_name: TENANT.name,
            site_name: TENANT.metadata?.siteName || TENANT.displayName,
          });

          console.log('[PostHog] Initialized for tenant:', TENANT_ID);
        },
        // Disable session recording by default for privacy
        disable_session_recording: true,
        // Enable autocapture to track clicks, form submissions, etc. automatically
        autocapture: true,
        // Automatically capture pageviews on route changes
        capture_pageview: true,
        // Respect do not track
        respect_dnt: true,
      });
      posthogInstance = posthog;
    } catch (error) {
      console.error('[PostHog] Initialization error:', error);
    }
  } else {
    console.warn('[PostHog] PostHog API key not found. Set VITE_POSTHOG_KEY environment variable.');
  }
}

/**
 * PostHog analytics hook
 * Only returns PostHog instance for non-NL tenants (determined at build time)
 * Respects user's analytics opt-out preference at runtime
 */
export function usePostHog() {
  const { isOptedOut } = useAnalyticsOptOut();

  useEffect(() => {
    // Handle opt-out/opt-in changes at runtime
    if (!posthogInstance) {
      return; // PostHog not initialized (NL tenant or missing key)
    }

    if (isOptedOut) {
      if (typeof posthogInstance.opt_out_capturing === 'function') {
        posthogInstance.opt_out_capturing();
      }
    } else {
      if (typeof posthogInstance.opt_in_capturing === 'function') {
        posthogInstance.opt_in_capturing();
      }
    }
  }, [isOptedOut]);

  // Return PostHog instance only if initialized and user hasn't opted out
  if (!posthogInstance) {
    return null;
  }

  // Check if PostHog is ready and user hasn't opted out
  const isReady = typeof posthogInstance.capture === 'function' && !isOptedOut;
  return isReady ? posthogInstance : null;
}
