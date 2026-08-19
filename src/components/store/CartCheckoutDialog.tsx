'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Minus, Plus, Trash2, X } from 'lucide-react';
import { initiatePayment, createCashInvoice } from '@/lib/storeApi';
import api from '@/lib/api';
import type { StoreCartLine, CartItem, CustomerInfo } from '@/types/store';
import type { ChildWithDetails } from '@/types/customer';

interface CartCheckoutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lines: StoreCartLine[];
  onUpdateQuantity: (key: string, quantity: number) => void;
  onRemoveLine: (key: string) => void;
  onSuccess: () => void;
}

function lineDelivery(line: StoreCartLine): number {
  return (Number(line.delivery_price) || 0) * line.quantity;
}

function lineTotal(line: StoreCartLine): number {
  return line.sale_price * line.quantity + lineDelivery(line);
}

function toCartItems(lines: StoreCartLine[]): CartItem[] {
  return lines.map((line) => {
    const item: CartItem = { product_id: line.product_id, quantity: line.quantity };
    if (line.size !== undefined) item.size = line.size;
    if (line.branch) item.branch = line.branch;
    if (line.size_stock_id) item.size_stock_id = line.size_stock_id;
    return item;
  });
}

export default function CartCheckoutDialog({
  isOpen,
  onClose,
  lines,
  onUpdateQuantity,
  onRemoveLine,
  onSuccess,
}: CartCheckoutDialogProps) {
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'cash' | 'monthly_billing'>('credit_card');
  const [customerType, setCustomerType] = useState<'existing' | 'walkin'>('existing');

  const [children, setChildren] = useState<ChildWithDetails[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildWithDetails | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [showTranzilaModal, setShowTranzilaModal] = useState(false);
  const [iframeUrl, setIframeUrl] = useState('');
  const [useDirectCard, setUseDirectCard] = useState(false);
  const [showPaymentChoice, setShowPaymentChoice] = useState(false);

  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardHolderId, setCardHolderId] = useState('');

  const productsTotal = lines.reduce((sum, line) => sum + line.sale_price * line.quantity, 0);
  const deliveryTotal = lines.reduce((sum, line) => sum + lineDelivery(line), 0);
  const total = productsTotal + deliveryTotal;

  useEffect(() => {
    if (isOpen && customerType === 'existing') {
      fetchChildren();
    }
  }, [isOpen, customerType]);

  async function fetchChildren() {
    try {
      const response = await api.get('/customers/children/');
      const data = response.data;
      const childrenArray = data.results || data;
      setChildren(Array.isArray(childrenArray) ? childrenArray : []);
    } catch (error) {
      console.error('Error fetching children:', error);
      setChildren([]);
    }
  }

  const filteredChildren = children.filter(
    (child) =>
      child.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      child.last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      child.family_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function handleDirectCardCharge() {
    setIsLoading(true);
    try {
      const customerInfo: CustomerInfo | undefined =
        customerType === 'walkin' ? { name: walkInName, phone: walkInPhone } : undefined;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/store/payment/charge-card/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            items: toCartItems(lines),
            child_id: customerType === 'existing' ? selectedChild?.id : undefined,
            customer_info: customerInfo,
            card_details: {
              card_number: cardNumber.replace(/\s/g, ''),
              expiry_month: parseInt(expiryMonth),
              expiry_year: parseInt(expiryYear),
              cvv: cvv,
              card_holder_id: cardHolderId,
            },
          }),
        }
      );

      const result = await response.json();

      if (result.success) {
        const message = `תשלום בוצע בהצלחה!\nחשבונית: ${result.invoice.invoice_number}${
          result.token_saved ? '\n✓ הכרטיס נשמר לשימוש עתידי' : ''
        }`;
        toast.success(message);
        handleReset();
        onSuccess();
      } else {
        toast.error(`התשלום נכשל:\n${result.error}`);
      }
    } catch (error: unknown) {
      console.error('Error charging card:', error);
      const errorMessage = (error as Error)?.message || 'שגיאה לא ידועה';
      toast.error(`שגיאה בעיבוד התשלום:\n${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePurchase() {
    if (lines.length === 0) {
      toast.error('הסל ריק');
      return;
    }

    if (useDirectCard) {
      handleDirectCardCharge();
      return;
    }

    setIsLoading(true);

    try {
      const cartItems = toCartItems(lines);

      if (paymentMethod === 'credit_card') {
        if (customerType === 'walkin') {
          if (!walkInName || !walkInPhone) {
            toast.error('יש למלא שם וטלפון עבור לקוח חדש');
            setIsLoading(false);
            return;
          }
        } else if (customerType === 'existing' && !selectedChild) {
          toast.error('יש לבחור לקוח קיים');
          setIsLoading(false);
          return;
        }

        const customerInfo: CustomerInfo | undefined =
          customerType === 'walkin'
            ? { name: walkInName.trim(), phone: walkInPhone.trim() }
            : undefined;

        const webhookBaseUrl =
          process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL ||
          process.env.NEXT_PUBLIC_API_URL ||
          'http://localhost:8000/api/v1';
        const callbackUrl = `${webhookBaseUrl.replace('/api/v1', '')}/api/v1/store/payment/callback/`;
        const response = await initiatePayment(
          cartItems,
          customerType === 'existing' ? selectedChild?.id : undefined,
          customerInfo,
          callbackUrl
        );

        if (response.requires_iframe) {
          if (customerType === 'walkin') {
            setIframeUrl(response.iframe_url || '');
            setShowTranzilaModal(true);
          } else {
            setIframeUrl(response.iframe_url || '');
            setShowPaymentChoice(true);
            setIsLoading(false);
            return;
          }
        } else {
          if (response.success) {
            toast.success(`תשלום בוצע בהצלחה!\nחשבונית: ${response.invoice?.invoice_number}`);
            handleReset();
            onSuccess();
          } else {
            toast.error(`התשלום נכשל:\n${response.error}`);
          }
        }
      } else {
        if (!selectedChild) {
          toast.error('יש לבחור לקוח');
          setIsLoading(false);
          return;
        }

        const invoice = await createCashInvoice(cartItems, selectedChild.id, paymentMethod);
        toast.success(`חשבונית נוצרה בהצלחה!\nמספר חשבונית: ${invoice.invoice_number}`);
        handleReset();
        onSuccess();
      }
    } catch (error: unknown) {
      console.error('Error processing purchase:', error);
      const errorMessage =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (error as Error)?.message ||
        'שגיאה לא ידועה';
      toast.error(`שגיאה בעיבוד הרכישה:\n${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    setPaymentMethod('credit_card');
    setCustomerType('existing');
    setSelectedChild(null);
    setSearchQuery('');
    setWalkInName('');
    setWalkInPhone('');
    setShowTranzilaModal(false);
    setIframeUrl('');
    setUseDirectCard(false);
    setShowPaymentChoice(false);
    setCardNumber('');
    setExpiryMonth('');
    setExpiryYear('');
    setCvv('');
    setCardHolderId('');
  }

  function handlePaymentChoice(useDirectEntry: boolean) {
    if (useDirectEntry) {
      setUseDirectCard(true);
    } else {
      setShowTranzilaModal(true);
    }
  }

  function handleClose() {
    handleReset();
    onClose();
  }

  return (
    <>
      <Dialog open={isOpen && !showTranzilaModal} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-8 space-y-5">
          <DialogHeader className="px-0 pt-0">
            <DialogTitle className="text-2xl">סל קניות — תשלום</DialogTitle>
          </DialogHeader>

          {/* Cart lines */}
          <div className="border rounded-lg divide-y">
            {lines.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">הסל ריק</div>
            ) : (
              lines.map((line) => (
                <div key={line.key} className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{line.product_name}</div>
                    <div className="text-xs text-gray-500">
                      {[line.size, line.branch_name || (line.branch ? null : line.size_stock_id ? 'משלוח' : null)]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                      {' · '}₪{line.sale_price} ליחידה
                      {lineDelivery(line) > 0 ? ` · +₪${(Number(line.delivery_price) || 0).toFixed(2)} משלוח` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 px-0"
                      onClick={() => onUpdateQuantity(line.key, Math.max(1, line.quantity - 1))}
                      disabled={line.quantity <= 1}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm tabular-nums">{line.quantity}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 px-0"
                      onClick={() =>
                        onUpdateQuantity(line.key, Math.min(line.max_stock, line.quantity + 1))
                      }
                      disabled={line.quantity >= line.max_stock}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="w-20 text-left font-semibold text-sm shrink-0 tabular-nums">
                    ₪{lineTotal(line).toFixed(2)}
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 px-0 text-red-500 hover:text-red-700 shrink-0"
                    onClick={() => onRemoveLine(line.key)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* Customer Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">בחירת לקוח *</label>
            <Tabs
              defaultValue="existing"
              value={customerType}
              onValueChange={(v) => setCustomerType(v as 'existing' | 'walkin')}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="existing">לקוח קיים</TabsTrigger>
                <TabsTrigger value="walkin">לקוח מזדמן</TabsTrigger>
              </TabsList>

              <TabsContent value="existing" className="space-y-3">
                <Input
                  placeholder="חיפוש לפי שם ילד או משפחה..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {Array.isArray(filteredChildren) &&
                    filteredChildren.map((child) => (
                      <div
                        key={child.id}
                        className={`px-3 py-2 cursor-pointer hover:bg-gray-50 border-b last:border-b-0 ${
                          selectedChild?.id === child.id ? 'bg-teal-50' : ''
                        }`}
                        onClick={() => setSelectedChild(child)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="font-medium text-sm">
                              {child.first_name} {child.last_name}
                            </span>
                            <span className="text-xs text-gray-500">•</span>
                            <span className="text-sm text-gray-600">{child.family_name}</span>
                          </div>
                          {child.id_number && (
                            <span className="text-xs text-gray-500 whitespace-nowrap">
                              ת.ז: {child.id_number}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
                {selectedChild && (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-teal-100 text-teal-800">
                      נבחר: {selectedChild.first_name} {selectedChild.last_name}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedChild(null)}
                      className="h-6 w-6 px-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="walkin" className="space-y-3">
                <Input
                  placeholder="שם (אופציונלי)"
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                />
                <Input
                  placeholder="טלפון (אופציונלי)"
                  value={walkInPhone}
                  onChange={(e) => setWalkInPhone(e.target.value)}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium mb-2">אמצעי תשלום *</label>
            <Select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as 'credit_card' | 'cash' | 'monthly_billing')}
            >
              <option value="credit_card">אשראי</option>
              <option value="cash">מזומן</option>
            </Select>
            {paymentMethod === 'credit_card' && selectedChild && !useDirectCard && (
              <p className="text-sm text-teal-600 mt-2">✓ ישתמש בכרטיס השמור אם קיים</p>
            )}
          </div>

          {/* Direct Card Entry Form */}
          {paymentMethod === 'credit_card' && useDirectCard && (
            <div className="border rounded-lg p-4 bg-blue-50 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-blue-900">פרטי כרטיס אשראי</h4>
                <Button size="sm" variant="outline" onClick={() => setUseDirectCard(false)}>
                  חזור
                </Button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">מספר כרטיס *</label>
                <Input
                  placeholder="0000 0000 0000 0000"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  maxLength={19}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">חודש *</label>
                  <Input
                    placeholder="MM"
                    value={expiryMonth}
                    onChange={(e) => setExpiryMonth(e.target.value)}
                    maxLength={2}
                    type="number"
                    min="1"
                    max="12"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">שנה *</label>
                  <Input
                    placeholder="YYYY"
                    value={expiryYear}
                    onChange={(e) => setExpiryYear(e.target.value)}
                    maxLength={4}
                    type="number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">CVV *</label>
                  <Input
                    placeholder="123"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value)}
                    maxLength={4}
                    type="password"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">תעודת זהות *</label>
                <Input
                  placeholder="123456789"
                  value={cardHolderId}
                  onChange={(e) => setCardHolderId(e.target.value)}
                  maxLength={9}
                />
              </div>

              <p className="text-xs text-blue-700">🔒 פרטי הכרטיס מועברים ישירות לטרנזילה באופן מאובטח</p>
            </div>
          )}

          {/* Total */}
          <div className="bg-teal-50 p-4 rounded-lg space-y-1">
            {deliveryTotal > 0 ? (
              <>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>מוצרים</span>
                  <span>₪{productsTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>משלוח</span>
                  <span>₪{deliveryTotal.toFixed(2)}</span>
                </div>
              </>
            ) : null}
            <div className="flex justify-between items-center text-lg font-semibold">
              <span>
                סכום כולל ({lines.reduce((n, l) => n + l.quantity, 0)} פריטים):
              </span>
              <span className="text-teal-600">₪{total.toFixed(2)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button variant="outline" onClick={handleClose}>
              סגור
            </Button>
            <Button
              onClick={handlePurchase}
              disabled={
                isLoading ||
                lines.length === 0 ||
                (customerType === 'existing' && !selectedChild) ||
                (useDirectCard && (!cardNumber || !expiryMonth || !expiryYear || !cvv || !cardHolderId))
              }
            >
              {isLoading ? 'מעבד...' : `שלם ₪${total.toFixed(2)}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tranzila Iframe Modal */}
      {showTranzilaModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-auto">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-xl font-semibold">תשלום</h3>
              <Button variant="outline" onClick={handleClose}>
                ביטול
              </Button>
            </div>
            <div className="p-4">
              <iframe src={iframeUrl} className="w-full h-[600px] border-0" title="Tranzila Payment" />
            </div>
          </div>
        </div>
      )}

      {/* Payment Method Choice Dialog */}
      <ConfirmDialog
        isOpen={showPaymentChoice}
        onClose={() => setShowPaymentChoice(false)}
        onConfirm={handlePaymentChoice}
        title="בחר אמצעי תשלום"
        message="כיצד תרצה להזין את פרטי התשלום?"
        confirmText="הזנה ישירה"
        cancelText="דף תשלום מאובטח"
        type="question"
      />
    </>
  );
}
