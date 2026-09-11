'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders its children at the end of <body>, outside the page.
 *
 * The shared dialogs draw their overlay inline, in the app's own palette. The
 * page used to render them outside its dashboard-scoped wrapper; a tab that
 * now owns its dialog would otherwise draw it inside that wrapper, where the
 * dashboard tokens re-tint it and an entrance animation's transform on an
 * ancestor pulls its fixed overlay off the viewport. Sending the dialog out
 * through here keeps it exactly as it was.
 */
export default function BodyPortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.body);
  }, []);

  return host ? createPortal(children, host) : null;
}
