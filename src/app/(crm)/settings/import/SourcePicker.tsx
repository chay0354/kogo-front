'use client';

import { Select } from '@/components/ui/select';
import { TAZMAN_SOURCE, type LegacyKnownSource, type LegacySourceFormat } from '@/lib/legacyImportApi';
import styles from './import.module.css';

const FORMATS: { id: LegacySourceFormat; title: string; hint: string }[] = [
  { id: 'tazman', title: 'התוכנה הקודמת (Tazman)', hint: 'קובץ הייצוא של המסמכים, ‎.xls' },
  { id: 'table', title: 'תוכנה אחרת — טבלה', hint: 'CSV או Excel (‎.xlsx / ‎.xls) עם שורת כותרות' },
  { id: 'uniform', title: 'מבנה אחיד', hint: 'BKMVDATA.TXT, או ZIP שלו עם INI.TXT' },
];

/** '' = the software named in the file's INI.TXT (מבנה אחיד only). */
export const FROM_FILE = '';

/**
 * Which software the file came from, and in which format. Every document is
 * kept under its software, so the same software must be chosen every time —
 * a name typed for "another software" is matched ignoring case and spaces.
 */
export default function SourcePicker({
  format,
  onFormat,
  choice,
  onChoice,
  otherName,
  onOtherName,
  sources,
  disabled = false,
}: {
  format: LegacySourceFormat;
  onFormat: (format: LegacySourceFormat) => void;
  choice: string;
  onChoice: (choice: string) => void;
  otherName: string;
  onOtherName: (name: string) => void;
  sources: LegacyKnownSource[];
  disabled?: boolean;
}) {
  const others = sources.filter((s) => s.id !== TAZMAN_SOURCE);
  return (
    <div className="space-y-3">
      <div className={styles.formats} role="radiogroup" aria-label="מאיזו תוכנה הקובץ">
        {FORMATS.map((option) => (
          <label key={option.id} className={`${styles.format} ${format === option.id ? styles.formatActive : ''}`}>
            <input
              type="radio"
              name="legacy-format"
              value={option.id}
              checked={format === option.id}
              disabled={disabled}
              onChange={() => onFormat(option.id)}
            />
            <span>
              <strong className="block text-sm">{option.title}</strong>
              <span className="block text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {format !== 'tazman' ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor="legacy-source">
            התוכנה:
          </label>
          <Select
            id="legacy-source"
            className={styles.sourceSelect}
            value={choice}
            disabled={disabled}
            onChange={(e) => onChoice(e.target.value)}
          >
            {format === 'uniform' ? <option value={FROM_FILE}>לפי הקובץ (INI.TXT)</option> : null}
            {format === 'table' && !choice ? <option value="">בחרו תוכנה</option> : null}
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
            <option value={TAZMAN_SOURCE}>Tazman (התוכנה הקודמת)</option>
            <option value="other">אחרת…</option>
          </Select>
          {choice === 'other' ? (
            <input
              className={`input ${styles.sourceName}`}
              placeholder="שם התוכנה"
              aria-label="שם התוכנה"
              value={otherName}
              maxLength={40}
              disabled={disabled}
              onChange={(e) => onOtherName(e.target.value)}
            />
          ) : null}
        </div>
      ) : null}
      {format !== 'tazman' ? (
        <p className="text-xs text-muted-foreground">
          כל תוכנה ממספרת לעצמה, ולכן מסמכים נשמרים לפי התוכנה: חשבונית 1000 מתוכנה אחת לא תדרוס את חשבונית 1000 של
          אחרת. בחרו את אותה תוכנה בכל ייבוא ממנה.
        </p>
      ) : null}
    </div>
  );
}
