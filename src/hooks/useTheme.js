import { useState, useEffect } from 'react';

// Initialize theme on module load (before React renders)
const initializeTheme = () => {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  return savedTheme;
};

// Initialize immediately
const initialTheme = initializeTheme();

export const useTheme = () => {
  const [theme, setTheme] = useState(() => {
    // Read from localStorage on each component mount to ensure sync
    return localStorage.getItem('theme') || 'dark';
  });

  useEffect(() => {
    // Sync with localStorage on mount in case it changed on another page
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme !== theme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  }, []);

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
    setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark');
  };

  return { theme, toggleTheme };
};

