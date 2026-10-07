/**
 * Filing a business customer: when a location can be saved, how the change is
 * asked about, and what is sent. The axios instance is mocked. Every name is invented.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('./api', () => ({ default: api }));

import {
  EMPTY_LOCATION,
  fileCustomerLocation,
  hasLocation,
  locationComplete,
  locationMissing,
  locationOf,
  sameLocation,
  savedNote,
  scopeChoices,
} from './businessCustomerLocation';

const NORTH = { business_id: 'lessons', business_category_id: 'branches', branch_id: 'north' };
const SHOWS = { business_id: 'shows', business_category_id: 'general', branch_id: null };

beforeEach(() => {
  api.post.mockReset();
});

describe('a location', () => {
  it('is read from a card or a form, blanks as null', () => {
    expect(locationOf({ business_id: 'lessons', business_category_id: '', branch_id: undefined })).toEqual({
      business_id: 'lessons', business_category_id: null, branch_id: null,
    });
    expect(locationOf(null)).toEqual(EMPTY_LOCATION);
  });

  it('is the same only when all three are', () => {
    expect(sameLocation(NORTH, { ...NORTH })).toBe(true);
    expect(sameLocation(NORTH, { ...NORTH, branch_id: 'south' })).toBe(false);
    expect(sameLocation(SHOWS, EMPTY_LOCATION)).toBe(false);
  });

  it('a card imported clean has none', () => {
    expect(hasLocation(EMPTY_LOCATION)).toBe(false);
    expect(hasLocation(SHOWS)).toBe(true);
    expect(hasLocation({ ...EMPTY_LOCATION, branch_id: 'north' })).toBe(true);
  });

  it('is complete with a business, a category, and the branch when the category means one', () => {
    expect(locationComplete(SHOWS, false)).toBe(true);
    expect(locationComplete(NORTH, true)).toBe(true);
    expect(locationComplete({ ...NORTH, branch_id: null }, true)).toBe(false);
    expect(locationComplete({ ...SHOWS, business_category_id: null }, false)).toBe(false);
    expect(locationComplete(EMPTY_LOCATION, false)).toBe(false);
  });

  it('says what is still missing', () => {
    expect(locationMissing(EMPTY_LOCATION, false)).toBe('יש לבחור עסק');
    expect(locationMissing({ ...SHOWS, business_category_id: null }, false)).toBe('יש לבחור קטגוריה');
    expect(locationMissing({ ...NORTH, branch_id: null }, true)).toBe('יש לבחור סניף');
    expect(locationMissing(NORTH, true)).toBe('');
  });
});

describe('how far a change goes', () => {
  it('offers from now on, and backwards with the number of documents it would move', () => {
    const [future, all] = scopeChoices(12, true);
    expect([future.value, all.value]).toEqual(['future', 'all']);
    expect(future.hint).toContain('12 המסמכים שכבר הופקו ללקוח נשארים במיקום הקודם');
    expect(all.hint).toContain('גם 12 המסמכים שכבר הופקו ללקוח יעברו');
    expect(all.hint).toContain('המספרים, הסכומים והמסמכים עצמם לא משתנים');
    expect([future.disabled, all.disabled]).toEqual([false, false]);
  });

  it('says one document in the singular', () => {
    const [future, all] = scopeChoices(1, true);
    expect(future.hint).toContain('המסמך שכבר הופק ללקוח נשאר');
    expect(all.hint).toContain('גם המסמך שכבר הופק ללקוח יעבור');
  });

  it('closes backwards when there is nothing behind, or to somebody who is not a manager', () => {
    expect(scopeChoices(0, true)[1]).toMatchObject({ disabled: true });
    expect(scopeChoices(0, true)[1].hint).toContain('עוד לא הופקו ללקוח מסמכים');
    expect(scopeChoices(5, false)[1]).toMatchObject({ disabled: true });
    expect(scopeChoices(5, false)[1].hint).toContain('רק מנהל');
    expect(scopeChoices(5, false)[0].disabled).toBe(false);
  });
});

describe('what is said once it is saved', () => {
  const saved = { kind: 'saved' as const, changed: true, documentsChanged: 0, location: NORTH };
  it('names what moved', () => {
    expect(savedNote({ ...saved, scope: 'first' })).toBe('המיקום נשמר בכרטיס הלקוח.');
    expect(savedNote({ ...saved, scope: 'future' })).toContain('מסמכים שכבר הופקו נשארו במיקום הקודם');
    expect(savedNote({ ...saved, scope: 'all', documentsChanged: 7 })).toContain('גם 7 מסמכים שכבר הופקו ללקוח עברו אליו');
    expect(savedNote({ ...saved, scope: 'all', documentsChanged: 1 })).toContain('גם המסמך שכבר הופק');
    expect(savedNote({ ...saved, changed: false, scope: null })).toBe('');
  });
});

describe('fileCustomerLocation', () => {
  it('sends the three ids, and the scope only when one was chosen', async () => {
    api.post.mockResolvedValue({ data: { changed: true, scope: 'first', documents_changed: 0, location: NORTH } });
    const first = await fileCustomerLocation('c1', NORTH);
    expect(api.post).toHaveBeenLastCalledWith('/customers/business-customers/c1/location/', NORTH);
    expect(first).toEqual({ kind: 'saved', changed: true, scope: 'first', documentsChanged: 0, location: NORTH });

    api.post.mockResolvedValue({ data: { changed: true, scope: 'all', documents_changed: 3, location: SHOWS } });
    const moved = await fileCustomerLocation('c1', SHOWS, 'all');
    expect(api.post).toHaveBeenLastCalledWith('/customers/business-customers/c1/location/', { ...SHOWS, scope: 'all' });
    expect(moved).toMatchObject({ kind: 'saved', scope: 'all', documentsChanged: 3 });
  });

  it('turns the server asking how far into a question, not an error', async () => {
    api.post.mockRejectedValue({
      response: {
        status: 409,
        data: {
          needs_scope: true,
          documents: 4,
          previous: { ...NORTH, label: 'חוגים · סניפים · סניף צפון' },
          location: { ...SHOWS, label: 'הצגות חיצוניות · כללי' },
        },
      },
    });
    const answer = await fileCustomerLocation('c1', SHOWS);
    expect(answer).toMatchObject({ kind: 'ask', documents: 4 });
    if (answer.kind !== 'ask') throw new Error('expected a question');
    expect(answer.previous.label).toBe('חוגים · סניפים · סניף צפון');
    expect(answer.location.label).toBe('הצגות חיצוניות · כללי');
  });

  it('throws anything else, for the screen to show', async () => {
    const refused = { response: { status: 400, data: { error: 'הקטגוריה אינה שייכת לעסק שנבחר' } } };
    api.post.mockRejectedValue(refused);
    await expect(fileCustomerLocation('c1', NORTH)).rejects.toBe(refused);
    // A 409 that is not the question is an error too.
    const other = { response: { status: 409, data: { error: 'x' } } };
    api.post.mockRejectedValue(other);
    await expect(fileCustomerLocation('c1', NORTH)).rejects.toBe(other);
  });
});
