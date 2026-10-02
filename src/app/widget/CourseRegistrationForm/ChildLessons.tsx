'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { enrollmentSelectionKey, type EnrollmentSelection } from '../catalogRows';
import ExtraLessonPicker from './ExtraLessonPicker';
import SelectedLessonCard from './SelectedLessonCard';
import type { WidgetFilterDefaults } from './MiniLessonPicker';
import { pickedLessonLine } from './formHeading';
import look from './newLook.module.css';

/** Which class the open list is choosing: the child's first, one more, or the one that replaces the n-th extra. */
type Slot = 'first' | 'extra' | number;

interface ChildLessonsProps {
  /** Whose classes these are — a first name, or "ילד/ה 2" until there is one. Empty for an adult registering themselves. */
  owner: string;
  /** Under "another class": who it is for. */
  addHint: string;
  /** The class the form was opened for. It stands first and is not changed from here. */
  fixedFirst?: { name: string; line: string; key: string };
  /** The first class of a child added in the form: chosen here, before anything else. */
  first?: EnrollmentSelection | null;
  extras: EnrollmentSelection[];
  maxExtras: number;
  defaultFilters: WidgetFilterDefaults;
  /** Why the form did not go on: no class was chosen. */
  error?: string;
  /** A line above the group, for a group that stands under a child's fields. */
  divided?: boolean;
  /** `wasEmpty`: this is the child's first class being chosen, not being replaced. */
  onFirst?: (selection: EnrollmentSelection, wasEmpty: boolean) => void;
  onExtras: (next: EnrollmentSelection[]) => void;
  /** The list was opened by a press, or closed again. */
  onListChange?: (open: boolean) => void;
}

/**
 * The classes of one child: a card for each, numbered, and "another class"
 * under them. The list opens where it was asked for; a class that is chosen
 * folds the list and lands as a card.
 */
