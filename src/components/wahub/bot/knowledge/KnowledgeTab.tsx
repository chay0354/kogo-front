'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import {
  HOURS_KINDS,
  KNOWLEDGE_TAB_KINDS,
  SCOPE_LEVELS,
  filterKnowledge,
  groupKnowledgeByKind,
  kindDef,
} from '@/lib/wahub/bot';
import { israelToday } from '@/lib/wahub/format';
import {
  createWahubKnowledge,
  deleteWahubKnowledge,
  restoreWahubKnowledge,
  updateWahubKnowledge,
} from '@/lib/wahubApi';
import type { WahubKnowledgeItem, WahubKnowledgeKind, WahubKnowledgeWrite, WahubScopeLevel } from '@/types/wahub';
import { useKnowledgeCache, useWahubKnowledge } from '../../hooks/useBotQueries';
import { useNow } from '../../hooks/useNow';
import { EmptyState, ErrorState, Skeleton } from '../../shared/bits';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import AddWizard from './AddWizard';
import FromKogoBlock from './FromKogoBlock';
import KnowledgeCard from './KnowledgeCard';
import KnowledgeEditor from './KnowledgeEditor';
import KnowledgeList from './KnowledgeList';

interface KnowledgeTabProps {
  /** An item named in the address (a link from a shadow reply): opened, and scrolled to. */
  openItemId: number | null;
  onOpenItem: (id: number | null) => void;
  /** "נסה שאלה" with a question already in the box. */
  onTryQuestion: (question: string) => void;
}

type Adding = { kind: WahubKnowledgeKind; preset: Partial<WahubKnowledgeItem> } | null;

const NO_ITEMS: WahubKnowledgeItem[] = [];

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="טוען את הידע">
      {[0, 1, 2].map((card) => (
        <div key={card} className={s.card}>
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="mt-3 h-9" />
          <Skeleton className="mt-2 h-9" />
        </div>
      ))}
    </div>
  );
}

/**
 * The knowledge: the list by kind, a search, the filters, an item's card and
 * its editor inside the page, the "where does it belong" questionnaire for a
 * new one, and the read-only block of what comes from Kogo.
 */
