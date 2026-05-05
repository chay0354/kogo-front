'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';

interface DropdownMenuProps {
  children: ReactNode;
}

interface DropdownMenuTriggerProps {
  children: ReactNode;
  asChild?: boolean;
}

interface DropdownMenuContentProps {
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
}

interface DropdownMenuItemProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function DropdownMenu({ children }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className="relative inline-block">
      {Array.isArray(children) ? children.map((child: any, index: number) => {
        if (child.type === DropdownMenuTrigger) {
          return <div key={index} onClick={() => setIsOpen(!isOpen)}>{child}</div>;
        }
        if (child.type === DropdownMenuContent && isOpen) {
          return <div key={index}>{child}</div>;
        }
        return null;
      }) : children}
    </div>
  );
}

export function DropdownMenuTrigger({ children, asChild }: DropdownMenuTriggerProps) {
  return <div className="cursor-pointer">{children}</div>;
}

export function DropdownMenuContent({ children, align = 'end', className = '' }: DropdownMenuContentProps) {
  const alignClass = align === 'end' ? 'left-0' : 'right-0';
  
  return (
    <div 
      className={`absolute ${alignClass} mt-2 z-50 min-w-[12rem] rounded-lg bg-white shadow-lg border border-gray-200 py-1 animate-scale-in ${className}`}
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({ children, onClick, className = '' }: DropdownMenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-right px-4 py-2 text-sm hover:bg-muted/50 transition-colors flex items-center ${className}`}
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div className="my-1 border-t border-gray-200" />;
}

