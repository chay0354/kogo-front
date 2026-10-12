'use client';

import type { ReactNode } from 'react';
import { DialogCloseButton, DialogTitle } from '@/components/ui/dialog';
import dlg from './storeDialog.module.css';

/**
 * The title of a store dialog and the way out of it, pinned to the top.
 *
 * On a phone the dialog is a sheet that fills the screen, and a product with a
 * row per size and branch makes it many screens long. The only way out used to
 * be "ביטול" at the very end of it.
 */
export default function StoreDialogHead({ children }: { children: ReactNode }) {
  return (
    <div className={dlg.head}>
      <DialogTitle className="text-xl sm:text-2xl min-w-0">{children}</DialogTitle>
      <DialogCloseButton label="סגירה" />
    </div>
  );
}
