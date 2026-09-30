/**
 * The customer's details as the child's card edits them: the child, the
 * primary parent, the family and the extra phones — the shape PATCH
 * /customers/children/{id}/details/ takes (kogo-back customers/customer_details.py).
 *
 * The server is the judge of every rule; the checks here are the same rules,
 * run first so the office sees the problem beside the field before a save.
 */
import type { ChildWithDetails } from '@/types/customer';
import { isValidIsraeliId } from '@/lib/israeliId';

/** An extra contact: a phone gets the group messages, an email a copy of the receipt each month. */
export interface ExtraPhoneDraft {
  /** Stable React key; an existing contact's is its parent id. */
  key: string;
  /** The parent row behind it; absent for a contact added in this edit. */
  id?: string;
  name: string;
  phone: string;
  email: string;
}

export interface CustomerDetailsForm {
  child: {
    first_name: string;
    last_name: string;
    birth_date: string;
    gender: '' | 'male' | 'female';
    id_number: string;
    phone_number: string;
    notes: string;
  };
  parent: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    id_number: string;
  };
  family: {
    name: string;
    address: string;
    notes: string;
  };
  extra_phones: ExtraPhoneDraft[];
}

export type Section = 'child' | 'parent' | 'family';
/** 'child.first_name', 'extra_phones.0.phone', … — the server's error keys. */
export type FieldErrors = Record<string, string>;

export const MAX_EXTRA_PHONES = 5;

const LABELS: Record<string, string> = {
  'child.first_name': 'שם פרטי (ילד)',
  'child.last_name': 'שם משפחה (ילד)',
  'child.birth_date': 'תאריך לידה',
  'child.gender': 'מגדר',
  'child.id_number': 'ת.ז. ילד',
  'child.phone_number': 'טלפון ילד',
  'child.notes': 'הערות (ילד)',
  'parent.first_name': 'שם פרטי (הורה)',
  'parent.last_name': 'שם משפחה (הורה)',
  'parent.phone': 'טלפון הורה',
  'parent.email': 'אימייל',
  'parent.id_number': 'ת.ז. הורה',
  'family.name': 'שם המשפחה',
  'family.address': 'כתובת',
  'family.notes': 'הערות (משפחה)',
};

/** Digits only, with a leading 972 read as the 0 it stands for — the server's normalise_phone. */
export function normalisePhone(raw: string): string {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('972')) digits = `0${digits.slice(3)}`;
  return digits;
}

export function samePhone(a: string, b: string): boolean {
  return normalisePhone(a) === normalisePhone(b);
}

/** A landline (0X-XXXXXXX) or a 10-digit number — the customers form's rule. */
export function isPhone(digits: string): boolean {
  return /^0\d{8,9}$/.test(digits);
}

/** WhatsApp only reaches a mobile number. */
export function isMobile(digits: string): boolean {
  return /^05\d{8}$/.test(digits);
}

function idDigits(raw: string): string {
  return (raw || '').replace(/\D/g, '');
}

/** Up to nine digits, leading zeros optional — as the widget takes it, and stored as typed. */
function idError(raw: string): string | null {
  const digits = idDigits(raw);
  if (digits.length < 5 || digits.length > 9 || !isValidIsraeliId(digits)) return 'מספר ת.ז. לא תקין';
  return null;
}

export function formFromChild(child: ChildWithDetails): CustomerDetailsForm {
  return {
    child: {
      first_name: child.first_name || '',
      last_name: child.last_name || '',
      birth_date: (child.birth_date || '').slice(0, 10),
      gender: child.gender === 'male' || child.gender === 'female' ? child.gender : '',
      id_number: child.id_number || '',
      phone_number: child.phone_number || '',
      notes: child.notes || '',
    },
    parent: {
      first_name: child.parent_first_name || '',
      last_name: child.parent_last_name || '',
      // What the card shows: the parent's, else the family's.
      phone: child.parent_phone || child.family_phone || '',
      email: child.parent_email || child.family_email || '',
      id_number: child.parent_id_number || '',
    },
    family: {
      name: child.family_name || '',
      address: child.family_address || '',
      notes: child.family_notes || '',
    },
    extra_phones: (child.extra_phones ?? []).map((extra) => ({
      key: extra.id,
      id: extra.id,
      name: extra.name || '',
      phone: extra.phone || '',
      email: extra.email || '',
    })),
  };
}

