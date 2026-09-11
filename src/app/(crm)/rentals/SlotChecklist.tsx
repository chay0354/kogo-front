'use client';

import type { ReactNode } from 'react';
import type { TenancySlot } from '@/lib/rentalsApi';
import { contractRangeLabel, slotPriceLabel, slotSummary } from './tenancyUtils';
import styles from './rentalsDialog.module.css';

export interface SlotChoice {
  slot: TenancySlot;
  /** A word under the slot — who the calendar says rents it, or that it is this tenant's already. */
  note?: string;
}

interface SlotChecklistProps {
  /** Prefix of the checkboxes' ids, unique per dialog. */
  id: string;
  /** Names the list for a screen reader. */
  label: string;
  choices: readonly SlotChoice[];
  selected: readonly string[];
  onToggle: (slotId: string, checked: boolean) => void;
  disabled?: boolean;
  /** Said instead of the list when there is nothing to choose. */
  empty: ReactNode;
}

/**
 * Calendar slots as checkboxes: when each runs, what a session costs and the
 * agreement dates the calendar holds for it. The tenancy dialog and the link
 * dialog choose slots through this one list.
 */
export default function SlotChecklist({ id, label, choices, selected, onToggle, disabled = false, empty }: SlotChecklistProps) {
  if (choices.length === 0) {
    return <p className={styles.checkEmpty}>{empty}</p>;
  }

  const chosen = new Set(selected);

  return (
    <ul className={styles.checklist} aria-label={label}>
      {choices.map(({ slot, note }) => {
        const inputId = `${id}-${slot.id}`;
        const on = chosen.has(slot.id);
        // The summary already names the rental when it has no studio.
        const name = (slot.studio_name ?? '').trim() ? (slot.name ?? '').trim() : '';
        const agreement =
          slot.contract_start_date || slot.contract_end_date
            ? `הסכם ביומן: ${contractRangeLabel(slot.contract_start_date, slot.contract_end_date)}`
            : '';
        const meta = [name, slotPriceLabel(slot), agreement, note].filter(Boolean).join(' · ');
        return (
          <li key={slot.id}>
            <label htmlFor={inputId} className={`${styles.checkItem} ${on ? styles.checkItemOn : ''}`}>
              <input
                id={inputId}
                type="checkbox"
                checked={on}
                disabled={disabled}
                onChange={(event) => onToggle(slot.id, event.target.checked)}
              />
              <span className={styles.checkMain}>
                <span className={styles.checkTitle}>
                  {slotSummary(slot)}
                  {slot.is_active === false && <span className={styles.checkOff}>לא פעילה</span>}
                </span>
                {meta && <span className={styles.checkMeta}>{meta}</span>}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
