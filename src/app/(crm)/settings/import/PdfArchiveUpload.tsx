'use client';

import { useState } from 'react';
import { FileArchive, FileUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { readableError } from '@/lib/apiError';
import {
  LEGACY_IMPORT_MAX_BYTES,
  PDF_PROBLEM_STATUSES,
  PDF_STATUS_LABELS,
  TAZMAN_SOURCE,
  chosenSourceSystem,
  documentNumberLabel,
  formatLegacyDate,
  mergePdfReports,
  pdfBatches,
  uploadLegacyPdfs,
  type LegacyKnownSource,
  type LegacyPdfReport,
  type LegacyPdfStatus,
} from '@/lib/legacyImportApi';
import styles from './import.module.css';

// A request that ran out of time says how many it left; the same batch is sent again, at most this many times.
const MAX_ROUNDS_PER_BATCH = 5;

/**
 * קובצי ה-PDF של התוכנה הקודמת — after the documents were imported, their
 * PDFs: each one matched by the number in its name to a document of the chosen
 * software. The server keeps only each file's fingerprint (SHA-256) and size;
 * the file itself goes to the locked storage in Israel, when it is set up.
 *
 * A request carries at most ~4MB (the server's host refuses more), so PDFs
 * chosen one by one (or a whole folder) are sent in batches; a ZIP must fit
 * in one request.
 */
export default function PdfArchiveUpload({
  sources,
  defaultSource,
}: {
  sources: LegacyKnownSource[];
  defaultSource: string;
}) {
  const [choice, setChoice] = useState(defaultSource || TAZMAN_SOURCE);
  const [otherName, setOtherName] = useState('');
  const [pdfs, setPdfs] = useState<File[]>([]);
  const [zip, setZip] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState<LegacyPdfReport | null>(null);

  const sourceSystem = chosenSourceSystem(choice, otherName);
  const { batches, tooBig } = pdfBatches(pdfs);

  async function send() {
    if (!sourceSystem) {
      setError('יש לבחור את התוכנה שממנה ה-PDF');
      return;
    }
    if (zip && zip.size > LEGACY_IMPORT_MAX_BYTES) {
      setError('קובץ ה-ZIP גדול מ-4.3MB. חלצו אותו ובחרו את קובצי ה-PDF עצמם — הם יישלחו בחלקים.');
      return;
    }
    setBusy(true);
    setError('');
    setReport(null);
    const reports: LegacyPdfReport[] = [];
    try {
      const jobs: { pdfs?: File[]; zip?: File }[] = zip ? [{ zip }] : batches.map((batch) => ({ pdfs: batch }));
      for (let i = 0; i < jobs.length; i += 1) {
        const job = jobs[i];
        for (let round = 0; round < MAX_ROUNDS_PER_BATCH; round += 1) {
          setProgress(`שולח חלק ${i + 1} מתוך ${jobs.length}…`);
          const answer = await uploadLegacyPdfs(job, sourceSystem);
          reports.push(answer);
          // Out of time on the server: what it did is recorded, so the same files again pick up where it stopped.
          if (!answer.remaining || answer.stopped) break;
        }
        if (reports[reports.length - 1]?.stopped) break;
      }
      setReport(mergePdfReports(reports));
    } catch (e) {
      setError(readableError(e, 'שליחת הקבצים נכשלה'));
      if (reports.length) setReport(mergePdfReports(reports));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  const problems = report ? report.files.filter((f) => PDF_PROBLEM_STATUSES.includes(f.status)) : [];

  return (
    <section className="card">
      <h3 className="text-lg font-semibold mb-1">קובצי ה-PDF של התוכנה הקודמת</h3>
      <p className="text-sm text-muted-foreground mb-3">
        אחרי ייבוא המסמכים: כל PDF מותאם למסמך לפי המספר שבשם הקובץ (למשל <span dir="ltr">40001.pdf</span>). כשאותו מספר
        קיים בכמה סוגים, כתבו בשם גם את הסוג (&quot;קבלה 40001.pdf&quot;). במסד הנתונים נשמרת רק טביעת האצבע של הקובץ,
        והקובץ עצמו נשמר באחסון הנעול בישראל — אי אפשר למחוק או להחליף אותו שם.
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="text-sm" htmlFor="legacy-pdf-source">
          התוכנה:
        </label>
        <Select
          id="legacy-pdf-source"
          className={styles.sourceSelect}
          value={choice}
          disabled={busy}
          onChange={(e) => setChoice(e.target.value)}
        >
          <option value={TAZMAN_SOURCE}>Tazman (התוכנה הקודמת)</option>
          {sources
            .filter((s) => s.id !== TAZMAN_SOURCE)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          {choice && choice !== 'other' && choice !== TAZMAN_SOURCE && !sources.some((s) => s.id === choice) ? (
            <option value={choice}>{choice}</option>
          ) : null}
          <option value="other">אחרת…</option>
        </Select>
        {choice === 'other' ? (
          <input
            className={`input ${styles.sourceName}`}
            placeholder="שם התוכנה, כפי שהוקלד בייבוא"
            aria-label="שם התוכנה"
            value={otherName}
            onChange={(e) => setOtherName(e.target.value)}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className={styles.fileLabel}>
          <FileUp className="h-4 w-4" aria-hidden="true" />
          <span>{pdfs.length ? `${pdfs.length.toLocaleString('he-IL')} קובצי PDF` : 'בחירת קובצי PDF'}</span>
          <input
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              setPdfs(Array.from(e.target.files ?? []).filter((f) => /\.pdf$/i.test(f.name)));
              setZip(null);
              setReport(null);
              setError('');
            }}
          />
        </label>
        <span className="text-xs text-muted-foreground">או</span>
        <label className={styles.fileLabel}>
          <FileArchive className="h-4 w-4" aria-hidden="true" />
          <span>{zip ? zip.name : 'ZIP עד 4.3MB'}</span>
          <input
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              setZip(e.target.files?.[0] ?? null);
              setPdfs([]);
              setReport(null);
              setError('');
            }}
          />
        </label>
        <Button variant="gradient" onClick={send} disabled={busy || (!zip && !batches.length)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
          {busy ? progress || 'שולח…' : 'שלח והתאם'}
        </Button>
      </div>
      {pdfs.length ? (
        <p className="text-xs text-muted-foreground mt-2">
          יישלחו ב-{batches.length.toLocaleString('he-IL')} חלקים של עד 4MB.
          {tooBig.length ? ` ${tooBig.length} קבצים גדולים מ-4MB לא יישלחו: ${tooBig.map((f) => f.name).join(', ')}` : ''}
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-600 mt-2">{error}</p> : null}

      {report ? (
        <div className="mt-4" role="status">
          {!report.bucket_configured ? (
            <p className="text-sm text-amber-700 mb-2">
              האחסון הנעול אינו מוגדר בשרת: נשמרה רק טביעת האצבע של כל קובץ, הקבצים עצמם לא נשמרו. שמרו אותם אצלכם,
              ושלחו אותם שוב כשהאחסון יוגדר — הם יישמרו אז.
            </p>
          ) : null}
          {report.stopped ? (
            <p className="text-sm text-red-600 mb-2">
              האחסון לא היה זמין והשליחה נעצרה ({report.remaining.toLocaleString('he-IL')} קבצים לא טופלו). נסו שוב
              מאוחר יותר — מה שכבר נשמר לא יישלח פעמיים.
            </p>
          ) : report.remaining ? (
            <p className="text-sm text-amber-700 mb-2">
              {report.remaining.toLocaleString('he-IL')} קבצים עוד לא טופלו. שלחו שוב את אותם קבצים — מה שכבר נשמר יזוהה
              וידולג.
            </p>
          ) : null}
          <ul className={styles.facts}>
            {(Object.entries(report.counts) as [LegacyPdfStatus, number][]).map(([status, count]) => (
              <li key={status}>
                {PDF_STATUS_LABELS[status] ?? status}: <strong>{count.toLocaleString('he-IL')}</strong>
              </li>
            ))}
          </ul>
          {problems.length ? (
            <div className="table-scroll mt-3">
              <table className="table table-compact">
                <thead>
                  <tr className="bg-muted/50">
                    <th>קובץ</th>
                    <th>מצב</th>
                    <th className="col-hide-mobile">פירוט</th>
                  </tr>
                </thead>
                <tbody>
                  {problems.map((entry, i) => (
                    <tr key={`${entry.file}-${i}`}>
                      <td dir="ltr" className="text-xs">
                        {entry.file}
                      </td>
                      <td className="text-xs">{PDF_STATUS_LABELS[entry.status]}</td>
                      <td className="col-hide-mobile text-xs text-muted-foreground">
                        {entry.reason ?? ''}
                        {entry.document
                          ? ` · ${entry.document.type_label} ${documentNumberLabel(entry.document)} מ-${formatLegacyDate(entry.document.date)}`
                          : ''}
                        {entry.candidates?.length
                          ? ` · ${entry.candidates.map((c) => `${c.type_label} ${documentNumberLabel(c)}`).join(', ')}`
                          : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