export default function ChildLessons({
  owner,
  addHint,
  fixedFirst,
  first = null,
  extras,
  maxExtras,
  defaultFilters,
  error,
  divided = false,
  onFirst,
  onExtras,
  onListChange,
}: ChildLessonsProps) {
  const [slot, setSlot] = useState<Slot | null>(null);
  // The card that was chosen a moment ago: it lands, and the page keeps it in view.
  const [landed, setLanded] = useState<string | null>(null);
  const rowRef = useRef<HTMLButtonElement | null>(null);
  const cardsRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  const later = (run: () => void, ms: number) => {
    timers.current.push(window.setTimeout(run, ms));
  };
  const listPressedOpen = slot !== null;
  useEffect(() => {
    onListChange?.(listPressedOpen);
    // Told when the list opens or closes; the handler reads the form as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listPressedOpen]);

  // A child added in the form has no class yet: the list is open, and there is nothing to cancel.
  const mustChoose = !fixedFirst && !first;
  const openSlot: Slot | null = mustChoose ? 'first' : slot;
  const total = (fixedFirst || first ? 1 : 0) + extras.length;
  const canAdd = !mustChoose && extras.length < maxExtras;

  const excluded = useMemo(() => {
    const keys = new Set<string>();
    if (fixedFirst) keys.add(fixedFirst.key);
    if (first && openSlot !== 'first') keys.add(enrollmentSelectionKey(first));
    extras.forEach((selection, index) => {
      if (openSlot !== index) keys.add(enrollmentSelectionKey(selection));
    });
    return keys;
  }, [fixedFirst, first, extras, openSlot]);

  const open = (next: Slot) => {
    setSlot(next);
    // The list is tall: the row it opens under goes to the top, so the whole of it is on show.
    later(() => rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };

  const choose = (selection: EnrollmentSelection) => {
    const wasEmpty = mustChoose;
    if (openSlot === 'first') onFirst?.(selection, wasEmpty);
    else if (openSlot === 'extra') onExtras([...extras, selection]);
    else if (typeof openSlot === 'number') {
      onExtras(extras.map((item, index) => (index === openSlot ? selection : item)));
    }
    setSlot(null);
    setLanded(enrollmentSelectionKey(selection));
    // A first class opens the child's details, and the section itself moves the page there.
    if (wasEmpty) return;
    later(() => {
      cardsRef.current?.querySelector('[data-landed]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 140);
  };

  const caption = (number: number) => (total > 1 ? `חוג ${number}` : 'החוג שנבחר');
  const replacedName = openSlot === 'first' ? first?.displayTitle
    : typeof openSlot === 'number' ? extras[openSlot]?.displayTitle
      : undefined;
  const listOpen = openSlot !== null;
  // The class the form was opened for is at the top of the form; it joins the group once there is a second one.
  const showCards = total > 1 || !fixedFirst;

  return (
    <div className={`${look.lessons}${divided && (showCards || canAdd) ? ` ${look.lessonsDivided}` : ''}`}>
      {total > 1 ? (
        <div className={look.lessonsHead}>
          <b>{owner ? `החוגים של ${owner}` : 'החוגים שנבחרו'}</b>
          <span aria-label={`${total} חוגים`}>{total}</span>
        </div>
      ) : null}

      {showCards && total > 0 ? (
        <div ref={cardsRef} className={look.lessonsCards}>
          {fixedFirst ? (
            <SelectedLessonCard caption={caption(1)} name={fixedFirst.name} line={fixedFirst.line} />
          ) : null}
          {first ? (
            <div
              key={enrollmentSelectionKey(first)}
              {...(landed === enrollmentSelectionKey(first) ? { 'data-landed': '' } : {})}
            >
              <SelectedLessonCard
                caption={caption(1)}
                name={first.displayTitle}
                line={pickedLessonLine(first.displaySchedule, first.displayPlace)}
                landed={landed === enrollmentSelectionKey(first)}
                replacing={openSlot === 'first'}
                onChange={() => open('first')}
              />
            </div>
          ) : null}
          {extras.map((selection, index) => {
            const key = enrollmentSelectionKey(selection);
            return (
              <div key={`${key}-${index}`} {...(landed === key ? { 'data-landed': '' } : {})}>
                <SelectedLessonCard
                  caption={caption(index + 2)}
                  name={selection.displayTitle}
                  line={pickedLessonLine(selection.displaySchedule, selection.displayPlace)}
                  landed={landed === key}
                  replacing={openSlot === index}
                  onChange={() => open(index)}
                  onRemove={() => {
                    onExtras(extras.filter((_, itemIndex) => itemIndex !== index));
                    setSlot(null);
                    // The cards after it move up one place; none of them was just chosen.
                    setLanded(null);
                  }}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      {!mustChoose && (canAdd || listOpen) ? (
        <button
          ref={rowRef}
          type="button"
          className={`${look.addRow} ${look.lessonsAdd}${listOpen ? ` ${look.addRowOpen}` : ''}`}
          aria-expanded={listOpen}
          onClick={() => (listOpen ? setSlot(null) : open('extra'))}
        >
          <span className={look.addRowPlus} aria-hidden="true">+</span>
          <span className={look.addRowText}>
            <b>{!listOpen ? 'חוג נוסף' : replacedName ? 'בוחרים חוג אחר' : 'בוחרים חוג נוסף'}</b>
            <small>{listOpen && replacedName ? `במקום ${replacedName}` : addHint}</small>
          </span>
          {listOpen ? <span className={look.addRowCancel}>ביטול</span> : null}
        </button>
      ) : null}

      {error && mustChoose ? <p className={look.lessonsError} role="alert" data-field-error="">{error}</p> : null}

      <ExtraLessonPicker
        open={listOpen}
        defaultFilters={defaultFilters}
        excludedSelectionKeys={excluded}
        invalid={Boolean(error) && mustChoose}
        onSelect={choose}
      />
    </div>
  );
}
