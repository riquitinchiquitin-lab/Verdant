import React from 'react';
import { motion } from 'motion/react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tonal' | 'outlined' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  isLoading, 
  className = '', 
  disabled,
  ...props 
}) => {
  const baseStyles = "m3-state-layer inline-flex items-center justify-center rounded-full font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2 disabled:opacity-38 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-md-primary text-md-on-primary shadow-sm hover:shadow-md",
    secondary: "bg-md-secondary-container text-md-on-secondary-container",
    tonal: "bg-md-secondary-container text-md-on-secondary-container",
    outlined: "bg-transparent border border-md-outline text-md-primary",
    danger: "bg-md-error text-md-on-error shadow-sm",
    ghost: "bg-transparent text-md-primary",
  };

  const sizes = {
    sm: "h-9 px-4 text-xs gap-1.5",
    md: "h-10 px-6 text-sm gap-2",
    lg: "h-12 px-7 text-sm gap-2.5",
  };

  return (
    <motion.button 
      whileTap={{ scale: 0.97 }}
      className={`${baseStyles} ${variant ? variants[variant] : ''} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      {...(props as any)}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-1 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </motion.button>
  );
};