export default function KnowledgeTab({ openItemId, onOpenItem, onTryQuestion }: KnowledgeTabProps) {
  const now = useNow(60_000);
  const today = israelToday(now);
  const cache = useKnowledgeCache();

  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<WahubKnowledgeKind | ''>('');
  const [scopeLevel, setScopeLevel] = useState<WahubScopeLevel | ''>('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState<Adding>(null);
  const [wizard, setWizard] = useState(false);
  const [fromKogo, setFromKogo] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const query = useWahubKnowledge(includeInactive ? {} : { active: true });
  const items = query.data ?? NO_ITEMS;

  const visible = useMemo(
    () => filterKnowledge(items, { search, kind, scopeLevel, includeInactive }).filter((item) => !HOURS_KINDS.includes(item.kind)),
    [items, search, kind, scopeLevel, includeInactive],
  );
  const groups = useMemo(() => groupKnowledgeByKind(visible, kind ? KNOWLEDGE_TAB_KINDS.filter((def) => def.kind === kind) : KNOWLEDGE_TAB_KINDS), [visible, kind]);
  const filled = groups.filter((group) => group.items.length > 0);
  const empty = groups.filter((group) => group.items.length === 0);
  const filtering = Boolean(search.trim() || kind || scopeLevel);
  const countByKind = useMemo(() => {
    const map = new Map<WahubKnowledgeKind, number>();
    for (const item of items) if (!HOURS_KINDS.includes(item.kind) && (includeInactive || item.is_active)) map.set(item.kind, (map.get(item.kind) ?? 0) + 1);
    return map;
  }, [items, includeInactive]);

  // An item named in the address: once the list holds it, bring it into view.
  useEffect(() => {
    if (openItemId == null || !items.some((item) => item.id === openItemId)) return;
    const element = document.getElementById(`wahub-knowledge-${openItemId}`);
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [openItemId, items]);

  // The named item may be inactive, or of a kind the filter hides: widen the view so it can be seen.
  useEffect(() => {
    if (openItemId == null) return;
    const item = items.find((entry) => entry.id === openItemId);
    if (!item) return;
    if (!item.is_active) setIncludeInactive(true);
    if (kind && kind !== item.kind) setKind('');
  }, [openItemId, items, kind]);

  async function save(body: WahubKnowledgeWrite, id: number | null) {
    setSaving(true);
    try {
      const saved = id == null ? await createWahubKnowledge(body) : await updateWahubKnowledge(id, body);
      cache.put(saved);
      cache.invalidate();
      setEditingId(null);
      setAdding(null);
      onOpenItem(saved.id);
      toast.success(id == null ? `נוספה רשומה: ${saved.title}` : 'השינוי נשמר');
      if (id == null && body.kind === 'fact' && saved.title) {
        toast(`לבדוק מה הבוט עונה על "${saved.title}"?`, {
          action: { label: 'נסה שאלה', onClick: () => onTryQuestion(saved.title) },
        });
      }
    } catch (error) {
      toast.error(readableError(error, 'הרשומה לא נשמרה'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: WahubKnowledgeItem) {
    setBusyId(item.id);
    const before = item;
    cache.put({ ...item, is_active: !item.is_active });
    try {
      if (item.is_active) {
        await deleteWahubKnowledge(item.id);
        if (!includeInactive) onOpenItem(null);
      } else {
        const saved = await updateWahubKnowledge(item.id, { is_active: true });
        cache.put(saved);
      }
      cache.invalidate();
      toast.success(item.is_active ? 'הרשומה הושבתה. הבוט לא משתמש בה יותר.' : 'הרשומה פעילה שוב');
    } catch (error) {
      cache.put(before);
      toast.error(readableError(error, 'השינוי לא נשמר'));
    } finally {
      setBusyId(null);
    }
  }

  async function restore(item: WahubKnowledgeItem, version: number) {
    setBusyId(item.id);
    try {
      const saved = await restoreWahubKnowledge(item.id, version);
      cache.put(saved);
      cache.invalidate();
      toast.success(`שוחזרה גרסה ${version}`);
    } catch (error) {
      toast.error(readableError(error, 'השחזור נכשל'));
    } finally {
      setBusyId(null);
    }
  }

  function startAdd(kind: WahubKnowledgeKind, preset: Partial<WahubKnowledgeItem> = {}) {
    setWizard(false);
    setEditingId(null);
    setAdding({ kind, preset });
    onOpenItem(null);
  }

  return (
    <div className="flex flex-col gap-3.5">
      <section className={cx(s.card, 'flex flex-col gap-2.5')} aria-label="חיפוש וסינון">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className={cx(s.search, 'min-w-[220px] flex-1 !h-[38px]')}>
            <Search aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="חיפוש בידע: כותרת, תוכן, כינוי, טלפון"
              aria-label="חיפוש בידע"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="נקה חיפוש">
                <X aria-hidden="true" />
              </button>
            )}
          </label>
          <select value={scopeLevel} onChange={(event) => setScopeLevel(event.target.value as WahubScopeLevel | '')} aria-label="סינון לפי היקף" className={cx(s.field, '!w-auto')}>
            <option value="">כל ההיקפים</option>
            {SCOPE_LEVELS.map((level) => (
              <option key={level.level} value={level.level}>
                {level.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setWizard((value) => !value);
              setAdding(null);
            }}
            aria-expanded={wizard}
            className={cx(s.btn, s.btnP, '!h-[38px]')}
          >
            <Plus aria-hidden="true" />
            הוסף רשומה
          </button>
        </div>
        <div className={s.chips} role="group" aria-label="סינון לפי סוג">
          <button type="button" aria-pressed={kind === ''} onClick={() => setKind('')} className={cx(s.chipbtn, kind === '' && s.on)}>
            הכול
            <span className={s.cnt}>{Array.from(countByKind.values()).reduce((sum, count) => sum + count, 0)}</span>
          </button>
          {KNOWLEDGE_TAB_KINDS.map((def) => {
            const count = countByKind.get(def.kind) ?? 0;
            const on = kind === def.kind;
            return (
              <button key={def.kind} type="button" aria-pressed={on} onClick={() => setKind(on ? '' : def.kind)} title={def.hint} className={cx(s.chipbtn, on && s.on)}>
                {def.label}
                <span className={s.cnt}>{count}</span>
              </button>
            );
          })}
          <button
            type="button"
            role="switch"
            aria-checked={includeInactive}
            onClick={() => setIncludeInactive((value) => !value)}
            className={cx(s.switchRow, 'ms-auto')}
          >
            <span className={s.switch} aria-hidden="true" />
            הצג גם לא פעילים
          </button>
        </div>
      </section>

      {wizard && (
        <AddWizard
          onPick={startAdd}
          onClose={() => setWizard(false)}
          onShowFromKogo={() => {
            setFromKogo(true);
            setWizard(false);
            window.setTimeout(() => document.getElementById('wahub-from-kogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
          }}
        />
      )}

      {adding && (
        <section className={s.card} aria-label="רשומה חדשה">
          <h3 className="mb-3 text-[15px] font-extrabold">רשומה חדשה: {kindDef(adding.kind).label}</h3>
          <KnowledgeEditor kind={adding.kind} preset={adding.preset} saving={saving} onSave={(body) => void save(body, null)} onCancel={() => setAdding(null)} />
        </section>
      )}

      {query.isLoading ? (
        <ListSkeleton />
      ) : query.isError ? (
        <div className={s.card}>
          <ErrorState title="לא הצלחנו לטעון את הידע" text={readableError(query.error, '')} onRetry={() => void query.refetch()} />
        </div>
      ) : visible.length === 0 ? (
        <div className={s.card}>
          {filtering ? (
            <EmptyState icon={<Search />} title="אין רשומות שמתאימות לסינון">
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setKind('');
                  setScopeLevel('');
                }}
                className={s.btn}
              >
                ניקוי הסינון
              </button>
            </EmptyState>
          ) : (
            <EmptyState icon={<BookOpen />} title="עוד אין ידע" text="הייבוא מהבוט הישן (wahub_import_old_knowledge) ממלא את הרשימה; אפשר גם להוסיף רשומה ביד.">
              <button type="button" onClick={() => setWizard(true)} className={cx(s.btn, s.btnP)}>
                <Plus aria-hidden="true" />
                הוסף רשומה
              </button>
            </EmptyState>
          )}
        </div>
      ) : (
        <>
          <KnowledgeList
            groups={filled}
            openId={openItemId}
            today={today}
            now={now}
            onOpen={(id) => {
              onOpenItem(id);
              if (id !== editingId) setEditingId(null);
            }}
            onAdd={(addKind) => startAdd(addKind)}
            renderOpen={(item) =>
              editingId === item.id ? (
                <div className="px-3 pb-3">
                  <KnowledgeEditor item={item} kind={item.kind} saving={saving} onSave={(body) => void save(body, item.id)} onCancel={() => setEditingId(null)} />
                </div>
              ) : (
                <KnowledgeCard
                  item={item}
                  today={today}
                  now={now}
                  busy={busyId === item.id}
                  onEdit={() => setEditingId(item.id)}
                  onToggleActive={() => void toggleActive(item)}
                  onRestore={(version) => void restore(item, version)}
                />
              )
            }
          />
          {!filtering && empty.length > 0 && (
            <p className={cx(s.t2, 'm-0 flex flex-wrap items-center gap-1.5 px-1')}>
              עוד אין רשומות של:
              {empty.map((group) => (
                <button key={group.kind} type="button" onClick={() => startAdd(group.kind)} className={cx(s.chipbtn, '!h-7')} title={`הוסף ${group.label}`}>
                  <Plus aria-hidden="true" />
                  {group.label}
                </button>
              ))}
            </p>
          )}
        </>
      )}

      <FromKogoBlock open={fromKogo} onToggle={() => setFromKogo((value) => !value)} />
    </div>
  );
}
