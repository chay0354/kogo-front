'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, FileUp, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select } from '@/components/ui/select';
import LegacyDocumentsTable from '@/components/LegacyHistory/LegacyDocumentsTable';
import { readableError } from '@/lib/apiError';
import {
  FORMAT_ACCEPT,
  ImportFileTooBigError,
  LEGACY_DOC_TYPE_LABELS,
  LEGACY_IMPORT_SCOPES,
  TAZMAN_SOURCE,
  applyMappingChange,
  branchAllowed,
  categoriesFor,
  chosenSourceSystem,
  commitConfirmText,
  commitLegacyImport,
  describeLegacyColumns,
  fetchLegacyDocuments,
  fetchLegacyImports,
  fetchLegacySources,
  formatLegacyDate,
  fromSourceText,
  importFileProblem,
  initialColumnMapping,
  initialMapping,
  mappingProgress,
  numberingLine,
  openCountNote,
  openInvoicesCsv,
  previewLegacyImport,
  scopeFlags,
  type LegacyColumnMapping,
  type LegacyColumnsInfo,
  type LegacyCommitResult,
  type LegacyDocType,
  type LegacyDocument,
  type LegacyImport,
  type LegacyImportScope,
  type LegacyKnownSource,
  type LegacyMapping,
  type LegacyOpenInvoice,
  type LegacySourceFormat,
  type LegacySummary,
  type LegacyTarget,
} from '@/lib/legacyImportApi';
import ColumnMappingStep from './ColumnMappingStep';
import PdfArchiveUpload from './PdfArchiveUpload';
import SourcePicker, { FROM_FILE } from './SourcePicker';
import styles from './import.module.css';

const FORMAT_LABELS: Record<LegacySourceFormat, string> = {
  tazman: 'קובץ הייצוא של התוכנה הקודמת',
  table: 'טבלה (CSV / Excel)',
  uniform: 'מבנה אחיד',
};

const FILE_BUTTON: Record<LegacySourceFormat, string> = {
  tazman: 'בחירת קובץ ‎.xls',
  table: 'בחירת קובץ CSV / Excel',
  uniform: 'בחירת BKMVDATA.TXT או ZIP',
};

const KIND_LABELS: Record<string, string> = {
  branch: 'סניף',
  section: 'סעיף',
  expenses: 'הוצאות',
  unknown: 'לא ידוע',
};

/**
 * ייבוא מתוכנה קודמת. An export from the previous invoicing software — or from
 * any other one — becomes kogo's business customers and a read-only history of
 * every document it issued: source → file → (a table: its column mapping) →
 * preview (what would happen, and where each old location goes) → confirm →
 * result; then the old PDFs, matched to the documents by number. Nothing is
 * written before the confirm, and confirming the same file again changes nothing.
 */
