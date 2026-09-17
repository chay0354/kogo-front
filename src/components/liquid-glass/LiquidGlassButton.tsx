'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import LiquidGlass, { type LiquidGlassTone, type LiquidGlassVariant } from './LiquidGlass';
import type { GlassSize } from './refraction';

export interface LiquidGlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  variant?: LiquidGlassVariant;
  tone?: LiquidGlassTone;
  /** Small controls stay thin and clear; `md` is for a primary floating action. */
  size?: Extract<GlassSize, 'sm' | 'md'>;
  /** An HSL triplet. Tint is for meaning — the one primary action — not decoration. */
  tint?: string;
}

const PADDING: Record<'sm' | 'md', string> = {
  sm: 'inline-flex items-center justify-center gap-2 min-h-[36px] px-4 text-sm font-medium',
  md: 'inline-flex items-center justify-center gap-2 min-h-[44px] px-5 text-[0.9375rem] font-semibold',
};

/** A capsule of glass that gives under the finger and lights from the touch point. */
const LiquidGlassButton = forwardRef<HTMLButtonElement, LiquidGlassButtonProps>(function LiquidGlassButton(
  { children, variant, tone, size = 'sm', tint, type = 'button', ...rest },
  ref,
) {
  return (
    <LiquidGlass
      {...(rest as object)}
      as="button"
      ref={ref as never}
      // @ts-expect-error `type` belongs to the button this renders as
      type={type}
      variant={variant}
      tone={tone}
      size={size}
      tint={tint}
      interactive
      style={{ border: 0, background: 'none', font: 'inherit', ...(rest.style ?? {}) }}
      contentClassName={PADDING[size]}
    >
      {children}
    </LiquidGlass>
  );
});

export default LiquidGlassButton;
