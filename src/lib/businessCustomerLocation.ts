import api from './api';

/**
 * Where a business customer is filed — the business, the category in it and,
 * under the category סניפים, the branch (kogo-back
 * apps/customers/business_customer_location.py).
 *
 * A card with no location yet is simply filed. Changing a location that was
 * already set needs a word on how far the change goes: from now on only, or
 * the documents already issued to the customer too. The server asks for that
 * word (409 `needs_scope`); this module turns the answer into something a
 * screen can show, and keeps what the screen decides as pure functions.
 */

export interface CustomerLocation {
  business_id: string | null;
  business_category_id: string | null;
  branch_id: string | null;
}

/** How far a change of location goes. */
export type LocationScope = 'future' | 'all';

export interface LocationNames {
  business_name: string;
  business_category_name: string;
  branch_name: string;
  /** 'חוגים · סניפים · כפר סבא' */
  label: string;
}

/** The server wants to know how far the change goes before it makes it. */
export interface LocationQuestion {
  kind: 'ask';
  /** How many documents already issued to the customer "backwards too" would move. */
  documents: number;
  previous: CustomerLocation & LocationNames;
  location: CustomerLocation & LocationNames;
}

export interface LocationSaved {
  kind: 'saved';
  /** false when the card was already filed there. */
  changed: boolean;
  /** 'first' for a card that had no location; null when nothing changed. */
  scope: 'first' | LocationScope | null;
  documentsChanged: number;
  location: CustomerLocation;
}

export const EMPTY_LOCATION: CustomerLocation = { business_id: null, business_category_id: null, branch_id: null };

/** The location a card or a form carries. */
export function locationOf(source: Partial<CustomerLocation> | null | undefined): CustomerLocation {
  return {
    business_id: source?.business_id || null,
    business_category_id: source?.business_category_id || null,
    branch_id: source?.branch_id || null,
  };
}

export function sameLocation(a: CustomerLocation, b: CustomerLocation): boolean {
  return a.business_id === b.business_id && a.business_category_id === b.business_category_id && a.branch_id === b.branch_id;
}

/** A card is filed once it names a business or a branch; a card imported clean names neither. */
export function hasLocation(location: CustomerLocation): boolean {
  return Boolean(location.business_id || location.branch_id);
}

/**
 * Whether a location can be saved as it stands: a business, a category in it,
 * and — when the category is the one that means a branch — the branch. Until
 * then the office is still choosing, and nothing is sent.
 */
export function locationComplete(location: CustomerLocation, branchApplies: boolean): boolean {
  return Boolean(location.business_id && location.business_category_id && (!branchApplies || location.branch_id));
}

/** What the form is missing before its location can be saved, in words — or '' when nothing. */
export function locationMissing(location: CustomerLocation, branchApplies: boolean): string {
  if (!location.business_id) return 'יש לבחור עסק';
  if (!location.business_category_id) return 'יש לבחור קטגוריה';
  if (branchApplies && !location.branch_id) return 'יש לבחור סניף';
  return '';
}

/** The two answers to "how far", as the dialog words them. */
export function scopeChoices(documents: number, mayMoveDocuments: boolean): {
  value: LocationScope;
  label: string;
  hint: string;
  disabled: boolean;
}[] {
  const count = documents.toLocaleString('he-IL');
  return [
    {
      value: 'future',
      label: 'רק מעכשיו והלאה',
      hint: documents
        ? `${documents === 1 ? 'המסמך שכבר הופק ללקוח נשאר' : `${count} המסמכים שכבר הופקו ללקוח נשארים`} במיקום הקודם.`
        : 'מסמכים שיופקו ללקוח מעכשיו ישויכו למיקום החדש.',
      disabled: false,
    },
    {
      value: 'all',
      label: 'גם אחורה',
      hint: !documents
        ? 'עוד לא הופקו ללקוח מסמכים, אז אין מה לשנות אחורה.'
        : !mayMoveDocuments
          ? 'רק מנהל משנה את השיוך של מסמכים שכבר הופקו.'
          : `${documents === 1 ? 'גם המסמך שכבר הופק ללקוח יעבור' : `גם ${count} המסמכים שכבר הופקו ללקוח יעברו`} למיקום החדש. המספרים, הסכומים והמסמכים עצמם לא משתנים — רק לאיזה עסק וסניף הם משויכים.`,
      disabled: !documents || !mayMoveDocuments,
    },
  ];
}

/** What is said once the location is saved. */
export function savedNote(saved: LocationSaved): string {
  if (!saved.changed) return '';
  if (saved.scope === 'all') {
    return saved.documentsChanged === 1
      ? 'המיקום נשמר, וגם המסמך שכבר הופק ללקוח עבר אליו.'
      : `המיקום נשמר, וגם ${saved.documentsChanged.toLocaleString('he-IL')} מסמכים שכבר הופקו ללקוח עברו אליו.`;
  }
  if (saved.scope === 'future') return 'המיקום נשמר. מסמכים שכבר הופקו נשארו במיקום הקודם.';
  return 'המיקום נשמר בכרטיס הלקוח.';
}

function names(data: Record<string, unknown> | undefined): CustomerLocation & LocationNames {
  return {
    ...locationOf(data as Partial<CustomerLocation>),
    business_name: String(data?.business_name ?? ''),
    business_category_name: String(data?.business_category_name ?? ''),
    branch_name: String(data?.branch_name ?? ''),
    label: String(data?.label ?? ''),
  };
}

/**
 * File the customer under a location. Without `scope` a change to a location
 * that was already set comes back as a question; with it, the change is made.
 * Anything else the server refuses is thrown, for the screen to show.
 */
export async function fileCustomerLocation(
  customerId: string,
  location: CustomerLocation,
  scope?: LocationScope,
): Promise<LocationSaved | LocationQuestion> {
  try {
    const res = await api.post(`/customers/business-customers/${encodeURIComponent(customerId)}/location/`, {
      ...location,
      ...(scope ? { scope } : {}),
    });
    return {
      kind: 'saved',
      changed: Boolean(res.data?.changed),
      scope: res.data?.scope ?? null,
      documentsChanged: Number(res.data?.documents_changed ?? 0),
      location: locationOf(res.data?.location),
    };
  } catch (error) {
    const response = (error as { response?: { status?: number; data?: Record<string, unknown> } } | null)?.response;
    if (response?.status === 409 && response.data?.needs_scope) {
      return {
        kind: 'ask',
        documents: Number(response.data.documents ?? 0),
        previous: names(response.data.previous as Record<string, unknown>),
        location: names(response.data.location as Record<string, unknown>),
      };
    }
    throw error;
  }
}
