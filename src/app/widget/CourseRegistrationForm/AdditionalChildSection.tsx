'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { sanitizeIsraeliIdInput } from '@/lib/israeliId';
import { prefersReducedMotion } from '../widgetMotion';
import type { EnrollmentSelection } from '../catalogRows';
import ChildLessons from './ChildLessons';
import type { WidgetFilterDefaults } from './MiniLessonPicker';
import MaskedField from './MaskedField';
import Reveal from './Reveal';
import { FoldStrip, KnownParentCard, KnownStrip } from './KnownParentCard';
import { childTitle } from './formHeading';
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
  /** The section was added a moment ago: it rises in, and the page goes to it. */
  fresh?: boolean;
  /** The entrance was played; a section that is mounted again later stands still. */
  onShown?: () => void;
  /**
   * The child's details as one line: 'folded' — the line alone; 'editing' — the
   * line with the fields open under it. Undefined: the fields as they always were.
   */
  fold?: 'folded' | 'editing';
  /** Nothing is missing or wrong in the details, so they may fold. */
  detailsValid?: boolean;
  onFold?: (next: 'folded' | 'editing') => void;
  /** The list of classes was opened by a press. */
  onListOpen?: () => void;
  onChange: (next: AdditionalChildEnrollment) => void;
  onRemove: () => void;
}

/** How long a section takes to fold away before it is removed; in step with `.kidWrapGone`. */
const SECTION_LEAVE_MS = 280;

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

/**
 * Every detail of the child is in — typed, or held on the family's card. Says
 * nothing about whether what was typed is valid; that is checked on "continue".
 */
export function childDetailsFilled(child: AdditionalChildEnrollment): boolean {
  const held = (field: 'lastName' | 'idNumber' | 'birthDate') =>
    Boolean(child.known?.[field]) && !(child.openedFields ?? []).includes(field);
  return Boolean(
    child.firstName.trim()
    && (held('lastName') || child.lastName.trim())
    && (held('idNumber') || child.idNumber.trim())
    && (held('birthDate') || child.birthDate.trim())
    && child.gender,
  );
}


/**
 * One more child in the same registration, as a card of its own.
 *
 * The card opens on one thing only — the class. Once a class is chosen it
 * lands as a card and the next step opens under it: for a family we know,
 * "who is being added?"; for everyone else, the child's fields, with the
 * cursor in the first of them. Changing the class later touches nothing that
 * was typed.
 */
