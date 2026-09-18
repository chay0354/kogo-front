'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import {
  fetchLegacySeries,
  fetchSeriesOverview,
  openSeries,
  type NumberRun,
  type SeriesOverview,
} from '@/lib/numberingApi';
import { serverErrorText } from '@/app/(crm)/invoices/missingReceipts';
import {
  canConfirmOpening,
  confirmationText,
  defaultTypeFor,
  editDraft,
  firstNumberPreview,
  legacyLastNumbers,
  mappingRows,
  openingPayload,
  openingProblems,
  runStatus,
  runsOf,
  typeChoices,
  type OpeningDraft,
  type RunTone,
} from './numbering';
import styles from './numbering.module.css';

const TONE_TAG: Record<RunTone, string> = {
  continued: theme.tagOk,
  open: theme.tagType,
  issued: theme.tagOff,
  closed: theme.tagOff,
};

function Num({ children }: { children: string }) {
  return <span className={styles.number}>{children}</span>;
}

/**
 * מספור מסמכים: every kogo run of this tax year and the next, and — for a run
 * that has issued nothing yet — continuing the previous software's run of
 * the same type from its last number. Managers only; the server enforces it.
 */
export default function NumberingSection() {
  const [overview, setOverview] = useState<SeriesOverview | null>(null);
  const [legacy, setLegacy] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openFor, setOpenFor] = useState('');
  // What just happened, said in the card of its year, where the office is looking.
  const [notice, setNotice] = useState<{ year: number; text: string; failed: boolean } | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError('');
    try {
      const data = await fetchSeriesOverview();
      if (request === requestRef.current) setOverview(data);
    } catch (err) {
      if (request === requestRef.current) setError(await serverErrorText(err, 'טעינת סדרות המספור נכשלה'));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // The legacy import may not exist on this server yet; then nothing is prefilled.
    let cancelled = false;
    void fetchLegacySeries().then((data) => {
      if (!cancelled) setLegacy(legacyLastNumbers(data));
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const currentYear = overview?.current_year ?? new Date().getFullYear();

  return (
    <section className={theme.scope} aria-labelledby="numbering-heading" dir="rtl">
      <div className={theme.card}>
        <h2 id="numbering-heading" className={theme.cardTitle}>
          מספור מסמכים
        </h2>
        <p className={theme.cardSub}>איך kogo ממספר מסמכים, ואיך ממשיכים את המספור של התוכנה הקודמת</p>
        <ul className={styles.explain}>
          <li>
            <strong>המספור הוא לפי סוג מסמך, לא לפי לקוח.</strong> לכל סוג מסמך יש סדרה אחת רציפה, וכל מסמך
            מקבל את המספר הבא בסדרה של הסוג שלו — לא משנה לאיזה לקוח הוא הונפק.
          </li>
          <li>
            <strong>סדרה ב-kogo יכולה להמשיך את הסדרה של אותו סוג בתוכנה הקודמת.</strong> המסמך הראשון ב-kogo
            יקבל את המספר שאחרי האחרון שהונפק שם, וכך הספרים נשארים רצף אחד. סדרה ישנה ממשיכה בסדרה אחת בלבד
            ב-kogo בכל שנת מס.
          </li>
          <li>
            <strong>ב-kogo הסדרה מתחילה מחדש בכל שנת מס</strong> (למשל <Num>{`TI-${currentYear + 1}-000001`}</Num>).
            לכן ממשיכים סדרה רק לפני שהונפק בה המסמך הראשון של השנה — לשנה הנוכחית או לשנה הבאה.
          </li>
          <li>
            <strong>מספר שהונפק לא משתנה לעולם</strong>, והמשך נקבע פעם אחת. לפני שממשיכים, בודקים בתוכנה הקודמת
            עצמה מה המספר האחרון — קובץ הייצוא לא כולל את כל המסמכים, ולכן המספרים שבו הם רק רצפה.
          </li>
        </ul>
      </div>

      {error && (
        <p className={`${styles.error} ${theme.mt}`} role="alert">
          {error}
        </p>
      )}

      {loading && !overview ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <Skeleton className="h-5 w-48 mb-3" />
          <TableSkeleton columns={7} tableClassName={theme.table} label="טוען סדרות מספור" />
        </div>
      ) : overview ? (
        <>
          <MappingCard overview={overview} year={overview.current_year} legacy={legacy} />
          {overview.years.map((year) => (
            <div key={year} className={`${theme.card} ${theme.mt}`}>
              <h3 className={theme.cardTitle}>שנת המס {year}</h3>
              <p className={theme.cardSub}>
                {year === overview.current_year
                  ? 'הסדרות של השנה הנוכחית'
                  : `הסדרות שייפתחו ב-1 בינואר ${year}. אפשר לקבוע כבר עכשיו מאיזה מספר הן ימשיכו.`}
              </p>
              <RunsTable
                overview={overview}
                runs={runsOf(overview, year)}
                legacy={legacy}
                openFor={openFor}
                notice={notice?.year === year ? notice : null}
                onOpenForm={(name) => {
                  setOpenFor(name);
                  setNotice(null);
                }}
                onCancel={() => setOpenFor('')}
                onOpened={(next, run) => {
                  setOverview(next);
                  setOpenFor('');
                  setNotice({
                    year: run.year,
                    text: `${run.name} ממשיכה את הסדרה של התוכנה הקודמת. המסמך הבא בה יקבל את המספר ${run.next_number}.`,
                    failed: false,
                  });
                }}
                onStale={(message) => {
                  // The run changed under the form: say why here, since the form may not come back.
                  setOpenFor('');
                  setNotice({ year, text: message, failed: true });
                  void load();
                }}
              />
            </div>
          ))}
        </>
      ) : null}
    </section>
  );
}

function MappingCard({ overview, year, legacy }: { overview: SeriesOverview; year: number; legacy: Record<string, number> }) {
  const rows = mappingRows(overview, year);
  if (rows.length === 0) return null;
  return (
    <div className={`${theme.card} ${theme.mt}`}>
      <h3 className={theme.cardTitle}>מה ממשיך מה ב-{year}</h3>
      <p className={theme.cardSub}>
        ההצעה לכל סוג מסמך בתוכנה הקודמת. אפשר לבחור סדרה אחרת מאותו סוג מסמך — בטבלה למטה.
      </p>
      <ul className={styles.mapping}>
        {rows.map((row) => {
          const target = row.continuedBy || row.suggested;
          const known = legacy[row.label];
          return (
            <li key={row.label} className={styles.mappingRow}>
              <span>{row.label}</span>
              {known !== undefined && (
                <span className={styles.muted}>
                  (אחרון בייבוא: <Num>{String(known)}</Num>)
                </span>
              )}
              <span className={styles.arrow} aria-hidden="true">←</span>
              <Num>{target ? `${target}-${year}` : '—'}</Num>
              {row.continuedBy ? (
                <span className={`${theme.tag} ${theme.tagOk}`}>כבר ממשיכה</span>
              ) : row.available ? (
                <span className={`${theme.tag} ${theme.tagType}`}>מוצע</span>
              ) : (
                <span className={`${theme.tag} ${theme.tagOff}`}>
                  {`${row.suggested || 'הסדרה'} כבר הנפיקה ב-${year} — אפשר מ-${year + 1}`}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface RunsTableProps {
  overview: SeriesOverview;
  runs: NumberRun[];
  legacy: Record<string, number>;
  openFor: string;
  notice: { text: string; failed: boolean } | null;
  onOpenForm: (name: string) => void;
  onCancel: () => void;
  onOpened: (overview: SeriesOverview, run: NumberRun) => void;
  onStale: (message: string) => void;
}

function RunsTable({ overview, runs, legacy, openFor, notice, onOpenForm, onCancel, onOpened, onStale }: RunsTableProps) {
  const formRun = runs.find((run) => run.name === openFor && run.can_open);
  const noticeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [notice]);

  return (
    <>
      <div className={theme.tableScroll}>
        <table className={theme.table}>
          <thead>
            <tr>
              <th scope="col">סדרה</th>
              <th scope="col">סוג</th>
              <th scope="col" className={theme.n}>הונפקו</th>
              <th scope="col">מספר אחרון</th>
              <th scope="col">המספר הבא</th>
              <th scope="col">מצב</th>
              <th scope="col" className={styles.actionHead}>
                <span className="sr-only">פעולה</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const status = runStatus(run);
              const formOpen = openFor === run.name;
              return (
                <tr key={run.name}>
                  <td>
                    <Num>{run.name}</Num>
                  </td>
                  <td>{run.label}</td>
                  <td className={theme.n}>{run.issued.toLocaleString('he-IL')}</td>
                  <td>{run.last ? <Num>{run.last}</Num> : <span className={styles.muted}>—</span>}</td>
                  <td>
                    <Num>{run.next_number}</Num>
                  </td>
                  <td className={styles.statusCell}>
                    <span className={`${theme.tag} ${TONE_TAG[status.tone]}`}>{status.label}</span>
                    {status.detail && (
                      <div className={`${styles.statusDetail} ${status.tone === 'continued' ? styles.continued : ''}`}>
                        {status.detail}
                      </div>
                    )}
                  </td>
                  <td className={styles.actionCell}>
                    {run.can_open && (
                      <button
                        type="button"
                        className={styles.actionBtn}
                        aria-expanded={formOpen}
                        aria-controls={formOpen ? `open-${run.name}` : undefined}
                        onClick={() => (formOpen ? onCancel() : onOpenForm(run.name))}
                      >
                        המשך מהתוכנה הקודמת
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {notice && (
        <p
          ref={noticeRef}
          className={`${notice.failed ? styles.error : styles.success} ${theme.mt}`}
          role={notice.failed ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      )}
      {/* Below the table, not inside it: a wide table scrolls sideways, and the form must not. */}
      {formRun && (
        <div id={`open-${formRun.name}`} className={styles.formPanel}>
          <OpenRunForm
            key={formRun.name}
            overview={overview}
            run={formRun}
            legacy={legacy}
            onCancel={onCancel}
            onOpened={onOpened}
            onStale={onStale}
          />
        </div>
      )}
    </>
  );
}

interface OpenRunFormProps {
  overview: SeriesOverview;
  run: NumberRun;
  legacy: Record<string, number>;
  onCancel: () => void;
  onOpened: (overview: SeriesOverview, run: NumberRun) => void;
  onStale: (message: string) => void;
}

function OpenRunForm({ overview, run, legacy, onCancel, onOpened, onStale }: OpenRunFormProps) {
  const choices = typeChoices(overview, run);
  const [draft, setDraft] = useState<OpeningDraft>(() => {
    const typeLabel = defaultTypeFor(overview, run);
    const known = legacy[typeLabel];
    return { typeLabel, lastText: known !== undefined ? String(known) : '', checked: false, submitting: false };
  });
  // The number shown came from the legacy import and has not been typed over.
  const [prefilled, setPrefilled] = useState(() => legacy[defaultTypeFor(overview, run)] !== undefined);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  // The legacy numbers may arrive after the form opened: fill the field once,
  // if it is still empty, and never again after the office cleared it.
  const legacyAppliedRef = useRef(Object.keys(legacy).length > 0);
  useEffect(() => {
    if (legacyAppliedRef.current || Object.keys(legacy).length === 0) return;
    legacyAppliedRef.current = true;
    const known = legacy[draft.typeLabel];
    if (known === undefined || draft.lastText !== '') return;
    setDraft((current) => editDraft(current, { lastText: String(known) }));
    setPrefilled(true);
    // Only the arrival of the legacy numbers triggers this, not the office's typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacy]);

  const preview = firstNumberPreview(run.series, run.year, draft.lastText);
  const problems = openingProblems(overview, run, draft);
  const ready = canConfirmOpening(overview, run, draft);
  const ids = {
    type: `open-type-${run.name}`,
    last: `open-last-${run.name}`,
    note: `open-note-${run.name}`,
    lastHint: `open-last-hint-${run.name}`,
    problems: `open-problems-${run.name}`,
  };

  function changeType(typeLabel: string) {
    const known = legacy[typeLabel];
    // A number from the import follows the type; a number the office typed stays.
    if (prefilled || draft.lastText === '') {
      setDraft((current) => editDraft(current, { typeLabel, lastText: known !== undefined ? String(known) : '' }));
      setPrefilled(known !== undefined);
    } else {
      setDraft((current) => editDraft(current, { typeLabel }));
    }
  }

  async function submit() {
    const payload = openingPayload(overview, run, draft, note);
    if (!payload || draft.submitting) return;
    setDraft((current) => ({ ...current, submitting: true }));
    setError('');
    try {
      const result = await openSeries(payload);
      const opened = result.overview.runs.find((item) => item.name === run.name) ?? result.run;
      onOpened(result.overview, opened);
    } catch (err) {
      const status = (err as { response?: { status?: number } } | null)?.response?.status;
      const message = await serverErrorText(err, 'המשך הסדרה נכשל. לא נקבע דבר.');
      // The run's state changed under the form (issued meanwhile, or opened elsewhere): read it again.
      if (status === 409) {
        onStale(message);
        return;
      }
      setError(message);
      setDraft((current) => ({ ...current, submitting: false }));
    }
  }

  return (
    <form
      className={styles.form}
      aria-labelledby={`open-title-${run.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p id={`open-title-${run.name}`} className={styles.formTitle}>
        {run.name} · {run.label} — המשך מהתוכנה הקודמת
      </p>

      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor={ids.type} className={styles.label}>
            סוג המסמך בתוכנה הקודמת
          </label>
          <select
            id={ids.type}
            ref={firstFieldRef}
            className={styles.control}
            value={draft.typeLabel}
            disabled={draft.submitting}
            onChange={(e) => changeType(e.target.value)}
          >
            {draft.typeLabel === '' && <option value="">בחרו סוג</option>}
            {choices.map((choice) => (
              <option key={choice.label} value={choice.label} disabled={Boolean(choice.takenBy)}>
                {choice.label}
                {choice.takenBy ? ` — כבר ממשיכה ב-${choice.takenBy}` : choice.suggested ? ' (מוצע)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor={ids.last} className={styles.label}>
            המספר האחרון שהונפק בתוכנה הקודמת
          </label>
          <input
            id={ids.last}
            className={`${styles.control} ${styles.numberInput}`}
            inputMode="numeric"
            autoComplete="off"
            value={draft.lastText}
            disabled={draft.submitting}
            aria-describedby={ids.lastHint}
            aria-invalid={draft.lastText !== '' && !preview}
            onChange={(e) => {
              setPrefilled(false);
              setDraft((current) => editDraft(current, { lastText: e.target.value }));
            }}
          />
          <span id={ids.lastHint} className={styles.hint}>
            {prefilled
              ? 'מולא מהייבוא. הייבוא לא כולל את כל המסמכים — יש לוודא בתוכנה הקודמת עצמה.'
              : 'כפי שהוא מופיע בתוכנה הקודמת, בלי קידומת.'}
          </span>
        </div>
      </div>

      <div className={styles.preview} aria-live="polite">
        {preview ? (
          <>
            המסמך הבא בסדרה {run.name} יקבל את המספר{' '}
            <span className={`${styles.number} ${styles.previewNumber}`}>{preview}</span>
            {run.year > overview.current_year ? ` — מ-1 בינואר ${run.year}` : ''}.
          </>
        ) : (
          <>הקלידו את המספר האחרון כדי לראות מאיזה מספר הסדרה תמשיך.</>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor={ids.note} className={styles.label}>
          מקור / הערה <span className={styles.muted}>(לא חובה)</span>
        </label>
        <textarea
          id={ids.note}
          className={styles.textarea}
          value={note}
          maxLength={1000}
          disabled={draft.submitting}
          placeholder="למשל: נבדק במסך המסמכים של התוכנה הקודמת ב-18.9"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <label className={styles.confirm}>
        <input
          type="checkbox"
          className={styles.check}
          checked={draft.checked}
          disabled={draft.submitting}
          onChange={(e) => setDraft((current) => editDraft(current, { checked: e.target.checked }))}
        />
        <span>{confirmationText(draft.typeLabel, draft.lastText)}</span>
      </label>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.buttons}>
        <button
          type="submit"
          className={styles.primaryBtn}
          disabled={!ready}
          aria-describedby={problems.length ? ids.problems : undefined}
        >
          {draft.submitting ? 'קובע…' : preview ? `המשך מ-${preview}` : 'המשך את הסדרה'}
        </button>
        <button type="button" className={styles.ghostBtn} onClick={onCancel} disabled={draft.submitting}>
          ביטול
        </button>
      </div>
      {problems.length > 0 && (
        <ul id={ids.problems} className={styles.problems}>
          {problems.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <p className={styles.hint}>ההמשך נקבע פעם אחת ולא ניתן לשנותו אחר כך. מסמכים שכבר הונפקו לא משתנים.</p>
    </form>
  );
}
