
import React from 'react';
import { PotType } from '../../types';

interface PotIconProps {
  type: PotType;
  color?: string;
  className?: string;
}

export const PotIcon: React.FC<PotIconProps> = ({ type, color = 'currentColor', className = "w-6 h-6" }) => {
  switch (type) {
    case 'terra_cotta':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M5 4h14l-1.5 14a2 2 0 0 1-2 1.5H8.5a2 2 0 0 1-2-1.5L5 4z" />
          <path d="M4 4h16v2H4V4z" />
          <path d="M8 8c0 1 1 2 2 2h4c1 0 2-1 2-2" opacity="0.3" />
        </svg>
      );
    case 'ceramic':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M12 21c-4.4 0-8-1.5-8-4V8c0-2.5 3.6-4 8-4s8 1.5 8 4v9c0 2.5-3.6 4-8 4z" />
          <ellipse cx="12" cy="8" rx="8" ry="4" />
          <path d="M4 12c0 2.5 3.6 4 8 4s8-1.5 8-4" opacity="0.5" />
        </svg>
      );
    case 'plastic':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M6 3h12l-1 18H7L6 3z" />
          <path d="M6 7h12" />
          <path d="M12 3v18" opacity="0.1" />
        </svg>
      );
    case 'concrete':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="4" y="4" width="16" height="16" rx="1" />
          <path d="M4 8h16M4 12h16M4 16h16" opacity="0.2" />
          <circle cx="7" cy="10" r="0.5" fill={color} />
          <circle cx="15" cy="14" r="0.5" fill={color} />
          <circle cx="10" cy="17" r="0.5" fill={color} />
        </svg>
      );
    case 'air_pot':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M6 3h12l-1 18H7L6 3z" />
          {[7, 10, 13, 16, 19].map(y => (
            <g key={y} opacity="0.6">
              <circle cx="9" cy={y} r="0.5" fill={color} />
              <circle cx="12" cy={y} r="0.5" fill={color} />
              <circle cx="15" cy={y} r="0.5" fill={color} />
            </g>
          ))}
        </svg>
      );
    case 'hanging_planter':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M12 2v6M6 6l2 4M18 6l-2 4" />
          <path d="M8 10h8l-1 10a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1L8 10z" />
          <path d="M7 10c0-1 2-2 5-2s5 1 5 2" />
        </svg>
      );
    case 'wood_box':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="3" y="8" width="18" height="12" rx="1" />
          <path d="M3 12h18M3 16h18" opacity="0.4" />
          <path d="M7 8v12M17 8v12" />
        </svg>
      );
    case 'fiberglass':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M4 4h16c0 10-2 16-8 16S4 14 4 4z" />
          <path d="M4 8h16" opacity="0.3" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      );
  }
};

export const SaucerIcon: React.FC<{ color?: string; className?: string }> = ({ color = 'currentColor', className = "w-6 h-6" }) => {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 16h18l-1 3a2 2 0 0 1-2 1.5H6a2 2 0 0 1-2-1.5l-1-3z" />
      <path d="M4 16c0-1 2-2 8-2s8 1 8 2" opacity="0.4" />
    </svg>
  );
};
