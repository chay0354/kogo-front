'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { sanitizeIsraeliIdInput } from '@/lib/israeliId';
import { formatPriceLabel, type EnrollmentSelection } from '../catalogRows';
import MiniLessonPicker, { type WidgetFilterDefaults } from './MiniLessonPicker';
import styles from './AdditionalChildSection.module.css';

export type AdditionalChildFieldKey =
  | 'selection'
  | 'firstName'
  | 'lastName'
  | 'idNumber'
  | 'birthDate'
  | 'gender';

export interface AdditionalChildEnrollment {
  id: string;
  selection: EnrollmentSelection | null;
  firstName: string;
  lastName: string;
  idNumber: string;
  birthDate: string;
  gender: 'male' | 'female' | '';
  lookup: (import('./types').LookupResult & { _confirmed?: boolean }) | null;
  errors: Partial<Record<AdditionalChildFieldKey, string>>;
}

interface AdditionalChildSectionProps {
  index: number;
  child: AdditionalChildEnrollment;
  catalogDefaultFilters: WidgetFilterDefaults;
  excludedSelectionKeys: Set<string>;
  onChange: (next: AdditionalChildEnrollment) => void;
  onRemove: () => void;
}

export function createEmptyAdditionalChild(id: string): AdditionalChildEnrollment {
  return {
    id,
    selection: null,
    firstName: '',
    lastName: '',
    idNumber: '',
    birthDate: '',
    gender: '',
    lookup: null,
    errors: {},
  };
}

export default function AdditionalChildSection({
  index,
  child,
  catalogDefaultFilters,
  excludedSelectionKeys,
  onChange,
  onRemove,
}: AdditionalChildSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(!child.selection);

  const patch = (partial: Partial<AdditionalChildEnrollment>) => {
    onChange({ ...child, ...partial, errors: { ...child.errors, ...partial.errors } });
  };

  const clearError = (field: AdditionalChildFieldKey) => {
    if (!child.errors[field]) return;
    const nextErrors = { ...child.errors };
    delete nextErrors[field];
    patch({ errors: nextErrors });
  };

  const fieldClass = (field: AdditionalChildFieldKey) =>
    `${styles.input}${child.errors[field] ? ` ${styles.inputInvalid}` : ''}`;

  const childNumber = index + 2;

  return (
    <div className={`${styles.section} ${styles.fadeIn}`}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>
          <span className={styles.sectionTitleLine} />
          <span className={styles.sectionTitleText}>ילד {childNumber}</span>
          <span className={styles.sectionTitleLine} />
        </div>
        <button type="button" className={styles.removeBtn} onClick={onRemove} aria-label={`הסר ילד ${childNumber}`}>
          <X size={16} />
        </button>
      </div>

      <div className={styles.lessonBlock}>
        <label className={styles.label}>חוג ומפגש *</label>
        {child.selection && !pickerOpen ? (
          <div className={styles.selectedLesson}>
            <div className={styles.selectedLessonText}>
              <span className={styles.selectedLessonTitle}>{child.selection.displayTitle}</span>
              {child.selection.displaySchedule ? (
                <span className={styles.selectedLessonSchedule} dir="ltr">
                  {child.selection.displaySchedule}
                </span>
              ) : null}
              {child.selection.displayPrice != null ? (
                <span className={styles.selectedLessonPrice}>{formatPriceLabel(child.selection.displayPrice)}</span>
              ) : null}
            </div>
            <button
              type="button"
              className={styles.changeLessonBtn}
              onClick={() => setPickerOpen(true)}
            >
              שנה
            </button>
          </div>
        ) : null}

        {child.errors.selection && !pickerOpen ? (
          <p className={styles.fieldError}>{child.errors.selection}</p>
        ) : null}

        {pickerOpen ? (
          <>
            {child.selection ? (
              <button type="button" className={styles.cancelPickerBtn} onClick={() => setPickerOpen(false)}>
                ביטול
              </button>
            ) : null}
            <MiniLessonPicker
              defaultFilters={catalogDefaultFilters}
              excludedSelectionKeys={excludedSelectionKeys}
              onSelect={(selection) => {
                patch({
                  selection,
                  errors: { ...child.errors, selection: undefined },
                });
                setPickerOpen(false);
              }}
            />
          </>
        ) : null}

        {!child.selection && !pickerOpen ? (
          <button
            type="button"
            className={`${styles.openPickerBtn}${child.errors.selection ? ` ${styles.openPickerBtnInvalid}` : ''}`}
            onClick={() => setPickerOpen(true)}
          >
            בחרו חוג ומפגש
          </button>
        ) : null}
      </div>

      <div className={styles.grid2}>
        <div>
          <label className={styles.label}>שם פרטי *</label>
          <input
            type="text"
            value={child.firstName}
            onChange={(e) => {
              patch({ firstName: e.target.value });
              clearError('firstName');
            }}
            className={fieldClass('firstName')}
          />
          {child.errors.firstName ? <p className={styles.fieldError}>{child.errors.firstName}</p> : null}
        </div>
        <div>
          <label className={styles.label}>שם משפחה *</label>
          <input
            type="text"
            value={child.lastName}
            onChange={(e) => {
              patch({ lastName: e.target.value });
              clearError('lastName');
            }}
            className={fieldClass('lastName')}
          />
          {child.errors.lastName ? <p className={styles.fieldError}>{child.errors.lastName}</p> : null}
        </div>
        <div>
          <label className={styles.label}>ת.ז. ילד *</label>
          <input
            type="text"
            inputMode="numeric"
            value={child.idNumber}
            dir="ltr"
            onChange={(e) => {
              patch({ idNumber: sanitizeIsraeliIdInput(e.target.value) });
              clearError('idNumber');
            }}
            className={fieldClass('idNumber')}
          />
          {child.errors.idNumber ? <p className={styles.fieldError}>{child.errors.idNumber}</p> : null}
        </div>
        <div>
          <label className={styles.label}>תאריך לידה *</label>
          <input
            type="date"
            value={child.birthDate}
            onChange={(e) => {
              patch({ birthDate: e.target.value });
              clearError('birthDate');
            }}
            className={`${fieldClass('birthDate')} ${styles.inputDate}`}
          />
          {child.errors.birthDate ? <p className={styles.fieldError}>{child.errors.birthDate}</p> : null}
        </div>
        <div className={styles.gridFull}>
          <label className={styles.label}>מין *</label>
          <div className={styles.genderOptions}>
            {(['male', 'female'] as const).map((g) => (
              <label key={g} className={styles.radioLabel}>
                <input
                  type="radio"
                  name={`gender-${child.id}`}
                  value={g}
                  checked={child.gender === g}
                  onChange={() => {
                    patch({ gender: g });
                    clearError('gender');
                  }}
                  style={{ accentColor: '#2B3090' }}
                />
                {g === 'male' ? 'זכר' : 'נקבה'}
              </label>
            ))}
          </div>
          {child.errors.gender ? <p className={styles.fieldError}>{child.errors.gender}</p> : null}
        </div>
      </div>
    </div>
  );
}
