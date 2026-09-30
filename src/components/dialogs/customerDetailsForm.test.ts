/**
 * The card's edit form: what it starts from, what it calls a change, what it
 * sends, and the rules it checks before the server does.
 */
import { describe, expect, it } from 'vitest';
import type { ChildWithDetails } from '@/types/customer';
import {
  buildPayload,
  describeChanges,
  formFromChild,
  makeExtraPrimary,
  normalisePhone,
  readSaveResponse,
  validateDetails,
  type CustomerDetailsForm,
} from './customerDetailsForm';

function card(overrides: Partial<ChildWithDetails> = {}): ChildWithDetails {
  return {
    id: 'child-1',
    first_name: 'נועה',
    last_name: 'כהן',
    full_name: 'נועה כהן',
    birth_date: '2016-05-05',
    gender: 'female',
    age: 10,
    id_number: '',
    phone_number: null,
    family_id: 'family-1',
    family_name: 'כהן',
    family_phone: '050-777-8899',
    branch_id: null,
    branch_name: 'סניף',
    parent_name: 'יעל כהן',
    parent_phone: '050-777-8899',
    parent_id: 'parent-1',
    parent_id_number: '000000018',
    parent_email: 'yael@example.com',
    family_email: 'yael@example.com',
    family_address: 'הרצל 1',
    parent_first_name: 'יעל',
    parent_last_name: 'כהן',
    family_notes: '',
    notes: '',
    extra_phones: [{ id: 'parent-2', name: 'סבתא רחל', phone: '0525556666' }],
    family_editable: true,
    status: 'active',
    paid_until_date: null,
    trial_classes_attended: 0,
    absent_irregularly: false,
    is_ghost_visible: true,
    subscription_start_date: null,
    subscription_end_date: null,
    enrollments: [],
    attendance_rate: 0,
    created_at: null,
    ...overrides,
  };
}

function edit(form: CustomerDetailsForm, patch: (draft: CustomerDetailsForm) => void): CustomerDetailsForm {
  const draft: CustomerDetailsForm = JSON.parse(JSON.stringify(form));
  patch(draft);
  return draft;
}

describe('formFromChild', () => {
  it('starts from what the card shows', () => {
    const form = formFromChild(card());
    expect(form.parent).toEqual({
      first_name: 'יעל', last_name: 'כהן', phone: '050-777-8899', email: 'yael@example.com', id_number: '000000018',
    });
    expect(form.extra_phones).toEqual([{ key: 'parent-2', id: 'parent-2', name: 'סבתא רחל', phone: '0525556666' }]);
  });

  it('falls back to the family phone and email the way the card does', () => {
    const form = formFromChild(card({ parent_phone: null, parent_email: null, family_email: 'f@example.com' }));
    expect(form.parent.phone).toBe('050-777-8899');
    expect(form.parent.email).toBe('f@example.com');
  });
});

describe('changes and payload', () => {
  const initial = formFromChild(card());

  it('an untouched form changes nothing and sends nothing', () => {
    expect(describeChanges(initial, initial)).toEqual([]);
    expect(buildPayload(initial, initial)).toEqual({});
  });

  it('the same phone typed differently is not a change', () => {
    const form = edit(initial, (d) => { d.parent.phone = '+972 50 777 8899'; });
    expect(describeChanges(form, initial)).toEqual([]);
    expect(buildPayload(form, initial)).toEqual({});
  });

  it('sends only the fields that changed, by section', () => {
    const form = edit(initial, (d) => {
      d.parent.phone = '054-1234567';
      d.child.notes = 'אלרגיה';
    });
    expect(buildPayload(form, initial)).toEqual({
      child: { notes: 'אלרגיה' },
      parent: { phone: '054-1234567' },
    });
    const changes = describeChanges(form, initial);
    expect(changes.map((c) => [c.label, c.old, c.new])).toEqual([
      ['הערות (ילד)', '', 'אלרגיה'],
      ['טלפון הורה', '050-777-8899', '054-1234567'],
    ]);
  });

  it('sends the whole extra-phones list only when it changed', () => {
    const form = edit(initial, (d) => {
      d.extra_phones.push({ key: 'new-1', name: '', phone: '0521112233' });
    });
    expect(buildPayload(form, initial)).toEqual({
      extra_phones: [
        { id: 'parent-2', name: 'סבתא רחל', phone: '0525556666' },
        { name: '', phone: '0521112233' },
      ],
      extra_phone_ids_seen: ['parent-2'],
    });
    expect(describeChanges(form, initial).at(-1)?.path).toBe('extra_phones');
  });

  it('carries the confirmation of a duplicate only when asked', () => {
    const form = edit(initial, (d) => { d.family.address = 'הרצל 2'; });
    expect(buildPayload(form, initial, true)).toEqual({ family: { address: 'הרצל 2' }, confirm_duplicates: true });
  });

  it('shows dates and gender the way the office reads them', () => {
    const form = edit(initial, (d) => { d.child.birth_date = '2016-06-07'; d.child.gender = 'male'; });
    const byPath = Object.fromEntries(describeChanges(form, initial).map((c) => [c.path, c]));
    expect(byPath['child.birth_date']).toMatchObject({ old: '05/05/2016', new: '07/06/2016' });
    expect(byPath['child.gender']).toMatchObject({ old: 'נקבה', new: 'זכר' });
  });
});

