'use client';

import { useState } from 'react';
import { Loader2, DatabaseBackup } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/components/AuthProvider';
import { downloadDatabaseBackup } from '@/lib/devopsApi';
import styles from './page.module.css';

type BackupStatus = 'idle' | 'loading' | 'success' | 'error';

export default function DevOpsPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<BackupStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleBackup = async () => {
    setStatus('loading');
    setErrorMessage('');
    try {
      await downloadDatabaseBackup();
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(
        err?.response?.status === 403
          ? 'אין הרשאה לפעולה זו.'
          : 'יצירת הגיבוי נכשלה. נסה שוב.',
      );
    }
  };

  return (
    <>
      <PageHeader title="DevOps" />

      {!user?.is_superuser ? (
        <div className={styles.card}>
          <p className={styles.deniedText}>אין לך הרשאה לצפות בעמוד זה.</p>
        </div>
      ) : (
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>גיבוי בסיס נתונים</h2>
          <p className={styles.sectionDescription}>
            יוצר קובץ גיבוי מלא של בסיס הנתונים ומוריד אותו לדפדפן. הפעולה עשויה לקחת
            עד מספר דקות בהתאם לגודל בסיס הנתונים — אין לסגור את החלון בזמן היצירה.
          </p>

          <button
            type="button"
            onClick={handleBackup}
            disabled={status === 'loading'}
            className={styles.backupButton}
          >
            {status === 'loading' ? (
              <Loader2 className={styles.spinnerIcon} />
            ) : (
              <DatabaseBackup className={styles.buttonIcon} />
            )}
            {status === 'loading' ? 'יוצר גיבוי...' : 'צור גיבוי בסיס נתונים'}
          </button>

          {status === 'success' && (
            <p className={styles.successText}>הגיבוי נוצר והורד בהצלחה.</p>
          )}
          {status === 'error' && <p className={styles.errorText}>{errorMessage}</p>}
        </div>
      )}
    </>
  );
}
