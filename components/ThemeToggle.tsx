
import React, { useState, useEffect } from 'react';

export const ThemeToggle: React.FC = () => {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const updateThemeColor = (dark: boolean) => {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content', dark ? '#11140F' : '#F8FAF3');
      }
    };

    updateThemeColor(isDark);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          const dark = document.documentElement.classList.contains('dark');
          setIsDark(dark);
          updateThemeColor(dark);
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, [isDark]);

  const toggleTheme = () => {
    const newDark = !isDark;
    if (newDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('verdant-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('verdant-theme', 'light');
    }
  };

  return (
    <button 
      onClick={toggleTheme}
      className="m3-state-layer w-10 h-10 flex items-center justify-center text-md-on-surface-variant hover:text-md-on-surface transition-colors rounded-full"
      title="Toggle Appearance"
      aria-label="Toggle Appearance"
    >
      {isDark ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
};
