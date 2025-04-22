import styles from './Disclaimer.module.css';

const Disclaimer = () => {
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
                    <p>🔍 Mahdi vacation → Finds: "Mahdi is on vacation", "vacation with Mahdi"</p>
                    <p>🔍 egg pog → Finds: "egg pog moment", "pog egg", "egg pogging"</p>
                  </div>
                </div>
                <div className={styles.example}>
                  <p className={styles.exampleTitle}>Exact Phrase Search:</p>
                  <p>Use double quotes for precise matches:</p>
                  <div className={styles.exampleDescription}>
                    <p>🔍 "Mahdi vacation" → Only finds: "Mahdi vacation" (exact phrase)</p>
                    <p>🔍 "egg pog" → Only finds: "egg pog" (exact phrase)</p>
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
                  <p>Instead of: "Maushold family of three"</p>
                  <p>Try: "family of three"</p>
                </div>
                <div className={styles.example}>
                  <p>Instead of: "mahdi is on vacation"</p>
                  <p>Try: "is on vacation"</p>
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
        </div>
      </div>
    </div>
  );
};

export default Disclaimer; 