/** The same value as far as the server is concerned — so formatting alone is not a change. */
function sameValue(path: string, a: string, b: string): boolean {
  if (path.endsWith('phone') || path.endsWith('phone_number')) return samePhone(a, b);
  if (path.endsWith('id_number')) return idDigits(a) === idDigits(b);
  return a.trim() === b.trim();
}

function extrasChanged(form: CustomerDetailsForm, initial: CustomerDetailsForm): boolean {
  const now = form.extra_phones;
  const was = initial.extra_phones;
  if (now.length !== was.length) return true;
  return now.some((row, index) => {
    const before = was[index];
    return (
      row.id !== before.id
      || !samePhone(row.phone, before.phone)
      || row.name.trim() !== before.name.trim()
      || row.email.trim() !== before.email.trim()
    );
  });
}

/**
 * Make an extra contact the parent: the two swap phones and names — and
 * emails, when the contact has one — so payment and card links go to the new
 * number and the old parent stays as an extra contact. A contact without an
 * email leaves the parent's email where it is.
 */
export function makeExtraPrimary(form: CustomerDetailsForm, index: number): CustomerDetailsForm {
  const extra = form.extra_phones[index];
  if (!extra) return form;
  const [first, ...rest] = extra.name.trim().split(/\s+/).filter(Boolean);
  const swapEmail = Boolean(extra.email.trim());
  const parent = {
    ...form.parent,
    ...(extra.name.trim() ? { first_name: first, last_name: rest.join(' ') } : {}),
    phone: extra.phone,
    ...(swapEmail ? { email: extra.email } : {}),
  };
  const demoted = {
    ...extra,
    name: `${form.parent.first_name} ${form.parent.last_name}`.trim(),
    phone: form.parent.phone,
    email: swapEmail ? form.parent.email : '',
  };
  return {
    ...form,
    parent,
    extra_phones: form.extra_phones.map((row, i) => (i === index ? demoted : row)),
  };
}

export interface DetailChange {
  path: string;
  label: string;
  old: string;
  new: string;
}

/** What the save would change, in the order the card shows it. */
export function describeChanges(form: CustomerDetailsForm, initial: CustomerDetailsForm): DetailChange[] {
  const changes: DetailChange[] = [];
  (['child', 'parent', 'family'] as const).forEach((section) => {
    const now = form[section] as Record<string, string>;
    const was = initial[section] as Record<string, string>;
    Object.keys(now).forEach((key) => {
      const path = `${section}.${key}`;
      if (!sameValue(path, now[key] ?? '', was[key] ?? '')) {
        changes.push({
          path,
          label: LABELS[path] ?? path,
          old: displayValue(path, was[key] ?? ''),
          new: displayValue(path, now[key] ?? ''),
        });
      }
    });
  });
  if (extrasChanged(form, initial)) {
    // A phone saved without a name takes the parent's, as the server does.
    const list = (rows: ExtraPhoneDraft[]) =>
      rows
        .map((row) => [row.phone.trim(), row.email.trim(), row.name.trim() || 'בשם ההורה'].filter(Boolean).join(' · '))
        .join(', ');
    changes.push({
      path: 'extra_phones',
      label: 'אנשי קשר נוספים',
      old: list(initial.extra_phones),
      new: list(form.extra_phones),
    });
  }
  return changes;
}

function displayValue(path: string, value: string): string {
  if (path === 'child.gender') return value === 'male' ? 'זכר' : value === 'female' ? 'נקבה' : '';
  if (path === 'child.birth_date') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
  }
  return value.trim();
}

