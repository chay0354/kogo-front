'use client';

import {
  documentAmount,
  formatLegacyDate,
  formatShekel,
  type LegacyDocument,
} from '@/lib/legacyImportApi';
import styles from './LegacyHistory.module.css';

/** Documents from the previous software, newest first. Read-only: there is nothing to act on. */
export default function LegacyDocumentsTable({
  documents,
  showCustomer = false,
}: {
  documents: LegacyDocument[];
  showCustomer?: boolean;
}) {
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
            <td>{doc.original_type || doc.doc_type_label}</td>
            <td className={styles.number}>{doc.number}</td>
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
