'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, MessageCircle, Trash2, UserPlus, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import ExternalStudentDialog from '@/components/dialogs/ExternalStudentDialog';
import ExternalBroadcastDialog from '@/components/dialogs/ExternalBroadcastDialog';
import { useAuth } from '@/components/AuthProvider';
import { fetchExternalStudents, removeExternalStudent } from '@/lib/externalStudents';
import type { ExternalStudent } from '@/types/externalStudent';
import type { Lesson } from '@/types/course';
import styles from './ExternalStudentsSection.module.css';

interface Props {
  branchId: string;
  lessons: Lesson[];
}

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/**
 * The municipality roster for one external branch.
 *
 * Rendered only where `branch.is_external` is true. The explainer line under
 * the heading is worth its pixels: "why is this child not in my customers
 * list" is the first question anyone asks, and answering it once here is
 * cheaper than answering it every month.
 */
export default function ExternalStudentsSection({ branchId, lessons }: Props) {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const queryClient = useQueryClient();

  const [courseFilter, setCourseFilter] = useState('all');
  const [editing, setEditing] = useState<ExternalStudent | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ExternalStudent | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: students = [], isLoading } = useQuery({
    queryKey: ['branch-external-students', branchId],
    queryFn: () => fetchExternalStudents({ branch: branchId }),
  });

  const courseOptions = useMemo(() => {
    const seen = new Map<string, string>();
    students.forEach((s) => seen.set(s.course_id, s.course_name));
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], 'he'));
  }, [students]);

  const filtered = useMemo(
    () => (courseFilter === 'all' ? students : students.filter((s) => s.course_id === courseFilter)),
    [students, courseFilter],
  );

  /** Grouped by lesson, in the order an office reads a timetable. */
  const groups = useMemo(() => {
    const byLesson = new Map<string, { label: string; day: number; time: string; rows: ExternalStudent[] }>();
    filtered.forEach((s) => {
      const existing = byLesson.get(s.lesson_id);
      if (existing) {
        existing.rows.push(s);
        return;
      }
      byLesson.set(s.lesson_id, {
        label: `${s.course_name} · יום ${DAYS[s.day_of_week] ?? ''} ${s.start_time}`,
        day: s.day_of_week,
        time: s.start_time,
        rows: [s],
      });
    });
    return [...byLesson.values()].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  }, [filtered]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['branch-external-students', branchId] });

  const confirmRemove = async (choice: boolean) => {
    if (!removing || !choice) {
      setRemoving(null);
      return;
    }
    setBusy(true);
    try {
      await removeExternalStudent(removing.id);
      refresh();
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  return (
    <div className="card mb-6 animate-slide-up" style={{ animationDelay: '650ms' }} dir="rtl">
      <div className={styles.header}>
        <div className={styles.headingGroup}>
          <Users className="w-5 h-5" />
          <h2 className={styles.heading}>רישום עירייה — תלמידים חיצוניים ({students.length})</h2>
        </div>
        {isManager && (
          <div className={styles.actions}>
            <button
              type="button"
              onClick={() => setBroadcasting(true)}
              disabled={filtered.length === 0}
              className={styles.secondaryButton}
            >
              <MessageCircle className="w-4 h-4" />
              שליחת וואטסאפ
            </button>
            <button type="button" onClick={() => setAdding(true)} className={styles.primaryButton}>
              <UserPlus className="w-4 h-4" />
              הוספת תלמיד
            </button>
          </div>
        )}
      </div>

      <p className={styles.explainer}>
        תלמידים שנרשמו דרך העירייה. מופיעים ברשימת הנוכחות ובספירת התלמידים בלבד — ללא חיוב,
        ללא הוראת קבע וללא הופעה ברשימת הלקוחות.
      </p>

      {courseOptions.length > 1 && (
        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className={styles.filter}
        >
          <option value="all">כל החוגים</option>
          {courseOptions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      )}

      {isLoading ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : groups.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>אין תלמידים חיצוניים בסניף זה.</p>
          <p className={styles.emptyHint}>
            הוסיפו את הרשימה שהתקבלה מהעירייה כדי שהמדריכים יוכלו לסמן נוכחות.
          </p>
        </div>
      ) : (
        <div className={styles.groups}>
          {groups.map((group) => (
            <section key={group.label} className={styles.group}>
              <h3 className={styles.groupTitle}>
                {group.label}
                <span className={styles.groupCount}>{group.rows.length}</span>
              </h3>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>שם</th>
                      <th className={styles.th}>טלפון</th>
                      <th className={styles.th}>נוכחויות</th>
                      {isManager && <th className={`${styles.th} ${styles.thActions}`}>פעולות</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((student) => (
                      <tr key={student.id} className={styles.row}>
                        <td className={styles.td}>{student.full_name}</td>
                        <td className={styles.td}>{student.phone || '—'}</td>
                        <td className={styles.td}>{student.attendance_count}</td>
                        {isManager && (
                          <td className={`${styles.td} ${styles.tdActions}`}>
                            <button
                              type="button"
                              onClick={() => setEditing(student)}
                              className={styles.iconButton}
                              aria-label={`עריכת ${student.full_name}`}
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemoving(student)}
                              className={`${styles.iconButton} ${styles.danger}`}
                              aria-label={`הסרת ${student.full_name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      <ExternalStudentDialog
        isOpen={adding || Boolean(editing)}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onSuccess={refresh}
        lessons={lessons}
        student={editing}
      />

      <ExternalBroadcastDialog
        isOpen={broadcasting}
        onClose={() => setBroadcasting(false)}
        students={filtered}
      />

      <ConfirmDialog
        isOpen={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        title="הסרת תלמיד חיצוני"
        message={
          removing && removing.attendance_count > 0
            ? `${removing.full_name} יירד מרשימת הנוכחות. היסטוריית הנוכחות שלו תישמר.`
            : `${removing?.full_name ?? ''} יימחק מהרשימה.`
        }
        confirmText="הסרה"
        type="warning"
      />
    </div>
  );
}
