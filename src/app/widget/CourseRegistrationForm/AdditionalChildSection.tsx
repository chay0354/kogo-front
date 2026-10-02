'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { sanitizeIsraeliIdInput } from '@/lib/israeliId';
import { enrollmentSelectionKey, type EnrollmentSelection } from '../catalogRows';
import ExtraLessonPicker from './ExtraLessonPicker';
import SelectedLessonCard from './SelectedLessonCard';
import type { WidgetFilterDefaults } from './MiniLessonPicker';
import MaskedField from './MaskedField';
import { KnownParentCard, KnownStrip } from './KnownParentCard';
import type { KnownChild } from './identification';
import look from './newLook.module.css';
import styles from './AdditionalChildSection.module.css';

export const MAX_EXTRA_LESSONS = 4;

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
  extraSelections: EnrollmentSelection[];
  firstName: string;
  lastName: string;
  idNumber: string;
  birthDate: string;
  gender: 'male' | 'female' | '';
  lookup: (import('./types').LookupResult & { _confirmed?: boolean }) | null;
  errors: Partial<Record<AdditionalChildFieldKey, string>>;
  /**
   * A child of the family the parent chose from the list: the hidden details
   * stay on the server and the fields below show them hidden. Null once a
   * detail was typed over — the section then registers a new child.
   */
  known?: import('./identification').KnownChild | null;
  /** The list was answered — a child was chosen, or "another child". */
  knownAsked?: boolean;
  /** The chosen child a typed-over detail turned away from, to offer the way back. */
  knownWas?: import('./identification').KnownChild | null;
  /** Hidden fields the parent pressed to retype. */
  openedFields?: string[];
}

interface AdditionalChildSectionProps {
  index: number;
  child: AdditionalChildEnrollment;
  catalogDefaultFilters: WidgetFilterDefaults;
  /**
   * The family's children not yet chosen elsewhere in the form, when the
   * parent was identified. The section then asks who is being added before it
   * asks for any detail.
   */
  knownKids?: KnownChild[];
  onChange: (next: AdditionalChildEnrollment) => void;
  onRemove: () => void;
}

type PickerKind = 'first' | 'extra' | number;

export function createEmptyAdditionalChild(id: string): AdditionalChildEnrollment {
  return {
    id,
    selection: null,
    extraSelections: [],
    firstName: '',
    lastName: '',
    idNumber: '',
    birthDate: '',
    gender: '',
    lookup: null,
    errors: {},
  };
}

export function childLessonSelections(child: AdditionalChildEnrollment): EnrollmentSelection[] {
  return child.selection ? [child.selection, ...child.extraSelections] : [];
}