/** Only what changed, so an untouched field is never rewritten (and keeps its formatting). */
export function buildPayload(
  form: CustomerDetailsForm,
  initial: CustomerDetailsForm,
  confirmDuplicates = false,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  (['child', 'parent', 'family'] as const).forEach((section) => {
    const now = form[section] as Record<string, string>;
    const was = initial[section] as Record<string, string>;
    const changed: Record<string, string> = {};
    Object.keys(now).forEach((key) => {
      if (!sameValue(`${section}.${key}`, now[key] ?? '', was[key] ?? '')) changed[key] = now[key] ?? '';
    });
    if (Object.keys(changed).length) payload[section] = changed;
  });
  if (extrasChanged(form, initial)) {
    payload.extra_phones = form.extra_phones.map((row) => ({
      ...(row.id ? { id: row.id } : {}),
      name: row.name.trim(),
      phone: row.phone.trim(),
      email: row.email.trim(),
    }));
    // The list replaces what is there; the server refuses it if someone else
    // changed the extra phones since this card was opened.
    payload.extra_phone_ids_seen = initial.extra_phones.map((row) => row.id).filter(Boolean);
  }
  if (confirmDuplicates) payload.confirm_duplicates = true;
  return payload;
}

/**
 * The server's rules, checked on what changed. A value the office did not
 * touch is left alone even if an old record would not pass today.
 */
export function validateDetails(form: CustomerDetailsForm, initial: CustomerDetailsForm): FieldErrors {
  const errors: FieldErrors = {};
  const changed = (path: string, now: string, was: string) => !sameValue(path, now, was);
  const { child, parent, family } = form;

  // Required fields are checked when they change, as the server does, so an
  // old record with a blank surname does not block an unrelated edit.
  (['first_name', 'last_name'] as const).forEach((key) => {
    if (changed(`child.${key}`, child[key], initial.child[key]) && !child[key].trim()) {
      errors[`child.${key}`] = 'שדה חובה';
    }
  });
  if (changed('child.birth_date', child.birth_date, initial.child.birth_date)) {
    const today = new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(child.birth_date) || child.birth_date > today || child.birth_date < '1900-01-01') {
      errors['child.birth_date'] = 'תאריך לא תקין';
    }
  }
  if (changed('child.gender', child.gender, initial.child.gender) && !child.gender) {
    errors['child.gender'] = 'שדה חובה';
  }
  if (changed('child.id_number', child.id_number, initial.child.id_number) && idDigits(child.id_number)) {
    const error = idError(child.id_number);
    if (error) errors['child.id_number'] = error;
  }
  if (changed('child.phone_number', child.phone_number, initial.child.phone_number)) {
    const digits = normalisePhone(child.phone_number);
    if (digits && !isPhone(digits)) errors['child.phone_number'] = 'מספר טלפון לא תקין';
  }

  (['first_name', 'last_name'] as const).forEach((key) => {
    if (changed(`parent.${key}`, parent[key], initial.parent[key]) && !parent[key].trim()) {
      errors[`parent.${key}`] = 'שדה חובה';
    }
  });
  if (changed('parent.phone', parent.phone, initial.parent.phone)) {
    const digits = normalisePhone(parent.phone);
    if (!digits) errors['parent.phone'] = 'טלפון ההורה הוא שדה חובה';
    else if (!isPhone(digits)) errors['parent.phone'] = 'מספר טלפון לא תקין';
    else if (!extrasChanged(form, initial) && form.extra_phones.some((row) => samePhone(row.phone, parent.phone))) {
      errors['parent.phone'] = 'המספר רשום כטלפון נוסף של המשפחה — הסירו אותו משם קודם';
    }
  }
  if (changed('parent.email', parent.email, initial.parent.email) && parent.email.trim()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent.email.trim())) errors['parent.email'] = 'כתובת אימייל לא תקינה';
  }
  if (changed('parent.id_number', parent.id_number, initial.parent.id_number)) {
    if (!idDigits(parent.id_number)) {
      errors['parent.id_number'] = 'ת.ז. ההורה משמשת לזיהוי בהרשמה ואינה יכולה להימחק';
    } else {
      const error = idError(parent.id_number);
      if (error) errors['parent.id_number'] = error;
    }
  }

  if (changed('family.name', family.name, initial.family.name) && !family.name.trim()) {
    errors['family.name'] = 'שדה חובה';
  }

  if (extrasChanged(form, initial)) {
    if (form.extra_phones.length > MAX_EXTRA_PHONES) {
      errors.extra_phones = `עד ${MAX_EXTRA_PHONES} אנשי קשר נוספים`;
    }
    const seen = new Set<string>([normalisePhone(parent.phone)].filter(Boolean));
    const seenEmails = new Set<string>([parent.email.trim().toLowerCase()].filter(Boolean));
    const before = new Map(initial.extra_phones.map((row) => [row.id, row]));
    form.extra_phones.forEach((row, index) => {
      const digits = normalisePhone(row.phone);
      const email = row.email.trim();
      const path = `extra_phones.${index}`;
      const was = row.id !== undefined ? before.get(row.id) : undefined;
      // What the office did not touch stays, even if an old record would not pass today.
      const unchangedPhone = was !== undefined && samePhone(row.phone, was.phone);
      const unchangedEmail = was !== undefined && email === was.email.trim();
      if (!digits && !email && !(unchangedPhone && unchangedEmail)) {
        errors[`${path}.phone`] = 'צריך טלפון או מייל';
        return;
      }
      if (digits && !unchangedPhone) {
        if (!isMobile(digits)) errors[`${path}.phone`] = 'מספר נייד לא תקין (05X-XXXXXXX)';
        else if (seen.has(digits)) errors[`${path}.phone`] = 'המספר כבר מופיע בכרטיס';
      }
      if (email && !unchangedEmail) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors[`${path}.email`] = 'כתובת אימייל לא תקינה';
        else if (seenEmails.has(email.toLowerCase())) errors[`${path}.email`] = 'המייל כבר מופיע בכרטיס';
      }
      if (digits) seen.add(digits);
      if (email) seenEmails.add(email.toLowerCase());
    });
  }
  return errors;
}

