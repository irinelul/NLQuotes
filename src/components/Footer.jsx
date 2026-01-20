import { Link } from 'react-router-dom'
import { useTenant } from '../hooks/useTenant'

export const Footer = ({ onChangelogClick }) => {
    const { tenant } = useTenant();
    const footerText = tenant?.texts?.footerText || 'Made with passion by a fan';
    
    return (
        <div className="footer-message">
            {footerText} • <a href="https://github.com/irinelul/NLQuotes" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>GitHub</a> • <Link to="/privacy" style={{ color: 'inherit', textDecoration: 'underline' }}>Privacy</Link> • <button onClick={onChangelogClick} style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', padding: 0, margin: 0 }}>Changelog</button>
        </div>
    )
}