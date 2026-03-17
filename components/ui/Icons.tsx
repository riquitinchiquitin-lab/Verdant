import React from 'react';

export const PotRotationIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="1.2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    {/* The Plant & Pot - Scaled slightly for better orbit space */}
    <path d="M10.5 14.5l.4 3h2.2l.4-3" className="text-amber-700 dark:text-amber-600" stroke="currentColor" />
    <path d="M9.5 12h5v2.5h-5z" className="text-amber-600 dark:text-amber-500" stroke="currentColor" />
    <path d="M12 12V9.5" className="text-emerald-600 dark:text-emerald-500" stroke="currentColor" />
    <path d="M12 9.5c-1.2-1.2-2.5-.8-2.5-.8s.4 1.2 2.5.8c2.1-.4 2.5-.8 2.5-.8s-1.3-.4-2.5.8z" className="text-emerald-500 dark:text-emerald-400" stroke="currentColor" />
    
    {/* The Orbiting Arrows - Spread out further (Radius 9) */}
    <path d="M21 12a9 9 0 0 0-16.15-5.3" className="text-blue-500" stroke="currentColor" />
    <path d="M3 12a9 9 0 0 0 16.15 5.3" className="text-blue-500" stroke="currentColor" />
    <polyline points="17 19 20 18 19 15" className="text-blue-500" stroke="currentColor" />
    <polyline points="7 5 4 6 5 9" className="text-blue-500" stroke="currentColor" />
  </svg>
);
