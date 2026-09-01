'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ListSkeleton, Skeleton } from '@/components/ui/skeleton';
import {
  bulkSendWhatsAppAutomation,
  fetchWhatsAppAutomations,
  fetchWhatsAppContacts,
  fetchWhatsAppStatus,
  whatsappContactKey,
  type BulkFlowResult,
  type WhatsAppAutomation,
  type WhatsAppContact,
} from '@/lib/whatsappApi';
import api, { fetchCourseTypesList, fetchInstructorsDropdown } from '@/lib/api';
import { MessageCircle, RefreshCw, Search, Send, Zap } from 'lucide-react';
import { toast } from 'sonner';

function automationOptionValue(a: WhatsAppAutomation) {
  return `${a.automation_type}:${a.automation_id}`;
}

function parseAutomationValue(value: string): WhatsAppAutomation | null {
  const idx = value.indexOf(':');
  if (idx < 0) return null;
  const automation_type = value.slice(0, idx) as 'kind' | 'flow';
  const automation_id = value.slice(idx + 1);
  if (automation_type !== 'kind' && automation_type !== 'flow') return null;
  return { automation_type, automation_id, flow_ns: automation_id, label: '' };
}

export default function WhatsAppPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [pageName, setPageName] = useState<string | null>(null);
  const [apiError, setApiError] = useState('');

  const [automations, setAutomations] = useState<WhatsAppAutomation[]>([]);
  const [loadingAutomations, setLoadingAutomations] = useState(true);
  const [selectedAutomationValue, setSelectedAutomationValue] = useState('');

  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [courseTypeFilter, setCourseTypeFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [instructorFilter, setInstructorFilter] = useState('all');
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [courseTypes, setCourseTypes] = useState<{ id: string; name: string }[]>([]);
  const [courses, setCourses] = useState<{ id: string; name: string; branch_name?: string }[]>([]);
  const [instructors, setInstructors] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());

  const [result, setResult] = useState<BulkFlowResult | null>(null);
  const [sending, setSending] = useState(false);

  const selectedAutomation = useMemo(() => {
    if (!selectedAutomationValue) return null;
    const parsed = parseAutomationValue(selectedAutomationValue);
    if (!parsed) return null;
    return (
      automations.find(
        (a) =>
          a.automation_type === parsed.automation_type &&
          a.automation_id === parsed.automation_id
      ) ?? null
    );
  }, [selectedAutomationValue, automations]);

  const recipients = useMemo(
    () => contacts.filter((c) => selectedKeys.has(whatsappContactKey(c))),
    [contacts, selectedKeys]
  );

  const loadStatus = useCallback(async () => {
    try {
      const s = await fetchWhatsAppStatus();
      setConfigured(s.configured);
      setPageName(s.page_name || null);
      if (!s.configured) {
        setApiError(s.error || 'ManyChat לא מוגדר — הוסף MANYCHAT_KEY ל-.env בשרת');
      } else {
        setApiError('');
      }
    } catch {
      setConfigured(false);
      setApiError('לא ניתן להתחבר ל-API');
    }
  }, []);

  const loadAutomations = useCallback(async () => {
    setLoadingAutomations(true);
    try {
      const data = await fetchWhatsAppAutomations();
      const list = data.automations || [];
      setAutomations(list);
      setSelectedAutomationValue((prev) =>
        prev || (list[0] ? automationOptionValue(list[0]) : '')
      );
    } catch {
      toast.error('שגיאה בטעינת אוטומציות');
      setAutomations([]);
    } finally {
      setLoadingAutomations(false);
    }
  }, []);

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      const list = await fetchWhatsAppContacts({
        q: search.trim() || undefined,
        branch_id: branchFilter !== 'all' ? branchFilter : undefined,
        course_type_id: courseTypeFilter !== 'all' ? courseTypeFilter : undefined,
        course_id: courseFilter !== 'all' ? courseFilter : undefined,
        instructor_id: instructorFilter !== 'all' ? instructorFilter : undefined,
      });
      setContacts(list);
    } catch {
      toast.error('שגיאה בטעינת אנשי קשר');
    } finally {
      setLoadingContacts(false);
    }
  }, [search, branchFilter, courseTypeFilter, courseFilter, instructorFilter]);

  const loadFilterOptions = useCallback(async () => {
    const [branchResult, courseTypesResult, instructorsResult] = await Promise.allSettled([
      api.get('/core/branches/?simple=true'),
      fetchCourseTypesList(),
      fetchInstructorsDropdown(),
    ]);

    let failed = false;

    if (branchResult.status === 'fulfilled') {
      const branchData = branchResult.value.data;
      const branchList = Array.isArray(branchData)
        ? branchData
        : Array.isArray(branchData?.results)
          ? branchData.results
          : [];
      setBranches(branchList.map((b: { id: string; name: string }) => ({ id: b.id, name: b.name })));
    } else {
      failed = true;
    }

    if (courseTypesResult.status === 'fulfilled') {
      const ctData = Array.isArray(courseTypesResult.value)
        ? courseTypesResult.value
        : courseTypesResult.value?.results || [];
      setCourseTypes(ctData.map((ct: { id: string; name: string }) => ({ id: ct.id, name: ct.name })));
    } else {
      failed = true;
    }

    if (instructorsResult.status === 'fulfilled') {
      const list = Array.isArray(instructorsResult.value) ? instructorsResult.value : [];
      setInstructors(
        list.map((i: { id: string; first_name?: string; last_name?: string }) => ({
          id: i.id,
          first_name: i.first_name || '',
          last_name: i.last_name || '',
        }))
      );
    } else {
      failed = true;
    }

    if (failed) {
      toast.error('שגיאה בטעינת מסננים');
    }
  }, []);

  // Group (course) list, narrowed by the selected branch / course type filters
  const loadCourses = useCallback(async () => {
    try {
      const res = await api.get('/courses/courses/', {
        params: {
          ...(branchFilter !== 'all' ? { branch_id: branchFilter } : {}),
          ...(courseTypeFilter !== 'all' ? { course_type: courseTypeFilter } : {}),
        },
      });
      const data = Array.isArray(res.data) ? res.data : res.data?.results || [];
      setCourses(
        data.map((c: { id: string; name: string; branch_name?: string }) => ({
          id: c.id,
          name: c.name,
          branch_name: c.branch_name,
        }))
      );
    } catch {
      setCourses([]);
    }
  }, [branchFilter, courseTypeFilter]);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  // Reset group selection when its parent filters change
  useEffect(() => {
    setCourseFilter('all');
  }, [branchFilter, courseTypeFilter]);

  useEffect(() => {
    loadStatus();
    loadFilterOptions();
  }, [loadStatus, loadFilterOptions]);

  useEffect(() => {
    if (configured) {
      loadAutomations();
    }
  }, [configured, loadAutomations]);

  useEffect(() => {
    const t = setTimeout(() => loadContacts(), 300);
    return () => clearTimeout(t);
  }, [loadContacts]);

  const toggleSelected = (contact: WhatsAppContact) => {
    const key = whatsappContactKey(contact);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedKeys(new Set(contacts.map(whatsappContactKey)));
  };

  const clearSelection = () => setSelectedKeys(new Set());

  const runBroadcast = async (dryRun: boolean) => {
    if (!selectedAutomation) {
      toast.error('בחר אוטומציה לשליחה');
      return;
    }
    if (recipients.length === 0) {
      toast.error('בחר לפחות נמען אחד');
      return;
    }

    setSending(true);
    setResult(null);
    try {
      const data = await bulkSendWhatsAppAutomation({
        automation_type: selectedAutomation.automation_type,
        automation_id: selectedAutomation.automation_id,
        contacts: recipients.map((c) => ({
          phone: c.phone,
          name: c.name,
          ...(c.branch_name ? { branch_name: c.branch_name } : {}),
        })),
        dry_run: dryRun,
      });
      setResult(data);
      if (dryRun) {
        toast.info(`תצוגה מקדימה: ${data.preview_count ?? data.total} נמענים`);
      } else {
        toast.success(`נשלחו ${data.sent} אוטומציות, ${data.failed} נכשלו`);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'שגיאה בשליחה';
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <AppLayout>
      <div dir="rtl" className="space-y-4 max-w-5xl mx-auto">
        <PageHeader
          title="WhatsApp"
          description={
            configured
              ? `שליחת אוטומציית ManyChat לכמה נמענים${pageName ? ` · ${pageName}` : ''}`
              : 'ממתין להגדרת ManyChat בשרת'
          }
        />

        {apiError && configured === false && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {apiError}
          </div>
        )}

        {/* Step 1: automation */}
        <section className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <Zap className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">1. בחר אוטומציה</h2>
          </div>
          {loadingAutomations ? (
            <div className="space-y-3" aria-busy="true" aria-label="טוען אוטומציות">
              <Skeleton className="h-3 w-56" />
              <Skeleton className="h-11 rounded-md" />
            </div>
          ) : automations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              לא נמצאו אוטומציות פעילות ב-ManyChat. ודא שהן מוגדרות ב-.env או שמותיהן תואמים.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {automations.length} אוטומציות מ-ManyChat (כולל כל מה שמופיע בחשבון)
              </p>
              <select
                value={selectedAutomationValue}
                onChange={(e) => setSelectedAutomationValue(e.target.value)}
                disabled={!configured}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                {automations.map((a) => (
                  <option key={automationOptionValue(a)} value={automationOptionValue(a)}>
                    {a.kogo_label && a.kogo_label !== a.label
                      ? `${a.label} · ${a.kogo_label}`
                      : a.label}
                  </option>
                ))}
              </select>
              {selectedAutomation?.needs_enrollment_context && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  אוטומציה זו משתמשת בשדות חוג/ילד. בשליחה ידנית יישלחו שמות ההורים מהרשימה; פרטי
                  החוג יסומנו כלליים — לשליחה מדויקת השתמשו בזרימת המערכת הרגילה.
                </p>
              )}
            </>
          )}
        </section>

        {/* Step 2: recipients */}
        <section className="rounded-xl border bg-card overflow-hidden shadow-sm">
          <div className="p-4 border-b bg-muted/20 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">2. בחר נמענים</h2>
              </div>
              <span className="text-sm text-muted-foreground">
                נבחרו: <strong>{recipients.length}</strong>
              </span>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="חיפוש שם או טלפון..."
                  className="pr-9"
                />
              </div>
              <Button type="button" variant="outline" size="sm" className="h-9 w-9 px-0" onClick={() => loadContacts()} aria-label="רענן">
                <RefreshCw className={`h-4 w-4 ${loadingContacts ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">כל הסניפים</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
              <select
                value={courseTypeFilter}
                onChange={(e) => setCourseTypeFilter(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">כל התחומים</option>
                {courseTypes.map((courseType) => (
                  <option key={courseType.id} value={courseType.id}>
                    {courseType.name}
                  </option>
                ))}
              </select>
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">כל הקבוצות</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.branch_name && branchFilter === 'all'
                      ? `${course.name} · ${course.branch_name}`
                      : course.name}
                  </option>
                ))}
              </select>
              <select
                value={instructorFilter}
                onChange={(e) => setInstructorFilter(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">כל המדריכים</option>
                {instructors.map((instructor) => (
                  <option key={instructor.id} value={instructor.id}>
                    {`${instructor.first_name} ${instructor.last_name}`.trim()}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={selectAllVisible}>
                סמן הכל
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                נקה בחירה
              </Button>
            </div>
          </div>

          <div className="max-h-[320px] overflow-y-auto divide-y">
            {loadingContacts ? (
              <ListSkeleton rows={5} className="p-3" label="טוען אנשי קשר" />
            ) : contacts.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">לא נמצאו אנשי קשר עם טלפון</p>
            ) : (
              contacts.map((c) => {
                const key = whatsappContactKey(c);
                const checked = selectedKeys.has(key);
                return (
                  <label
                    key={key}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 ${
                      checked ? 'bg-primary/5' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelected(c)}
                      className="h-4 w-4 accent-primary shrink-0"
                    />
                    <div className="flex-1 min-w-0 text-right">
                      <div className="font-medium text-sm truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.phone}</div>
                      {c.branch_name && (
                        <div className="text-xs text-muted-foreground truncate">{c.branch_name}</div>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </section>

        {/* Step 3: send */}
        <section className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold">3. שלח תפוצה</h2>
          <p className="text-sm text-muted-foreground">
            {selectedAutomation ? (
              <>
                אוטומציה: <strong>{selectedAutomation.label}</strong> · נמענים:{' '}
                <strong>{recipients.length}</strong>
              </>
            ) : (
              'בחר אוטומציה ונמענים לפני השליחה'
            )}
          </p>

          {result && (
            <div className="text-sm rounded-md border bg-muted/30 p-3">
              {result.dry_run ? 'תצוגה מקדימה' : 'נשלח'}:{' '}
              {result.preview_count ?? result.sent} / {result.total}
              {!result.dry_run && result.failed > 0 && (
                <span className="text-destructive"> · {result.failed} נכשלו</span>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={
                !configured ||
                sending ||
                !selectedAutomation ||
                recipients.length === 0
              }
              onClick={() => runBroadcast(true)}
            >
              תצוגה מקדימה
            </Button>
            <Button
              type="button"
              className="flex-1 gap-2"
              disabled={
                !configured ||
                sending ||
                !selectedAutomation ||
                recipients.length === 0
              }
              onClick={() => {
                if (
                  !window.confirm(
                    `לשלוח את "${selectedAutomation?.label}" ל-${recipients.length} נמענים?`
                  )
                ) {
                  return;
                }
                runBroadcast(false);
              }}
            >
              <Send className="h-4 w-4" />
              שלח אוטומציה
            </Button>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
