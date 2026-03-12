import { useState, useEffect } from 'react';

// Available themes in cycle order
const THEMES = ['dark', 'light', 'warm', 'cool'];

// Theme display info
export const THEME_INFO = {
  dark:  { label: 'Dark',  icon: '🌙', next: '☀️ Light' },
  light: { label: 'Light', icon: '☀️', next: '🌤️ Warm' },
  warm:  { label: 'Warm',  icon: '🌤️', next: '❄️ Cool' },
  cool:  { label: 'Cool',  icon: '❄️', next: '🌙 Dark' },
};

// Initialize theme on module load (before React renders)
const initializeTheme = () => {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  // Validate the saved theme is still a valid option
  const validTheme = THEMES.includes(savedTheme) ? savedTheme : 'dark';
  document.documentElement.setAttribute('data-theme', validTheme);
  return validTheme;
};

// Initialize immediately
const initialTheme = initializeTheme();

export const useTheme = () => {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme') || 'dark';
    return THEMES.includes(saved) ? saved : 'dark';
  });

  useEffect(() => {
    // Sync with localStorage on mount in case it changed on another page
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const validTheme = THEMES.includes(savedTheme) ? savedTheme : 'dark';
    if (validTheme !== theme) {
      setTheme(validTheme);
      document.documentElement.setAttribute('data-theme', validTheme);
    }
  }, []);

  useEffect(() => {
    // Listen for storage changes (when theme changes in another tab/page)
    const handleStorageChange = (e) => {
      if (e.key === 'theme' && e.newValue) {
        const validTheme = THEMES.includes(e.newValue) ? e.newValue : 'dark';
        setTheme(validTheme);
        document.documentElement.setAttribute('data-theme', validTheme);
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
      const currentIndex = THEMES.indexOf(prevTheme);
      const nextIndex = (currentIndex + 1) % THEMES.length;
      return THEMES[nextIndex];
    });
  };

  return { theme, toggleTheme };
};
