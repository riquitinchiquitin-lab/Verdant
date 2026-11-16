import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { LANGUAGES } from '../../constants';

interface LanguageSelectorProps {
  direction?: 'up' | 'down';
  align?: 'left' | 'right';
  className?: string;
  variant?: 'ghost' | 'filled';
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ 
  direction = 'down', 
  align = 'left',
  className = '',
  variant = 'ghost'
}) => {
  const { currentLanguage, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const baseButtonStyles = variant === 'filled' 
    ? "bg-md-surface-container-high text-md-on-surface border border-md-outline-variant/40" 
    : "text-md-on-surface-variant hover:text-md-on-surface";

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`m3-state-layer flex items-center gap-2 px-3 h-10 rounded-full transition-colors ${baseButtonStyles}`}
      >
        <span className="text-lg leading-none">{currentLanguage.flag}</span>
        <span className="text-xs font-semibold uppercase tracking-wide">{currentLanguage.code}</span>
      </button>

      {isOpen && (
        <div className={`absolute ${direction === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'} ${align === 'right' ? 'right-0' : 'left-0'} w-64 bg-md-surface-container-high border border-md-outline-variant/40 rounded-[20px] shadow-xl z-[100] py-2 animate-in fade-in zoom-in-95 duration-150`}>
          <div className="px-4 py-2 border-b border-md-outline-variant/30">
             <p className="text-[11px] font-semibold text-md-on-surface-variant">Select Language</p>
          </div>
          <div className="max-h-64 overflow-y-auto no-scrollbar py-1">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  setLanguage(lang.code);
                  setIsOpen(false);
                }}
                className={`m3-state-layer w-full flex items-center gap-3 px-4 py-2.5 transition-colors ${currentLanguage.code === lang.code ? 'bg-md-secondary-container text-md-on-secondary-container' : 'text-md-on-surface'}`}
              >
                <span className="text-lg leading-none">{lang.flag}</span>
                <span className="text-xs font-semibold">{lang.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
