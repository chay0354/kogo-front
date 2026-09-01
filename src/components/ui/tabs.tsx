'use client';

import * as React from 'react';
import motion from './motion.module.css';

type TabsContextValue = {
  value: string;
  setValue: (v: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

export function Tabs({
  defaultValue,
  value: controlledValue,
  onValueChange,
  children,
}: {
  defaultValue: string;
  value?: string;
  onValueChange?: (v: string) => void;
  children: React.ReactNode;
}) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const value = controlledValue ?? uncontrolled;

  const setValue = React.useCallback(
    (v: string) => {
      if (controlledValue === undefined) setUncontrolled(v);
      onValueChange?.(v);
    },
    [controlledValue, onValueChange]
  );

  return (
    <TabsContext.Provider value={{ value, setValue }}>
      {children}
    </TabsContext.Provider>
  );
}

export function TabsList({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-muted/40 p-1 rounded-lg ${className}`}>{children}</div>
  );
}

export function TabsTrigger({
  value,
  className = '',
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error('TabsTrigger must be used within Tabs');

  const active = ctx.value === value;
  return (
    <button
      type="button"
      onClick={() => ctx.setValue(value)}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors w-full ${
        active
          ? 'bg-white shadow-sm text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className = '',
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error('TabsContent must be used within Tabs');
  if (ctx.value !== value) return null;
  return <div key={value} className={`${motion.tabPanel} ${className}`}>{children}</div>;
}


