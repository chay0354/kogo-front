'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  bulkSendWhatsAppMessage,
  fetchWhatsAppContacts,
  fetchWhatsAppStatus,
  loadTalkedContactKeys,
  whatsappContactKey,
  type BulkSendResult,
  type WhatsAppContact,
} from '@/lib/whatsappApi';
import { Megaphone, MessageCircle, RefreshCw, Search, Send } from 'lucide-react';
import { toast } from 'sonner';

type BulkAudience = 'all' | 'talked' | 'selected';

export default function WhatsAppPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [pageName, setPageName] = useState<string | null>(null);
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [search, setSearch] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [apiError, setApiError] = useState('');

  const [talkedKeys, setTalkedKeys] = useState<Set<string>>(() => new Set());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [bulkText, setBulkText] = useState('');
  const [bulkAudience, setBulkAudience] = useState<BulkAudience>('selected');
  const [bulkPreview, setBulkPreview] = useState<BulkSendResult | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    setTalkedKeys(loadTalkedContactKeys());
  }, []);

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

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      const list = await fetchWhatsAppContacts(search.trim() || undefined);
      setContacts(list);
    } catch (e: unknown) {
      console.error(e);
      toast.error('שגיאה בטעינת אנשי קשר');
    } finally {
      setLoadingContacts(false);
    }
  }, [search]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const t = setTimeout(() => loadContacts(), 300);
    return () => clearTimeout(t);
  }, [loadContacts]);

  const talkedContacts = useMemo(
    () => contacts.filter((c) => talkedKeys.has(whatsappContactKey(c))),
    [contacts, talkedKeys]
  );

  const bulkRecipients = useMemo(() => {
    if (bulkAudience === 'all') return contacts;
    if (bulkAudience === 'talked') return talkedContacts;
    return contacts.filter((c) => selectedKeys.has(whatsappContactKey(c)));
  }, [bulkAudience, contacts, talkedContacts, selectedKeys]);

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

  const runBulkSend = async (forceDryRun: boolean) => {
    if (!bulkText.trim()) {
      toast.error('כתוב הודעה לשליחה');
      return;
    }
    if (bulkRecipients.length === 0) {
      toast.error('אין נמענים ברשימה');
      return;
    }
    setBulkLoading(true);
    setBulkPreview(null);
    try {
      const result = await bulkSendWhatsAppMessage({
        text: bulkText.trim(),
        contacts: bulkRecipients.map((c) => ({ phone: c.phone, name: c.name })),
        dry_run: forceDryRun,
      });
      setBulkPreview(result);
      if (result.dry_run) {
        toast.info(`תצוגה מקדימה: ${result.preview_count} נמענים — לא נשלחה הודעה`);
      } else {
        toast.success(`נשלחו ${result.sent} הודעות, ${result.failed} נכשלו`);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'שגיאה בשליחה לקבוצה';
      toast.error(msg);
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <AppLayout>
      <div dir="rtl" className="space-y-4">
        <PageHeader
          title="WhatsApp"
          description={
            configured
              ? `חיבור ManyChat פעיל${pageName ? ` — ${pageName}` : ''}. בחר נמענים ושלח הודעת תפוצה.`
              : 'ממתין להגדרת ManyChat בשרת'
          }
        />

        {apiError && configured === false && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {apiError}
          </div>
        )}

        <div className="flex h-[calc(100vh-220px)] min-h-[480px] rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
          {/* Contact list */}
          <div className="w-full max-w-sm border-l border-border/60 flex flex-col bg-muted/20 shrink-0">
            <div className="p-3 border-b border-border/60 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <MessageCircle className="h-4 w-4" />
                  אנשי קשר
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={selectAllVisible}>
                    הכל
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={clearSelection}>
                    נקה
                  </Button>
                </div>
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
                <Button type="button" variant="outline" size="sm" onClick={() => loadContacts()} aria-label="רענן">
                  <RefreshCw className={`h-4 w-4 ${loadingContacts ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingContacts ? (
                <p className="p-4 text-sm text-muted-foreground">טוען...</p>
              ) : contacts.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">לא נמצאו אנשי קשר עם טלפון</p>
              ) : (
                contacts.map((c) => {
                  const key = whatsappContactKey(c);
                  const isChecked = selectedKeys.has(key);
                  return (
                    <label
                      key={key}
                      className={`flex items-start gap-2 border-b border-border/30 hover:bg-muted/50 cursor-pointer px-2 py-3 ${
                        isChecked ? 'bg-primary/10' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelected(c)}
                        className="mt-1 shrink-0 accent-primary"
                      />
                      <div className="flex-1 min-w-0 text-right">
                        <div className="font-medium text-sm truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.phone}</div>
                        {c.branch_name && (
                          <div className="text-xs text-muted-foreground/80">{c.branch_name}</div>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Broadcast panel (inline) */}
          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-background">
            <div className="px-6 py-4 border-b border-border/60 bg-muted/10">
              <div className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold">הודעת תפוצה</h2>
                  <p className="text-sm text-muted-foreground">
                    שליחת אותה הודעה למספר נמענים. סמן אנשי קשר ברשימה או בחר קהל יעד.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 p-6 space-y-5 max-w-2xl">
              <div>
                <label className="block text-sm font-medium mb-1.5">תוכן ההודעה</label>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder="כתוב הודעה לכל הנמענים..."
                  rows={6}
                  disabled={!configured}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">קהל יעד</label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['selected', `נבחרים (${selectedKeys.size})`],
                      ['all', `כל הרשימה (${contacts.length})`],
                      ['talked', `דיברתי איתם (${talkedContacts.length})`],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setBulkAudience(value)}
                      className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                        bulkAudience === value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border hover:bg-muted'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  נמענים: <strong>{bulkRecipients.length}</strong>
                  {bulkAudience === 'selected' && selectedKeys.size === 0 && (
                    <span> — סמן אנשי קשר ברשימה משמאל</span>
                  )}
                </p>
              </div>

              {bulkRecipients.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">רשימת נמענים</label>
                  <div className="rounded-md border bg-muted/20 max-h-48 overflow-y-auto">
                    <ul className="text-sm divide-y">
                      {bulkRecipients.map((c) => (
                        <li key={whatsappContactKey(c)} className="px-3 py-2 flex justify-between gap-2">
                          <span className="font-medium truncate">{c.name}</span>
                          <span className="text-muted-foreground shrink-0 text-xs">{c.phone}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {bulkPreview && (
                <div className="text-sm rounded-md border bg-muted/30 p-3 space-y-1">
                  {bulkPreview.message && (
                    <p className="text-amber-800 font-medium text-xs">{bulkPreview.message}</p>
                  )}
                  <p>
                    {bulkPreview.dry_run ? 'תצוגה מקדימה' : 'נשלח'}:{' '}
                    {bulkPreview.preview_count || bulkPreview.sent} / {bulkPreview.total}
                    {!bulkPreview.dry_run && bulkPreview.failed > 0 && (
                      <span className="text-destructive"> · {bulkPreview.failed} נכשלו</span>
                    )}
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={!configured || bulkLoading || !bulkText.trim() || bulkRecipients.length === 0}
                  onClick={() => runBulkSend(true)}
                >
                  תצוגה מקדימה
                </Button>
                <Button
                  type="button"
                  className="flex-1 gap-1"
                  disabled={!configured || bulkLoading || !bulkText.trim() || bulkRecipients.length === 0}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `לשלוח ל-${bulkRecipients.length} נמענים? פעולה זו לא ניתנת לביטול.`
                      )
                    ) {
                      return;
                    }
                    runBulkSend(false);
                  }}
                >
                  <Send className="h-4 w-4" />
                  שלח תפוצה
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
