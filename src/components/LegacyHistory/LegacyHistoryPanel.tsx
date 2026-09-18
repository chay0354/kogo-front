'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, History } from 'lucide-react';
import {
  fetchLegacyDocuments,
  formatLegacyDate,
  lastNumbersByType,
} from '@/lib/legacyImportApi';
import LegacyDocumentsTable from './LegacyDocumentsTable';
import styles from './LegacyHistory.module.css';

/**
 * היסטוריה מהתוכנה הקודמת — what the old software issued to this business
 * customer, and the last number of each type. Shown only when there is any, and
 * folded until asked for: the step it sits in is about the document being made
 * now, and this is context, not a task.
 *
 * Managers only (the endpoint is); the caller decides whether to render it.
 */
export default function LegacyHistoryPanel({ businessCustomerId }: { businessCustomerId: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['legacy-documents', businessCustomerId],
    queryFn: () => fetchLegacyDocuments({ business_customer: businessCustomerId }),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!data || data.count === 0) return null;
  const lastNumbers = lastNumbersByType(data.results);

  return (
    <section className={styles.panel} aria-label="היסטוריה מהתוכנה הקודמת">
      <button type="button" className={styles.header} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={styles.title}>
          <History size={14} aria-hidden="true" />
          היסטוריה מהתוכנה הקודמת · {data.count} מסמכים
          <span className={styles.origin}>לא הופק בקוגו</span>
        </span>
        {open ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>
      <div className={styles.lastNumbers}>
        {lastNumbers.map((entry) => (
          <span key={entry.doc_type}>
            {entry.label}: אחרון <strong>{entry.number}</strong> מ-{formatLegacyDate(entry.date)}
          </span>
        ))}
      </div>
      {open ? (
        <>
          <div className={styles.tableWrap}>
            <LegacyDocumentsTable documents={data.results} />
          </div>
          {data.truncated ? <p className={styles.note}>מוצגים {data.results.length} האחרונים מתוך {data.count}.</p> : null}
        </>
      ) : null}
    </section>
  );
}
