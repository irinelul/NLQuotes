import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useTenant } from '../hooks/useTenant';
import { TENANT as TENANT_CONFIG, IS_HIVEMIND } from '../config/tenant';
import styles from './Stats.module.css';

// Public Metabase dashboard (view-only, aggregate data) embedded in the page.
// Hash params control Metabase's embed chrome: theme follows the site,
// refresh every 30 min.
//
// Sizing — three layers, most reliable wins:
// 1. CSS fallback: a viewport-based height, so the dashboard is usable (it
//    scrolls internally) even if no resize protocol ever connects.
// 2. iframe-resizer handshake (the real fix): Metabase bundles the
//    iframe-resizer *child*, which announces "[iFrameResizerChild]Ready" and
//    then streams its true content height ("[iFrameSizer]id:h:w:type") for
//    every layout change — but only after the parent (us) replies with an
//    init message. Without the reply it stays dormant forever.
// 3. Metabase's own { metabase: { frame: { height } } } message is a trap:
//    the embed body is 100% tall, so it just echoes the iframe's current
//    height back. Treated as grow-only, lowest priority.
const MB_FRAME_ID = 'mb-dashboard';
// iframe-resizer v4 parent init string (positional options the child parses).
// heightCalculationMethod = lowestElement: measured from the content itself,
// so it can't echo the iframe's own height the way body-based methods do.
const MB_RESIZER_INIT = `[iFrameSizer]${MB_FRAME_ID}:8:false:false:32:true:true:null:lowestElement:null:null:0:false:child:scroll:true`;
// Child event types whose height is a real content measurement. 'init' and
// 'reset' measure the (100%-tall) body and just echo our own height back —
// applying those causes a grow/shrink ping-pong.
const MB_TRUSTED_SIZE_TYPES = new Set(['mutationObserver', 'interval', 'size', 'resize', 'resizeObserver']);

const MetabaseDashboard = ({ url, theme, siteName }) => {
  const frameRef = useRef(null);

  useEffect(() => {
    if (!url) return;
    const metabaseOrigin = new URL(url).origin;
    let resizerActive = false;

    const applyHeight = (h) => {
      const height = Math.ceil(parseFloat(h));
      if (height > 0 && frameRef.current) {
        frameRef.current.style.height = `${height}px`;
        frameRef.current.classList.add(styles.dashboardContainerIframeLoaded);
      }
    };

    const sendResizerInit = () => {
      try {
        frameRef.current?.contentWindow?.postMessage(MB_RESIZER_INIT, metabaseOrigin);
      } catch {
        // iframe not ready — a later Ready/retry will cover it
      }
    };

    const onMessage = (e) => {
      if (e.origin !== metabaseOrigin) return;
      if (typeof e.data === 'string') {
        if (e.data === '[iFrameResizerChild]Ready') {
          sendResizerInit();
        } else if (e.data.startsWith('[iFrameSizer]')) {
          const [id, height, , type] = e.data.slice('[iFrameSizer]'.length).split(':');
          if (id === MB_FRAME_ID) {
            resizerActive = true;
            if (MB_TRUSTED_SIZE_TYPES.has(type)) applyHeight(height);
          }
        }
        return;
      }
      // Echo-prone legacy message: only ever let it grow the frame.
      const height = e.data?.metabase?.frame?.height;
      if (!resizerActive && height > 0 && frameRef.current
          && height > frameRef.current.getBoundingClientRect().height + 20) {
        applyHeight(height);
      }
    };

    // The child's Ready can fire before our listener attaches (or be eaten by
    // an extension) — re-offer the handshake a few times after load.
    const retryTimers = [];
    const onFrameLoad = () => {
      [300, 1500, 4000].forEach((ms) => {
        retryTimers.push(setTimeout(() => { if (!resizerActive) sendResizerInit(); }, ms));
      });
    };
    const frame = frameRef.current;
    frame?.addEventListener('load', onFrameLoad);

    // On viewport width change the last measured height is stale (the grid
    // reflows). With a connected resizer, ask the child to re-measure; without
    // one, fall back to the CSS viewport height. (Width changes only: mobile
    // URL-bar show/hide fires resize with equal width.)
    let lastWidth = window.innerWidth;
    let resizeTimer;
    const onResize = () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!frameRef.current) return;
        if (resizerActive) {
          try {
            frameRef.current.contentWindow?.postMessage('[iFrameSizer]resize', metabaseOrigin);
          } catch {
            // ignore — next content mutation will re-report anyway
          }
        } else {
          frameRef.current.style.height = '';
        }
      }, 250);
    };

    window.addEventListener('message', onMessage);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('resize', onResize);
      frame?.removeEventListener('load', onFrameLoad);
      retryTimers.forEach(clearTimeout);
      clearTimeout(resizeTimer);
    };
  }, [url]);

  if (!url) return null;
  const hash = `#refresh=1800&bordered=false&titled=false${theme === 'dark' ? '&theme=night' : ''}`;
  return (
    <section className={styles.metabaseSection}>
      <h2 className={styles.msTitle}>Community dashboard</h2>
      <p className={styles.msSubtitle}>
        What everyone's searching, playing, and sharing — live, anonymous, aggregates only.
      </p>
      <div className={`${styles.dashboardContainer} ${styles.metabaseContainer}`}>
        <iframe
          ref={frameRef}
          key={`metabase-${theme}`}
          src={`${url}${hash}`}
          title={`${siteName} Usage Dashboard`}
          sandbox="allow-scripts allow-same-origin allow-popups"
          loading="eager"
          referrerPolicy="no-referrer"
          className={styles.dashboardContainerIframe}
        />
      </div>
    </section>
  );
};

const Stats = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { tenant, loading: tenantLoading } = useTenant();

  // Wait for tenant to load before rendering
  if (tenantLoading) {
    return (
      <div className={styles.statsContainer}>
        <h1>Loading...</h1>
      </div>
    );
  }

  const metabaseUrl = tenant?.metabase?.publicDashboardUrl || null;

  // Tenant-aware text
  const siteName = TENANT_CONFIG.displayName || TENANT_CONFIG.metadata?.siteName || 'NLQuotes';
  const statsTitle = `${siteName} Statistics`;
  const isHiveQuotes = IS_HIVEMIND;

  return (
    <div className={styles.statsContainer}>
      <div className={styles.titleSection}>
        <h1 className={styles.dashboardTitle}>{statsTitle}</h1>
        <div className={styles.statsSummary}>
          {!isHiveQuotes && tenant?.channels && (
            <>
              {tenant.channels.find(c => c.id === 'librarian') && (
                <p>Librarian has indexed 1,135 videos (Some older NLSS vids are assigned to Librarian but on different channel)</p>
              )}
              {tenant.channels.find(c => c.id === 'northernlion') && (
                <p>NL has 21,951 videos</p>
              )}
            </>
          )}
          <button className={styles.backButton} onClick={() => navigate('/')}>
            ← Back to Search
          </button>
        </div>
      </div>
      {metabaseUrl ? (
        <MetabaseDashboard url={metabaseUrl} theme={theme} siteName={siteName} />
      ) : (
        <div className={styles.errorMessage}>
          <p>No dashboard configured for this site yet.</p>
        </div>
      )}
    </div>
  );
};

export default Stats;