describe('validateDetails', () => {
  const initial = formFromChild(card());

  it('passes an untouched form, even with an old record that would not pass today', () => {
    const legacy = formFromChild(card({ parent_phone: '123', parent_id_number: '1' }));
    expect(validateDetails(legacy, legacy)).toEqual({});
  });

  it('checks phones, IDs, email and required names', () => {
    const form = edit(initial, (d) => {
      d.child.first_name = ' ';
      d.child.id_number = '123456789';
      d.parent.phone = '12345';
      d.parent.email = 'not-an-email';
      d.parent.id_number = '';
      d.family.name = '';
    });
    expect(Object.keys(validateDetails(form, initial)).sort()).toEqual([
      'child.first_name', 'child.id_number', 'family.name', 'parent.email', 'parent.id_number', 'parent.phone',
    ]);
  });

  it('accepts a landline for the parent but only a mobile as an extra phone', () => {
    const landline = edit(initial, (d) => { d.parent.phone = '03-5551234'; });
    expect(validateDetails(landline, initial)).toEqual({});
    const extra = edit(initial, (d) => { d.extra_phones.push({ key: 'n', name: '', phone: '03-5551234' }); });
    expect(validateDetails(extra, initial)).toHaveProperty(['extra_phones.1.phone']);
  });

  it('refuses an extra phone that repeats the parent or another extra', () => {
    const repeatParent = edit(initial, (d) => { d.extra_phones.push({ key: 'n', name: '', phone: '0507778899' }); });
    expect(validateDetails(repeatParent, initial)).toHaveProperty(['extra_phones.1.phone']);
    const twice = edit(initial, (d) => { d.extra_phones.push({ key: 'n', name: '', phone: '052-555-6666' }); });
    expect(validateDetails(twice, initial)).toHaveProperty(['extra_phones.1.phone']);
  });
});

describe('readSaveResponse', () => {
  it('reads each answer the server gives', () => {
    expect(readSaveResponse(200, { child: { id: 'x' } })).toMatchObject({ kind: 'saved', child: { id: 'x' } });
    expect(readSaveResponse(200, { child: null })).toEqual({ kind: 'saved', child: null, changes: [] });
    // The saved note says what the server changed, not what the form expected.
    expect(readSaveResponse(200, { child: null, changes: [{ field: 'parent.phone', label: 'טלפון הורה', old: 'a', new: 'b' }] }))
      .toMatchObject({ changes: [{ path: 'parent.phone', label: 'טלפון הורה', old: 'a', new: 'b' }] });
    expect(readSaveResponse(400, { errors: { 'parent.phone': 'x' } })).toEqual({ kind: 'invalid', errors: { 'parent.phone': 'x' } });
    expect(readSaveResponse(409, { duplicates: [{ field: 'parent.phone', message: 'm' }] }))
      .toEqual({ kind: 'duplicates', duplicates: [{ field: 'parent.phone', message: 'm' }] });
    expect(readSaveResponse(403, {})).toMatchObject({ kind: 'failed' });
    expect(readSaveResponse(500, undefined)).toEqual({ kind: 'failed', message: 'שגיאה בשמירת הפרטים' });
  });
});

describe('normalisePhone', () => {
  it('reads 972 as the leading zero', () => {
    expect(normalisePhone('+972 52-111-2233')).toBe('0521112233');
    expect(normalisePhone('052-111-2233')).toBe('0521112233');
  });
});

describe('review round', () => {
  const initial = formFromChild(card());

  it('takes an ID of up to nine digits, as the widget does', () => {
    const short = edit(initial, (d) => { d.parent.id_number = '31972540'; });
    expect(validateDetails(short, initial)).toEqual({});
    const tooShort = edit(initial, (d) => { d.parent.id_number = '1234'; });
    expect(validateDetails(tooShort, initial)).toHaveProperty(['parent.id_number']);
  });

  it('does not let the parent phone take an extra phone', () => {
    const form = edit(initial, (d) => { d.parent.phone = '052-555-6666'; });
    expect(validateDetails(form, initial)).toHaveProperty(['parent.phone']);
  });

  it('lets an old extra that fails today stay while another is added', () => {
    const legacy = formFromChild(card({
      extra_phones: [{ id: 'old', name: 'בית', phone: '03-5551234' }, { id: 'empty', name: 'ישן', phone: '' }],
    }));
    const form = edit(legacy, (d) => { d.extra_phones.push({ key: 'n', name: '', phone: '0521112233' }); });
    expect(validateDetails(form, legacy)).toEqual({});
  });
});

describe('requirements check round', () => {
  const initial = formFromChild(card());

  it('makes an extra phone the parent, and the parent an extra', () => {
    const swapped = makeExtraPrimary(initial, 0);
    expect(swapped.parent).toMatchObject({ first_name: 'סבתא', last_name: 'רחל', phone: '0525556666', email: 'yael@example.com' });
    expect(swapped.extra_phones[0]).toMatchObject({ id: 'parent-2', name: 'יעל כהן', phone: '050-777-8899' });
    expect(validateDetails(swapped, initial)).toEqual({});
    expect(buildPayload(swapped, initial)).toEqual({
      parent: { first_name: 'סבתא', last_name: 'רחל', phone: '0525556666' },
      extra_phones: [{ id: 'parent-2', name: 'יעל כהן', phone: '050-777-8899' }],
      extra_phone_ids_seen: ['parent-2'],
    });
  });

  it('an old record with a blank surname does not block another edit', () => {
    const legacy = formFromChild(card({ last_name: '', parent_last_name: '', family_name: '' }));
    const form = edit(legacy, (d) => { d.child.notes = 'הערה'; });
    expect(validateDetails(form, legacy)).toEqual({});
    const blanked = edit(initial, (d) => { d.child.last_name = ''; });
    expect(validateDetails(blanked, initial)).toHaveProperty(['child.last_name']);
  });

  it('says that a nameless extra phone takes the parent name', () => {
    const form = edit(initial, (d) => { d.extra_phones.push({ key: 'n', name: '', phone: '0521112233' }); });
    expect(describeChanges(form, initial).at(-1)?.new).toContain('0521112233 · בשם ההורה');
  });
});
