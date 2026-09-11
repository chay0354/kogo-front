'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTranzilaDocuments } from '@/lib/documentsApi';
import type { DocumentRow } from './types';
import { ledgerRangeParams } from './utils';

/**
 * The documents issued in a date range — the list behind both the documents
 * tab and the collection tab.
 *
 * The list is fetched for the chosen range, so moving either date goes back to
 * the server. It used to load once with a 90-day window and only filter that
 * window in the browser, which made every older document unreachable. The
 * request waits a moment after the last change so a date typed digit by digit
 * does not fire a request per keystroke, and an answer that arrives after a
 * newer request went out is dropped rather than painted over it.
 */
export function useLedgerDocuments(dateFrom: string, dateTo: string, refreshKey = 0) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const latestRequest = useRef(0);

  const reload = useCallback(async () => {
    const request = ++latestRequest.current;
    setIsLoading(true);
    setError('');
    try {
      const ledger = await fetchTranzilaDocuments({
        ...ledgerRangeParams({ dateFrom, dateTo }),
        local_only: '1',
      });
      if (request !== latestRequest.current) return;
      const rows: DocumentRow[] = Array.isArray(ledger.documents) ? ledger.documents : [];
      setDocuments(rows);
      if (ledger.error && rows.length === 0) {
        setError('לא ניתן לטעון מסמכים מטרנזילה כרגע.');
      }
    } catch (err) {
      if (request !== latestRequest.current) return;
      console.error('Error loading invoices:', err);
      setDocuments([]);
      setError('שגיאה בטעינת המסמכים');
    } finally {
      if (request === latestRequest.current) setIsLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void reload();
    }, 300);
    return () => clearTimeout(timer);
  }, [reload, refreshKey]);

  // An answer still on its way when the tab closes has nowhere to go.
  useEffect(() => () => {
    latestRequest.current += 1;
  }, []);

  return { documents, isLoading, error, reload };
}