export default function AdditionalChildSection({
  index,
  child,
  catalogDefaultFilters,
  knownKids = [],
  fresh = false,
  onShown,
  fold,
  detailsValid = false,
  onFold,
  onListOpen,
  onChange,
  onRemove,
}: AdditionalChildSectionProps) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);
  // The section is folding away, a moment before it is removed.
  const [leaving, setLeaving] = useState(false);
  // Read once: the entrance belongs to the moment the section was added.
  const [arriving] = useState(fresh);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  const later = (run: () => void, ms: number) => {
    timers.current.push(window.setTimeout(run, ms));
  };

  /** The top of the section comes to the top of the page: its class and what opened under it are on show. */
  const showSection = (ms: number) => later(
    () => sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    ms,
  );
  /** The cursor waits in the first field to type in — never in a hidden one, which a focus would open. */
  const focusFirstField = (ms: number) => later(
    () => detailsRef.current?.querySelector<HTMLInputElement>('input[type="text"]:not([readonly])')?.focus({ preventScroll: true }),
    ms,
  );

  useEffect(() => {
    if (!arriving) return;
    onShown?.();
    showSection(120);
    // Once, when the section is added.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Who is being added? Asked once the class is chosen, when the family has children we know.
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
      focusFirstField(120);
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

  /** The errors as they are once a class was chosen. */
  const withoutSelectionError = () => {
    if (!child.errors.selection) return child.errors;
    const nextErrors = { ...child.errors };
    delete nextErrors.selection;
    return nextErrors;
  };

  const chooseFirst = (selection: EnrollmentSelection, wasEmpty: boolean) => {
    if (!wasEmpty) {
      // Another class in its place: nothing that was typed is touched.
      onChange({ ...child, selection, errors: withoutSelectionError() });
      return;
    }
    // The fields open now for the first time. Whatever the form marked on them while they were out of sight is dropped.
    onChange({ ...child, selection, errors: {} });
    showSection(160);
    if (!asking && !child.known) focusFirstField(420);
  };

  const remove = () => {
    if (prefersReducedMotion()) {
      onRemove();
      return;
    }
    setLeaving(true);
    later(onRemove, SECTION_LEAVE_MS);
  };

  const fieldClass = (field: AdditionalChildFieldKey) =>
    `${styles.input}${child.errors[field] ? ` ${styles.inputInvalid}` : ''}`;

  const childNumber = index + 2;
  const firstName = child.firstName.trim();
  const title = childTitle(childNumber, child.firstName);
  const hasErrors = Object.keys(child.errors).length > 0;

  const fields = (
    <div className={`${styles.grid2} ${look.riseGrid}`}>
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
        {child.errors.firstName ? <p className={styles.fieldError} data-field-error="">{child.errors.firstName}</p> : null}
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
        {child.errors.lastName ? <p className={styles.fieldError} data-field-error="">{child.errors.lastName}</p> : null}
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
        {child.errors.idNumber ? <p className={styles.fieldError} data-field-error="">{child.errors.idNumber}</p> : null}
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
        {child.errors.birthDate ? <p className={styles.fieldError} data-field-error="">{child.errors.birthDate}</p> : null}
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
        {child.errors.gender ? <p className={styles.fieldError} data-field-error="">{child.errors.gender}</p> : null}
      </div>
    </div>
  );

  return (
    <div
      ref={sectionRef}
      className={[look.kidWrap, arriving ? look.kidWrapNew : '', leaving ? look.kidWrapGone : ''].filter(Boolean).join(' ')}
      data-kid={child.id}
      {...(hasErrors ? { 'data-kid-error': '' } : {})}
    >
      <div className={look.kidWrapIn}>
        <section className={look.kidCard} aria-label={title}>
          <div className={look.kidCardHead}>
            <span className={look.kidCardNum} aria-hidden="true">{childNumber}</span>
            <div className={look.kidCardTitle}>
              {/* Keyed by what it says, so the name takes the number's place with a small rise. */}
              <b key={firstName ? 'name' : 'number'}>{title}</b>
              {firstName ? <small>ילד/ה {childNumber}</small> : null}
            </div>
            <button type="button" className={look.kidCardRemove} onClick={remove} aria-label={`הסרת ${title}`}>
              <X size={14} aria-hidden="true" />
              הסרה
            </button>
          </div>

          <Reveal open={!child.selection}>
            <p className={look.kidStep}>קודם בוחרים חוג</p>
          </Reveal>

          <ChildLessons
            owner={title}
            addHint={`עבור ${title}`}
            first={child.selection}
            extras={child.extraSelections}
            maxExtras={MAX_EXTRA_LESSONS}
            defaultFilters={catalogDefaultFilters}
            error={child.errors.selection}
            onFirst={chooseFirst}
            onExtras={(next) => onChange({ ...child, extraSelections: next, errors: withoutSelectionError() })}
            onListChange={(open) => {
              if (open) onListOpen?.();
            }}
          />

          <Reveal open={Boolean(child.selection)} gap={16}>
            {/* Mounted when it opens, so what is inside rises in as it comes on show. */}
            {child.selection ? (
              <div ref={detailsRef}>
                {asking ? (
                  <KnownParentCard
                    title={knownKids.length === 1 ? `מוסיפים את ${knownKids[0].firstName}?` : 'את מי מוסיפים?'}
                    kids={knownKids}
                    newHint="שעוד לא רשום/ה אצלנו"
                    onChoose={chooseKnown}
                  />
                ) : (
                  <>
                    <Reveal fold open={Boolean(fold)}>
                      <FoldStrip
                        // A child chosen from the family's list is shown by first name only.
                        title={child.known ? child.known.firstName : `${child.firstName} ${child.lastName}`.trim()}
                        note="פרטי הילד/ה"
                        open={fold === 'editing'}
                        missing={fold === 'editing' && !detailsValid}
                        onToggle={() => onFold?.(fold === 'folded' ? 'editing' : 'folded')}
                      />
                    </Reveal>
                    <Reveal fold open={fold !== 'folded'}>
                    <div className={fold ? look.foldBody : undefined}>
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
                    ) : fold ? null : (
                      <p className={look.kidStep}>פרטי הילד/ה</p>
                    )}
                    {!child.known && child.knownWas ? (
                      <p className={look.kidNote} style={{ margin: '0 0 12px' }}>
                        שיניתם פרט של {child.knownWas.firstName}, אז נרשום ילד/ה חדש/ה. הפרטים של {child.knownWas.firstName} נשארים אצלנו כמו שהם.
                        <button type="button" className={look.textButton} onClick={() => child.knownWas && chooseKnown(child.knownWas)}>
                          חזרה ל{child.knownWas.firstName}
                        </button>
                      </p>
                    ) : null}
                    {fields}
                    </div>
                    </Reveal>
                  </>
                )}
              </div>
            ) : null}
          </Reveal>
        </section>
      </div>
    </div>
  );
}
