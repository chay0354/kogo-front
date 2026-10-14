import HistoryImport from '@/components/wahub/history/HistoryImport';

/**
 * "העתקת השיחות מ-ManyChat": a page with no way in from the menu, for copying the conversations from before the
 * switch once (lib/wahub/historyBridge.ts). Managers only — the server refuses anyone else.
 */
export default function Page() {
  return <HistoryImport />;
}
