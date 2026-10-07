'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { scopeChoices, type LocationQuestion, type LocationScope } from '@/lib/businessCustomerLocation';
import styles from './index.module.css';

interface LocationChangeDialogProps {
  /** The server's question, or null while there is none. */
  question: LocationQuestion | null;
  customerName: string;
  /** Only a manager moves documents that were already issued. */
  mayMoveDocuments: boolean;
  /** Make the change, as far as chosen. Rejects with the reason when it fails. */
  onConfirm: (scope: LocationScope) => Promise<void>;
  /** Leave the customer where they were. */
  onCancel: () => void;
}

/**
 * A customer's location was already set, and the office picked another: how
 * far does the change go — from now on, or the documents already issued too —
 * and is the office sure. Nothing is changed until it says so here.
 */
export default function LocationChangeDialog({
  question,
  customerName,
  mayMoveDocuments,
  onConfirm,
  onCancel,
}: LocationChangeDialogProps) {
  const [scope, setScope] = useState<LocationScope>('future');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Each question starts from the answer that touches the least.
  useEffect(() => {
    if (question) {
      setScope('future');
      setError('');
    }
  }, [question]);

  if (!question) return null;
  const choices = scopeChoices(question.documents, mayMoveDocuments);

  async function confirm() {
    setSaving(true);
    setError('');
    try {
      await onConfirm(scope);
    } catch (e) {
      const data = (e as { response?: { data?: { error?: string; detail?: string } } } | null)?.response?.data;
      setError(data?.error || data?.detail || 'שינוי המיקום נכשל. המיקום נשאר כפי שהיה.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onCancel(); }}>
      <DialogContent className="max-w-md" overlayClassName="z-[60]">
        <DialogHeader>
          <div className="flex justify-center mb-3">
            <AlertCircle className="h-10 w-10 text-orange-500" aria-hidden="true" />
          </div>
          <DialogTitle className="text-lg text-center">לשנות את המיקום של {customerName || 'הלקוח'}?</DialogTitle>
        </DialogHeader>

        {/* The dialog's own content has no side padding; the header brings its own. */}
        <div className="px-5 pb-5">
        <dl className={styles.locationChange}>
          <div>
            <dt>המיקום היום</dt>
            <dd>{question.previous.label || '—'}</dd>
          </div>
          <div>
            <dt>המיקום החדש</dt>
            <dd><strong>{question.location.label}</strong></dd>
          </div>
        </dl>

        <fieldset className={styles.locationScope}>
          <legend>על מה השינוי חל?</legend>
          {choices.map((choice) => (
            <label key={choice.value} className={choice.disabled ? styles.locationScopeOff : undefined}>
              <input
                type="radio"
                name="location-scope"
                value={choice.value}
                checked={scope === choice.value}
                disabled={choice.disabled || saving}
                onChange={() => setScope(choice.value)}
              />
              <span>
                <strong>{choice.label}</strong>
                <span className={styles.locationScopeHint}>{choice.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {error ? <p className={styles.fieldError} role="alert">{error}</p> : null}

        <div className="flex flex-wrap gap-3 justify-center mt-3">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            ביטול — להשאיר כמו שהיה
          </Button>
          <Button variant="gradient" onClick={confirm} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" aria-hidden="true" /> : null}
            {scope === 'all' ? 'כן, לשנות גם אחורה' : 'כן, לשנות מעכשיו'}
          </Button>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
