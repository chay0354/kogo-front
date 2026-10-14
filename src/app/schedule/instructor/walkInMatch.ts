/**
 * "התכוונת לילד הזה?" (owner, 14.10.2026). An instructor adding a walk-in may be
 * typing a child who is already on the register, spelt a little differently —
 * and then the system holds two children for one. Before adding, the name is
 * compared with the registered children on this register; a close one is
 * offered instead.
 *
 * Close means: the same name once spelling noise is gone (geresh, spaces, final
 * letters, a vowel letter), first and last swapped, a first name written short
 * (דני / דניאל), a family name a letter away. A first name a letter away is not:
 * נועה and נועם are two children. A first name alone is never enough — a class
 * has three Noas.
 */

const FINAL_LETTERS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

/** One word as it is compared: no niqqud, no geresh, no final forms, no case. */
export function normalizeNamePart(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '')
    .replace(/[׳'`’״"\-.]/g, '')
    .toLowerCase()
    .replace(/[ךםןףץ]/g, (ch) => FINAL_LETTERS[ch] ?? ch)
    .trim();
}

/** Without the vowel letters Hebrew spelling plays with (נועם / נעם, מיכאל / מכאל). */
function skeleton(word: string): string {
  return word.replace(/[וי]/g, '');
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min(prev[j] + 1, next[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = next;
  }
  return prev[b.length];
}

/** Two spellings of one first name: equal, equal without vowel letters, or one a short form of the other. */
function sameFirstName(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b || skeleton(a) === skeleton(b)) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 3 && longer.startsWith(shorter);
}

/** Two spellings of one family name: as for a first name, or a single letter apart. */
function sameLastName(a: string, b: string): boolean {
  if (sameFirstName(a, b)) return true;
  return Math.min(a.length, b.length) >= 3 && editDistance(a, b) <= 1;
}

/** Split a full name the way the register writes it: first word, then the rest. */
export function splitFullName(full: string): { first: string; last: string } {
  const words = full.trim().split(/\s+/);
  return { first: words[0] ?? '', last: words.slice(1).join(' ') };
}

export type RegisterChild = { child_id: string; child_name: string };

/**
 * The registered child on this register the typed name most likely means, or
 * null. Exact matches win over close ones; between two equally close the first
 * on the register is offered.
 */
export function findSimilarChild(
  typed: { first_name: string; last_name: string },
  register: RegisterChild[],
): RegisterChild | null {
  const first = normalizeNamePart(typed.first_name);
  const last = normalizeNamePart(typed.last_name);
  if (!first || !last) return null;

  let best: { child: RegisterChild; score: number } | null = null;
  for (const child of register) {
    const parts = splitFullName(child.child_name);
    const theirFirst = normalizeNamePart(parts.first);
    const theirLast = normalizeNamePart(parts.last);
    let score = 0;
    if (first === theirFirst && last === theirLast) score = 3;
    else if (first === theirLast && last === theirFirst) score = 2;
    else if (sameFirstName(first, theirFirst) && sameLastName(last, theirLast)) score = 1;
    if (score && (!best || score > best.score)) best = { child, score };
  }
  return best?.child ?? null;
}
