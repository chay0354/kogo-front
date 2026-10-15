import HistoryImport from '@/components/wahub/history/HistoryImport';

/**
 * "העתקת השיחות מ-ManyChat": a page with no way in from the menu, for copying every conversation from before the
 * switch once (lib/wahub/historyScript.ts, historyFile.ts). Managers only — the server refuses anyone else.
 */
export default function Page() {
  return <HistoryImport />;
}
