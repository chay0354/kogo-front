'use client';

/**
 * Make every parent findable in ManyChat at once, instead of linking them one by one.
 *
 * ManyChat's API cannot search by WhatsApp number, so Kogo finds a contact
 * through the kogo_whatsapp_phone field. The contacts imported from the
 * previous system never got that field, and a broadcast to them fails with
 * "already in ManyChat, but cannot be found". ManyChat's own CSV import can
 * fill it: a row whose WhatsApp ID matches an existing contact updates that
 * contact. This panel hands the office that file, the steps, and a way to see
 * that the numbers which failed are found now.
 */
import { useEffect, useState } from 'react';
import { Check, ChevronDown, Download, RefreshCw, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readableError } from '@/lib/apiError';
import {
  checkContactFound,
  downloadContactIndex,
  fetchContactIndexCounts,
  type BroadcastRow,
  type ContactIndexScope,
} from '@/lib/whatsappApi';
import { localPhone } from './LinkContactPanel';

/** The phones of the rows ManyChat has but Kogo cannot find — each once. */
export function unfindablePhones(rows: BroadcastRow[]): string[] {
  const phones = rows
    .filter((row) => row.status === 'failed' && row.reason === 'contact_unfindable' && row.phone)
    .map((row) => row.phone);
  return Array.from(new Set(phones));
}

type CheckState = { state: 'checking' } | { state: 'found'; name: string } | { state: 'missing' } | { state: 'error'; message: string };

interface Props {
  /** Numbers a broadcast could not reach — offered for a check after the import. */
  phones?: string[];
  /** Starts folded to one line, for the broadcast results where space is short. */
  collapsible?: boolean;
  /** A number the check found, so the row it failed on can say so. */
  onFound?: (phone: string, displayName: string) => void;
}

