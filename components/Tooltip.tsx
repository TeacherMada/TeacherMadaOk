
import React from 'react';

interface TooltipProps {
  children: React.ReactNode;
  text: string;
  position?: 'top' | 'bottom';
  className?: string;
}

const Tooltip: React.FC<TooltipProps> = ({ children, text, position = 'top', className = '' }) => {
  return (
    <div className={`group relative inline-flex items-center justify-center ${className}`}>
      {children}
      <div 
        className={`
          absolute z-[100] px-2.5 py-1.5 
          bg-slate-800 text-white text-xs font-medium rounded-lg shadow-xl
          opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap
          ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}
          left-1/2 -translate-x-1/2
        `}
      >
        {text}
        {/* Tiny Arrow */}
        <div 
          className={`
            absolute left-1/2 -translate-x-1/2 border-4 border-transparent
            ${position === 'top' ? 'border-t-slate-800 top-full' : 'border-b-slate-800 bottom-full'}
          `} 
        />
      </div>
    </div>
  );
};

export default Tooltip;
