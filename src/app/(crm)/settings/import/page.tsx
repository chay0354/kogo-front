'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileUp, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select } from '@/components/ui/select';
import LegacyDocumentsTable from '@/components/LegacyHistory/LegacyDocumentsTable';
import { readableError } from '@/lib/apiError';
import {
  applyMappingChange,
  branchAllowed,
  categoriesFor,
  commitConfirmText,
  commitLegacyImport,
  fetchLegacyDocuments,
  fetchLegacyImports,
  formatLegacyDate,
  importFileProblem,
  initialMapping,
  mappingProgress,
  numberingLine,
  previewLegacyImport,
  type LegacyCommitResult,
  type LegacyDocument,
  type LegacyImport,
  type LegacyMapping,
  type LegacyTarget,
} from '@/lib/legacyImportApi';
import styles from './import.module.css';

const KIND_LABELS: Record<string, string> = {
  branch: 'סניף',
  section: 'סעיף',
  expenses: 'הוצאות',
  unknown: 'לא ידוע',
};

/**
 * ייבוא מהתוכנה הקודמת. The owner's export from his previous invoicing
 * software becomes kogo's business customers and a read-only history of
 * every document it issued: upload → preview (what would happen, and where
 * each old location goes) → confirm → result. Nothing is written before the
 * confirm, and confirming the same file again changes nothing.
 */
