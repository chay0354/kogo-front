'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { FilePlus2, Loader2, Search } from 'lucide-react';
import { useDialogExit } from '@/components/ui/motion';
import { searchBusinessCustomers } from '@/lib/api';
import type { BusinessCustomer } from '@/components/dialogs/NewDocumentDialog/types';
import type { BranchOption } from '@/lib/scopedFilters';
import {
  createTenancy,
  fetchTenancy,
  linkTenancySlots,
  unlinkTenancySlot,
  updateTenancy,
  type Tenancy,
  type TenancySlot,
  type TenancySuggestion,
  type TenantFields,
} from '@/lib/rentalsApi';
import DialogShell from './DialogShell';
import SlotChecklist, { type SlotChoice } from './SlotChecklist';
import { contractNoticeAfterSave, isUnsignedContract } from './contractUtils';
import {
  BILLING_DAYS,
  TENANCY_STATUS_OPTIONS,
  VAT_RATE,
  amountFieldValue,
  buildCreatePayload,
  buildUpdatePayload,
  canApplySuggestion,
  emptyTenancyForm,
  estimateMonthlyAmount,
  formatShekels,
  freeSlotsForBranch,
  isUnknownOutcome,
  parseAmountInput,
  slotChanges,
  sortSlots,
  suggestedAmountLabel,
  tenancyApiError,
  tenancyFormErrors,
  tenancyFormFrom,
  tenantFieldsOf,
  tenantIdentifier,
  tenantName,
  withVat,
  type TenancyFormState,
} from './tenancyUtils';
import styles from './rentalsDialog.module.css';

interface TenancyDialogProps {
  /** The tenancy to edit. Absent to create one. */
  tenancy?: Tenancy | null;
  /** The branches this user works in (useScopedBranches). */
  branches: readonly BranchOption[];
  /** A new tenancy starts in the branch the list is narrowed to. */
  defaultBranchId?: string;
  /** Where the free slots come from: the calendar's rentals that no tenancy holds. */
  suggestions: readonly TenancySuggestion[];
  /** The dialog is gone, after its exit. */
  onClose: () => void;
  /** Something may have been written — the list should read the server again. */
  onChanged: () => void;
  /**
   * Everything was written. Say so; the dialog closes itself — or stays, when
   * the server now calls the unsigned contract version on file stale, to say so.
   */
  onSaved: (message: string) => void;
  /**
   * Issue a new contract version for this tenancy, from the row as the server
   * returned it after the save. Offered when the save left its unsigned
   * version behind; the view takes over, and the dialog is gone by then.
   */
  onIssueContract?: (tenancy: Tenancy) => void;
}

/** A search result. The endpoint sends the customer's business too, which the shared type leaves out. */
type CustomerResult = BusinessCustomer & { business_name?: string };

/** What the server holds as far as this dialog knows — what every save is worked out against. */
interface SavedState {
  tenancy: Tenancy;
  slots: TenancySlot[];
}

const TENANT_INPUTS: ReadonlyArray<{
  key: keyof TenantFields;
  label: string;
  required?: boolean;
  ltr?: boolean;
  type?: 'text' | 'tel' | 'email';
  full?: boolean;
}> = [
  { key: 'first_name', label: 'שם פרטי' },
  { key: 'last_name', label: 'שם משפחה / שם העסק', required: true },
  { key: 'company_number', label: 'ח.פ', ltr: true },
  { key: 'id_number', label: 'ת.ז', ltr: true },
  { key: 'phone', label: 'טלפון', ltr: true, type: 'tel' },
  { key: 'email', label: 'מייל', ltr: true, type: 'email' },
  { key: 'address', label: 'כתובת', full: true },
];

const VAT_PERCENT = Math.round(VAT_RATE * 100);

function isSlot(slot: TenancySlot | undefined): slot is TenancySlot {
  return Boolean(slot);
}

