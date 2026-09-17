'use client';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import LiquidGlass, { type LiquidGlassTone, type LiquidGlassVariant } from './LiquidGlass';

export interface LiquidGlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  variant?: LiquidGlassVariant;
  tone?: LiquidGlassTone;
  /** Corner radius in px. Controls placed inside should use this minus their inset, to stay concentric. */
  radius?: number;
}

/**
 * A floating panel — a popover, a sheet, a menu body. The thickest surface in
 * the system, so the strongest bend and the deepest shadow. Put type and
 * controls inside it, never another glass surface.
 */
const LiquidGlassPanel = forwardRef<HTMLDivElement, LiquidGlassPanelProps>(function LiquidGlassPanel(
  { children, variant, tone, radius = 28, ...rest },
  ref,
) {
  return (
    <LiquidGlass {...rest} ref={ref as never} as="div" size="lg" variant={variant} tone={tone} radius={radius}>
      {children}
    </LiquidGlass>
  );
});

export default LiquidGlassPanel;
