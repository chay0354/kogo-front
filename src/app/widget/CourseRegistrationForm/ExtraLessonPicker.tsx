'use client';

import { useEffect, useState } from 'react';
import MiniLessonPicker, { type WidgetFilterDefaults } from './MiniLessonPicker';
import Reveal from './Reveal';
import look from './newLook.module.css';

interface ExtraLessonPickerProps {
  /** The list is on show. Closed, it folds away and keeps the filters it was left with. */
  open: boolean;
  defaultFilters: WidgetFilterDefaults;
  excludedSelectionKeys: Set<string>;
  /** No class was chosen where one must be: the frame turns red. */
  invalid?: boolean;
  onSelect: Parameters<typeof MiniLessonPicker>[0]['onSelect'];
}

/**
 * The list a class is chosen from inside the form: it opens by its own height
 * where it was asked for, and folds back the moment a class is chosen.
 */
export default function ExtraLessonPicker({
  open,
  defaultFilters,
  excludedSelectionKeys,
  invalid = false,
  onSelect,
}: ExtraLessonPickerProps) {
  // The list asks the server for the branches when it mounts, so it mounts the first time it is opened.
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  return (
    <Reveal open={open}>
      <div className={look.pickerGap}>
        <div className={`${look.pickerPanel}${invalid ? ` ${look.pickerPanelInvalid}` : ''}`}>
          {mounted || open ? (
            <MiniLessonPicker
              flat
              defaultFilters={defaultFilters}
              excludedSelectionKeys={excludedSelectionKeys}
              onSelect={onSelect}
            />
          ) : null}
        </div>
      </div>
    </Reveal>
  );
}
