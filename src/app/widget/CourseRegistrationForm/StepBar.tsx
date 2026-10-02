'use client';

import styles from './newLook.module.css';

const STEPS = ['פרטים', 'סיכום', 'אישורים', 'תשלום'] as const;

/** Where the parent stands in a course registration: details, the price, approvals, payment. */
export default function StepBar({ current }: { current: 0 | 1 | 2 | 3 }) {
  return (
    <ol className={styles.stepBar} aria-label="שלבי ההרשמה" data-screen-top="">
      {STEPS.map((label, index) => (
        <li
          key={label}
          className={`${styles.stepBarItem}${
            index < current ? ` ${styles.stepBarDone}` : index === current ? ` ${styles.stepBarNow}` : ''
          }`}
          aria-current={index === current ? 'step' : undefined}
        >
          {label}
        </li>
      ))}
    </ol>
  );
}
