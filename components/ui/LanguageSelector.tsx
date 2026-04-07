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
    ? "bg-slate-800/50 hover:bg-slate-800 border border-white/5" 
    : "hover:bg-gray-100 dark:hover:bg-slate-800";

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${baseButtonStyles}`}
      >
        <span className="text-xl">{currentLanguage.flag}</span>
        <span className="text-[10px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-widest">{currentLanguage.code}</span>
      </button>

      {isOpen && (
        <div className={`absolute ${direction === 'up' ? 'bottom-full mb-3' : 'top-full mt-3'} ${align === 'right' ? 'right-0' : 'left-0'} w-64 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[24px] shadow-2xl z-[100] py-3 animate-in fade-in zoom-in-95 duration-200`}>
          <div className="px-4 pb-2 mb-2 border-b border-gray-50 dark:border-slate-800">
             <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Select Language</p>
          </div>
          <div className="max-h-64 overflow-y-auto no-scrollbar">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  setLanguage(lang.code);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors ${currentLanguage.code === lang.code ? 'bg-verdant/5 text-verdant' : 'text-gray-700 dark:text-slate-300'}`}
              >
                <span className="text-xl">{lang.flag}</span>
                <span className="text-[11px] font-black uppercase tracking-wider">{lang.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
