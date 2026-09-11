'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSignatures } from '@/lib/signaturesApi';
import { signatureListParams, type SignatureListFilters } from '@/lib/signatureUtils';
import type { SignatureSummary } from '@/types/signature';

/** A new query waits this long, so typing a name asks once rather than per letter. */
const REQUEST_DELAY_MS = 300;
const NO_ROWS: SignatureSummary[] = [];

interface ListState {
  /** The query, the page and the attempt these rows answer. */
  key: string;
  /** The query alone — its count holds on every page of it. */
  queryKey: string;
  rows: SignatureSummary[];
  count: number;
  error: string;
}

/**
 * One page of the signature history for a query, from the server.
 *
 * The list is paginated on the server, so every filter goes there too. A new
 * query waits a moment first; another page of the same query, or a retry, goes
 * at once. An answer that arrives after a newer request went out is dropped
 * rather than painted over it — the shape PaymentsTab uses for the charges.
 */
export function useSignaturesList(filters: SignatureListFilters, page: number) {
  const [attempt, setAttempt] = useState(0);
  const queryKey = JSON.stringify(signatureListParams(filters));
  const key = `${queryKey}#${page}#${attempt}`;
  const [state, setState] = useState<ListState>({ key: '', queryKey: '', rows: NO_ROWS, count: 0, error: '' });
  const latest = useRef(0);

  useEffect(() => {
    const request = ++latest.current;
    // The first load and a page turn go at once; a changed query waits for the typing to stop.
    const delay = state.queryKey === '' || state.queryKey === queryKey ? 0 : REQUEST_DELAY_MS;
    const timer = window.setTimeout(() => {
      fetchSignatures(filters, page)
        .then((data) => {
          if (request !== latest.current) return;
          setState({ key, queryKey, rows: data.results, count: data.count, error: '' });
        })
        .catch((error) => {
          if (request !== latest.current) return;
          console.error('Error loading signatures:', error);
          setState({ key, queryKey, rows: NO_ROWS, count: 0, error: 'לא הצלחנו לטעון את החתימות.' });
        });
    }, delay);
    return () => window.clearTimeout(timer);
    // `key` is the query, the page and the attempt; `filters` is a new object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // An answer still on its way when the page closes has nowhere to go.
  useEffect(() => () => {
    latest.current += 1;
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const exact = state.key === key;
  const sameQuery = state.queryKey === queryKey && !state.error;
  return {
    rows: exact ? state.rows : NO_ROWS,
    error: exact ? state.error : '',
    loading: !exact,
    /** The query's total. Paging keeps it on screen; a new query clears it until it is known. */
    count: sameQuery ? state.count : null,
    retry,
  };
}
