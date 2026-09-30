'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  LEGACY_DOC_TYPE_LABELS,
  columnMappingProblems,
  columnOptionLabel,
  setColumn,
  typeValueRows,
  type LegacyColumnMapping,
  type LegacyColumnsInfo,
  type LegacyDocType,
} from '@/lib/legacyImportApi';
import styles from './import.module.css';

const DOC_TYPES = Object.entries(LEGACY_DOC_TYPE_LABELS) as [LegacyDocType, string][];

/**
 * מיפוי עמודות — another software's table: which column holds what. It opens
 * with the server's suggestion (by the headers' names, Hebrew or English); the
 * office confirms or changes each field, and the preview reads the file with
 * exactly this. A column holds one field; a column that looks like a password
 * or a birth date is not offered at all.
 */
export default function ColumnMappingStep({
  info,
  mapping,
  onMapping,
  fixedDocType,
  onFixedDocType,
  typeValues,
  onTypeValues,
  busy,
  onPreview,
}: {
  info: LegacyColumnsInfo;
  mapping: LegacyColumnMapping;
  onMapping: (mapping: LegacyColumnMapping) => void;
  fixedDocType: LegacyDocType | '';
  onFixedDocType: (type: LegacyDocType | '') => void;
  typeValues: Record<string, LegacyDocType>;
  onTypeValues: (values: Record<string, LegacyDocType>) => void;
  busy: boolean;
  onPreview: () => void;
}) {
  const problems = columnMappingProblems(mapping, fixedDocType);
  const columns = info.columns.filter((c) => !c.sensitive);
  const hidden = info.columns.length - columns.length;
  const typeRows = typeValueRows(info, mapping, typeValues);

  return (
    <section className="card">
      <h3 className="text-lg font-semibold mb-1">מיפוי עמודות</h3>
      <p className="text-sm text-muted-foreground mb-3">
        {info.rows.toLocaleString('he-IL')} שורות בקובץ. ההצעה נקבעה לפי שמות העמודות — בדקו כל שורה ושנו לפי הצורך.
        עמודה שלא נבחרה לא נקראת ולא נשמרת.
        {hidden ? ` ${hidden} עמודות עם מידע רגיש (סיסמה, תאריך לידה) אינן מוצגות ואינן נקראות.` : ''}
      </p>
      <div className="table-scroll">
        <table className="table table-compact">
          <thead>
            <tr className="bg-muted/50">
              <th>שדה בקוגו</th>
              <th>עמודה בקובץ</th>
            </tr>
          </thead>
          <tbody>
            {info.fields.map((field) => (
              <tr key={field.key}>
                <td>
                  {field.label}
                  {field.required ? <span className="text-red-600"> *</span> : null}
                  {field.hint ? <span className="block text-xs text-muted-foreground">{field.hint}</span> : null}
                </td>
                <td>
                  <Select
                    aria-label={`עמודה עבור ${field.label}`}
                    className={styles.columnSelect}
                    value={mapping[field.key] ?? ''}
                    onChange={(e) =>
                      onMapping(setColumn(mapping, field.key, e.target.value === '' ? null : Number(e.target.value)))
                    }
                  >
                    <option value="">— לא בקובץ —</option>
                    {columns.map((column) => (
                      <option key={column.index} value={column.index}>
                        {columnOptionLabel(column)}
                      </option>
                    ))}
                  </Select>
                  {field.key === 'doc_type' && mapping.doc_type == null ? (
                    <Select
                      aria-label="סוג אחד לכל הקובץ"
                      className={`${styles.columnSelect} mt-2`}
                      value={fixedDocType}
                      onChange={(e) => onFixedDocType(e.target.value as LegacyDocType | '')}
                    >
                      <option value="">סוג אחד לכל הקובץ…</option>
                      {DOC_TYPES.map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {typeRows.length ? (
        <div className="mt-4">
          <h4 className="font-semibold text-sm mb-1">סוגי המסמכים בקובץ</h4>
          <p className="text-xs text-muted-foreground mb-2">
            כל ערך בעמודת הסוג וסוג המסמך שהוא יהיה בקוגו. ערך בלי סוג לא ייובא — שורותיו יופיעו כ&quot;לא נקראו&quot;.
          </p>
          <div className="table-scroll">
            <table className="table table-compact">
              <thead>
                <tr className="bg-muted/50">
                  <th>בקובץ</th>
                  <th>שורות</th>
                  <th>בקוגו</th>
                </tr>
              </thead>
              <tbody>
                {typeRows.map((row) => (
                  <tr key={row.value} className={row.docType ? undefined : styles.flagged}>
                    <td>{row.value}</td>
                    <td className="tabular-nums">{row.count.toLocaleString('he-IL')}</td>
                    <td>
                      <Select
                        aria-label={`סוג עבור ${row.value}`}
                        className={styles.select}
                        value={row.docType}
                        onChange={(e) => {
                          const next = { ...typeValues };
                          if (e.target.value) next[row.value] = e.target.value as LegacyDocType;
                          else delete next[row.value];
                          onTypeValues(next);
                        }}
                      >
                        {row.recognised ? null : <option value="">לא מוכר — לא ייובא</option>}
                        {DOC_TYPES.map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {problems.length ? (
        <p className="text-sm text-amber-700 mt-3">חסר: {problems.join(' · ')}</p>
      ) : null}
      <div className="flex justify-end mt-3">
        <Button variant="gradient" onClick={onPreview} disabled={busy || problems.length > 0}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
          {busy ? 'קורא את הקובץ…' : 'הצג תצוגה מקדימה'}
        </Button>
      </div>
    </section>
  );
}
