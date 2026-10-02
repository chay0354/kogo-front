/**
 * Asking the server whether a parent is already with us.
 *
 * The parent types an identity number and a mobile phone. When both are the
 * ones on a family's card, the server answers with the children's first names
 * and with every other stored detail hidden — one character of each — so the
 * form can show them as filled without this browser ever holding them. The
 * registration then sends the token back and the server completes the rest.
 *
 * Nothing here is kept in the browser but a random id for the device (the
 * server's limits count families per device): no detail, no token.
 */
import api from '@/lib/api';

export interface KnownChild {
  id: string;
  firstName: string;
  /** Hidden versions: one character and dots. Empty when the card lacks the detail. */
  lastName: string;
  idNumber: string;
  birthDate: string;
  gender: 'male' | 'female' | '';
}

export interface KnownParent {
  token: string;
  /** The parent was told on WhatsApp; the form may say so. */
  noticeSent: boolean;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  children: KnownChild[];
}

export type IdentifyAnswer =
  | { status: 'unknown' }
  | { status: 'near'; lastDigit: string; nearToken: string }
  | { status: 'known'; parent: KnownParent };

export interface IdentifyConfig {
  enabled: boolean;
  ticket: string;
}

/** A mobile number as the form takes it: ten digits that start with 05. */
export function isMobilePhone(phone: string): boolean {
  return /^05\d{8}$/.test(phone);
}

/** Under the two numbers, as soon as one of them is complete and wrong. */
export function pairHintError(idNumber: string, idOk: boolean, phone: string, phoneOk: boolean): string {
  if (idNumber.length === 9 && !idOk) return 'מספר תעודת הזהות לא תקין';
  if (phone.length === 10 && !phoneOk) return 'מספר נייד מתחיל ב־05';
  return '';
}

/**
 * What a change to the two numbers does.
 *
 * - `wait`: one of them is not whole yet — whatever was open closes, and the form waits.
 * - `ask`: a whole pair that was not asked about yet — the server is asked.
 * - `stay`: nothing to do.
 * - `settle`: the parent said "I'll fill it in myself" after taking the card's
 *   phone, so there was no phone to type over. The form stayed open while the
 *   phone was typed; now that it is whole, it is noted and not asked about.
 *
 * Any other change after "I'll fill it in myself" starts over, like every
 * other change to the two numbers.
 */
export type PairMove = 'wait' | 'ask' | 'stay' | 'settle';

export function nextPairMove(pair: {
  idOk: boolean;
  phoneOk: boolean;
  key: string;
  lastKey: string;
  /** "I'll fill it in myself" is on, and the phone is still to be typed. */
  manualAwaitsPhone: boolean;
}): PairMove {
  if (!pair.idOk || !pair.phoneOk) return pair.manualAwaitsPhone ? 'stay' : 'wait';
  if (pair.manualAwaitsPhone) return 'settle';
  return pair.key === pair.lastKey ? 'stay' : 'ask';
}

const DEVICE_KEY = 'kogo.widget.device';
let memoryDevice = '';

function randomId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A random id for this browser. Kept when storage allows, else for this page only. */
export function deviceId(): string {
  if (memoryDevice) return memoryDevice;
  try {
    const stored = window.localStorage.getItem(DEVICE_KEY);
    if (stored && /^[A-Za-z0-9-]{16,64}$/.test(stored)) {
      memoryDevice = stored;
      return stored;
    }
  } catch {
    // Private windows and blocked storage: the id lives for this page.
  }
  memoryDevice = randomId();
  try {
    window.localStorage.setItem(DEVICE_KEY, memoryDevice);
  } catch {
    // As above.
  }
  return memoryDevice;
}

/** Is identification on, and the ticket to bring back. Off on any failure — an older server, no network. */
export async function fetchIdentifyConfig(): Promise<IdentifyConfig> {
  try {
    const res = await api.get('/customers/widget/identify/', { timeout: 10_000 });
    return { enabled: res.data?.enabled === true, ticket: String(res.data?.ticket ?? '') };
  } catch {
    return { enabled: false, ticket: '' };
  }
}

function readChild(raw: Record<string, unknown>): KnownChild {
  const gender = raw.gender === 'male' || raw.gender === 'female' ? raw.gender : '';
  return {
    id: String(raw.id ?? ''),
    firstName: String(raw.first_name ?? ''),
    lastName: String(raw.last_name ?? ''),
    idNumber: String(raw.id_number ?? ''),
    birthDate: String(raw.birth_date ?? ''),
    gender,
  };
}

export function readIdentifyAnswer(data: unknown): IdentifyAnswer {
  const body = (data ?? {}) as Record<string, unknown>;
  if (body.status === 'near' && body.near_token && body.last_digit) {
    return { status: 'near', lastDigit: String(body.last_digit), nearToken: String(body.near_token) };
  }
  if (body.status === 'known' && body.token) {
    const parent = (body.parent ?? {}) as Record<string, unknown>;
    const children = Array.isArray(body.children) ? body.children : [];
    return {
      status: 'known',
      parent: {
        token: String(body.token),
        noticeSent: body.notice_sent === true,
        firstName: String(parent.first_name ?? ''),
        lastName: String(parent.last_name ?? ''),
        email: String(parent.email ?? ''),
        phone: String(parent.phone ?? ''),
        children: children
          .map((child) => readChild(child as Record<string, unknown>))
          .filter((child) => child.id && child.firstName),
      },
    };
  }
  return { status: 'unknown' };
}

/** Ask. Any failure is "not known": the form opens empty and registration goes on as always. */
export async function askIdentify(
  body: { parentIdNumber: string; parentPhone: string } | { nearToken: string },
  ticket: string,
): Promise<IdentifyAnswer> {
  try {
    const res = await api.post('/customers/widget/identify/', {
      ...('nearToken' in body
        ? { near_token: body.nearToken }
        : { parent_id_number: body.parentIdNumber, parent_phone: body.parentPhone }),
      device_id: deviceId(),
      ticket,
      // Left empty by people; a script that fills every field fills this one too.
      website: '',
    }, { timeout: 15_000 });
    return readIdentifyAnswer(res.data);
  } catch {
    return { status: 'unknown' };
  }
}
