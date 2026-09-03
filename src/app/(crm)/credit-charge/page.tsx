'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@/lib/api';
import { initiatePayment } from '@/lib/storeApi';
import type { ChildWithDetails } from '@/types/customer';

function Row({ label, value, mono }: { label: string; value: string | number | boolean; mono?: boolean }) {
  return (
    <tr className="border-t">
      <td className="px-3 py-2 text-muted-foreground w-44 shrink-0">{label}</td>
      <td className={`px-3 py-2 ${mono ? 'font-mono text-xs' : ''}`}>{String(value)}</td>
    </tr>
  );
}

// ─── Section A: Direct card charge ───────────────────────────────────────────

function DirectCardSection({ products }: { products: { id: string; name: string; sale_price: number }[] }) {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [amountOverride, setAmountOverride] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardHolderId, setCardHolderId] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    if (!selectedProductId && products.length > 0) setSelectedProductId(products[0].id);
  }, [products, selectedProductId]);

  const selectedProduct = products.find(p => p.id === selectedProductId);

  async function handleCharge() {
    if (!selectedProductId) return;
    setLoading(true);
    setResponse(null);
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      const token = typeof window !== 'undefined' ? localStorage.getItem('kogomalo_auth_token') : null;
      const res = await fetch(`${base}/store/payment/charge-card/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Token ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          items: [{ product_id: selectedProductId, quantity: 1, ...(amountOverride ? { price_override: parseFloat(amountOverride) } : {}) }],
          card_details: {
            card_number: cardNumber.replace(/\s/g, ''),
            expiry_month: parseInt(expiryMonth),
            expiry_year: parseInt(expiryYear),
            cvv,
            card_holder_id: cardHolderId,
          },
        }),
      });
      const data = await res.json();
      setResponse(data);
    } catch (err: any) {
      setResponse({ error: err?.message || 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>סליקה ישירה (ללא iframe)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-right" dir="rtl">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-sm font-medium">מוצר לחיוב</label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
            >
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — ₪{p.sale_price}
                </option>
              ))}
              {products.length === 0 && <option value="">טוען מוצרים...</option>}
            </select>
            {selectedProduct && (
              <p className="mt-1 text-xs text-muted-foreground font-mono">{selectedProduct.id}</p>
            )}
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium">
              סכום לחיוב (₪)
              <span className="text-muted-foreground font-normal"> — ריק = מחיר המוצר</span>
            </label>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder={selectedProduct ? `${selectedProduct.sale_price}` : ''}
                value={amountOverride}
                onChange={e => setAmountOverride(e.target.value)}
                className="w-32"
              />
              <Button
                type="button"
                variant={amountOverride === '2' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAmountOverride(amountOverride === '2' ? '' : '2')}
              >
                ₪2
              </Button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">מספר כרטיס</label>
            <Input placeholder="4111111111111111" value={cardNumber} onChange={e => setCardNumber(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">חודש תפוגה</label>
            <Input placeholder="12" value={expiryMonth} onChange={e => setExpiryMonth(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">שנת תפוגה</label>
            <Input placeholder="2026" value={expiryYear} onChange={e => setExpiryYear(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">CVV</label>
            <Input placeholder="123" value={cvv} onChange={e => setCvv(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">תעודת זהות בעל הכרטיס</label>
            <Input placeholder="012345678" value={cardHolderId} onChange={e => setCardHolderId(e.target.value)} />
          </div>
        </div>
        <Button onClick={handleCharge} disabled={loading || !selectedProductId || !cardNumber}>
          {loading ? 'מעבד...' : 'סלוק כרטיס'}
        </Button>

        {response && (
          <div className="mt-4 space-y-4">
            {/* Status banner */}
            <div className={`rounded-lg px-4 py-3 font-semibold text-sm ${
              response.success
                ? 'bg-green-50 border border-green-300 text-green-800'
                : 'bg-red-50 border border-red-300 text-red-800'
            }`}>
              {response.success ? '✓ התשלום בוצע בהצלחה' : `✗ התשלום נכשל — ${response.error || 'שגיאה לא ידועה'}`}
            </div>

            {/* Structured fields */}
            <div className="border rounded-lg overflow-hidden text-sm">
              <table className="w-full">
                <tbody>
                  {/* Tranzila core fields */}
                  <tr className="bg-muted/50">
                    <td colSpan={2} className="px-3 py-1.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                      פרטי עסקה — טרנזילה
                    </td>
                  </tr>
                  <Row label="סטטוס" value={response.success ? 'הצלחה' : 'כישלון'} />
                  {response.invoice?.tranzila_transaction_id && (
                    <Row label="מזהה עסקה (Tranzila)" value={response.invoice.tranzila_transaction_id} mono />
                  )}
                  {response.invoice?.tranzila_confirmation_code && (
                    <Row label="קוד אישור" value={response.invoice.tranzila_confirmation_code} mono />
                  )}

                  {/* Invoice fields */}
                  {response.invoice && (
                    <>
                      <tr className="bg-muted/50">
                        <td colSpan={2} className="px-3 py-1.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                          חשבונית
                        </td>
                      </tr>
                      <Row label="מספר חשבונית" value={response.invoice.invoice_number} mono />
                      <Row label="סכום" value={`₪${response.invoice.total_amount}`} />
                      <Row label="סטטוס תשלום" value={response.invoice.payment_status} />
                      <Row label="אמצעי תשלום" value={response.invoice.payment_method} />
                      {response.invoice.child_name && <Row label="ילד" value={response.invoice.child_name} />}
                      {response.invoice.customer_name && <Row label="לקוח" value={response.invoice.customer_name} />}
                      {response.invoice.customer_phone && <Row label="טלפון" value={response.invoice.customer_phone} />}
                      <Row label="טוקן נשמר" value={response.token_saved ? 'כן' : 'לא'} />
                    </>
                  )}

                  {/* Error details */}
                  {!response.success && response.error && (
                    <>
                      <tr className="bg-muted/50">
                        <td colSpan={2} className="px-3 py-1.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                          פרטי שגיאה
                        </td>
                      </tr>
                      <Row label="שגיאה" value={response.error} />
                      {response.response_code && <Row label="קוד תגובה" value={response.response_code} mono />}
                      {response.message && <Row label="הודעה" value={response.message} />}
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* Raw JSON */}
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground select-none">
                תגובה גולמית (JSON)
              </summary>
              <pre className="mt-2 text-xs bg-muted p-3 rounded overflow-auto max-h-64 text-left">
                {JSON.stringify(response, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section B: Iframe flow ───────────────────────────────────────────────────

function IframeSection({ products }: { products: { id: string; name: string; sale_price: number }[] }) {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [loading, setLoading] = useState(false);
  const [iframeUrl, setIframeUrl] = useState('');
  const [response, setResponse] = useState<object | null>(null);

  useEffect(() => {
    if (!selectedProductId && products.length > 0) setSelectedProductId(products[0].id);
  }, [products, selectedProductId]);

  async function handleInitiate() {
    if (!selectedProductId) return;
    setLoading(true);
    setResponse(null);
    setIframeUrl('');
    try {
      const webhookBase =
        process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL ||
        (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1').replace('/api/v1', '');
      const callbackUrl = `${webhookBase}/api/v1/store/payment/callback/`;
      const data = await initiatePayment(
        [{ product_id: selectedProductId, quantity: 1 }],
        undefined,
        undefined,
        callbackUrl,
      );
      setResponse(data);
      if (data.iframe_url) setIframeUrl(data.iframe_url);
    } catch (err: any) {
      setResponse({ error: err?.message || 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>סליקה דרך iframe של טרנזילה</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-right" dir="rtl">
        <div>
          <label className="text-sm font-medium">מוצר לחיוב</label>
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selectedProductId}
            onChange={e => setSelectedProductId(e.target.value)}
          >
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name} — ₪{p.sale_price}</option>
            ))}
            {products.length === 0 && <option value="">טוען מוצרים...</option>}
          </select>
        </div>
        <Button onClick={handleInitiate} disabled={loading || !selectedProductId}>
          {loading ? 'מאתחל...' : 'פתח iframe לתשלום'}
        </Button>
        {response && (
          <details open className="mt-3">
            <summary className="cursor-pointer text-sm text-muted-foreground">תגובת API (initiate)</summary>
            <pre className="mt-2 text-xs bg-muted p-3 rounded overflow-auto max-h-48 text-left">
              {JSON.stringify(response, null, 2)}
            </pre>
          </details>
        )}
        {iframeUrl && (
          <div className="mt-4">
            <p className="text-sm font-medium mb-2">iframe טרנזילה:</p>
            <iframe
              src={iframeUrl}
              className="w-full border rounded"
              style={{ height: 420 }}
              title="Tranzila payment"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section C: Token charge ──────────────────────────────────────────────────

function TokenSection({ products }: { products: { id: string; name: string; sale_price: number }[] }) {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [children, setChildren] = useState<ChildWithDetails[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildWithDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [response, setResponse] = useState<object | null>(null);
  const [action1Loading, setAction1Loading] = useState(false);
  const [action1Result, setAction1Result] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!selectedProductId && products.length > 0) setSelectedProductId(products[0].id);
  }, [products, selectedProductId]);

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const params = new URLSearchParams({ search: searchQuery, limit: '20' });
      const res = await api.get(`/customers/children/?${params.toString()}`);
      setChildren(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch {
      setChildren([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleTokenCharge() {
    if (!selectedChild || !selectedProductId) return;
    setLoading(true);
    setResponse(null);
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      const token = typeof window !== 'undefined' ? localStorage.getItem('kogomalo_auth_token') : null;
      const res = await fetch(`${base}/store/payment/charge-card/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Token ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          items: [{ product_id: selectedProductId, quantity: 1 }],
          child_id: selectedChild.id,
          charged_with_token: true,
        }),
      });
      const data = await res.json();
      setResponse(data);
    } catch (err: any) {
      setResponse({ error: err?.message || 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }

  const filteredChildren = children.filter(c =>
    !searchQuery ||
    c.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.family_name?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>סליקה בטוקן שמור (לקוח קיים)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-right" dir="rtl">
        <div className="flex gap-2">
          <Input
            placeholder="חפש ילד לפי שם..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="flex-1"
          />
          <Button variant="outline" onClick={handleSearch} disabled={searching}>
            {searching ? 'מחפש...' : 'חפש'}
          </Button>
        </div>

        {filteredChildren.length > 0 && (
          <div className="border rounded max-h-40 overflow-auto">
            {filteredChildren.map(child => (
              <button
                key={child.id}
                className={`w-full text-right px-3 py-2 text-sm hover:bg-muted transition-colors ${
                  selectedChild?.id === child.id ? 'bg-muted font-semibold' : ''
                }`}
                onClick={() => setSelectedChild(child)}
              >
                {child.first_name} {child.last_name} — {child.family_name}
              </button>
            ))}
          </div>
        )}

        {selectedChild && (
          <div className="text-sm bg-muted rounded px-3 py-2">
            נבחר: <strong>{selectedChild.first_name} {selectedChild.last_name}</strong> (ID: {selectedChild.id})
          </div>
        )}

        <div>
          <label className="text-sm font-medium">מוצר לחיוב</label>
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selectedProductId}
            onChange={e => setSelectedProductId(e.target.value)}
          >
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name} — ₪{p.sale_price}</option>
            ))}
            {products.length === 0 && <option value="">טוען מוצרים...</option>}
          </select>
        </div>

        <Button onClick={handleTokenCharge} disabled={loading || !selectedChild || !selectedProductId}>
          {loading ? 'מעבד...' : 'סלוק בטוקן'}
        </Button>

        <button
          type="button"
          className="block text-[10px] leading-none text-muted-foreground/70 hover:text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
          disabled={action1Loading}
          onClick={async () => {
            setAction1Loading(true);
            setAction1Result(null);
            try {
              const res = await api.post('/customers/payments/action-1/', {}, { timeout: 90000 });
              setAction1Result(res.data);
            } catch (err: any) {
              setAction1Result(err?.response?.data || { error: err?.message || 'שגיאה' });
            } finally {
              setAction1Loading(false);
            }
          }}
        >
          {action1Loading ? '...' : 'פעולה 1'}
        </button>
        {action1Result && (
          <pre className="text-[10px] bg-muted p-2 rounded overflow-auto max-h-40 text-left">
            {JSON.stringify(action1Result, null, 2)}
          </pre>
        )}

        {response && (
          <details open className="mt-3">
            <summary className="cursor-pointer text-sm text-muted-foreground">תגובת API</summary>
            <pre className="mt-2 text-xs bg-muted p-3 rounded overflow-auto max-h-64 text-left">
              {JSON.stringify(response, null, 2)}
            </pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreditChargePage() {
  const [products, setProducts] = useState<{ id: string; name: string; sale_price: number }[]>([]);

  useEffect(() => {
    api.get('/store/products/').then(r => {
      setProducts(Array.isArray(r.data) ? r.data : r.data.results || []);
    }).catch(() => {});
  }, []);

  return (
    <>
      <div className="p-6 space-y-6" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold">סליקת אשראי — בדיקות</h1>
          <p className="text-muted-foreground text-sm mt-1">
            דף לבדיקה וחקירה של זרמי סליקת אשראי מול טרנזילה
          </p>
        </div>
        <DirectCardSection products={products} />
        <IframeSection products={products} />
        <TokenSection products={products} />
      </div>
    </>
  );
}