export default function AdditionalChildSection({
  index,
  child,
  catalogDefaultFilters,
  knownKids = [],
  onChange,
  onRemove,
}: AdditionalChildSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(!child.selection);
  // Who is being added? Asked once, when the family has children we know.
  const asking = knownKids.length > 0 && !child.knownAsked && !child.known;
  const opened = child.openedFields ?? [];
  /** The hidden value of a detail of the chosen child; empty for a child being typed in. */
  const maskOf = (field: 'firstName' | 'lastName' | 'idNumber' | 'birthDate') => child.known?.[field] ?? '';
  const setOpened = (field: string, open: boolean) => onChange({
    ...child,
    openedFields: open ? [...opened.filter((key) => key !== field), field] : opened.filter((key) => key !== field),
  });

  const chooseKnown = (kid: KnownChild | 'new') => {
    if (kid === 'new') {
      onChange({ ...child, knownAsked: true, known: null, knownWas: null });
      return;
    }
    onChange({
      ...child,
      knownAsked: true,
      known: kid,
      knownWas: null,
      firstName: kid.firstName,
      lastName: '',
      idNumber: '',
      birthDate: '',
      gender: kid.gender,
      openedFields: [],
      errors: child.errors.selection ? { selection: child.errors.selection } : {},
    });
  };

  /**
   * A typed value. For a child chosen from the list, typing over a detail
   * makes this a new child — the stored child is never changed from the form —
   * so the other hidden details open empty.
   */
  const typed = (field: 'firstName' | 'lastName' | 'idNumber' | 'birthDate' | 'gender', value: string) => {
    const nextErrors = { ...child.errors };
    delete nextErrors[field];
    const changesKnown = child.known && (
      field === 'firstName' ? value !== child.known.firstName
        : field === 'gender' ? Boolean(child.known.gender) && value !== child.known.gender
          : Boolean(value)
    );
    if (changesKnown) {
      onChange({
        ...child,
        known: null,
        knownWas: child.known,
        firstName: '',
        gender: '',
        openedFields: [],
        [field]: value,
        errors: nextErrors,
      } as AdditionalChildEnrollment);
      return;
    }
    onChange({ ...child, [field]: value, errors: nextErrors } as AdditionalChildEnrollment);
  };

  const [pickerKind, setPickerKind] = useState<PickerKind>('first');

  const patch = (partial: Partial<AdditionalChildEnrollment>) => {
    onChange({ ...child, ...partial, errors: { ...child.errors, ...partial.errors } });
  };

  const clearError = (field: AdditionalChildFieldKey) => {
    if (!child.errors[field]) return;
    const nextErrors = { ...child.errors };
    delete nextErrors[field];
    patch({ errors: nextErrors });
  };

  const clearSelectionError = () => {
    if (!child.errors.selection) return;
    const nextErrors = { ...child.errors };
    delete nextErrors.selection;
    return nextErrors;
  };

  const fieldClass = (field: AdditionalChildFieldKey) =>
    `${styles.input}${child.errors[field] ? ` ${styles.inputInvalid}` : ''}`;

  const childNumber = index + 2;
  const canAddExtra = Boolean(child.selection) && child.extraSelections.length < MAX_EXTRA_LESSONS;
  const excludedSelectionKeys = useMemo(() => {
    const keys = new Set<string>();
    if (child.selection && pickerKind !== 'first') {
      keys.add(enrollmentSelectionKey(child.selection));
    }
    child.extraSelections.forEach((selection, extraIndex) => {
      if (pickerKind !== extraIndex) {
        keys.add(enrollmentSelectionKey(selection));
      }
    });
    return keys;
  }, [child.selection, child.extraSelections, pickerKind]);

  const openPicker = (kind: PickerKind) => {
    setPickerKind(kind);
    setPickerOpen(true);
  };

  const handleSelect = (selection: EnrollmentSelection) => {
    const nextErrors = clearSelectionError();
    if (pickerKind === 'first') {
      onChange({
        ...child,
        selection,
        errors: nextErrors ?? child.errors,
      });
    } else if (pickerKind === 'extra') {
      onChange({
        ...child,
        extraSelections: [...child.extraSelections, selection],
        errors: nextErrors ?? child.errors,
      });
    } else {
      onChange({
        ...child,
        extraSelections: child.extraSelections.map((item, extraIndex) =>
          extraIndex === pickerKind ? selection : item,
        ),
        errors: nextErrors ?? child.errors,
      });
    }
    setPickerOpen(false);
  };

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

      {asking ? (
        <KnownParentCard
          title={knownKids.length === 1 ? `מוסיפים את ${knownKids[0].firstName}?` : 'את מי מוסיפים?'}
          kids={knownKids}
          newHint="שעוד לא רשום/ה אצלנו"
          onChoose={chooseKnown}
        />
      ) : (
        <>
          {child.known ? (
            <div className={styles.knownRow}>
              <KnownStrip
                title={`מילאנו את הפרטים של ${child.known.firstName}`}
                note="הפרטים מוסתרים. לשינוי לוחצים על השדה."
                actionLabel="החלפה"
                onAction={() => onChange({
                  ...child, knownAsked: false, known: null, knownWas: null, firstName: '', gender: '', openedFields: [],
                })}
              />
            </div>
          ) : null}
          {!child.known && child.knownWas ? (
            <p className={look.kidNote} style={{ margin: '0 0 12px' }}>
              שיניתם פרט של {child.knownWas.firstName}, אז נרשום ילד/ה חדש/ה. הפרטים של {child.knownWas.firstName} נשארים אצלנו כמו שהם.
              <button type="button" className={look.textButton} onClick={() => child.knownWas && chooseKnown(child.knownWas)}>
                חזרה ל{child.knownWas.firstName}
              </button>
            </p>
          ) : null}

        <div className={styles.lessonBlock}>
          <label className={styles.label}>חוג ומפגש *</label>
          {child.selection && !(pickerOpen && pickerKind === 'first') ? (
            <SelectedLessonCard
              selection={child.selection}
              onChange={() => openPicker('first')}
            />
          ) : null}

          {child.extraSelections.map((selection, extraIndex) => (
            pickerOpen && pickerKind === extraIndex ? null : (
              <SelectedLessonCard
                key={`${enrollmentSelectionKey(selection)}-${extraIndex}`}
                selection={selection}
                onChange={() => openPicker(extraIndex)}
                onRemove={() => {
                  patch({
                    extraSelections: child.extraSelections.filter((_, itemIndex) => itemIndex !== extraIndex),
                  });
                  if (pickerOpen && pickerKind === extraIndex) {
                    setPickerOpen(false);
                  }
                }}
              />
            )
          ))}

          {child.errors.selection && !pickerOpen ? (
            <p className={styles.fieldError}>{child.errors.selection}</p>
          ) : null}

          {pickerOpen ? (
            <ExtraLessonPicker
              defaultFilters={catalogDefaultFilters}
              excludedSelectionKeys={excludedSelectionKeys}
              canCancel={Boolean(child.selection) || pickerKind !== 'first'}
              onCancel={() => setPickerOpen(false)}
              onSelect={handleSelect}
            />
          ) : null}

          {!child.selection && !pickerOpen ? (
            <button
              type="button"
              className={`${styles.openPickerBtn}${child.errors.selection ? ` ${styles.openPickerBtnInvalid}` : ''}`}
              onClick={() => openPicker('first')}
            >
              בחרו חוג ומפגש
            </button>
          ) : null}

          {canAddExtra && !pickerOpen ? (
            <button type="button" className={look.addRow} onClick={() => openPicker('extra')}>
              <span className={look.addRowPlus} aria-hidden="true">+</span>
              <span className={look.addRowText}>
                <b>חוג נוסף</b>
                <small>עבור {child.firstName.trim() || `ילד ${childNumber}`}</small>
              </span>
            </button>
          ) : null}
        </div>

        <div className={styles.grid2}>
          <div>
            <label className={styles.label}>שם פרטי *</label>
            <MaskedField
              mask={maskOf('firstName')}
              keepsValue
              open={opened.includes('firstName')}
              onOpen={() => setOpened('firstName', true)}
              onClose={() => setOpened('firstName', false)}
              value={child.firstName}
              onChange={(value) => typed('firstName', value)}
              className={fieldClass('firstName')}
            />
            {child.errors.firstName ? <p className={styles.fieldError}>{child.errors.firstName}</p> : null}
          </div>
          <div>
            <label className={styles.label}>שם משפחה *</label>
            <MaskedField
              mask={maskOf('lastName')}
              open={opened.includes('lastName')}
              onOpen={() => setOpened('lastName', true)}
              onClose={() => setOpened('lastName', false)}
              value={child.lastName}
              onChange={(value) => typed('lastName', value)}
              className={fieldClass('lastName')}
            />
            {child.errors.lastName ? <p className={styles.fieldError}>{child.errors.lastName}</p> : null}
          </div>
          <div>
            <label className={styles.label}>ת.ז. ילד *</label>
            <MaskedField
              mask={maskOf('idNumber')}
              open={opened.includes('idNumber')}
              onOpen={() => setOpened('idNumber', true)}
              onClose={() => setOpened('idNumber', false)}
              value={child.idNumber}
              onChange={(value) => typed('idNumber', sanitizeIsraeliIdInput(value))}
              className={fieldClass('idNumber')}
              ltr
              inputMode="numeric"
            />
            {child.errors.idNumber ? <p className={styles.fieldError}>{child.errors.idNumber}</p> : null}
          </div>
          <div>
            <label className={styles.label}>תאריך לידה *</label>
            <MaskedField
              mask={maskOf('birthDate')}
              open={opened.includes('birthDate')}
              onOpen={() => setOpened('birthDate', true)}
              onClose={() => setOpened('birthDate', false)}
              type="date"
              value={child.birthDate}
              onChange={(value) => typed('birthDate', value)}
              className={fieldClass('birthDate')}
              dateClassName={styles.inputDate}
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
                    onChange={() => typed('gender', g)}
                    style={{ accentColor: '#2B3090' }}
                  />
                  {g === 'male' ? 'זכר' : 'נקבה'}
                </label>
              ))}
            </div>
            {child.errors.gender ? <p className={styles.fieldError}>{child.errors.gender}</p> : null}
          </div>
        </div>
        </>
      )}
    </div>
  );
}
