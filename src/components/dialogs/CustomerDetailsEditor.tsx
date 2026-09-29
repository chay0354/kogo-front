'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  MessageCircle,
  Plus,
  Trash2,
  User,
  Users,
} from 'lucide-react';

import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { sanitizeIsraeliIdInput } from '@/lib/israeliId';
import type { ChildWithDetails } from '@/types/customer';
import {
  MAX_EXTRA_PHONES,
  buildPayload,
  describeChanges,
  formFromChild,
  isMobile,
  normalisePhone,
  readSaveResponse,
  samePhone,
  validateDetails,
  type CustomerDetailsForm,
  type DetailChange,
  type DuplicateWarning,
  type FieldErrors,
  type SaveOutcome,
  type Section,
} from './customerDetailsForm';

interface CustomerDetailsEditorProps {
  child: ChildWithDetails;
  onCancel: () => void;
  /** The card's fresh row (null when the save folded it into another record), and what changed. */
  onSaved: (child: ChildWithDetails | null, changes: DetailChange[]) => void;
  /** Whether there are edits not yet saved — so the card can ask before it closes. */
  onDirtyChange?: (dirty: boolean) => void;
}

// Every path a field below renders; any other server error is listed at the top.
const FIELD_PATHS = new Set([
  'child.first_name', 'child.last_name', 'child.birth_date', 'child.gender',
  'child.id_number', 'child.phone_number', 'child.notes',
  'parent.first_name', 'parent.last_name', 'parent.phone', 'parent.email', 'parent.id_number',
  'family.name', 'family.address', 'family.notes',
]);

