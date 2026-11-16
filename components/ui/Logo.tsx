
import React from 'react';

interface LogoProps {
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ className = "w-full h-full" }) => (
  <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-label="Verdant">
    {/* M3 Tonal Botanical Ring */}
    <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.28" />
    {/* Geometric Botanical "V" Twin-Leaf Monogram */}
    <path
      d="M14 16.5C14 16.5 19.5 16.5 22.5 21.5C24.5 24.8 24 31 24 31C24 31 18.2 30.2 15.5 25.5C13.6 22.2 14 16.5 14 16.5Z"
      fill="currentColor"
      fillOpacity="0.32"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M34 14.5C34 14.5 28 14.8 25 20.2C23.1 23.7 24 31 24 31C24 31 30.2 29.8 32.8 24.6C34.7 20.8 34 14.5 34 14.5Z"
      fill="currentColor"
      fillOpacity="0.88"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Central Stem */}
    <path
      d="M24 31V36"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
    />
  </svg>
);