export default function SettingsImportPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const queryClient = useQueryClient();

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

  const summary = preview?.summary;
  const options = summary?.options;
  const progress = useMemo(
    () => (summary ? mappingProgress(summary.locations, mapping) : null),
    [summary, mapping],
  );

  async function upload() {
    const problem = importFileProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const next = await previewLegacyImport(file as File);
      setPreview(next);
      setMapping(initialMapping(next.summary.locations));
      setIncludeParents(false);
    } catch (e) {
      setError(readableError(e, 'קריאת הקובץ נכשלה'));
    } finally {
      setUploading(false);
    }
  }

  async function commit() {
    if (!preview) return;
    try {
      const done = await commitLegacyImport(preview.id, mapping, includeParents);
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
        <h2 className="text-xl font-semibold">ייבוא מהתוכנה הקודמת</h2>
        <p className="text-sm text-muted-foreground">
          קובץ הייצוא של המסמכים (‎.xls) הופך ללקוחות העסקיים של קוגו ולהיסטוריה של כל מסמך שהופק. המסמכים לא מופקים
          מחדש, לא נכנסים לרצף המספור של קוגו ולא לדוחות — הם נשמרים כדי לראות מה הופק לכל לקוח.
        </p>
      </div>

      {/* 1. Upload */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <label className={styles.fileLabel}>
            <FileUp className="h-4 w-4" aria-hidden="true" />
            <span>{file ? file.name : 'בחירת קובץ ‎.xls'}</span>
            <input
              type="file"
              accept=".xls,application/vnd.ms-excel"
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError('');
              }}
            />
          </label>
          <Button variant="gradient" onClick={upload} disabled={!file || uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
            {uploading ? 'קורא את הקובץ…' : 'הצג תצוגה מקדימה'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          עד 4.3MB. הסיסמה לאפליקציה, תאריך הלידה, הפקס והטלפון בבית שבקובץ אינם נקראים ואינם נשמרים.
        </p>
        {error ? <p className="text-sm text-red-600 mt-2">{error}</p> : null}
      </div>

      {result ? (
        <div className="card" role="status">
          <h3 className="text-lg font-semibold mb-2">הייבוא הושלם</h3>
          <ul className={styles.facts}>
            <li>
              לקוחות עסקיים: <strong>{result.customers.created}</strong> נפתחו, <strong>{result.customers.updated}</strong>{' '}
              עודכנו, {result.customers.unchanged} ללא שינוי
            </li>
            <li>
              מסמכים: <strong>{result.documents.created.toLocaleString('he-IL')}</strong> נשמרו,{' '}
              {result.documents.updated.toLocaleString('he-IL')} עודכנו, {result.documents.unchanged.toLocaleString('he-IL')} ללא
              שינוי · {result.documents.linked_to_customers.toLocaleString('he-IL')} מקושרים ללקוח עסקי
            </li>
            {result.customers.skipped_deleted ? (
              <li>{result.customers.skipped_deleted} לקוחות שנמחקו בתוכנה הקודמת לא נפתחו</li>
            ) : null}
          </ul>
          <p className="text-sm text-muted-foreground mt-2">
            ההיסטוריה של כל לקוח מופיעה באשף &quot;מסמך חדש&quot; כשבוחרים אותו, תחת &quot;היסטוריה מהתוכנה הקודמת&quot;.
          </p>
        </div>
      ) : null}

      {summary && options && !result ? (
        <>
          {/* 2. Summary */}
          <section className="card">
            <h3 className="text-lg font-semibold mb-3">סיכום</h3>
            <div className={styles.stats}>
              <Stat label="מסמכים" value={summary.documents.total} hint={`${formatLegacyDate(summary.documents.first_date)} – ${formatLegacyDate(summary.documents.last_date)}`} />
              <Stat label="לקוחות עסקיים חדשים" value={summary.customers.business_create} />
              <Stat label="לקוחות עסקיים קיימים שיעודכנו" value={summary.customers.business_update} />
              <Stat label="הורים משלמי מנוי" value={summary.customers.parents} />
              <Stat label="כבר יובאו בעבר" value={summary.documents.already_imported} hint="יעודכנו, לא ישוכפלו" />
            </div>
            {summary.documents.skipped ? (
              <p className="text-sm text-amber-700 mt-3">
                {summary.documents.skipped} שורות לא נקראו (שורות:{' '}
                {summary.documents.skipped_rows.map((s) => `${s.row} — ${s.reason}`).join(' · ')})
              </p>
            ) : null}
          </section>

          {/* 3. Numbering */}
          <section className="card">
            <h3 className="text-lg font-semibold mb-2">מספור לפי סוג מסמך</h3>
            <div className={styles.warning} role="note">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                הקובץ מכיל רק חלק מכל רצף מספרים של התוכנה הקודמת — רק את המסמכים של הלקוחות שבייצוא — ולכן יש בו
                פערים. &quot;המספר האחרון&quot; כאן הוא האחרון שבקובץ, לא בהכרח האחרון שהופק. לפני שקוגו ממשיך רצף כלשהו,
                יש לאשר בתוכנה הקודמת את המספר האחרון של כל סוג מסמך.
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
                          <span className="block text-xs text-muted-foreground">בתוכנה הקודמת: {row.original_labels.join(', ')}</span>
                        ) : null}
                      </td>
                      <td className="tabular-nums">{row.count.toLocaleString('he-IL')}</td>
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

          {/* 4. Customers */}
          <section className="card">
            <h3 className="text-lg font-semibold mb-2">לקוחות</h3>
            <p className="text-sm text-muted-foreground mb-3">
              לקוח עסקי הוא מי שהופק לו מסמך ידני, ששילם שלא בכרטיס אשראי, שיש לו מספר חברה או ששמו של ארגון. לקוח שכבר
              קיים בקוגו (לפי ח&quot;פ/ת&quot;ז, אימייל, או טלפון ושם) מתעדכן: שדות ריקים מתמלאים והשם האחרון גובר.
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
                        {c.latest.type_label} {c.latest.number} · {formatLegacyDate(c.latest.date)}
                      </td>
                      <td className="col-hide-mobile text-xs text-muted-foreground">{c.reasons.join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className={styles.parents}>
              <input type="checkbox" checked={includeParents} onChange={(e) => setIncludeParents(e.target.checked)} />
              <span>
                לפתוח גם את {summary.customers.parents.toLocaleString('he-IL')} ההורים משלמי המנוי כלקוחות עסקיים
                <span className="block text-xs text-muted-foreground">
                  בדרך כלל הם כבר קיימים בקוגו כמשפחות ({summary.customers.parents_matching_family.toLocaleString('he-IL')} מהם
                  נמצאו לפי טלפון או אימייל). בלי הסימון המסמכים שלהם נשמרים בהיסטוריה בלבד.
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
            title="לייבא מהתוכנה הקודמת?"
            message={commitConfirmText(summary, includeParents, mapping)}
            confirmText="ייבוא"
            type="question"
          />
        </>
      ) : null}

      <HistorySearch />

      {history.length ? (
        <div className="card">
          <h3 className="text-lg font-semibold mb-2">ייבואים קודמים</h3>
          <ul className={styles.facts}>
            {history.map((item) => (
              <li key={item.id}>
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
      <h3 className="text-lg font-semibold mb-2">חיפוש בהיסטוריה מהתוכנה הקודמת</h3>
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
