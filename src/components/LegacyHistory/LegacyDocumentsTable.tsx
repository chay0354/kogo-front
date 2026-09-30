'use client';

import { FileCheck } from 'lucide-react';
import {
  TAZMAN_SOURCE,
  documentAmount,
  documentNumberLabel,
  formatLegacyDate,
  formatShekel,
  sourcesOf,
  type LegacyDocument,
} from '@/lib/legacyImportApi';
import styles from './LegacyHistory.module.css';

/**
 * Documents from the previous software — or any other — newest first.
 * Read-only: there is nothing to act on. Which software issued each one is
 * shown whenever it is not only the previous one; a document whose PDF was
 * received is marked (the file is in the locked storage, or only its fingerprint).
 */
export default function LegacyDocumentsTable({
  documents,
  showCustomer = false,
}: {
  documents: LegacyDocument[];
  showCustomer?: boolean;
}) {
  const sources = sourcesOf(documents);
  const showSource = sources.length > 1 || documents.some((d) => d.source_system && d.source_system !== TAZMAN_SOURCE);
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>תאריך</th>
          <th>סוג</th>
          <th>מספר</th>
          {showCustomer ? <th>לקוח</th> : null}
          <th>סכום</th>
          <th className={styles.hideNarrow}>פרטים</th>
          <th className={styles.hideNarrow}>סטטוס</th>
        </tr>
      </thead>
      <tbody>
        {documents.map((doc) => (
          <tr key={doc.id}>
            <td className={styles.number}>{formatLegacyDate(doc.document_date)}</td>
            <td>
              {doc.original_type || doc.doc_type_label}
              {showSource && doc.source_label ? <span className={styles.source}>{doc.source_label}</span> : null}
            </td>
            <td className={styles.number}>
              {documentNumberLabel(doc)}
              {doc.has_pdf ? (
                <FileCheck
                  size={12}
                  className={styles.pdfMark}
                  aria-label={doc.pdf_stored ? 'PDF שמור באחסון הנעול' : 'PDF התקבל — נשמרה טביעת אצבע בלבד'}
                >
                  <title>{doc.pdf_stored ? 'PDF שמור באחסון הנעול' : 'PDF התקבל — נשמרה טביעת אצבע בלבד'}</title>
                </FileCheck>
              ) : null}
            </td>
            {showCustomer ? <td>{doc.customer_name || '—'}</td> : null}
            <td className={styles.number}>{formatShekel(documentAmount(doc))}</td>
            <td className={`${styles.details} ${styles.hideNarrow}`}>
              {[doc.details, doc.location].filter(Boolean).join(' · ') || '—'}
            </td>
            <td className={styles.hideNarrow}>{doc.original_status || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
