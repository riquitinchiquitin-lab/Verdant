
import React from 'react';
import { ContainerType } from '../../types';

interface IconProps {
  type: ContainerType;
  color?: string;
  className?: string;
}

export const ContainerIcon: React.FC<IconProps> = ({ type, color = 'currentColor', className = "w-6 h-6" }) => {
  switch (type) {
    case 'hdpe_jug':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M7 21h10a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3V4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3z" />
          <path d="M7 7V4" />
          <circle cx="12" cy="13" r="2" strokeWidth="1" opacity="0.3" fill={color} />
        </svg>
      );
    case 'jerry_can':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="4" y="6" width="16" height="15" rx="2" />
          <path d="M8 6V3h4l2 3" />
          <path d="M4 11h16" />
          <path d="M4 16h16" />
          <path d="M10 6v15" />
          <path d="M14 6v15" />
        </svg>
      );
    case 'bag_in_box':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M7 21v-4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4" />
          <circle cx="12" cy="10" r="2" />
        </svg>
      );
    case 'spray_bottle':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M9 3h6v2l-1 2v4h4v2l-2 1v8a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-8l-2-1v-2h4V7l-1-2V3z" />
          <path d="M15 5h2a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case 'pressure_sprayer':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <ellipse cx="12" cy="14" rx="7" ry="8" />
          <path d="M12 6V2" />
          <path d="M10 2h4" />
          <path d="M19 14l3-3" />
          <path d="M19 14v-4" />
        </svg>
      );
    case 'bucket':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M4 7l2 14h12l2-14" />
          <path d="M4 7c0-2 4-4 8-4s8 2 8 4" />
          <path d="M20 7c0 1.5-3.5 3-8 3S4 8.5 4 7" />
        </svg>
      );
    case 'tote':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="2" y="8" width="20" height="12" rx="2" />
          <path d="M2 12h20" />
          <path d="M6 8V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3" />
          <path d="M8 20v2" />
          <path d="M16 20v2" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      );
  }
};
