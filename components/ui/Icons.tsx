import React from 'react';

export const PotRotationIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {/* Minimal M3 Pot */}
    <path d="M9.5 13h5l-.6 4.2a1 1 0 0 1-1 .8h-1.8a1 1 0 0 1-1-.8L9.5 13Z" />
    <path d="M8.5 13h7" />
    {/* Minimal M3 Sprout */}
    <path d="M12 13v-3.5" />
    <path d="M12 10.5c0-1.6 1.4-2.5 3-2.5 0 1.6-1.4 2.5-3 2.5Z" />
    <path d="M12 11c0-1.4-1.2-2.2-2.5-2.2 0 1.4 1.2 2.2 2.5 2.2Z" />
    {/* Clean M3 Orbit Arrow */}
    <path d="M4.6 9.5A8 8 0 0 1 19 8" />
    <path d="M19.5 5v3.5H16" />
    <path d="M19.4 14.5A8 8 0 0 1 5 16" />
    <path d="M4.5 19v-3.5H8" />
  </svg>
);
