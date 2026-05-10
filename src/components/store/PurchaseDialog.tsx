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
import { X } from 'lucide-react';
import { initiatePayment, createCashInvoice, calculateCartTotal } from '@/lib/storeApi';
import api from '@/lib/api';
import type { StoreProduct, CartItem, CustomerInfo } from '@/types/store';
import type { ChildWithDetails } from '@/types/customer';

interface PurchaseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  product: StoreProduct;
  onSuccess: () => void;
}

export default function PurchaseDialog({ isOpen, onClose, product, onSuccess }: PurchaseDialogProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'cash' | 'monthly_billing'>('credit_card');
  const [customerType, setCustomerType] = useState<'existing' | 'walkin'>('existing');
  
  // Existing customer
  const [children, setChildren] = useState<ChildWithDetails[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildWithDetails | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Walk-in customer
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  
  // Loading and iframe states
  const [isLoading, setIsLoading] = useState(false);
  const [showTranzilaModal, setShowTranzilaModal] = useState(false);
  const [iframeUrl, setIframeUrl] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [useDirectCard, setUseDirectCard] = useState(false);
  const [showPaymentChoice, setShowPaymentChoice] = useState(false);
  
  // Card details for direct entry
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardHolderId, setCardHolderId] = useState('');

  // Per-size stock takes precedence over the legacy CSV `size` field.
  const hasPerSizeStock = Array.isArray(product.size_stocks) && product.size_stocks.length > 0;
  const sizeOptions = hasPerSizeStock
    ? product.size_stocks!.map((s) => ({ size: s.size, stock: Number(s.stock_quantity) || 0 }))
    : (product.size ? product.size.split(',').map((s) => s.trim()).filter(Boolean) : [])
        .map((size) => ({ size, stock: product.stock_quantity }));

  // Stock available for the *currently selected* size (or the product total when no sizes).
  const selectedSizeStock = (() => {
    if (sizeOptions.length === 0) return product.stock_quantity;
    const match = sizeOptions.find((opt) => opt.size === selectedSize);
    return match ? match.stock : 0;
  })();

  // Calculate total
  const total = product.sale_price * quantity;

  // Fetch children for search
  useEffect(() => {
    if (isOpen && customerType === 'existing') {
      fetchChildren();
    }
  }, [isOpen, customerType]);

  async function fetchChildren() {
    try {
      const response = await api.get('/customers/children/');
      const data = response.data;
      // Handle paginated response
      const childrenArray = data.results || data;
      setChildren(Array.isArray(childrenArray) ? childrenArray : []);
    } catch (error) {
      console.error('Error fetching children:', error);
      setChildren([]);
    }
  }

  // Filter children based on search
  const filteredChildren = children.filter(child =>
    child.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    child.last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    child.family_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function handleDirectCardCharge() {
    setIsLoading(true);
    try {
      const cartItems: CartItem[] = [{
        product_id: product.id,
        quantity,
        size: selectedSize
      }];
      
      const customerInfo: CustomerInfo | undefined = customerType === 'walkin' 
        ? { name: walkInName, phone: walkInPhone }
        : undefined;
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/store/payment/charge-card/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          items: cartItems,
          child_id: customerType === 'existing' ? selectedChild?.id : undefined,
          customer_info: customerInfo,
          card_details: {
            card_number: cardNumber.replace(/\s/g, ''),
            expiry_month: parseInt(expiryMonth),
            expiry_year: parseInt(expiryYear),
            cvv: cvv,
            card_holder_id: cardHolderId
          }
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        const message = `תשלום בוצע בהצלחה!\nחשבונית: ${result.invoice.invoice_number}${result.token_saved ? '\n✓ הכרטיס נשמר לשימוש עתידי' : ''}`;
        toast.success(message);
        onSuccess();
        onClose();
      } else {
        toast.error(`התשלום נכשל:\n${result.error}`);
      }
    } catch (error: any) {
      console.error('Error charging card:', error);
      const errorMessage = error?.message || 'שגיאה לא ידועה';
      toast.error(`שגיאה בעיבוד התשלום:\n${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }
  
  async function handlePurchase() {
    // If using direct card entry, handle separately
    if (useDirectCard) {
      handleDirectCardCharge();
      return;
    }
    
    setIsLoading(true);
    
    try {
      const cartItems: CartItem[] = [{
        product_id: product.id,
        quantity,
        size: selectedSize
      }];

      if (paymentMethod === 'credit_card') {
        // Credit card - initiate payment with smart routing
        
        // Validate walk-in customer info
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
        
        const customerInfo: CustomerInfo | undefined = customerType === 'walkin' 
          ? { name: walkInName.trim(), phone: walkInPhone.trim() }
          : undefined;

        console.log('Initiating payment:', {
          customerType,
          childId: customerType === 'existing' ? selectedChild?.id : undefined,
          customerInfo,
          cartItems
        });

        // Backend URL for Tranzila webhook (must be accessible by Tranzila servers)
        // Use NEXT_PUBLIC_WEBHOOK_BASE_URL for Cloudflare Tunnel support (same as recurring payments)
        const webhookBaseUrl = process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
        const callbackUrl = `${webhookBaseUrl.replace('/api/v1', '')}/api/v1/store/payment/callback/`;        
        const response = await initiatePayment(
          cartItems,
          customerType === 'existing' ? selectedChild?.id : undefined,
          customerInfo,
          callbackUrl
        );

        if (response.requires_iframe) {
          // No token - use iframe for payment
          if (customerType === 'walkin') {
            // Walk-in customer - go directly to iframe, no choice
            setIframeUrl(response.iframe_url || '');
            setShowTranzilaModal(true);
            setHasToken(false);
          } else {
            // Existing customer without token - offer choice
            setIframeUrl(response.iframe_url || '');
            setShowPaymentChoice(true);
            setIsLoading(false);
            return;
          }
        } else {
          // Token charged - show result
          setHasToken(true);
          if (response.success) {
            toast.success(`תשלום בוצע בהצלחה!\nחשבונית: ${response.invoice?.invoice_number}`);
            onSuccess();
            onClose();
          } else {
            toast.error(`התשלום נכשל:\n${response.error}`);
          }
        }
      } else {
        // Cash or monthly billing - create invoice directly
        if (!selectedChild) {
          toast.error('יש לבחור לקוח');
          setIsLoading(false);
          return;
        }

        console.log('Creating cash invoice with:', {
          cartItems,
          childId: selectedChild.id,
          paymentMethod
        });

        const invoice = await createCashInvoice(cartItems, selectedChild.id, paymentMethod);
        console.log('Invoice created:', invoice);
        toast.success(`חשבונית נוצרה בהצלחה!\nמספר חשבונית: ${invoice.invoice_number}`);
        onSuccess();
        onClose();
      }
    } catch (error: any) {
      console.error('Error processing purchase:', error);
      const errorMessage = error?.response?.data?.error || error?.message || 'שגיאה לא ידועה';
      toast.error(`שגיאה בעיבוד הרכישה:\n${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    setQuantity(1);
    setSelectedSize('');
    setPaymentMethod('credit_card');
    setCustomerType('existing');
    setSelectedChild(null);
    setSearchQuery('');
    setWalkInName('');
    setWalkInPhone('');
    setShowTranzilaModal(false);
    setIframeUrl('');
    setHasToken(false);
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
      setHasToken(false);
    }
  }

  function handleClose() {
    handleReset();
    onClose();
  }

  return (
    <>
      <Dialog open={isOpen && !showTranzilaModal} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl">מכירת מוצר</DialogTitle>
          </DialogHeader>

          {/* Product Info */}
          <div className="bg-gray-50 p-4 rounded-lg mt-6">
            <h3 className="font-semibold text-lg">{product.name}</h3>
            <p className="text-gray-600">מחיר: ₪{product.sale_price}</p>
            <p className="text-gray-600">מלאי: {product.stock_quantity} יחידות</p>
          </div>

          {/* Size Selection */}
          {sizeOptions.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">בחירת מידה *</label>
              <Select value={selectedSize} onChange={(e) => setSelectedSize(e.target.value)}>
                <option value="">בחר מידה</option>
                {sizeOptions.map((opt) => (
                  <option key={opt.size} value={opt.size} disabled={hasPerSizeStock && opt.stock <= 0}>
                    {hasPerSizeStock ? `${opt.size} (במלאי: ${opt.stock})` : opt.size}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium mb-2">
              כמות
              {hasPerSizeStock && selectedSize && (
                <span className="text-xs text-gray-500 mr-2">(מלאי למידה {selectedSize}: {selectedSizeStock})</span>
              )}
            </label>
            <Input
              type="number"
              min="1"
              max={selectedSizeStock || 1}
              disabled={hasPerSizeStock && !selectedSize}
              value={quantity}
              onChange={(e) =>
                setQuantity(
                  Math.max(
                    1,
                    Math.min(selectedSizeStock || 1, parseInt(e.target.value) || 1)
                  )
                )
              }
            />
          </div>

          {/* Customer Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">בחירת לקוח *</label>
            <Tabs defaultValue="existing" value={customerType} onValueChange={(v) => setCustomerType(v as 'existing' | 'walkin')}>
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
                  {Array.isArray(filteredChildren) && filteredChildren.map(child => (
                    <div
                      key={child.id}
                      className={`px-3 py-2 cursor-pointer hover:bg-gray-50 border-b last:border-b-0 ${
                        selectedChild?.id === child.id ? 'bg-teal-50' : ''
                      }`}
                      onClick={() => setSelectedChild(child)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="font-medium text-sm">{child.first_name} {child.last_name}</span>
                          <span className="text-xs text-gray-500">•</span>
                          <span className="text-sm text-gray-600">{child.family_name}</span>
                        </div>
                        {child.id_number && (
                          <span className="text-xs text-gray-500 whitespace-nowrap">ת.ז: {child.id_number}</span>
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
                      className="h-1 px-1 py-2 flex items-center justify-center"
                    >
                      <X className="h-2.5 w-2.5" />
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
            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)}>
              <option value="credit_card">אשראי</option>
              <option value="cash">מזומן</option>
            </Select>
            {paymentMethod === 'credit_card' && selectedChild && !useDirectCard && (
              <p className="text-sm text-teal-600 mt-2">
                ✓ ישתמש בכרטיס השמור אם קיים
              </p>
            )}
          </div>

          {/* Direct Card Entry Form */}
          {paymentMethod === 'credit_card' && useDirectCard && (
            <div className="border rounded-lg p-4 bg-blue-50 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-blue-900">פרטי כרטיס אשראי</h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setUseDirectCard(false)}
                >
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
              
              <p className="text-xs text-blue-700">
                🔒 פרטי הכרטיס מועברים ישירות לטרנזילה באופן מאובטח
              </p>
            </div>
          )}

          {/* Total */}
          <div className="bg-teal-50 p-4 rounded-lg">
            <div className="flex justify-between items-center text-lg font-semibold">
              <span>סכום כולל:</span>
              <span className="text-teal-600">₪{total.toFixed(2)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end mt-8 pt-4 border-t">
            <Button variant="outline" onClick={handleClose}>ביטול</Button>
            <Button
              onClick={handlePurchase}
              disabled={
                isLoading ||
                (customerType === 'existing' && !selectedChild) ||
                (sizeOptions.length > 0 && !selectedSize) ||
                (hasPerSizeStock && quantity > selectedSizeStock) ||
                (useDirectCard && (!cardNumber || !expiryMonth || !expiryYear || !cvv || !cardHolderId))
              }
            >
              {isLoading ? 'מעבד...' : 'בצע רכישה'}
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
              <Button variant="outline" onClick={handleClose}>ביטול</Button>
            </div>
            <div className="p-4">
              <iframe
                src={iframeUrl}
                className="w-full h-[600px] border-0"
                title="Tranzila Payment"
              />
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

