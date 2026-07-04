'use client';

import * as React from 'react';
import { X } from 'lucide-react';

type DialogContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  return (
    <DialogContext.Provider value={{ open, onOpenChange }}>
      {children}
    </DialogContext.Provider>
  );
}

export function DialogContent({
  className = '',
  dir = 'rtl',
  children,
}: {
  className?: string;
  dir?: 'rtl' | 'ltr';
  children: React.ReactNode;
}) {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error('DialogContent must be used within Dialog');
  if (!ctx.open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 animate-fade-in p-0 sm:p-4"
      onMouseDown={() => ctx.onOpenChange(false)}
    >
      <div
        dir={dir}
        className={`relative w-full sm:w-[calc(100%-2rem)] max-h-[92vh] sm:max-h-[90vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-lg shadow-xl animate-scale-in ${className}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={className ?? 'px-4 pt-4 sm:px-6 sm:pt-6'}>{children}</div>;
}

export function DialogTitle({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`font-bold ${className}`}>{children}</div>;
}

export function DialogDescription({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`mt-1 text-sm text-muted-foreground ${className}`}>{children}</div>;
}

export function DialogTrigger({
  asChild,
  children,
}: {
  asChild?: boolean;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error('DialogTrigger must be used within Dialog');

  if (asChild) {
    // Clone the child element and add onClick handler
    return React.cloneElement(children as React.ReactElement, {
      onClick: () => ctx.onOpenChange(true),
    });
  }

  return (
    <button onClick={() => ctx.onOpenChange(true)}>
      {children}
    </button>
  );
}

export function DialogCloseButton() {
  const ctx = React.useContext(DialogContext);
  if (!ctx) return null;
  return (
    <button
      type="button"
      onClick={() => ctx.onOpenChange(false)}
      className="p-2 rounded-lg hover:bg-muted/40 transition-colors"
      aria-label="Close"
    >
      <X className="h-5 w-5" />
    </button>
  );
}

