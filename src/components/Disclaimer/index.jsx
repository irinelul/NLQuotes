import styles from './Disclaimer.module.css';
import { IS_NORTHERNLION } from '../../config/tenant';

/* eslint-disable react/no-unescaped-entities */

const Disclaimer = () => {
  // Use hard-bound tenant config (resolved at build time, no flickering)
  const isNorthernlion = IS_NORTHERNLION;
  
  // Tenant-aware examples (hard-bound at import time)
  const flexibleExample1 = isNorthernlion 
    ? '🔍 Mahdi vacation → Finds: "Mahdi is on vacation", "vacation with Mahdi"'
    : '🔍 music video → Finds: "music in the video", "video with music"';
  const flexibleExample2 = isNorthernlion
    ? '🔍 egg pog → Finds: "egg pog moment", "pog egg", "egg pogging"'
    : '🔍 best song → Finds: "best song ever", "song is the best", "best song moment"';
  const exactExample1 = isNorthernlion
    ? '🔍 "Mahdi vacation" → Only finds: "Mahdi vacation" (exact phrase)'
    : '🔍 "music video" → Only finds: "music video" (exact phrase)';
  const exactExample2 = isNorthernlion
    ? '🔍 "egg pog" → Only finds: "egg pog" (exact phrase)'
    : '🔍 "best song" → Only finds: "best song" (exact phrase)';
  
  return (
    <div className={styles.container}>
      <div className={styles.title}>
        <span>💡</span> Search Tips & Disclaimer
      </div>
      <div className={styles.content}>
        <p>
          Our tool uses AI transcription to search through videos. Due to the nature of speech recognition,
          some words might be transcribed differently than expected. Here are some tips to improve your search:
        </p>

        <div className={styles.tips}>
          <div className={styles.tip}>
            <span>⚡</span>
            <div>
              <strong>Flexible vs. Exact Searching</strong>
              <div className={styles.examples}>
                <div className={styles.example}>
                  <p className={styles.exampleTitle}>Flexible Search (Default):</p>
                  <p>Just type your keywords and find matches anywhere in the text:</p>
                  <div className={styles.exampleDescription}>
                    <p>{flexibleExample1}</p>
                    <p>{flexibleExample2}</p>
                  </div>
                </div>
                <div className={styles.example}>
                  <p className={styles.exampleTitle}>Exact Phrase Search:</p>
                  <p>Use double quotes for precise matches:</p>
                  <div className={styles.exampleDescription}>
                    <p>{exactExample1}</p>
                    <p>{exactExample2}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.tip}>
            <span>💡</span>
            <div>
              <strong>Be Flexible with Your Search Terms</strong>
              <p>Try different variations and focus on common words or phrases rather than specific names. You don't need to remember the entire quote - just search for the exact words you remember from within the quote.</p>
            </div>
          </div>

          <div className={styles.tip}>
            <span>📝</span>
            <div>
              <div className={styles.tipTitle}>
                <strong>Use Shorter Phrases or Keywords</strong>
                <span>
                  Search fewer words each time when you don't get results
                </span>
              </div>
              <div className={styles.examples}>
                <div className={styles.example}>
                  <p>Instead of: {isNorthernlion ? '"Maushold family of three"' : '"long complex phrase"'}</p>
                  <p>Try: {isNorthernlion ? '"family of three"' : '"complex phrase"'}</p>
                </div>
                <div className={styles.example}>
                  <p>Instead of: {isNorthernlion ? '"mahdi is on vacation"' : '"best song ever"'}</p>
                  <p>Try: {isNorthernlion ? '"is on vacation"' : '"best song"'}</p>
                </div>
                <div className={styles.example}>
                  <p>Instead of: "long complex phrase"</p>
                  <p>Try: "complex phrase"</p>
                  <p>
                    If no results → Try: "phrase"
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.tip}>
            <span>🚩</span>
            <div>
              <strong>Help Improve the Database</strong>
              <p>If you find incorrect transcriptions, use the flag button to help us improve the search results</p>
            </div>
          </div>

          <div className={styles.tip}>
            <span>📊</span>
            <div>
              <strong>Analytics Notice</strong>
              <p>We collect anonymous usage statistics to help improve the service. This includes information about how you use the site, such as page views and search terms. All data is anonymous and cannot be used to identify you. You can opt out at any time in the <a href="/privacy" style={{ color: 'var(--primary-color)', textDecoration: 'underline' }}>Privacy Policy</a>.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Disclaimer; 