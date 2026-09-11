'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { useDialogExit } from '@/components/ui/motion';
import { linkTenancySlots, type Tenancy, type TenancySuggestion } from '@/lib/rentalsApi';
import DialogShell from './DialogShell';
import SlotChecklist, { type SlotChoice } from './SlotChecklist';
import {
  estimateMonthlyAmount,
  formatShekels,
  freeSlotsForBranch,
  isUnknownOutcome,
  tenancyApiError,
  tenantName,
  toAmount,
} from './tenancyUtils';
import styles from './rentalsDialog.module.css';

interface LinkSlotsDialogProps {
  tenancy: Tenancy;
  /** The calendar's rentals that no tenancy holds. */
  suggestions: readonly TenancySuggestion[];
  suggestionsLoading: boolean;
  onClose: () => void;
  /** Something may have been written — the list should read the server again. */
  onChanged: () => void;
  /** The slots were linked. Say so; the dialog closes itself. */
  onSaved: (message: string) => void;
}

/**
 * Hang more of the calendar's rentals on a tenancy: the rentals in its branch
 * that no tenancy holds yet. Linking does not touch the monthly amount — that
 * is the agreement, and changes only when the office edits it — so the dialog
 * shows what the slots would come to, and leaves the decision in the editor.
 */
export default function LinkSlotsDialog({
  tenancy,
  suggestions,
  suggestionsLoading,
  onClose,
  onChanged,
  onSaved,
}: LinkSlotsDialogProps) {
  const { closing, requestClose } = useDialogExit(onClose);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);

  const choices = useMemo<SlotChoice[]>(
    () =>
      freeSlotsForBranch(suggestions, tenancy.branch).map(({ slot, renterName }) => ({
        slot,
        note: renterName ? `ביומן: ${renterName}` : undefined,
      })),
    [suggestions, tenancy.branch],
  );

  // A slot another screen linked meanwhile drops out of the choices, and out of the selection with it.
  const chosen = useMemo(() => {
    const offered = new Set(choices.map(({ slot }) => slot.id));
    return selected.filter((id) => offered.has(id));
  }, [choices, selected]);

  const after = useMemo(() => {
    const ids = new Set(chosen);
    const added = choices.filter(({ slot }) => ids.has(slot.id)).map(({ slot }) => slot);
    return estimateMonthlyAmount([...(tenancy.slots ?? []), ...added]);
  }, [choices, chosen, tenancy.slots]);

  function toggle(slotId: string, checked: boolean) {
    setSelected((prev) => (checked ? [...prev.filter((id) => id !== slotId), slotId] : prev.filter((id) => id !== slotId)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || chosen.length === 0) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      await linkTenancySlots(tenancy.id, chosen);
      onSaved(chosen.length === 1 ? 'המשבצת חוברה לשוכר' : `${chosen.length} משבצות חוברו לשוכר`);
      requestClose();
    } catch (err) {
      if (isUnknownOutcome(err)) {
        onChanged();
        setError('לא התקבלה תשובה מהשרת. בדקו ברשימה אם המשבצות חוברו לפני שמנסים שוב.');
      } else {
        setError(tenancyApiError(err, 'חיבור המשבצות נכשל'));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const where = tenancy.branch_name ? `ב${tenancy.branch_name}` : 'בסניף';

  return (
    <DialogShell
      id="link-slots"
      title={`חיבור משבצות — ${tenantName(tenancy.tenant)}`}
      hint={`שכירויות ${where} שעוד לא שייכות לאף שוכר.`}
      closing={closing}
      onRequestClose={requestClose}
      busy={saving}
      onSubmit={handleSubmit}
      footer={
        <>
          <span className={styles.footNote}>
            {chosen.length > 0 ? (
              <>
                נבחרו <b>{chosen.length}</b>
              </>
            ) : (
              'לא נבחרו משבצות'
            )}
          </span>
          <button type="button" className={styles.secondaryBtn} onClick={requestClose} disabled={saving}>
            ביטול
          </button>
          <button type="submit" className={styles.primaryBtn} disabled={saving || chosen.length === 0}>
            {saving && <Loader2 size={15} className={styles.spin} aria-hidden="true" />}
            {saving ? 'מחבר…' : 'חיבור המשבצות'}
          </button>
        </>
      }
    >
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {suggestionsLoading && choices.length === 0 ? (
        <p className={styles.checkEmpty}>טוען את השכירויות הפנויות…</p>
      ) : (
        <SlotChecklist
          id="link-slot"
          label={`שכירויות פנויות ${where}`}
          choices={choices}
          selected={chosen}
          onToggle={toggle}
          disabled={saving}
          empty={`אין ${where} שכירויות שלא חוברו לשוכר. שכירות חדשה נוספת בלשונית "משבצות ביומן".`}
        />
      )}

      {chosen.length > 0 && (
        <div>
          <p className={styles.moneyLine}>
            <span>
              הסכום החודשי עכשיו: <b>{formatShekels(toAmount(tenancy.monthly_amount))}</b> לפני מע״מ
            </span>
            {after > 0 && (
              <span>
                · לפי כל המשבצות אחרי החיבור: <b>{formatShekels(after)}</b>
              </span>
            )}
          </p>
          <p className={styles.help}>חיבור משבצת לא משנה את הסכום החודשי. כדי לעדכן אותו, פתחו את עריכת השוכר.</p>
        </div>
      )}
    </DialogShell>
  );
}
