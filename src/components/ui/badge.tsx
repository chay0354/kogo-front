'use client';

import * as React from 'react';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const base =
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium';

const variants: Record<BadgeVariant, string> = {
  default: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary text-foreground',
  outline: 'border border-gray-200 bg-white text-foreground',
  destructive: 'bg-destructive/10 text-destructive',
};

export function Badge({ className = '', variant = 'default', ...props }: BadgeProps) {
  return (
    <span className={`${base} ${variants[variant]} ${className}`} {...props} />
  );
}


