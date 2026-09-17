'use client';

import TrialBlockedDatesSection from '../TrialBlockedDatesSection';

/**
 * שיעורי ניסיון — one calendar, and nothing else to work through.
 *
 * The page used to open with a table of every lesson and its own open/closed
 * switch, above the calendar. Two ways to close the same trial made it unclear
 * which one had closed a given lesson, so the office works only through the
 * calendar: click a day, choose every class or some of them.
 *
 * The switch table is gone from the screen, not from the system — the
 * per-lesson setting and the global policy are still honoured. On the day it
 * was removed no lesson carried a per-lesson setting and the policy was open,
 * so nothing that was closed became invisible.
 */
export default function SettingsTrialsPage() {
  return <TrialBlockedDatesSection />;
}
