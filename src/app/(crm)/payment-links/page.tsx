'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Link2, Plus, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { TableSkeleton } from '@/components/ui/skeleton';
import PaymentLinkDialog from '@/components/dialogs/PaymentLinkDialog';
import { fetchPaymentLinks, formatShekels, type PaymentLink } from '@/lib/paymentLinksApi';

function whatsappShareUrl(link: PaymentLink) {
  const text = `${link.title}\nלתשלום: ${link.public_url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('הקישור הועתק');
  } catch {
    toast.error('ההעתקה נכשלה');
  }
}

/**
 * Manager-only list of payment links: what each is for, where the money is
 * tagged, how much came in, and the public URL to share.
 */
export default function PaymentLinksPage() {
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLinks(await fetchPaymentLinks());
    } catch {
      toast.error('שגיאה בטעינת קישורי התשלום');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = links.filter((l) => showClosed || l.is_open);

  return (
    <>
      <PageHeader
        title="קישורי תשלום"
        description="קישור לתשלום בכרטיס לכל מטרה — מופע, קייטנה, ציוד. הכסף נכנס לדשבורד תחת העסק והקטגוריה של הקישור."
        actions={
          <button className="btn-primary flex items-center gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            קישור חדש
          </button>
        }
      />

      <div className="card animate-slide-up">
        <div className="mb-4 pb-3 border-b flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{visible.length} קישורים</span>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            הצג גם קישורים סגורים
          </label>
        </div>

        {loading ? (
          <TableSkeleton columns={5} />
        ) : visible.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Link2 className="w-12 h-12 mx-auto mb-4" />
            <p>אין קישורי תשלום עדיין. צרו את הראשון.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="table table-compact">
              <thead>
                <tr className="bg-muted/50">
                  <th>למה</th>
                  <th className="col-hide-mobile">עסק · קטגוריה</th>
                  <th>אפשרויות</th>
                  <th>התקבל</th>
                  <th>סטטוס</th>
                  <th className="w-40 text-center">קישור</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((link) => (
                  <tr key={link.id} className="hover:bg-muted/30">
                    <td>
                      <Link href={`/payment-links/${link.id}`} className="font-medium text-primary hover:underline">
                        {link.title}
                      </Link>
                      {link.review_count > 0 && (
                        <span className="mr-2 text-xs rounded-full bg-red-100 text-red-800 px-2 py-0.5">
                          {link.review_count} לבדיקה
                        </span>
                      )}
                    </td>
                    <td className="col-hide-mobile text-sm">
                      {link.business_name || '—'}
                      {link.business_category_name ? ` · ${link.business_category_name}` : ''}
                    </td>
                    <td className="text-sm">
                      {link.options.filter((o) => o.is_active !== false).map((o) => `${o.label} ${formatShekels(o.amount)}`).join(' · ')}
                    </td>
                    <td className="text-sm tabular-nums">
                      {link.paid_count > 0 ? `${link.paid_count} × · ${formatShekels(link.paid_total)}` : '—'}
                    </td>
                    <td>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          link.is_open ? 'border-green-300 bg-green-100 text-green-800' : 'border-gray-300 bg-gray-100 text-gray-700'
                        }`}
                      >
                        {link.is_open ? 'פעיל' : 'סגור'}
                      </span>
                    </td>
                    <td className="text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          className="p-2 rounded-lg hover:bg-muted"
                          title="העתק קישור"
                          aria-label="העתק קישור"
                          onClick={() => void copyText(link.public_url)}
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <a
                          className="p-2 rounded-lg hover:bg-muted"
                          title="שתף ב-WhatsApp"
                          aria-label="שתף ב-WhatsApp"
                          href={whatsappShareUrl(link)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Share2 className="w-4 h-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PaymentLinkDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={(saved) => {
          setLinks((prev) => [saved, ...prev]);
          toast.success('הקישור מוכן — העתיקו אותו מהעמודה "קישור"');
        }}
      />
    </>
  );
}
