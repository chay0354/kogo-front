'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import CrossFade from '@/components/ui/CrossFade';

/**
 * The handover between one office screen and the next.
 *
 * The shell sits above this, so the sidebar and the menu never move; it is the
 * page area alone that changes, and it changes by dissolving rather than by
 * being replaced between two frames. What arrives is often the loading shape
 * rather than the screen itself, which is exactly the swap that used to flash.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <CrossFade swapKey={pathname}>{children}</CrossFade>;
}
