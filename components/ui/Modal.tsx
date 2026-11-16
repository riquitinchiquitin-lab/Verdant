import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'md' | 'lg' | 'xl' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    'md': 'max-w-md',
    'lg': 'max-w-lg',
    'xl': 'max-w-xl',
    '2xl': 'max-w-2xl'
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 pt-[calc(1rem+env(safe-area-inset-top))] bg-black/50 backdrop-blur-xs animate-in fade-in duration-200" 
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div 
        className={`bg-md-surface-container-high text-md-on-surface rounded-t-[28px] sm:rounded-[28px] shadow-2xl w-full ${sizeClasses[size]} transform transition-all border border-md-outline-variant/40 flex flex-col max-h-[92dvh] sm:max-h-[90vh] overflow-hidden pb-[env(safe-area-inset-bottom)]`}
        ref={overlayRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 sm:px-6 sm:py-5 border-b border-md-outline-variant/30 bg-md-surface-container-high sticky top-0 z-20">
          <h3 className="text-lg sm:text-xl font-semibold text-md-on-surface tracking-tight truncate pr-3">{title}</h3>
          <button 
            onClick={onClose}
            aria-label="Close dialog"
            className="m3-state-layer w-10 h-10 shrink-0 flex items-center justify-center text-md-on-surface-variant hover:text-md-on-surface rounded-full transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 bg-md-surface-container-low">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};