export default function ContactIndexPanel({ phones = [], collapsible = false, onFound }: Props) {
  const [open, setOpen] = useState(!collapsible);
  const [counts, setCounts] = useState<Record<ContactIndexScope, number> | null>(null);
  const [scope, setScope] = useState<ContactIndexScope>('current');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [checks, setChecks] = useState<Record<string, CheckState>>({});
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!open || counts) return;
    let cancelled = false;
    fetchContactIndexCounts()
      .then((data) => {
        if (!cancelled) setCounts(data.scopes);
      })
      .catch((err) => {
        if (!cancelled) setError(readableError(err, 'לא ניתן לספור את המספרים'));
      });
    return () => {
      cancelled = true;
    };
  }, [open, counts]);

  const download = async () => {
    setDownloading(true);
    setError('');
    try {
      await downloadContactIndex(scope);
    } catch (err) {
      setError(readableError(err, 'הורדת הקובץ נכשלה'));
    } finally {
      setDownloading(false);
    }
  };

  // One at a time: each check is a dozen ManyChat searches.
  const checkAll = async () => {
    setChecking(true);
    for (const phone of phones) {
      setChecks((prev) => ({ ...prev, [phone]: { state: 'checking' } }));
      try {
        const res = await checkContactFound(phone);
        setChecks((prev) => ({
          ...prev,
          [phone]: res.found ? { state: 'found', name: res.display_name } : { state: 'missing' },
        }));
        if (res.found) onFound?.(phone, res.display_name);
      } catch (err) {
        setChecks((prev) => ({ ...prev, [phone]: { state: 'error', message: readableError(err, 'הבדיקה נכשלה') } }));
      }
    }
    setChecking(false);
  };

  const headline = phones.length
    ? `${phones.length === 1 ? 'הורה אחד קיים' : `${phones.length} הורים קיימים`} ב-ManyChat, אבל קוגו לא מוצאת ${phones.length === 1 ? 'אותו' : 'אותם'} — תיקון אחד לכולם`
    : 'אנשי קשר ש-ManyChat לא מוצא';

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-right text-sm text-amber-950"
      >
        <span className="flex items-center gap-2 font-medium">
          <Users className="h-4 w-4 shrink-0" />
          {headline}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </button>
    );
  }

  const option = (value: ContactIndexScope, label: string, note: string) => (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="radio"
        name="contact-index-scope"
        className="mt-1"
        checked={scope === value}
        onChange={() => setScope(value)}
      />
      <span>
        {label}
        {counts && <span className="tabular-nums"> · {counts[value]} מספרים</span>}
        <span className="block text-xs text-amber-900/80">{note}</span>
      </span>
    </label>
  );

  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="flex items-center gap-2 font-medium">
        <Users className="h-4 w-4 shrink-0" />
        {headline}
      </p>
      <p>
        ManyChat לא מאפשר לקוגו לחפש איש קשר לפי מספר וואטסאפ, רק לפי השדה{' '}
        <span dir="ltr" className="font-mono text-xs">kogo_whatsapp_phone</span>. באנשי הקשר שיובאו מהמערכת הקודמת
        השדה ריק, ולכן ההודעות אליהם נכשלות. ייבוא אחד של הקובץ הזה ב-ManyChat ממלא את השדה לכולם.{' '}
        <strong>הייבוא לא שולח אף הודעה.</strong>
      </p>

      <fieldset className="space-y-2">
        <legend className="mb-1 font-medium">מי בקובץ</legend>
        {option('current', 'לקוחות נוכחיים', 'פעילים, בעיה באשראי, ניסיון ובתהליך רישום.')}
        {option(
          'all',
          'כולל תלמידים שעזבו',
          'מספר שאין ב-ManyChat ייווצר שם כאיש קשר חדש, ויותר אנשי קשר יכולים לייקר את החבילה של ManyChat.',
        )}
      </fieldset>

      <Button type="button" size="sm" onClick={() => void download()} disabled={downloading}>
        <Download className="h-4 w-4 ml-1" />
        {downloading ? 'מוריד…' : 'הורדת הקובץ ל-ManyChat'}
      </Button>

      <ol className="list-decimal space-y-1 pr-4">
        <li>
          ב-ManyChat: <span dir="ltr">Contacts › Import</span>, ובוחרים את הקובץ שירד. לא פותחים אותו קודם באקסל, כי
          אקסל משבש מספרים ארוכים.
        </li>
        <li>
          בהתאמת העמודות: <span dir="ltr" className="font-mono text-xs">WhatsApp ID</span> לשדה המערכת{' '}
          <span dir="ltr">WhatsApp ID</span>, ו-<span dir="ltr" className="font-mono text-xs">kogo_whatsapp_phone</span>{' '}
          לשדה <span dir="ltr" className="font-mono text-xs">kogo_whatsapp_phone</span>. לא מוסיפים תגית.
        </li>
        <li>
          <span dir="ltr">Confirm</span>. בסוף ManyChat מראה כמה אנשי קשר עודכנו, נוצרו והתעלמו. אלה שעודכנו הם אלה
          שתוקנו.
        </li>
        {phones.length > 0 && <li>לוחצים כאן על ״בדיקה חוזרת״, ושולחים שוב למי שנמצא.</li>}
      </ol>

      {phones.length > 0 && (
        <div className="space-y-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void checkAll()} disabled={checking}>
            <RefreshCw className={`h-4 w-4 ml-1 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'בודק…' : `בדיקה חוזרת של ${phones.length === 1 ? 'המספר' : `${phones.length} המספרים`}`}
          </Button>
          {Object.keys(checks).length > 0 && (
            <ul className="space-y-1 text-xs">
              {phones.map((phone) => {
                const check = checks[phone];
                if (!check) return null;
                return (
                  <li key={phone} className="flex items-center gap-2">
                    <span className="tabular-nums" dir="ltr">{localPhone(phone)}</span>
                    {check.state === 'checking' && <span className="text-muted-foreground">בודק…</span>}
                    {check.state === 'found' && (
                      <span className="flex items-center gap-1 text-emerald-800">
                        <Check className="h-3.5 w-3.5" />
                        נמצא{check.name ? ` (${check.name})` : ''}. ההודעה הבאה תגיע.
                      </span>
                    )}
                    {check.state === 'missing' && (
                      <span className="flex items-center gap-1 text-red-700">
                        <X className="h-3.5 w-3.5" />
                        עדיין לא נמצא. אפשר לקשר ידנית בשורה שלו.
                      </span>
                    )}
                    {check.state === 'error' && <span className="text-red-700">{check.message}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {error && <p className="text-red-700">{error}</p>}
    </div>
  );
}
