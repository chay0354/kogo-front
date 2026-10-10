import type { Tone } from '@/lib/wahub/boxes';
import s from '../wahub.module.css';

/** Join class names, leaving out whatever is empty or false. */
export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

/**
 * A meaning, as one of the sketch's pill colours. The sketch has no separate
 * "info" colour: what is merely informative wears the navy pill.
 */
export const PILL_TONE: Record<Tone, string> = {
  neutral: s.pMute,
  primary: s.pNav,
  danger: s.pBad,
  warning: s.pWarn,
  info: s.pNav,
  success: s.pGood,
  muted: s.pMute,
};

/** The colour of the number on a tile. Navy unless the number is a call to act. */
export const NUMBER_TONE: Record<Tone, string> = {
  neutral: '',
  primary: '',
  danger: s.badText,
  warning: s.warnText,
  info: '',
  success: s.goodText,
  muted: s.muted,
};