export default function SettingsImportPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const queryClient = useQueryClient();

  const [format, setFormat] = useState<LegacySourceFormat>('tazman');
  const [choice, setChoice] = useState('');
  const [otherName, setOtherName] = useState('');
  const [sources, setSources] = useState<LegacyKnownSource[]>([]);
  const [columnsInfo, setColumnsInfo] = useState<LegacyColumnsInfo | null>(null);
  const [columnMapping, setColumnMapping] = useState<LegacyColumnMapping>({});
  const [fixedDocType, setFixedDocType] = useState<LegacyDocType | ''>('');
  const [typeValues, setTypeValues] = useState<Record<string, LegacyDocType>>({});
  // What the import writes. Cards only is where it opens: the business numbers
  // its documents afresh in kogo and wants its customers, not the old documents.
  const [scope, setScope] = useState<LegacyImportScope>('cards');
  const { createCustomers, importDocuments } = scopeFlags(scope);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<LegacyImport | null>(null);
  const [mapping, setMapping] = useState<LegacyMapping>({});
  const [includeParents, setIncludeParents] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<LegacyCommitResult | null>(null);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof fetchLegacyImports>>>([]);

  useEffect(() => {
    if (!isManager) return;
    fetchLegacyImports().then(setHistory).catch(() => setHistory([]));
  }, [isManager, result]);

  useEffect(() => {
    if (!isManager) return;
    fetchLegacySources()
      .then((data) => setSources(data.sources))
      .catch(() => setSources([]));
  }, [isManager]);

  const summary = preview?.summary;
  const options = summary?.options;
  const progress = useMemo(
    () => (summary ? mappingProgress(summary.locations, mapping) : null),
    [summary, mapping],
  );

  const sourceSystem = format === 'tazman' ? TAZMAN_SOURCE : chosenSourceSystem(choice, otherName);

  /** Anything about the source or the file changed: what was read from the old one no longer applies. */
  function resetFileState() {
    setColumnsInfo(null);
    setPreview(null);
    setResult(null);
    setError('');
  }

  function changeFormat(next: LegacySourceFormat) {
    setFormat(next);
    setChoice(next === 'uniform' ? FROM_FILE : '');
    setFile(null);
    resetFileState();
  }

  async function upload() {
    const problem = importFileProblem(file, format);
    if (problem) {
      setError(problem);
      return;
    }
    if (format === 'table' && !sourceSystem) {
      setError('יש לבחור את התוכנה שממנה הקובץ יוצא');
      return;
    }
    setUploading(true);
    setError('');
    setResult(null);
    try {
      if (format === 'table') {
        // A table is described first: the office confirms which column is what before anything is read.
        const info = await describeLegacyColumns(file as File);
        setColumnsInfo(info);
        setColumnMapping(initialColumnMapping(info));
        setFixedDocType('');
        setTypeValues({});
        setPreview(null);
      } else {
        await runPreview();
      }
    } catch (e) {
      setError(uploadError(e));
    } finally {
      setUploading(false);
    }
  }

  async function runPreview() {
    const next = await previewLegacyImport(file as File, {
      format,
      sourceSystem,
      columnMapping,
      typeValues,
      fixedDocType,
    });
    setPreview(next);
    setMapping(initialMapping(next.summary.locations));
    setIncludeParents(false);
    setScope('cards');
  }

  async function previewWithMapping() {
    setUploading(true);
    setError('');
    try {
      await runPreview();
    } catch (e) {
      setError(uploadError(e));
    } finally {
      setUploading(false);
    }
  }

  async function commit() {
    if (!preview) return;
    try {
      const done = await commitLegacyImport(preview.id, mapping, includeParents && createCustomers, createCustomers, importDocuments);
      setResult(done);
      // Cards were created or changed: the wizard's search and history must not serve old copies.
      queryClient.invalidateQueries({ queryKey: ['legacy-documents'] });
      toast.success('הייבוא הושלם');
    } catch (e) {
      toast.error(readableError(e, 'הייבוא נכשל'));
    }
  }

  function changeTarget(location: string, field: keyof LegacyTarget, value: string) {
    if (!options) return;
    setMapping((prev) => ({
      ...prev,
      [location]: applyMappingChange(prev[location] ?? { business_id: null, category_id: null, branch_id: null }, field, value, options),
    }));
  }

  if (!isManager) {
    return (
      <div className="card">
        <p className="text-muted-foreground">אין הרשאה</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">ייבוא מתוכנה קודמת</h2>
        <p className="text-sm text-muted-foreground">
          קובץ ייצוא של המסמכים — מהתוכנה הקודמת או מכל תוכנת חשבוניות אחרת — הופך ללקוחות העסקיים של קוגו ולהיסטוריה
          של כל מסמך שהופק. המסמכים לא מופקים מחדש, לא נכנסים לרצף המספור של קוגו ולא לדוחות — הם נשמרים כדי לראות מה
          הופק לכל לקוח.
        </p>
      </div>

      {/* 1. Source and file */}
      <div className="card space-y-3">
        <SourcePicker
          format={format}
          onFormat={changeFormat}
          choice={choice}
          onChoice={(next) => {
            setChoice(next);
            resetFileState();
          }}
          otherName={otherName}
          onOtherName={(next) => {
            setOtherName(next);
            resetFileState();
          }}
          sources={sources}
          disabled={uploading}
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className={styles.fileLabel}>
            <FileUp className="h-4 w-4" aria-hidden="true" />
            <span>{file ? file.name : FILE_BUTTON[format]}</span>
            <input
              type="file"
              accept={FORMAT_ACCEPT[format]}
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                resetFileState();
              }}
            />
          </label>
          <Button variant="gradient" onClick={upload} disabled={!file || uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
            {uploading ? 'קורא את הקובץ…' : format === 'table' ? 'המשך למיפוי עמודות' : 'הצג תצוגה מקדימה'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          קובץ גדול (עד 40MB) נדחס אוטומטית לפני השליחה — אפשר להעלות את כל ההיסטוריה בקובץ אחד.{' '}
          {format === 'tazman'
            ? 'הסיסמה לאפליקציה, תאריך הלידה, הפקס והטלפון בבית שבקובץ אינם נקראים ואינם נשמרים.'
            : format === 'table'
              ? 'רק העמודות שתבחרו במיפוי נקראות ונשמרות.'
              : 'נקראים המסמכים (C100), השורות (D110) והתשלומים (D120). הזמנות, תעודות משלוח ורכש אינם מיובאים.'}
        </p>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>

      {/* 1b. A table's column mapping */}
      {format === 'table' && columnsInfo && !preview && !result ? (
        <ColumnMappingStep
          info={columnsInfo}
          mapping={columnMapping}
          onMapping={setColumnMapping}
          fixedDocType={fixedDocType}
          onFixedDocType={setFixedDocType}
          typeValues={typeValues}
          onTypeValues={setTypeValues}
          busy={uploading}
          onPreview={previewWithMapping}
        />
      ) : null}

      {result ? (
        <div className="card" role="status">
          <h3 className="text-lg font-semibold mb-2">הייבוא הושלם</h3>
          <ul className={styles.facts}>
            <li>
              לקוחות עסקיים: <strong>{result.customers.created}</strong> נפתחו, <strong>{result.customers.updated}</strong>{' '}
              עודכנו, {result.customers.unchanged} ללא שינוי
            </li>
            {result.documents.imported === false ? (
              <li>
                לא נשמר אף מסמך — כרטיסים בלבד.
                {result.documents.left_in_previous_software
                  ? ` ${result.documents.left_in_previous_software.toLocaleString('he-IL')} המסמכים שבקובץ נשארו בתוכנה שהפיקה אותם.`
                  : ''}
              </li>
            ) : (
              <li>
                מסמכים: <strong>{result.documents.created.toLocaleString('he-IL')}</strong> נשמרו,{' '}
                {result.documents.updated.toLocaleString('he-IL')} עודכנו, {result.documents.unchanged.toLocaleString('he-IL')} ללא
                שינוי · {result.documents.linked_to_customers.toLocaleString('he-IL')} מקושרים ללקוח עסקי
              </li>
            )}
            {result.customers.skipped_deleted ? (
              <li>{result.customers.skipped_deleted} לקוחות שנמחקו בתוכנה הקודמת לא נפתחו</li>
            ) : null}
            {result.customers.linked_without_changing_cards ? (
              <li>{result.customers.linked_without_changing_cards} לקוחות קושרו לכרטיס קיים בלי לשנות אותו</li>
            ) : null}
            {result.documents.open_skipped ? (
              <li>
                {result.documents.open_skipped === 1
                  ? 'חשבונית פתוחה אחת לא יובאה'
                  : `${result.documents.open_skipped} חשבוניות פתוחות לא יובאו`}{' '}
                — הן נשארות בתוכנה שהפיקה אותן
              </li>
            ) : null}
          </ul>
          <p className="text-sm text-muted-foreground mt-2">
            {result.documents.imported === false
              ? 'הלקוחות מופיעים באשף "מסמך חדש": מקלידים שם, ח"פ, אימייל או טלפון, והפרטים מתמלאים. המסמכים שיופקו להם ימוספרו במספור של קוגו.'
              : 'ההיסטוריה של כל לקוח מופיעה בכרטיס הלקוח העסקי ובאשף "מסמך חדש" כשבוחרים אותו. עכשיו אפשר לצרף את קובצי ה-PDF של המסמכים — בחלק שלמטה.'}
          </p>
        </div>
      ) : null}

      {summary && options && !result ? (
        <>
          {/* 2. Summary */}
          <section className="card">
            <h3 className="text-lg font-semibold mb-3">סיכום</h3>
            <SourceFacts summary={summary} />
            {format === 'table' && columnsInfo ? (
              <Button variant="outline" size="sm" className="mb-3" onClick={() => setPreview(null)}>
                שינוי מיפוי העמודות
              </Button>
            ) : null}
            <div className={styles.stats}>
              <Stat label="מסמכים" value={summary.documents.total} hint={`${formatLegacyDate(summary.documents.first_date)} – ${formatLegacyDate(summary.documents.last_date)}`} />
              <Stat label="לקוחות עסקיים חדשים" value={summary.customers.business_create} />
              <Stat label="לקוחות עסקיים קיימים שיעודכנו" value={summary.customers.business_update} />
              <Stat label="הורים משלמי מנוי" value={summary.customers.parents} />
              <Stat label="כבר יובאו בעבר" value={summary.documents.already_imported} hint="יעודכנו, לא ישוכפלו" />
              {summary.open_invoices?.count ? (
                <Stat label="חשבוניות פתוחות" value={summary.open_invoices.count} hint="לא נכנסות — רשימה למטה" />
              ) : null}
            </div>
            {summary.documents.skipped ? (
              <p className="text-sm text-amber-700 mt-3">
                {summary.documents.skipped} שורות לא נקראו (
                {summary.documents.skipped_rows.map((s) => (s.row ? `שורה ${s.row} — ${s.reason}` : s.reason)).join(' · ')})
              </p>
            ) : null}
          </section>

          {/* 3. Numbering */}
          <section className="card">
            <h3 className="text-lg font-semibold mb-2">מספור לפי סוג מסמך</h3>
            <div className={styles.warning} role="note">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                ייתכן שהקובץ מכיל רק חלק מכל רצף מספרים של התוכנה — למשל רק את המסמכים של הלקוחות שבייצוא — ולכן יש בו
                פערים. &quot;המספר האחרון&quot; כאן הוא האחרון שבקובץ, לא בהכרח האחרון שהופק. לפני שקוגו ממשיך רצף כלשהו,
                יש לאשר בתוכנה עצמה את המספר האחרון של כל סוג מסמך.
              </p>
            </div>
            <div className="table-scroll">
              <table className="table table-compact">
                <thead>
                  <tr className="bg-muted/50">
                    <th>סוג מסמך</th>
                    <th>מסמכים בקובץ</th>
                    <th>ראשון בקובץ</th>
                    <th>אחרון בקובץ</th>
                    <th className="col-hide-mobile">כיסוי הטווח</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.types.map((row) => (
                    <tr key={row.doc_type}>
                      <td>
                        {row.label}
                        {row.original_labels.some((l) => l !== row.label) ? (
                          <span className="block text-xs text-muted-foreground">בקובץ: {row.original_labels.join(', ')}</span>
                        ) : null}
                      </td>
                      <td className="tabular-nums">
                        {row.count.toLocaleString('he-IL')}
                        {openCountNote(row) ? (
                          <span className="block text-xs text-muted-foreground">{openCountNote(row)}</span>
                        ) : null}
                      </td>
                      <td className="tabular-nums">
                        {row.first_number} <span className="text-xs text-muted-foreground">({formatLegacyDate(row.first_date)})</span>
                      </td>
                      <td className="tabular-nums font-semibold">
                        {row.last_number} <span className="text-xs text-muted-foreground font-normal">({formatLegacyDate(row.last_date)})</span>
                      </td>
                      <td className="col-hide-mobile text-xs">{numberingLine(row).coverage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 3b. Open invoices: listed, never imported */}
          {summary.open_invoices?.count ? <OpenInvoices open={summary.open_invoices} /> : null}

          {/* 4. Customers */}
          <section className="card">
            <h3 className="text-lg font-semibold mb-2">לקוחות</h3>
            <p className="text-sm text-muted-foreground mb-3">
              לקוח עסקי הוא מי שהופקו לו חשבונית מס, חשבונית עסקה או קבלה ידניות, ששילם שלא בכרטיס אשראי, שמשלם שכירות,
              שיש לו מספר חברה או ששמו של ארגון. זיכוי לבדו אינו הופך הורה ללקוח עסקי. לקוח שכבר קיים בקוגו (לפי
              ח&quot;פ/ת&quot;ז, אימייל, או טלפון ושם) מתעדכן: שדות ריקים מתמלאים והשם האחרון גובר.
            </p>
            <div className="table-scroll">
              <table className="table table-compact">
                <thead>
                  <tr className="bg-muted/50">
                    <th>לקוח</th>
                    <th>פעולה</th>
                    <th>מסמכים</th>
                    <th className="col-hide-mobile">אחרון</th>
                    <th className="col-hide-mobile">למה עסקי</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.customers.business_list.map((c) => (
                    <tr key={c.key}>
                      <td>
                        {c.name}
                        {c.company_number ? <span className="block text-xs text-muted-foreground">ח&quot;פ {c.company_number}</span> : null}
                      </td>
                      <td className="text-xs">
                        {c.action === 'create' ? 'ייפתח' : null}
                        {c.action === 'update' && c.match ? `יעודכן: ${c.match.name} (${c.match.how})` : null}
                        {c.action === 'skip' ? 'נמחק בתוכנה הקודמת — לא ייפתח' : null}
                      </td>
                      <td className="tabular-nums">{c.documents}</td>
                      <td className="col-hide-mobile text-xs">
                        {/* No document of theirs is imported: all the file has is an invoice still open. */}
                        {c.documents === 0 && summary.open_invoices?.count
                          ? 'חשבונית פתוחה בלבד — לא מיובאת'
                          : `${c.latest.type_label} ${c.latest.number} · ${formatLegacyDate(c.latest.date)}`}
                      </td>
                      <td className="col-hide-mobile text-xs text-muted-foreground">{c.reasons.join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <fieldset className={styles.scope}>
              <legend className={styles.scopeLegend}>מה לייבא</legend>
              {LEGACY_IMPORT_SCOPES.map((option) => (
                <label key={option.value} className={styles.parents}>
                  <input
                    type="radio"
                    name="legacy-import-scope"
                    value={option.value}
                    checked={scope === option.value}
                    onChange={() => setScope(option.value)}
                  />
                  <span>
                    {option.label}
                    <span className="block text-xs text-muted-foreground">{option.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className={styles.parents}>
              <input
                type="checkbox"
                checked={includeParents && createCustomers}
                disabled={!createCustomers}
                onChange={(e) => setIncludeParents(e.target.checked)}
              />
              <span>
                לפתוח גם את {summary.customers.parents.toLocaleString('he-IL')} ההורים משלמי המנוי כלקוחות עסקיים
                <span className="block text-xs text-muted-foreground">
                  בדרך כלל הם כבר קיימים בקוגו כמשפחות ({summary.customers.parents_matching_family.toLocaleString('he-IL')} מהם
                  נמצאו לפי טלפון או אימייל). בלי הסימון לא נפתח להם כרטיס.
                </span>
              </span>
            </label>
          </section>

          {/* 5. Name changes */}
          {summary.name_changes.length ? (
            <section className="card">
              <h3 className="text-lg font-semibold mb-2">שינויי שם</h3>
              <p className="text-sm text-muted-foreground mb-2">אותו לקוח הופיע בכמה שמות. השם מהמסמך האחרון גובר.</p>
              <ul className={styles.facts}>
                {summary.name_changes.map((change) => (
                  <li key={change.key}>
                    {change.old_names.join(', ')} ← <strong>{change.new_name}</strong>{' '}
                    <span className="text-xs text-muted-foreground">({change.documents} מסמכים)</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* 5b. One company number, several customers */}
          {summary.shared_ids?.length ? (
            <section className="card">
              <h3 className="text-lg font-semibold mb-2">אותו ח&quot;פ, לקוחות נפרדים</h3>
              <p className="text-sm text-muted-foreground mb-2">
                מספר חברה שמופיע בקובץ תחת כמה לקוחות בשמות שונים — למשל מתנ&quot;סים של אותה רשת, או סניפים. כל אחד
                מקבל כרטיס משלו, עם ההיסטוריה שלו, ומותאם לכרטיס קיים רק לפי הח&quot;פ יחד עם השם.
              </p>
              <ul className={styles.facts}>
                {summary.shared_ids.map((group) => (
                  <li key={group.id_number}>
                    <span className="tabular-nums">ח&quot;פ {group.id_number}</span>:{' '}
                    {group.customers.map((customer, index) => (
                      <span key={customer.key}>
                        {index ? ' · ' : ''}
                        <strong>{customer.name}</strong>{' '}
                        <span className="text-xs text-muted-foreground">({customer.documents} מסמכים)</span>
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* 6. Locations */}
          <section className="card">
            <h3 className="text-lg font-semibold mb-2">מיקומים — עסק, קטגוריה וסניף</h3>
            <p className="text-sm text-muted-foreground mb-2">
              כל מסמך מקבל את העסק, הקטגוריה והסניף של המיקום שלו. לקוח עסקי מקבל את אלה של המסמך האחרון שלו. ההצעות
              מבוססות על השמות בקוגו — אשרו או שנו כל שורה. סניף נבחר תחת הקטגוריה סניפים.
            </p>
            {progress ? (
              <p className="text-sm mb-3">
                {progress.mapped} מתוך {progress.total} מיקומים משויכים
                {progress.unmappedDocuments ? ` · ${progress.unmappedDocuments.toLocaleString('he-IL')} מסמכים יישארו ללא שיוך` : ''}
                {progress.unmappedBusinessCustomers ? ` · ${progress.unmappedBusinessCustomers} לקוחות עסקיים בלי עסק` : ''}
              </p>
            ) : null}
            <div className="table-scroll">
              <table className="table table-compact">
                <thead>
                  <tr className="bg-muted/50">
                    <th>מיקום בתוכנה הקודמת</th>
                    <th>מסמכים</th>
                    <th>עסק</th>
                    <th>קטגוריה</th>
                    <th>סניף</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.locations.map((loc) => {
                    const target = mapping[loc.location] ?? { business_id: null, category_id: null, branch_id: null };
                    return (
                      <tr key={loc.location} className={loc.flag ? styles.flagged : undefined}>
                        <td>
                          {loc.location || '(ללא מיקום)'}
                          <span className="block text-xs text-muted-foreground">
                            {KIND_LABELS[loc.kind]} · {loc.reason}
                          </span>
                        </td>
                        <td className="tabular-nums">{loc.documents.toLocaleString('he-IL')}</td>
                        <td>
                          <Select
                            aria-label={`עסק עבור ${loc.location}`}
                            className={styles.select}
                            value={target.business_id ?? ''}
                            onChange={(e) => changeTarget(loc.location, 'business_id', e.target.value)}
                          >
                            <option value="">ללא</option>
                            {options.businesses
                              .filter((b) => b.is_active || b.id === target.business_id)
                              .map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                          </Select>
                        </td>
                        <td>
                          <Select
                            aria-label={`קטגוריה עבור ${loc.location}`}
                            className={styles.select}
                            value={target.category_id ?? ''}
                            disabled={!target.business_id}
                            onChange={(e) => changeTarget(loc.location, 'category_id', e.target.value)}
                          >
                            <option value="">{target.business_id ? 'ללא' : 'בחרו עסק'}</option>
                            {categoriesFor(options, target).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td>
                          <Select
                            aria-label={`סניף עבור ${loc.location}`}
                            className={styles.select}
                            value={target.branch_id ?? ''}
                            disabled={!branchAllowed(target, options)}
                            onChange={(e) => changeTarget(loc.location, 'branch_id', e.target.value)}
                          >
                            <option value="">{branchAllowed(target, options) ? 'ללא' : 'רק תחת סניפים'}</option>
                            {options.branches
                              .filter((b) => b.is_active || b.id === target.branch_id)
                              .map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* 7. Confirm */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button variant="outline" onClick={() => { setPreview(null); setFile(null); }}>
              ביטול
            </Button>
            <Button variant="gradient" onClick={() => setConfirmOpen(true)}>
              ייבוא
            </Button>
          </div>
          <ConfirmDialog
            isOpen={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            onConfirm={async (yes) => {
              if (yes) await commit();
            }}
            title={`לייבא ${fromSourceText(summary)}?`}
            message={commitConfirmText(summary, includeParents && createCustomers, mapping, createCustomers, importDocuments)}
            confirmText="ייבוא"
            type="question"
          />
        </>
      ) : null}

      <PdfArchiveUpload
        key={preview?.source_system ?? 'none'}
        sources={sources}
        defaultSource={preview?.source_system ?? (format === 'tazman' ? TAZMAN_SOURCE : sourceSystem || TAZMAN_SOURCE)}
      />

      <HistorySearch />

      {history.length ? (
        <div className="card">
          <h3 className="text-lg font-semibold mb-2">ייבואים קודמים</h3>
          <ul className={styles.facts}>
            {history.map((item) => (
              <li key={item.id}>
                {item.source_label ? `${item.source_label} · ` : ''}
                {item.file_name} · {item.row_count.toLocaleString('he-IL')} מסמכים ·{' '}
                {item.status === 'committed'
                  ? `יובא ${new Date(item.committed_at ?? item.uploaded_at).toLocaleDateString('he-IL')}`
                  : 'תצוגה מקדימה בלבד'}
                {item.uploaded_by_name ? ` · ${item.uploaded_by_name}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Where the preview's documents come from: the software, the format, and what a מבנה אחיד file says about itself. */
function SourceFacts({ summary }: { summary: LegacySummary }) {
  const source = summary.source;
  if (!source) return null;
  const uniform = source.uniform;
  const unknown = summary.unknown_types ?? [];
  return (
    <div className="mb-3 space-y-2">
      <div className={styles.sourceFacts}>
        <span>
          תוכנה: <strong className="text-foreground">{source.label}</strong>
        </span>
        <span>{FORMAT_LABELS[source.format] ?? source.format}</span>
        {uniform ? (
          <>
            {uniform.business_name || uniform.vat_number ? (
              <span>
                העסק בקובץ: {uniform.business_name} {uniform.vat_number ? `(${uniform.vat_number})` : ''}
              </span>
            ) : null}
            {uniform.software ? <span>נוצר ב: {uniform.software} {uniform.software_version}</span> : null}
            {uniform.period_start ? (
              <span>
                תקופה: {formatLegacyDate(uniform.period_start)} – {formatLegacyDate(uniform.period_end)}
              </span>
            ) : null}
            <span>
              רשומות: {uniform.records.C100.toLocaleString('he-IL')} מסמכים, {uniform.records.D110.toLocaleString('he-IL')}{' '}
              שורות, {uniform.records.D120.toLocaleString('he-IL')} תשלומים
            </span>
          </>
        ) : null}
      </div>
      {uniform?.warnings.length ? (
        <ul className="text-sm text-amber-700">
          {uniform.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {unknown.length ? (
        <p className="text-sm text-amber-700">
          סוגי מסמכים לא מוכרים לא יובאו:{' '}
          {unknown.map((u) => `${u.label} (${u.count.toLocaleString('he-IL')})`).join(' · ')}. אפשר לשייך אותם לסוג
          ב&quot;שינוי מיפוי העמודות&quot;.
        </p>
      ) : null}
      {source.columns?.fixed_doc_type ? (
        <p className="text-xs text-muted-foreground">
          כל המסמכים בקובץ נקראו כ{LEGACY_DOC_TYPE_LABELS[source.columns.fixed_doc_type as LegacyDocType] ?? ''}.
        </p>
      ) : null}
    </div>
  );
}

/** A failed upload in words: the reason a file could not be packed, or what the server said. */
function uploadError(e: unknown): string {
  return e instanceof ImportFileTooBigError ? e.message : readableError(e, 'קריאת הקובץ נכשלה');
}

/**
 * The invoices the software still shows as unpaid. They are not imported —
 * they are collected and closed where they were issued — so the office takes
 * the list with it as a file.
 */
function OpenInvoices({ open }: { open: { count: number; total: string; rows: LegacyOpenInvoice[] } }) {
  function download() {
    const blob = new Blob([openInvoicesCsv(open.rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'חשבוניות-פתוחות.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div>
          <h3 className="text-lg font-semibold">חשבוניות פתוחות — לא נכנסות</h3>
          <p className="text-sm text-muted-foreground">
            {open.count.toLocaleString('he-IL')} חשבוניות שעדיין פתוחות בתוכנה, בסך{' '}
            <span className="tabular-nums">₪{Number(open.total).toLocaleString('he-IL', { minimumFractionDigits: 2 })}</span>.
            הן לא מיובאות: גובים וסוגרים אותן בתוכנה שהפיקה אותן. חשבונית שתיסגר תיכנס בייבוא הבא. הלקוחות שלהן
            נפתחים כרגיל.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={download}>
          <Download className="h-4 w-4 ml-2" aria-hidden="true" />
          הורדה כקובץ
        </Button>
      </div>
      <div className="table-scroll">
        <table className="table table-compact">
          <thead>
            <tr className="bg-muted/50">
              <th>מספר</th>
              <th>תאריך</th>
              <th>לקוח</th>
              <th>סכום</th>
              <th className="col-hide-mobile">פרטים</th>
            </tr>
          </thead>
          <tbody>
            {open.rows.map((row) => (
              <tr key={`${row.doc_type}-${row.number}`}>
                <td className="tabular-nums">
                  {row.original_number || row.number}
                  <span className="block text-xs text-muted-foreground">{row.type_label}</span>
                </td>
                <td className="tabular-nums">{formatLegacyDate(row.date)}</td>
                <td>
                  {row.customer_name}
                  {row.id_number ? <span className="block text-xs text-muted-foreground tabular-nums">{row.id_number}</span> : null}
                </td>
                <td className="tabular-nums">₪{Number(row.invoice_total).toLocaleString('he-IL', { minimumFractionDigits: 2 })}</td>
                <td className="col-hide-mobile text-xs">{row.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open.count > open.rows.length ? (
        <p className="text-xs text-muted-foreground mt-2">
          מוצגות {open.rows.length.toLocaleString('he-IL')} הראשונות; הסכום והספירה כוללים את כולן.
        </p>
      ) : null}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value.toLocaleString('he-IL')}</span>
      <span className={styles.statLabel}>{label}</span>
      {hint ? <span className={styles.statHint}>{hint}</span> : null}
    </div>
  );
}

/** A lookup in everything already imported: a name, a number, a phone, a ת"ז, or words from the details. */
function HistorySearch() {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ count: number; truncated: boolean; results: LegacyDocument[] } | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try {
      setFound(await fetchLegacyDocuments({ q: q.trim() }));
    } catch (err) {
      toast.error(readableError(err, 'החיפוש נכשל'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-2">חיפוש בהיסטוריה מתוכנות קודמות</h3>
      <form className="flex gap-2" onSubmit={search}>
        <input
          className="input"
          placeholder='שם, מספר מסמך, טלפון, ת"ז או מילה מהפרטים'
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit" variant="outline" disabled={busy || !q.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </form>
      {found ? (
        found.count === 0 ? (
          <p className="text-sm text-muted-foreground mt-3">לא נמצאו מסמכים</p>
        ) : (
          <div className="table-scroll mt-3">
            <LegacyDocumentsTable documents={found.results} showCustomer />
            {found.truncated ? (
              <p className="text-xs text-muted-foreground mt-2">
                מוצגים {found.results.length} מתוך {found.count}. צמצמו את החיפוש.
              </p>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}
