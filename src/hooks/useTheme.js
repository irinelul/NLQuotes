import { useState, useEffect } from 'react';
import { track } from '../services/analytics';

// Initialize theme on module load (before React renders)
const initializeTheme = () => {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  return savedTheme;
};

// Initialize immediately
initializeTheme();

export const useTheme = () => {
  const [theme, setTheme] = useState(() => {
    // Read from localStorage on each component mount to ensure sync
    return localStorage.getItem('theme') || 'dark';
  });

  useEffect(() => {
    // Listen for storage changes (when theme changes in another tab/page)
    const handleStorageChange = (e) => {
      if (e.key === 'theme' && e.newValue) {
        setTheme(e.newValue);
        document.documentElement.setAttribute('data-theme', e.newValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    // Apply theme to document root whenever theme changes
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => {
      const next = prevTheme === 'dark' ? 'light' : 'dark';
      track('theme_toggle', { props: { theme: next } });
      return next;
    });
  };

  return { theme, toggleTheme };
};

