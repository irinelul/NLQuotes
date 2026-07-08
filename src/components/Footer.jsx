import { Link } from 'react-router-dom'
import { TENANT } from '../config/tenant'
import { track } from '../services/analytics'

export const Footer = ({ onChangelogClick }) => {
    // Use hard-bound tenant config (resolved at build time, no flickering)
    const footerText = TENANT.texts?.footerText || 'Made with passion by a fan';
    
    return (
        <div className="footer-message">
            {footerText} • <a href="https://github.com/irinelul/NLQuotes" target="_blank" rel="noopener noreferrer" onClick={() => track('external_link', { props: { target: 'github' } })} style={{ color: 'inherit', textDecoration: 'underline' }}>GitHub</a> • <Link to="/privacy" style={{ color: 'inherit', textDecoration: 'underline' }}>Privacy</Link> • <button onClick={onChangelogClick} style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', padding: 0, margin: 0 }}>Changelog</button>
        </div>
    )
}