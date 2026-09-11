'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { useDialogExit } from '@/components/ui/motion';
import { importTenancies, type TenancySuggestion, type TenantFields } from '@/lib/rentalsApi';
import DialogShell from './DialogShell';
import {
  BILLING_DAYS,
  TENANCY_STATUS_OPTIONS,
  buildImportPayload,
  contractRangeLabel,
  formatShekels,
  importCardErrors,
  isUnknownOutcome,
  isoDateOf,
  mergeImportCards,
  parseAmountInput,
  slotPriceLabel,
  slotSummary,
  sortSlots,
  suggestedAmountLabel,
  tenancyApiError,
  tenantIdentifier,
  withVat,
  type ImportCardState,
} from './tenancyUtils';
import styles from './rentalsDialog.module.css';

interface ImportTenanciesDialogProps {
  /** The renter groups to offer, already narrowed to the branch the list is filtered to. */
  suggestions: readonly TenancySuggestion[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  /** The branch the list is narrowed to, so an empty dialog is not read as "nothing anywhere". */
  branchName?: string;
  onClose: () => void;
  /** Something may have been written — the list should read the server again. */
  onChanged: () => void;
  /** The tenancies were created. Say so; the dialog closes itself. */
  onImported: (count: number) => void;
}

const TENANT_INPUTS: ReadonlyArray<{ key: keyof TenantFields; label: string; required?: boolean; ltr?: boolean }> = [
  { key: 'first_name', label: 'שם פרטי' },
  { key: 'last_name', label: 'שם משפחה / שם העסק', required: true },
  { key: 'company_number', label: 'ח.פ', ltr: true },
  { key: 'id_number', label: 'ת.ז', ltr: true },
  { key: 'phone', label: 'טלפון', ltr: true },
  { key: 'email', label: 'מייל', ltr: true },
  { key: 'address', label: 'כתובת' },
];

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : `${count} ${many}`;
}

/**
 * חיבור שכירויות קיימות — the calendar's studio rentals that no tenancy holds,
 * one card per renter (their ID, in one branch), each proposing a tenant and
 * an agreement. Every card starts unchecked: the office confirms each one,
 * and nothing is written until "צור שוכרים", which creates all the confirmed
 * ones or none.
 */