export interface DuplicateWarning {
  field: string;
  message: string;
}

export type SaveOutcome =
  | { kind: 'saved'; child: ChildWithDetails | null; changes: DetailChange[] }
  | { kind: 'invalid'; errors: FieldErrors }
  | { kind: 'duplicates'; duplicates: DuplicateWarning[] }
  | { kind: 'failed'; message: string };

/** Read the server's answer (or its error) into what the card does next. */
export function readSaveResponse(status: number, data: unknown): SaveOutcome {
  const body = (data ?? {}) as {
    child?: ChildWithDetails | null;
    changes?: Array<{ field?: string; label?: string; old?: string; new?: string }>;
    errors?: FieldErrors;
    duplicates?: DuplicateWarning[];
    error?: string;
    detail?: string;
  };
  if (status >= 200 && status < 300) {
    // What the server says it changed — not what the form thought it would.
    const changes = (Array.isArray(body.changes) ? body.changes : []).map((change) => ({
      path: change.field ?? '',
      label: change.label ?? change.field ?? '',
      old: change.old ?? '',
      new: change.new ?? '',
    }));
    return { kind: 'saved', child: body.child ?? null, changes };
  }
  if (status === 400 && body.errors && typeof body.errors === 'object') {
    return { kind: 'invalid', errors: body.errors };
  }
  if (status === 409 && Array.isArray(body.duplicates)) {
    return { kind: 'duplicates', duplicates: body.duplicates };
  }
  if (status === 403) return { kind: 'failed', message: 'אין הרשאה לערוך את הפרטים' };
  if (status === 404) return { kind: 'failed', message: 'הכרטיס לא נמצא — ייתכן שנמחק או אוחד' };
  return { kind: 'failed', message: body.error || body.detail || 'שגיאה בשמירת הפרטים' };
}
