import { Link } from 'react-router-dom'

export const Footer = ({ onChangelogClick }) => (
    <div className="footer-message">
        Made with passion by a fan • Generously supported by The Librarian • Contributors: Xetera, samfry13, JordanWeatherby, knakamura13 • <a href="https://github.com/irinelul/NLQuotes" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>GitHub</a> • <Link to="/privacy" style={{ color: 'inherit', textDecoration: 'underline' }}>Privacy</Link> • <button onClick={onChangelogClick} style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', padding: 0, margin: 0 }}>Changelog</button>
    </div>
)