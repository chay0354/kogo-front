'use client';

import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import styles from './StudioBusyWarning.module.css';

export type StudioBusySlot = {
  roomId?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

type Occupant = {
  kind: string;
  name: string;
  day_name: string;
  start_time: string;
  end_time: string;
};

function occupantKey(row: Occupant) {
  return `${row.kind}|${row.name}|${row.day_name}|${row.start_time}|${row.end_time}`;
}

function formatOccupant(row: Occupant) {
  const when = [row.day_name, `${row.start_time}–${row.end_time}`].filter(Boolean).join(' ');
  const prefix = row.kind === 'event' ? 'אירוע/שכירות' : 'החוג';
  return when
    ? `הסטודיו תפוס ביום ${when} על ידי ${prefix} ${row.name}`
    : `הסטודיו תפוס על ידי ${prefix} ${row.name}`;
}

export function useStudioBusyConflicts({
  open,
  slots,
  excludeCourseId,
  excludeLessonIds,
}: {
  open: boolean;
  slots: StudioBusySlot[];
  excludeCourseId?: string;
  excludeLessonIds?: string[];
}) {
  const [conflicts, setConflicts] = useState<Occupant[]>([]);
  const slotKey = useMemo(
    () =>
      JSON.stringify({
        slots: slots.map((s) => ({
          roomId: s.roomId || '',
          dayOfWeek: s.dayOfWeek,
          startTime: (s.startTime || '').slice(0, 5),
          endTime: (s.endTime || '').slice(0, 5),
        })),
        excludeCourseId: excludeCourseId || '',
        excludeLessonIds: excludeLessonIds || [],
      }),
    [slots, excludeCourseId, excludeLessonIds]
  );

  useEffect(() => {
    if (!open) {
      setConflicts([]);
      return;
    }
    const parsed = JSON.parse(slotKey) as {
      slots: { roomId: string; dayOfWeek: number; startTime: string; endTime: string }[];
      excludeCourseId: string;
      excludeLessonIds: string[];
    };
    const valid = parsed.slots.filter(
      (s) => s.roomId && s.startTime && s.endTime && Number.isInteger(s.dayOfWeek)
    );
    if (valid.length === 0) {
      setConflicts([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      Promise.all(
        valid.map((slot) =>
          api
            .get('/courses/lessons/room-conflicts/', {
              params: {
                room: slot.roomId,
                day_of_week: slot.dayOfWeek,
                start_time: slot.startTime,
                end_time: slot.endTime,
                exclude_course: parsed.excludeCourseId || undefined,
                exclude: parsed.excludeLessonIds.length ? parsed.excludeLessonIds.join(',') : undefined,
              },
            })
            .then((res) => (Array.isArray(res.data?.conflicts) ? res.data.conflicts : []))
            .catch(() => [])
        )
      ).then((batches) => {
        if (cancelled) return;
        const unique = new Map<string, Occupant>();
        for (const row of batches.flat()) {
          if (!row?.name) continue;
          unique.set(occupantKey(row), row);
        }
        setConflicts([...unique.values()]);
      });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, slotKey]);

  return conflicts;
}

export default function StudioBusyWarning({ conflicts }: { conflicts: Occupant[] }) {
  if (conflicts.length === 0) return null;
  return (
    <div className={styles.box} role="status">
      {conflicts.map((row) => (
        <p key={occupantKey(row)} className={styles.line}>
          {formatOccupant(row)}
        </p>
      ))}
    </div>
  );
}
