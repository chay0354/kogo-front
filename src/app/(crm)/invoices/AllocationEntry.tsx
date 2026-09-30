'use client';

import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { setAllocationNumber } from '@/lib/documentsApi';
import {
  allocationDigits,
  allocationFailureMessage,
  allocationInputError,
  allocationResultMessage,
} from './manualDelivery';
import styles from './manualDelivery.module.css';

interface AllocationEntryProps {
  /** The FormalDocument's id (the row's source_id) and its number, for the messages. */
  documentId: string;
  number: string;
  /** Called once the number was saved — the lists are read again. */
  onSaved: () => void;
}

/**
 * The allocation number of a tax invoice held for it, typed in by hand from the
 * Tax Authority's portal. Saving it signs the original with the number on it
 * and mails it when it goes by mail (the server does both); this only checks
 * the nine digits first and says what happened.
 */
export default function AllocationEntry({ documentId, number, onSaved }: AllocationEntryProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inputId = `allocation-${documentId}`;

  async function save() {
    if (saving) return;
    const invalid = allocationInputError(value);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const answer = await setAllocationNumber(documentId, allocationDigits(value));
      toast.success(allocationResultMessage(answer, number));
      setValue('');
      onSaved();
    } catch (err) {
      setError(allocationFailureMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!documentId) return <span className={styles.subLine}>יש להזין את המספר במסך המסמכים</span>;

  return (
    <span className={styles.allocation}>
      <label htmlFor={inputId} className={styles.srOnly}>מספר הקצאה ל-{number}</label>
      <input
        id={inputId}
        dir="ltr"
        inputMode="numeric"
        autoComplete="off"
        placeholder="9 ספרות"
        className={styles.allocationInput}
        value={value}
        disabled={saving}
        aria-invalid={error ? true : undefined}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void save();
        }}
      />
      <button
        type="button"
        className={styles.actionBtn}
        disabled={saving}
        aria-label={`שמירת מספר ההקצאה של ${number}`}
        onClick={() => void save()}
      >
        {saving ? <Loader2 size={14} className={styles.spin} aria-hidden="true" /> : <KeyRound size={14} aria-hidden="true" />}
        שמור
      </button>
      {error && <span className={styles.fieldError} role="alert">{error}</span>}
    </span>
  );
}
