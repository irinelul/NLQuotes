import { Link } from 'react-router-dom'
import { TENANT } from '../config/tenant'
import { track } from '../services/analytics'
import styles from './Footer.module.css'

export const Footer = ({ onChangelogClick }) => {
    // Use hard-bound tenant config (resolved at build time, no flickering)
    const footerText = TENANT.texts?.footerText || 'Made with passion by a fan';
    
    return (
        <div className={styles.footerMessage}>
            {footerText} • <a href="https://github.com/irinelul/NLQuotes" target="_blank" rel="noopener noreferrer" onClick={() => track('external_link', { props: { target: 'github' } })} className={styles.footerLink}>GitHub</a> • <Link to="/privacy" className={styles.footerLink}>Privacy</Link> • <button onClick={onChangelogClick} className={styles.footerButton}>Changelog</button>
        </div>
    )
}