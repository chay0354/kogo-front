/* eslint-disable react/button-has-type */
'use client';

import * as React from 'react';

type ButtonVariant =
  | 'default'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive'
  | 'gradient';

type ButtonSize = 'sm' | 'md';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const base =
  'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 disabled:pointer-events-none';

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

const variants: Record<ButtonVariant, string> = {
  default: 'bg-primary text-white hover:opacity-90',
  secondary: 'bg-secondary text-foreground hover:bg-secondary/80',
  outline:
    'border border-gray-200 bg-white text-foreground hover:bg-muted/40',
  ghost: 'bg-transparent text-foreground hover:bg-muted/40',
  destructive: 'bg-destructive text-white hover:bg-destructive/90',
  gradient:
    'text-white bg-gradient-to-l from-primary to-accent hover:opacity-95 shadow-sm',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';


