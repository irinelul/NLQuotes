import { Link } from 'react-router-dom'

export const Footer = () => (
    <div className="footer-message">
        Made with passion by a fan • Generously supported by The Librarian • Contributors: Xetera, samfry13, JordanWeatherby, knakamura13 • <a href="https://github.com/irinelul/NLQuotes" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>GitHub</a> • <Link to="/privacy" style={{ color: 'inherit', textDecoration: 'underline' }}>Privacy</Link>
    </div>
)