/**
 * Create or edit a tenancy: the tenant (a new business customer, or one that
 * exists), the branch, the agreement, and the calendar slots it holds.
 *
 * The contract writes a tenancy and links its slots in separate requests, so
 * a save is up to three steps. Each step moves the dialog's own record of
 * what the server holds; a step that fails leaves the ones before it done,
 * the dialog says so, and trying again sends only what is still missing. A
 * tenancy created here turns the dialog into its editor at once, so a retry
 * can never create a second one.
 *
 * The contract already issued keeps the terms it was issued with; an edit
 * never reaches it. When the tenancy has an unsigned version on file, a save
 * reads the row back, and if the server now calls that version stale the
 * dialog stays to say so, where the change was made — the server's is_stale
 * decides, not a guess from the fields that changed.
 */
export default function TenancyDialog({
  tenancy = null,
  branches,
  defaultBranchId = '',
  suggestions,
  onClose,
  onChanged,
  onSaved,
  onIssueContract,
}: TenancyDialogProps) {
  // The tenancy to issue a new version for once the dialog is gone. Handed over
  // only after the exit: the view's confirmation opens beneath this overlay.
  const issueAfterCloseRef = useRef<Tenancy | null>(null);
  const { closing, requestClose } = useDialogExit(() => {
    onClose();
    const pending = issueAfterCloseRef.current;
    issueAfterCloseRef.current = null;
    if (pending) onIssueContract?.(pending);
  });
  const createdHere = tenancy === null;
  const [saved, setSaved] = useState<SavedState | null>(() =>
    tenancy ? { tenancy, slots: tenancy.slots ?? [] } : null,
  );
  const editing = saved !== null;
  const [form, setForm] = useState<TenancyFormState>(() => {
    if (tenancy) return tenancyFormFrom(tenancy);
    const onlyBranch = branches.length === 1 ? branches[0].id : '';
    return emptyTenancyForm(defaultBranchId || onlyBranch);
  });
  const [picked, setPicked] = useState<CustomerResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Saved, and the server now calls the unsigned version on file stale: what to say, and the row it came from.
  const [contractNotice, setContractNotice] = useState<{ text: string; tenancy: Tenancy } | null>(null);
  const savingRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  function patchForm(patch: Partial<TenancyFormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function setTenantField(key: keyof TenantFields, value: string) {
    setForm((prev) => ({ ...prev, tenant: { ...prev.tenant, [key]: value } }));
  }

  function showError(message: string) {
    setError(message);
    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---- branch ----
  const branchOptions = useMemo(() => {
    const list = [...branches]
      .map((branch) => ({ id: branch.id, name: branch.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
    // A tenancy in a branch this list no longer offers still shows where it is.
    if (form.branch && !list.some((branch) => branch.id === form.branch)) {
      list.unshift({ id: form.branch, name: saved?.tenancy.branch_name || 'סניף שנבחר' });
    }
    return list;
  }, [branches, form.branch, saved?.tenancy.branch_name]);

  // Slots belong to their branch; moving the tenancy with slots on it would
  // leave them in the old one.
  const branchLocked = editing && (saved?.slots.length ?? 0) > 0;

  function changeBranch(branch: string) {
    // The free slots are the new branch's, so nothing chosen in the old one stays chosen.
    patchForm({ branch, slotIds: [] });
  }

  // ---- slots ----
  const choices = useMemo<SlotChoice[]>(() => {
    const held = saved?.slots ?? [];
    const heldIds = new Set(held.map((slot) => slot.id));
    const free = freeSlotsForBranch(suggestions, form.branch).filter(({ slot }) => !heldIds.has(slot.id));
    return [
      ...sortSlots(held).map((slot) => ({ slot, note: 'מחוברת לשוכר הזה' })),
      ...free.map(({ slot, renterName }) => ({ slot, note: renterName ? `ביומן: ${renterName}` : undefined })),
    ];
  }, [saved?.slots, suggestions, form.branch]);

  // A slot another screen linked meanwhile drops out of the choices, and out of the selection with it.
  const selectedIds = useMemo(() => {
    const offered = new Set(choices.map(({ slot }) => slot.id));
    return form.slotIds.filter((id) => offered.has(id));
  }, [choices, form.slotIds]);

  function toggleSlot(slotId: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      slotIds: checked ? [...prev.slotIds.filter((id) => id !== slotId), slotId] : prev.slotIds.filter((id) => id !== slotId),
    }));
  }

  // ---- the amount ----
  const suggested = useMemo(() => {
    const chosen = new Set(selectedIds);
    return estimateMonthlyAmount(choices.filter(({ slot }) => chosen.has(slot.id)).map(({ slot }) => slot));
  }, [choices, selectedIds]);
  const net = parseAmountInput(form.monthlyAmount);
  const suggestion = suggestedAmountLabel(suggested);

  // ---- save ----
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;

    const problems = tenancyFormErrors(form, { editing });
    if (problems.length > 0) {
      showError(problems.join('\n'));
      return;
    }

    const slotById = new Map(choices.map(({ slot }) => [slot.id, slot]));
    let baseline = saved;

    if (baseline) {
      const pending = slotChanges(baseline.slots.map((slot) => slot.id), selectedIds);
      const nothingToSave =
        Object.keys(buildUpdatePayload(form, baseline.tenancy)).length === 0 &&
        pending.link.length === 0 &&
        pending.unlink.length === 0;
      if (nothingToSave) {
        requestClose();
        return;
      }
    }

    savingRef.current = true;
    setSaving(true);
    setError('');
    setContractNotice(null);
    let wrote = false;
    let createdNow = false;

    try {
      if (!baseline) {
        try {
          const created = await createTenancy(buildCreatePayload(form));
          baseline = { tenancy: created, slots: created.slots ?? [] };
        } catch (err) {
          if (isUnknownOutcome(err)) {
            onChanged();
            showError('לא התקבלה תשובה מהשרת, ולכן לא ברור אם השוכר נוצר. בדקו ברשימה לפני שמנסים שוב.');
          } else {
            showError(tenancyApiError(err, 'יצירת השוכר נכשלה'));
          }
          return;
        }
        wrote = true;
        createdNow = true;
        // From here on this dialog edits what it created, so trying again cannot make a second one.
        const created = baseline.tenancy;
        setSaved(baseline);
        setForm((prev) => ({ ...prev, tenant: tenantFieldsOf(created.tenant) }));
      } else {
        const patch = buildUpdatePayload(form, baseline.tenancy);
        if (Object.keys(patch).length > 0) {
          const updated = await updateTenancy(baseline.tenancy.id, patch);
          baseline = {
            tenancy: { ...baseline.tenancy, ...(updated ?? {}) },
            slots: updated?.slots ?? baseline.slots,
          };
          wrote = true;
          setSaved(baseline);
        }
      }

      const { link, unlink } = slotChanges(baseline.slots.map((slot) => slot.id), selectedIds);
      if (link.length > 0) {
        await linkTenancySlots(baseline.tenancy.id, link);
        wrote = true;
        baseline = { ...baseline, slots: [...baseline.slots, ...link.map((id) => slotById.get(id)).filter(isSlot)] };
        setSaved(baseline);
      }
      for (const slotId of unlink) {
        await unlinkTenancySlot(baseline.tenancy.id, slotId);
        wrote = true;
        baseline = { ...baseline, slots: baseline.slots.filter((slot) => slot.id !== slotId) };
        setSaved(baseline);
      }

      onSaved(createdHere ? 'השוכר נוצר' : 'השינויים נשמרו');

      // Only an unsigned version can be left behind by a save; with one on
      // file, read the row back and let the server's is_stale decide.
      if (isUnsignedContract(baseline.tenancy.current_contract)) {
        const fresh = await readBack(baseline.tenancy.id);
        const text = contractNoticeAfterSave(fresh?.current_contract);
        if (fresh && text) {
          setSaved({ tenancy: fresh, slots: fresh.slots ?? baseline.slots });
          setForm(tenancyFormFrom(fresh));
          setContractNotice({ text, tenancy: fresh });
          bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      }
      requestClose();
    } catch (err) {
      if (wrote) onChanged();
      if (isUnknownOutcome(err)) {
        onChanged();
        showError('לא התקבלה תשובה מהשרת. בדקו ברשימה מה נשמר לפני שמנסים שוב.');
      } else {
        const reason = tenancyApiError(err, 'השמירה נכשלה');
        if (createdNow) {
          showError(`השוכר נוצר, אבל חיבור המשבצות נכשל:\n${reason}\nאפשר לנסות שוב מכאן — השוכר לא ייווצר פעמיים.`);
        } else if (wrote) {
          showError(`חלק מהשינויים נשמרו, אבל לא הכול:\n${reason}\nאפשר לנסות שוב — מה שכבר נשמר לא יישלח שוב.`);
        } else {
          showError(reason);
        }
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  /**
   * The row as the server holds it after a save. null when the read fails: the
   * save stands, and the list shows the version's state in its own column.
   */
  async function readBack(tenancyId: string): Promise<Tenancy | null> {
    try {
      return await fetchTenancy(tenancyId);
    } catch {
      return null;
    }
  }

  function issueNewVersion() {
    if (!contractNotice || saving) return;
    issueAfterCloseRef.current = contractNotice.tenancy;
    requestClose();
  }

  const title = saved ? `עריכת שוכר — ${tenantName(saved.tenancy.tenant)}` : 'שוכר חדש';
  const pickingExisting = !editing && form.tenantMode === 'existing';

  return (
    <DialogShell
      id="tenancy-dialog"
      title={title}
      hint={
        editing
          ? undefined
          : 'לקוח עסקי בסניף, ההסכם החודשי שלו והמשבצות שלו ביומן. את החוזה מפיקים מהשורה ברשימה אחרי השמירה; החתימה והוראת הקבע יתווספו בשלבים הבאים.'
      }
      closing={closing}
      onRequestClose={requestClose}
      busy={saving}
      onSubmit={handleSubmit}
      bodyRef={bodyRef}
      footer={
        <>
          {/* Once saved, "ביטול" would read as undoing what was just written. */}
          <button type="button" className={styles.secondaryBtn} onClick={requestClose} disabled={saving}>
            {contractNotice ? 'סגירה' : 'ביטול'}
          </button>
          <button type="submit" className={styles.primaryBtn} disabled={saving}>
            {saving && <Loader2 size={15} className={styles.spin} aria-hidden="true" />}
            {saving ? 'שומר…' : editing ? 'שמירת השינויים' : 'יצירת השוכר'}
          </button>
        </>
      }
    >
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {contractNotice && (
        <div className={styles.savedNotice} role="status">
          <p className={styles.savedTitle}>השינויים נשמרו</p>
          <p className={styles.savedText}>{contractNotice.text}</p>
          {onIssueContract && (
            <button type="button" className={styles.savedAction} onClick={issueNewVersion} disabled={saving}>
              <FilePlus2 size={14} aria-hidden="true" />
              הפק גרסה חדשה
            </button>
          )}
        </div>
      )}

      <section className={styles.section} aria-labelledby="tenancy-tenant-title">
        <div className={styles.sectionHead}>
          <h3 id="tenancy-tenant-title" className={styles.sectionTitle}>
            השוכר
          </h3>
          <p className={styles.sectionSub}>
            {editing ? 'שינוי כאן מעדכן את פרטי הלקוח העסקי' : 'יישמר כלקוח עסקי בתיוג סוחרים'}
          </p>
        </div>

        {!editing && (
          <div role="radiogroup" aria-label="מי השוכר" className={styles.segment}>
            <button
              type="button"
              role="radio"
              aria-checked={form.tenantMode === 'new'}
              className={styles.segmentBtn}
              onClick={() => patchForm({ tenantMode: 'new' })}
              disabled={saving}
            >
              שוכר חדש
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={form.tenantMode === 'existing'}
              className={styles.segmentBtn}
              onClick={() => patchForm({ tenantMode: 'existing' })}
              disabled={saving}
            >
              לקוח עסקי קיים
            </button>
          </div>
        )}

        {pickingExisting ? (
          <CustomerPicker
            picked={picked}
            disabled={saving}
            onPick={(customer) => {
              setPicked(customer);
              patchForm({ existingTenantId: customer.id });
            }}
            onClear={() => {
              setPicked(null);
              patchForm({ existingTenantId: '' });
            }}
          />
        ) : (
          <div className={styles.grid}>
            {TENANT_INPUTS.map((input) => {
              const inputId = `tenancy-tenant-${input.key}`;
              return (
                <div key={input.key} className={`${styles.field} ${input.full ? styles.full : ''}`}>
                  <label htmlFor={inputId} className={styles.label}>
                    {input.label}
                    {input.required && (
                      <span className={styles.req} aria-hidden="true">
                        *
                      </span>
                    )}
                  </label>
                  <input
                    id={inputId}
                    type={input.type ?? 'text'}
                    className={`${styles.input} ${input.ltr ? styles.ltr : ''}`}
                    value={form.tenant[input.key]}
                    onChange={(event) => setTenantField(input.key, event.target.value)}
                    required={input.required}
                    aria-required={input.required || undefined}
                    autoComplete="off"
                    disabled={saving}
                    autoFocus={!editing && input.key === 'first_name'}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="tenancy-agreement-title">
        <div className={styles.sectionHead}>
          <h3 id="tenancy-agreement-title" className={styles.sectionTitle}>
            ההסכם
          </h3>
          <p className={styles.sectionSub}>סכום חודשי קבוע, לפני מע״מ</p>
        </div>

        <div className={styles.grid}>
          <div className={styles.field}>
            <label htmlFor="tenancy-branch" className={styles.label}>
              סניף
              <span className={styles.req} aria-hidden="true">
                *
              </span>
            </label>
            <select
              id="tenancy-branch"
              className={styles.input}
              value={form.branch}
              onChange={(event) => changeBranch(event.target.value)}
              disabled={saving || branchLocked}
              aria-required
              aria-describedby={branchLocked ? 'tenancy-branch-help' : undefined}
            >
              <option value="">בחרו סניף</option>
              {branchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            {branchLocked && (
              <p id="tenancy-branch-help" className={styles.help}>
                כדי להעביר לסניף אחר, נתקו קודם את המשבצות של השוכר.
              </p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="tenancy-status" className={styles.label}>
              סטטוס
            </label>
            <select
              id="tenancy-status"
              className={styles.input}
              value={form.status}
              onChange={(event) => patchForm({ status: event.target.value as TenancyFormState['status'] })}
              disabled={saving}
            >
              {TENANCY_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={`${styles.field} ${styles.full}`}>
            <label htmlFor="tenancy-amount" className={styles.label}>
              סכום חודשי לפני מע״מ (₪)
              <span className={styles.req} aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="tenancy-amount"
              type="text"
              inputMode="decimal"
              className={`${styles.input} ${styles.ltr}`}
              value={form.monthlyAmount}
              onChange={(event) => patchForm({ monthlyAmount: event.target.value })}
              placeholder="0"
              aria-required
              aria-describedby="tenancy-amount-line"
              disabled={saving}
            />
            <div id="tenancy-amount-line" className={styles.moneyLine} aria-live="polite">
              {net !== null && (
                <span>
                  כולל מע״מ ({VAT_PERCENT}%): <b>{formatShekels(withVat(net))}</b>
                </span>
              )}
              {suggestion && (
                <span
                  className={styles.suggest}
                  title="מחיר לפעם × 4 לכל יום בשבוע, כמו בהסכם השכירות"
                >
                  {suggestion}
                  {canApplySuggestion(suggested, form.monthlyAmount) && (
                    <button
                      type="button"
                      className={styles.suggestApply}
                      onClick={() => patchForm({ monthlyAmount: amountFieldValue(suggested) })}
                      disabled={saving}
                    >
                      החלת הסכום
                    </button>
                  )}
                </span>
              )}
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="tenancy-billing-day" className={styles.label}>
              יום חיוב בחודש
            </label>
            <select
              id="tenancy-billing-day"
              className={styles.input}
              value={form.billingDay}
              onChange={(event) => patchForm({ billingDay: event.target.value })}
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
            <label htmlFor="tenancy-start" className={styles.label}>
              תאריך התחלה
            </label>
            <input
              id="tenancy-start"
              type="date"
              className={styles.input}
              value={form.startDate}
              max={form.endDate || undefined}
              onChange={(event) => patchForm({ startDate: event.target.value })}
              disabled={saving}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="tenancy-end" className={styles.label}>
              תאריך סיום
            </label>
            <input
              id="tenancy-end"
              type="date"
              className={styles.input}
              value={form.endDate}
              min={form.startDate || undefined}
              onChange={(event) => patchForm({ endDate: event.target.value })}
              disabled={saving}
            />
          </div>

          <div className={`${styles.field} ${styles.full}`}>
            <label htmlFor="tenancy-notes" className={styles.label}>
              הערות
            </label>
            <textarea
              id="tenancy-notes"
              className={`${styles.input} ${styles.textarea}`}
              value={form.notes}
              onChange={(event) => patchForm({ notes: event.target.value })}
              rows={3}
              disabled={saving}
            />
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="tenancy-slots-title">
        <div className={styles.sectionHead}>
          <h3 id="tenancy-slots-title" className={styles.sectionTitle}>
            משבצות ביומן
          </h3>
          <p className={styles.sectionSub}>שכירויות בסניף שעוד לא שייכות לאף שוכר</p>
        </div>
        <SlotChecklist
          id="tenancy-slot"
          label="משבצות ביומן לשוכר"
          choices={choices}
          selected={selectedIds}
          onToggle={toggleSlot}
          disabled={saving}
          empty={
            form.branch
              ? 'אין בסניף הזה שכירויות פנויות. שכירות חדשה נוספת בלשונית "משבצות ביומן".'
              : 'בחרו סניף כדי לראות את השכירויות הפנויות בו.'
          }
        />
      </section>
    </DialogShell>
  );
}

interface CustomerPickerProps {
  picked: CustomerResult | null;
  disabled: boolean;
  onPick: (customer: CustomerResult) => void;
  onClear: () => void;
}

/** Find a business customer by name, company number, phone or email — the documents dialog's search. */
function CustomerPicker({ picked, disabled, onPick, onClear }: CustomerPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [answered, setAnswered] = useState('');

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setAnswered('');
      setSearching(false);
      return undefined;
    }
    let live = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const list = (await searchBusinessCustomers(term)) as CustomerResult[];
        if (live) setResults(Array.isArray(list) ? list.slice(0, 8) : []);
      } catch {
        if (live) setResults([]);
      } finally {
        if (live) {
          setAnswered(term);
          setSearching(false);
        }
      }
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  if (picked) {
    const meta = [tenantIdentifier(picked), picked.phone].filter(Boolean).join(' · ');
    return (
      <div className={styles.chosen}>
        <div>
          <span className={styles.chosenName}>
            {picked.full_name || tenantName(picked)}
            {picked.business_name === 'סוחרים' && <span className={styles.tag}>סוחרים</span>}
          </span>
          {meta && <span className={styles.chosenMeta}>{meta}</span>}
        </div>
        <button type="button" className={styles.linkBtn} onClick={onClear} disabled={disabled}>
          החלפה
        </button>
      </div>
    );
  }

  const showList = query.trim().length >= 2 && answered === query.trim() && !searching;

  return (
    <div className={styles.picker}>
      <label htmlFor="tenancy-customer-search" className={styles.label}>
        חיפוש לקוח עסקי
      </label>
      <input
        id="tenancy-customer-search"
        type="search"
        className={styles.input}
        placeholder="שם, ח.פ, טלפון או מייל…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
        autoFocus
        disabled={disabled}
        aria-describedby="tenancy-customer-status"
      />
      <p id="tenancy-customer-status" className={styles.help} aria-live="polite">
        {searching ? (
          <>
            <Loader2 size={12} className={styles.spin} aria-hidden="true" /> מחפש…
          </>
        ) : query.trim().length < 2 ? (
          <>
            <Search size={12} aria-hidden="true" /> לפחות שתי אותיות
          </>
        ) : null}
      </p>
      {showList && (
        <ul className={styles.pickerList} aria-label="לקוחות עסקיים שנמצאו">
          {results.length === 0 ? (
            <li className={styles.pickerEmpty}>לא נמצא לקוח עסקי. אפשר לעבור ל&quot;שוכר חדש&quot;.</li>
          ) : (
            results.map((customer) => {
              const meta = [tenantIdentifier(customer), customer.phone].filter(Boolean).join(' · ');
              return (
                <li key={customer.id}>
                  <button type="button" className={styles.pickerItem} onClick={() => onPick(customer)} disabled={disabled}>
                    <span className={styles.pickerName}>
                      {customer.full_name || tenantName(customer)}
                      {customer.business_name === 'סוחרים' && <span className={styles.tag}>סוחרים</span>}
                    </span>
                    {meta && <span className={styles.pickerMeta}>{meta}</span>}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
