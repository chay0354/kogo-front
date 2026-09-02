'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import api from '@/lib/api';
import { createCheckPlan } from '@/lib/documentsApi';
import type { ChildWithDetails } from '@/types/customer';
import styles from './checks.module.css';

interface CheckDraft {
  id: string;
  date: string;
  bank: string;
  branch: string;
  accountNumber: string;
  checkNumber: string;
  amount: string;
}

function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function addMonths(iso: string, months: number) {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return todayISO();
  const next = new Date(year, month - 1 + months, day);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, '0');
  const d = String(next.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function emptyRow(overrides: Partial<CheckDraft> = {}): CheckDraft {
  return {
    id: String(Date.now() + Math.random()),
    date: todayISO(),
    bank: '',
    branch: '',
    accountNumber: '',
    checkNumber: '',
    amount: '',
    ...overrides,
  };
}

interface RegisterChecksDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function RegisterChecksDialog({ open, onClose, onCreated }: RegisterChecksDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [children, setChildren] = useState<ChildWithDetails[]>([]);
  const [child, setChild] = useState<ChildWithDetails | null>(null);
  const [lessonId, setLessonId] = useState('');
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState<CheckDraft[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSearchQuery('');
    setChildren([]);
    setChild(null);
    setLessonId('');
    setDescription('');
    setRows([emptyRow()]);
    setError('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setChildren([]);
      return;
    }
    const handle = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get('/customers/children/', {
          params: { search: q, limit: 20 },
        });
        setChildren(Array.isArray(res.data) ? res.data : res.data?.results ?? []);
      } catch {
        setChildren([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [open, searchQuery]);

  const enrollments = child?.enrollments ?? [];
  const validRows = useMemo(
    () => rows.filter((row) => row.date && Number(row.amount) > 0),
    [rows],
  );
  const total = validRows.reduce((sum, row) => sum + Number(row.amount), 0);

  function updateRow(id: string, field: keyof CheckDraft, value: string) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    const last = rows[rows.length - 1];
    setRows((prev) => [
      ...prev,
      emptyRow({
        date: last?.date ? addMonths(last.date, 1) : todayISO(),
        bank: last?.bank ?? '',
        branch: last?.branch ?? '',
        accountNumber: last?.accountNumber ?? '',
        checkNumber: last?.checkNumber ? String(Number(last.checkNumber) + 1 || '') : '',
        amount: last?.amount ?? '',
      }),
    ]);
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length === 1 ? [emptyRow()] : prev.filter((row) => row.id !== id)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!child) {
      setError('יש לבחור ילד');
      return;
    }
    if (validRows.length === 0) {
      setError('יש למלא לפחות צ׳ק אחד עם תאריך וסכום');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createCheckPlan({
        child_id: child.id,
        lesson_id: lessonId || null,
        description,
        checks: validRows.map((row) => ({
          date: row.date,
          bank: row.bank,
          branch: row.branch,
          account_number: row.accountNumber,
          check_number: row.checkNumber,
          amount: Number(row.amount),
        })),
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string } } })?.response?.data;
      setError(data?.error || 'שגיאה ברישום הצ׳קים');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <form
        className={styles.dialog}
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className={styles.dialogHeader}>
          <div>
            <h3 className={styles.dialogTitle}>רישום צ׳קים</h3>
            <p className={styles.dialogHint}>
              יוצאת קבלה עם פירוט כל הצ׳קים. בכל חודש, בתאריך הצ׳ק, תונפק חשבונית מס אוטומטית.
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="סגור">
            <X size={18} />
          </button>
        </div>

        <label className={styles.fieldLabel} htmlFor="check-child-search">
          חיפוש ילד
        </label>
        <div className={styles.searchRow}>
          <Search size={16} aria-hidden="true" />
          <input
            id="check-child-search"
            type="search"
            className={styles.textInput}
            placeholder="שם ילד או טלפון הורה..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {searching ? <p className={styles.muted}>מחפש...</p> : null}
        {!child && children.length > 0 ? (
          <ul className={styles.childList}>
            {children.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.childOption}
                  onClick={() => {
                    setChild(item);
                    setLessonId(item.enrollments?.[0]?.lesson_id ?? '');
                    setDescription(item.enrollments?.[0]?.course_name ? `מנוי צ׳קים — ${item.enrollments[0].course_name}` : '');
                  }}
                >
                  <strong>{item.full_name}</strong>
                  <span>
                    {item.parent_name || item.family_name}
                    {item.branch_name ? ` · ${item.branch_name}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {child ? (
          <div className={styles.selectedChild}>
            <div>
              <strong>{child.full_name}</strong>
              <p>
                {child.parent_name || child.family_name}
                {child.branch_name ? ` · ${child.branch_name}` : ''}
              </p>
            </div>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => {
                setChild(null);
                setLessonId('');
              }}
            >
              החלף
            </button>
          </div>
        ) : null}

        {child && enrollments.length > 0 ? (
          <>
            <label className={styles.fieldLabel} htmlFor="check-lesson">
              חוג
            </label>
            <select
              id="check-lesson"
              className={styles.selectInput}
              value={lessonId}
              onChange={(e) => {
                setLessonId(e.target.value);
                const enrollment = enrollments.find((item) => item.lesson_id === e.target.value);
                if (enrollment?.course_name) {
                  setDescription(`מנוי צ׳קים — ${enrollment.course_name}`);
                }
              }}
            >
              <option value="">ללא שיוך לחוג</option>
              {enrollments.map((enrollment) => (
                <option key={enrollment.lesson_id} value={enrollment.lesson_id}>
                  {enrollment.course_name}
                  {enrollment.branch_name ? ` · ${enrollment.branch_name}` : ''}
                </option>
              ))}
            </select>
          </>
        ) : null}

        <label className={styles.fieldLabel} htmlFor="check-description">
          תיאור בקבלה
        </label>
        <input
          id="check-description"
          className={styles.textInput}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="מנוי צ׳קים..."
        />

        <p className={styles.fieldLabel}>פרטי הצ׳קים</p>
        <div className={styles.tableWrap}>
          <table className={styles.checkTable}>
            <thead>
              <tr>
                <th>תאריך</th>
                <th>בנק</th>
                <th>סניף</th>
                <th>מס׳ חשבון</th>
                <th>מס׳ צ׳ק</th>
                <th>סכום (₪)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input
                      type="date"
                      className={styles.cellInput}
                      value={row.date}
                      onChange={(e) => updateRow(row.id, 'date', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className={styles.cellInput}
                      value={row.bank}
                      placeholder="בנק"
                      onChange={(e) => updateRow(row.id, 'bank', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className={styles.cellInput}
                      value={row.branch}
                      placeholder="סניף"
                      onChange={(e) => updateRow(row.id, 'branch', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className={styles.cellInput}
                      value={row.accountNumber}
                      placeholder="חשבון"
                      onChange={(e) => updateRow(row.id, 'accountNumber', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className={styles.cellInput}
                      value={row.checkNumber}
                      placeholder="מס׳ צ׳ק"
                      onChange={(e) => updateRow(row.id, 'checkNumber', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={styles.cellInput}
                      value={row.amount}
                      onChange={(e) => updateRow(row.id, 'amount', e.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.removeRowBtn}
                      onClick={() => removeRow(row.id)}
                      aria-label="מחק צ׳ק"
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button type="button" className={styles.addRowBtn} onClick={addRow}>
          <Plus size={14} />
          הוסף צ׳ק
        </button>

        <div className={styles.summaryBar}>
          <span>סה״כ {validRows.length} צ׳קים</span>
          <strong>₪{total.toFixed(2)}</strong>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose} disabled={saving}>
            ביטול
          </button>
          <button type="submit" className={styles.primaryBtn} disabled={saving || !child}>
            {saving ? 'מפיק קבלה...' : 'רישום והפקת קבלה'}
          </button>
        </div>
      </form>
    </div>
  );
}