function Field({
  label,
  error,
  hint,
  changed,
  children,
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
  changed?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {label}
        {changed && !error && (
          <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">שונה</span>
        )}
      </span>
      {children}
      {error ? (
        <span className="block text-xs text-red-600" role="alert">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

function inputClass(error?: string, changed?: boolean) {
  if (error) return 'input border-red-500 focus:ring-red-300';
  if (changed) return 'input border-amber-400 bg-amber-50/40';
  return 'input';
}

let draftCounter = 0;

/**
 * The details tab in edit mode: the same two cards the office reads, as fields.
 * A save first shows what will change, old against new; a phone or parent ID
 * that belongs to another family has to be confirmed; then one request saves
 * all of it or none of it.
 */
export default function CustomerDetailsEditor({ child, onCancel, onSaved, onDirtyChange }: CustomerDetailsEditorProps) {
  // Frozen at the start of the edit: a list refresh underneath must not move
  // the baseline the changes are measured against.
  const [initial] = useState<CustomerDetailsForm>(() => formFromChild(child));
  const [form, setForm] = useState<CustomerDetailsForm>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [stage, setStage] = useState<'editing' | 'review'>('editing');
  const [duplicates, setDuplicates] = useState<DuplicateWarning[]>([]);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState('');
  const familyEditable = child.family_editable !== false;

  const changes = useMemo(() => describeChanges(form, initial), [form, initial]);
  const changedPaths = useMemo(() => new Set(changes.map((change) => change.path)), [changes]);
  const dirty = changes.length > 0;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const otherErrors = Object.entries(errors).filter(([path]) => !FIELD_PATHS.has(path) && !/^extra_phones\.\d+\.phone$/.test(path));

  const backToEditing = () => {
    setStage('editing');
    setDuplicates([]);
  };

  const set = (section: Section, key: string, value: string) => {
    setForm((prev) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
    setErrors((prev) => {
      const path = `${section}.${key}`;
      if (!(path in prev)) return prev;
      const next = { ...prev };
      delete next[path];
      return next;
    });
    backToEditing();
  };

  const setExtra = (index: number, patch: Partial<{ name: string; phone: string }>) => {
    setForm((prev) => ({
      ...prev,
      extra_phones: prev.extra_phones.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
    setErrors((prev) => {
      const next = { ...prev };
      Object.keys(next).filter((path) => path.startsWith('extra_phones')).forEach((path) => delete next[path]);
      return next;
    });
    backToEditing();
  };

  const addExtra = () => {
    draftCounter += 1;
    setForm((prev) => ({
      ...prev,
      extra_phones: [...prev.extra_phones, { key: `new-${draftCounter}`, name: '', phone: '' }],
    }));
    backToEditing();
  };

  const removeExtra = (index: number) => {
    setForm((prev) => ({ ...prev, extra_phones: prev.extra_phones.filter((_, i) => i !== index) }));
    setErrors((prev) => {
      const next = { ...prev };
      Object.keys(next).filter((path) => path.startsWith('extra_phones')).forEach((path) => delete next[path]);
      return next;
    });
    backToEditing();
  };

  const review = () => {
    setFailure('');
    const found = validateDetails(form, initial);
    setErrors(found);
    if (Object.keys(found).length) {
      setFailure('יש שדות שצריך לתקן — הם מסומנים באדום');
      return;
    }
    if (!changes.length) {
      onCancel();
      return;
    }
    setStage('review');
  };

  const handleOutcome = (outcome: SaveOutcome) => {
    if (outcome.kind === 'saved') {
      onSaved(outcome.child, outcome.changes);
      return;
    }
    if (outcome.kind === 'invalid') {
      setErrors(outcome.errors);
      setStage('editing');
      setFailure('השמירה נדחתה — השדות לתיקון מסומנים באדום. דבר לא נשמר.');
      return;
    }
    if (outcome.kind === 'duplicates') {
      setDuplicates(outcome.duplicates);
      return;
    }
    setFailure(`${outcome.message}. דבר לא נשמר.`);
  };

  const save = async (confirmDuplicates: boolean) => {
    if (saving) return;
    setSaving(true);
    setFailure('');
    try {
      const res = await api.patch(
        `/customers/children/${child.id}/details/`,
        buildPayload(form, initial, confirmDuplicates),
      );
      handleOutcome(readSaveResponse(res.status, res.data));
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: unknown } } | null)?.response;
      if (!response) {
        // No answer: the save may or may not have landed. Say so rather than guess.
        setFailure('אין תשובה מהשרת. ייתכן שהשינויים נשמרו — סגרו ופתחו את הכרטיס מחדש לפני ניסיון נוסף.');
        return;
      }
      handleOutcome(readSaveResponse(response.status ?? 0, response.data));
    } finally {
      setSaving(false);
    }
  };

  const parentPhoneDigits = normalisePhone(form.parent.phone);
  const parentPhoneChanged = changedPaths.has('parent.phone');
  const parentPhoneHint = parentPhoneChanged && parentPhoneDigits
    ? isMobile(parentPhoneDigits)
      ? 'מעכשיו הודעות WhatsApp, קישורי תשלום והתראות יישלחו למספר הזה'
      : 'מספר קווי — הודעות WhatsApp לא יגיעו אליו'
    : undefined;

  const text = (section: Section, key: string, label: string, opts: {
    type?: string;
    dir?: 'ltr' | 'rtl';
    inputMode?: 'tel' | 'email' | 'numeric' | 'text';
    placeholder?: string;
    hint?: ReactNode;
    maxLength?: number;
    sanitize?: (value: string) => string;
    disabled?: boolean;
  } = {}) => {
    const path = `${section}.${key}`;
    const value = (form[section] as Record<string, string>)[key] ?? '';
    const changed = changedPaths.has(path);
    return (
      <Field label={label} error={errors[path]} hint={opts.hint} changed={changed}>
        <input
          type={opts.type ?? 'text'}
          dir={opts.dir}
          inputMode={opts.inputMode}
          value={value}
          maxLength={opts.maxLength}
          placeholder={opts.placeholder}
          disabled={opts.disabled || saving}
          aria-invalid={Boolean(errors[path]) || undefined}
          onChange={(e) => set(section, key, opts.sanitize ? opts.sanitize(e.target.value) : e.target.value)}
          className={inputClass(errors[path], changed)}
        />
      </Field>
    );
  };

  const notes = (section: Section, label: string) => {
    const path = `${section}.notes`;
    const changed = changedPaths.has(path);
    return (
      <Field label={label} error={errors[path]} changed={changed}>
        <textarea
          rows={2}
          value={(form[section] as Record<string, string>).notes ?? ''}
          disabled={saving}
          onChange={(e) => set(section, 'notes', e.target.value)}
          className={`${inputClass(errors[path], changed)} resize-y`}
        />
      </Field>
    );
  };

  return (
    <div className="px-6 pb-6">
      {otherErrors.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {otherErrors.map(([path, message]) => (
            <div key={path}>{message}</div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* The child */}
        <div>
          <h4 className="font-semibold text-lg flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            פרטי ילד
          </h4>
          <div className="bg-muted/50 rounded-lg p-4 space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-3">
              {text('child', 'first_name', 'שם פרטי', { maxLength: 100 })}
              {text('child', 'last_name', 'שם משפחה', { maxLength: 100 })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {text('child', 'birth_date', 'תאריך לידה', { type: 'date', dir: 'ltr' })}
              <Field label="מגדר" error={errors['child.gender']} changed={changedPaths.has('child.gender')}>
                <select
                  value={form.child.gender}
                  disabled={saving}
                  onChange={(e) => set('child', 'gender', e.target.value)}
                  className={inputClass(errors['child.gender'], changedPaths.has('child.gender'))}
                >
                  {!form.child.gender && <option value="">—</option>}
                  <option value="male">זכר</option>
                  <option value="female">נקבה</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {text('child', 'id_number', 'תעודת זהות', {
                dir: 'ltr', inputMode: 'numeric', maxLength: 9, sanitize: sanitizeIsraeliIdInput,
              })}
              {text('child', 'phone_number', 'טלפון ילד', {
                dir: 'ltr', inputMode: 'tel', placeholder: 'לא חובה', maxLength: 20,
              })}
            </div>
            {notes('child', 'הערות על הילד')}
          </div>
        </div>

        {/* The family */}
        <div>
          <h4 className="font-semibold text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            פרטי משפחה
          </h4>
          {!familyEditable ? (
            <div className="bg-muted/50 rounded-lg p-4 mt-3 text-sm text-muted-foreground">
              הילד נוסף בשיעור ועדיין אין לו משפחה משלו. פרטי ההורה יתעדכנו כשיירשם.
            </div>
          ) : (
            <div className="bg-muted/50 rounded-lg p-4 space-y-3 mt-3">
              {text('family', 'name', 'שם המשפחה', { maxLength: 200 })}
              <div className="grid grid-cols-2 gap-3">
                {text('parent', 'first_name', 'שם פרטי (הורה)', { maxLength: 100 })}
                {text('parent', 'last_name', 'שם משפחה (הורה)', { maxLength: 100 })}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {text('parent', 'phone', 'טלפון הורה', {
                  dir: 'ltr', inputMode: 'tel', maxLength: 20, hint: parentPhoneHint,
                })}
                {text('parent', 'id_number', 'ת.ז. הורה', {
                  dir: 'ltr', inputMode: 'numeric', maxLength: 9, sanitize: sanitizeIsraeliIdInput,
                  hint: changedPaths.has('parent.id_number') ? 'בה ההורה מזוהה כשהוא נרשם שוב באתר' : undefined,
                })}
              </div>
              {text('parent', 'email', 'אימייל', {
                type: 'email', dir: 'ltr', inputMode: 'email', maxLength: 254,
                hint: changedPaths.has('parent.email') ? 'חשבוניות וקבלות יישלחו לכתובת הזו' : undefined,
              })}
              {text('family', 'address', 'כתובת')}

              {/* Extra phones */}
              <div className="rounded-lg border border-teal-200 bg-white p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <MessageCircle className="h-4 w-4 text-teal-600" />
                    טלפונים נוספים
                    {changedPaths.has('extra_phones') && (
                      <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">שונה</span>
                    )}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    disabled={saving || form.extra_phones.length >= MAX_EXTRA_PHONES}
                    onClick={addExtra}
                  >
                    <Plus className="h-3 w-3 ml-1" />
                    הוספת טלפון
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  מקבלים גם את הודעות הקבוצה ב־WhatsApp. קישורי תשלום נשלחים רק להורה.
                </p>
                {form.extra_phones.length === 0 && (
                  <p className="text-xs text-muted-foreground">אין טלפונים נוספים</p>
                )}
                {form.extra_phones.map((row, index) => {
                  const phoneError = errors[`extra_phones.${index}.phone`];
                  const before = initial.extra_phones.find((item) => item.id && item.id === row.id);
                  const rowChanged = !before || !samePhone(before.phone, row.phone) || before.name.trim() !== row.name.trim();
                  return (
                    <div key={row.key} className="flex items-start gap-2">
                      <input
                        type="text"
                        value={row.name}
                        maxLength={200}
                        placeholder="שם (לא חובה)"
                        aria-label={`שם לטלפון נוסף ${index + 1}`}
                        disabled={saving}
                        onChange={(e) => setExtra(index, { name: e.target.value })}
                        className={`${inputClass(undefined, rowChanged)} flex-1 min-w-0`}
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <input
                          type="tel"
                          dir="ltr"
                          inputMode="tel"
                          value={row.phone}
                          maxLength={20}
                          placeholder="05X-XXXXXXX"
                          aria-label={`טלפון נוסף ${index + 1}`}
                          aria-invalid={Boolean(phoneError) || undefined}
                          disabled={saving}
                          onChange={(e) => setExtra(index, { phone: e.target.value })}
                          className={inputClass(phoneError, rowChanged)}
                        />
                        {phoneError && <span className="block text-xs text-red-600" role="alert">{phoneError}</span>}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-10 px-2 text-destructive hover:text-destructive"
                        disabled={saving}
                        onClick={() => removeExtra(index)}
                        title="הסרת הטלפון"
                        aria-label={`הסרת טלפון נוסף ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              {notes('family', 'הערות על המשפחה')}
              <div className="flex justify-between gap-4 text-sm">
                <span className="text-muted-foreground">סניף</span>
                <span className="font-medium" title="הסניף קובע מסוף סליקה ודוחות, ולכן אינו נערך מכאן">
                  {child.branch_name || '-'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save bar: first the review of what will change, then the save itself. */}
      <div className="sticky bottom-0 mt-6 -mx-6 border-t bg-white px-6 py-4 space-y-3">
        {failure && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {failure}
          </div>
        )}
        {stage === 'review' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2" aria-live="polite">
            <p className="text-sm font-semibold">אלה השינויים שיישמרו:</p>
            <ul className="space-y-1 text-sm">
              {changes.map((change) => (
                <li key={change.path} className="flex flex-wrap items-center gap-x-2">
                  <span className="text-muted-foreground">{change.label}:</span>
                  <span className="line-through text-muted-foreground" dir="auto">{change.old || 'ריק'}</span>
                  <ArrowLeft className="h-3 w-3 text-muted-foreground" aria-label="יוחלף ב" />
                  <span className="font-medium" dir="auto">{change.new || 'ריק'}</span>
                </li>
              ))}
            </ul>
            {duplicates.length > 0 && (
              <div className="rounded-md border border-orange-300 bg-orange-50 p-2 text-sm text-orange-900 space-y-1" role="alert">
                {duplicates.map((warning) => (
                  <div key={warning.field} className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{warning.message}</span>
                  </div>
                ))}
                <div className="text-xs">
                  מספר משותף לשתי משפחות עלול לגרום לאיחוד כרטיסים או לזיהוי שגוי בהרשמה. שמרו רק אם זה נכון.
                </div>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {stage === 'editing' ? (
            <>
              <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
                ביטול
              </Button>
              <Button type="button" onClick={review} disabled={saving}>
                {changes.length ? `שמירת שינויים (${changes.length})` : 'סיום עריכה'}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={backToEditing} disabled={saving}>
                חזרה לעריכה
              </Button>
              <Button
                type="button"
                onClick={() => save(duplicates.length > 0)}
                disabled={saving}
                className="gap-2"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {duplicates.length > 0 ? 'שמור בכל זאת' : 'אישור ושמירה'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