export default function ImportTenanciesDialog({
  suggestions,
  loading,
  failed,
  onRetry,
  branchName,
  onClose,
  onChanged,
  onImported,
}: ImportTenanciesDialogProps) {
  const { closing, requestClose } = useDialogExit(onClose);
  const today = useMemo(() => isoDateOf(new Date()), []);
  const [cards, setCards] = useState<ImportCardState[]>(() => mergeImportCards([], suggestions, today));
  const [cardErrors, setCardErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // A refresh while the dialog is open keeps what was typed on the groups still offered.
  useEffect(() => {
    setCards((prev) => mergeImportCards(prev, suggestions, today));
  }, [suggestions, today]);

  const groups = useMemo(() => new Map(suggestions.map((group) => [group.key, group])), [suggestions]);
  const included = cards.filter((card) => card.include);

  function clearCardErrors(key: string) {
    setCardErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function updateCard(key: string, patch: Partial<ImportCardState>) {
    setCards((prev) => prev.map((card) => (card.key === key ? { ...card, ...patch } : card)));
    clearCardErrors(key);
  }

  function updateTenant(key: string, field: keyof TenantFields, value: string) {
    setCards((prev) =>
      prev.map((card) => (card.key === key ? { ...card, tenant: { ...card.tenant, [field]: value } } : card)),
    );
    clearCardErrors(key);
  }

  function groupLabel(card: ImportCardState): string {
    const renter = (groups.get(card.key)?.renter_name ?? '').trim();
    if (renter) return renter;
    const typed = `${card.tenant.first_name} ${card.tenant.last_name}`.trim();
    return typed || card.existingTenant?.full_name || 'שוכר ללא שם';
  }

  function showError(message: string) {
    setError(message);
    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || included.length === 0) return;

    const found: Record<string, string[]> = {};
    included.forEach((card) => {
      const problems = importCardErrors(card);
      if (problems.length > 0) found[card.key] = problems;
    });
    const badKeys = Object.keys(found);
    if (badKeys.length > 0) {
      setCardErrors(found);
      showError(`יש לתקן ${plural(badKeys.length, 'כרטיס אחד', 'כרטיסים')} לפני יצירת השוכרים.`);
      return;
    }

    // The server names a failing group by its place in the request; these name it by its renter.
    const labels = included.map(groupLabel);
    savingRef.current = true;
    setSaving(true);
    setError('');
    setCardErrors({});
    try {
      const created = await importTenancies(buildImportPayload(cards));
      onImported(created.length || included.length);
      requestClose();
    } catch (err) {
      if (isUnknownOutcome(err)) {
        onChanged();
        showError('לא התקבלה תשובה מהשרת, ולכן לא ברור אם השוכרים נוצרו. הרשימה מתרעננת — בדקו בה לפני שמנסים שוב.');
      } else {
        showError(`${tenancyApiError(err, 'יצירת השוכרים נכשלה', labels)}\nדבר לא נשמר — אפשר לתקן ולנסות שוב.`);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function renderBody() {
    if (cards.length === 0) {
      if (loading) {
        return <div className={styles.stateBox}>טוען את השכירויות שעוד לא חוברו…</div>;
      }
      if (failed) {
        return (
          <div className={styles.stateBox} role="alert">
            <p className={styles.stateTitle}>לא הצלחנו לטעון את השכירויות</p>
            <p>אפשר לנסות שוב בעוד רגע.</p>
            <button type="button" className={styles.secondaryBtn} onClick={onRetry}>
              נסו שוב
            </button>
          </div>
        );
      }
      return (
        <div className={styles.stateBox} role="status">
          <p className={styles.stateTitle}>אין מה לחבר</p>
          <p>
            {branchName
              ? `כל השכירויות ביומן ב${branchName} כבר מחוברות לשוכרים.`
              : 'כל השכירויות ביומן כבר מחוברות לשוכרים.'}
          </p>
        </div>
      );
    }

    return (
      <div className={styles.importList}>
        {cards.map((card, index) => {
          const group = groups.get(card.key);
          const problems = cardErrors[card.key] ?? [];
          const net = parseAmountInput(card.monthlyAmount);
          const range = contractRangeLabel(group?.contract_start_date, group?.contract_end_date);
          const meta = [
            group?.branch_name,
            group?.renter_id_number ? `ת.ז / ח.פ ביומן: ${group.renter_id_number}` : 'בלי ת.ז / ח.פ ביומן',
            range !== '—' ? `הסכם ביומן: ${range}` : '',
          ]
            .filter(Boolean)
            .join(' · ');
          const fieldId = (name: string) => `import-${index}-${name}`;
          const serverSuggestion = suggestedAmountLabel(group?.suggested_monthly_amount);

          return (
            <article
              key={card.key}
              className={[
                styles.importCard,
                card.include ? styles.importCardOn : '',
                problems.length > 0 ? styles.importCardBad : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-labelledby={fieldId('title')}
            >
              <div className={styles.importHead}>
                <div>
                  <h3 id={fieldId('title')} className={styles.importTitle}>
                    {(group?.renter_name ?? '').trim() || 'שוכר ללא שם ביומן'}
                  </h3>
                  <p className={styles.importMeta}>{meta}</p>
                </div>
                <label className={styles.includeToggle}>
                  <input
                    type="checkbox"
                    checked={card.include}
                    onChange={(event) => updateCard(card.key, { include: event.target.checked })}
                    disabled={saving}
                  />
                  לכלול
                </label>
              </div>

              <ul className={styles.importSlots} aria-label="המשבצות בקבוצה">
                {sortSlots(group?.slots ?? []).map((slot) => {
                  const price = slotPriceLabel(slot);
                  return (
                    <li key={slot.id}>
                      {slotSummary(slot)}
                      {price ? ` · ${price}` : ''}
                    </li>
                  );
                })}
              </ul>

              <p className={styles.importSub}>השוכר</p>
              {card.useExisting && card.existingTenant ? (
                <div className={styles.chosen}>
                  <div>
                    <span className={styles.chosenName}>קיים: {card.existingTenant.full_name}</span>
                    {tenantIdentifier(card.existingTenant) && (
                      <span className={styles.chosenMeta}>{tenantIdentifier(card.existingTenant)}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => updateCard(card.key, { useExisting: false })}
                    disabled={saving}
                  >
                    שוכר חדש במקום
                  </button>
                </div>
              ) : (
                <>
                  <div className={styles.grid}>
                    {TENANT_INPUTS.map((input) => (
                      <div key={input.key} className={styles.field}>
                        <label htmlFor={fieldId(input.key)} className={styles.label}>
                          {input.label}
                          {input.required && (
                            <span className={styles.req} aria-hidden="true">
                              *
                            </span>
                          )}
                        </label>
                        <input
                          id={fieldId(input.key)}
                          type="text"
                          className={`${styles.input} ${input.ltr ? styles.ltr : ''}`}
                          value={card.tenant[input.key]}
                          onChange={(event) => updateTenant(card.key, input.key, event.target.value)}
                          autoComplete="off"
                          disabled={saving}
                        />
                      </div>
                    ))}
                  </div>
                  {card.existingTenant && (
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() => updateCard(card.key, { useExisting: true })}
                      disabled={saving}
                    >
                      חזרה ללקוח הקיים: {card.existingTenant.full_name}
                    </button>
                  )}
                </>
              )}

              <p className={styles.importSub}>ההסכם</p>
              <div className={styles.grid}>
                <div className={styles.field}>
                  <label htmlFor={fieldId('amount')} className={styles.label}>
                    סכום חודשי לפני מע״מ (₪)
                    <span className={styles.req} aria-hidden="true">
                      *
                    </span>
                  </label>
                  <input
                    id={fieldId('amount')}
                    type="text"
                    inputMode="decimal"
                    className={`${styles.input} ${styles.ltr}`}
                    value={card.monthlyAmount}
                    onChange={(event) => updateCard(card.key, { monthlyAmount: event.target.value })}
                    placeholder="0"
                    disabled={saving}
                  />
                  <p className={styles.help}>
                    {[net !== null ? `כולל מע״מ: ${formatShekels(withVat(net))}` : '', serverSuggestion]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>

                <div className={styles.field}>
                  <label htmlFor={fieldId('billing')} className={styles.label}>
                    יום חיוב בחודש
                  </label>
                  <select
                    id={fieldId('billing')}
                    className={styles.input}
                    value={card.billingDay}
                    onChange={(event) => updateCard(card.key, { billingDay: event.target.value })}
                    disabled={saving}
                  >
                    {BILLING_DAYS.map((day) => (
                      <option key={day} value={String(day)}>
                        ב־{day} לחודש
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.field}>
                  <label htmlFor={fieldId('start')} className={styles.label}>
                    תאריך התחלה
                  </label>
                  <input
                    id={fieldId('start')}
                    type="date"
                    className={styles.input}
                    value={card.startDate}
                    max={card.endDate || undefined}
                    onChange={(event) => updateCard(card.key, { startDate: event.target.value })}
                    disabled={saving}
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor={fieldId('end')} className={styles.label}>
                    תאריך סיום
                  </label>
                  <input
                    id={fieldId('end')}
                    type="date"
                    className={styles.input}
                    value={card.endDate}
                    min={card.startDate || undefined}
                    onChange={(event) => updateCard(card.key, { endDate: event.target.value })}
                    disabled={saving}
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor={fieldId('status')} className={styles.label}>
                    סטטוס
                  </label>
                  <select
                    id={fieldId('status')}
                    className={styles.input}
                    value={card.status}
                    onChange={(event) =>
                      updateCard(card.key, { status: event.target.value as ImportCardState['status'] })
                    }
                    disabled={saving}
                  >
                    {TENANCY_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {problems.length > 0 && (
                <ul className={styles.cardErrors} role="alert">
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <DialogShell
      id="import-tenancies"
      title="חיבור שכירויות קיימות"
      hint='כל כרטיס מציע שוכר אחד: השכירויות ביומן של אותו ת.ז / ח.פ באותו סניף. סמנו "לכלול" רק אחרי שבדקתם את הפרטים — דבר לא נשמר עד "צור שוכרים".'
      closing={closing}
      onRequestClose={requestClose}
      busy={saving}
      onSubmit={handleSubmit}
      wide
      bodyRef={bodyRef}
      footer={
        <>
          {cards.length > 0 && (
            <span className={styles.footNote}>
              נבחרו <b>{included.length}</b> מתוך {cards.length}
            </span>
          )}
          <button type="button" className={styles.secondaryBtn} onClick={requestClose} disabled={saving}>
            ביטול
          </button>
          <button type="submit" className={styles.primaryBtn} disabled={saving || included.length === 0}>
            {saving && <Loader2 size={15} className={styles.spin} aria-hidden="true" />}
            {saving ? 'יוצר…' : 'צור שוכרים'}
          </button>
        </>
      }
    >
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {renderBody()}
    </DialogShell>
  );
}
