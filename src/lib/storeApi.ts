/**
 * Store API Client - Functions for interacting with store endpoints
 */
import api from './api';
import type {
  StoreProduct,
  StoreInvoice,
  StoreSale,
  StoreAnalytics,
  CartItem,
  PaymentInitiationResponse,
  ProductFormData,
  StockUpdateData,
  CustomerInfo,
  AdjustStockData,
  TransferStockData,
} from '@/types/store';

// ============================
// Products API
// ============================

export async function fetchProducts(params?: {
  search?: string;
  branch?: string;
  stock_filter?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}): Promise<StoreProduct[]> {
  const { data } = await api.get('/store/products/', { params });
  return data;
}

export async function fetchProduct(id: string): Promise<StoreProduct> {
  const { data } = await api.get(`/store/products/${id}/`);
  return data;
}

export async function createProduct(productData: ProductFormData): Promise<StoreProduct> {
  const { data } = await api.post('/store/products/', productData);
  return data;
}

export async function updateProduct(id: string, productData: Partial<ProductFormData>): Promise<StoreProduct> {
  const { data } = await api.patch(`/store/products/${id}/`, productData);
  return data;
}

export async function deleteProduct(id: string): Promise<void> {
  await api.delete(`/store/products/${id}/`);
}

export async function updateStock(id: string, stockUpdate: StockUpdateData): Promise<StoreProduct> {
  const { data } = await api.patch(`/store/products/${id}/update_stock/`, stockUpdate);
  return data;
}

export async function adjustStock(id: string, adjustment: AdjustStockData): Promise<StoreProduct> {
  const { data } = await api.post(`/store/products/${id}/adjust_stock/`, adjustment);
  return data;
}

export async function transferStock(id: string, transfer: TransferStockData): Promise<StoreProduct> {
  const { data } = await api.post(`/store/products/${id}/transfer_stock/`, transfer);
  return data;
}

/** Pull catalog from B2C website — creates/links CRM products to match the online shop. */
export async function syncWebsiteProducts(): Promise<{
  ok: boolean;
  created: number;
  updated: number;
  pushed: number;
  total_crm: number;
  errors: string[];
}> {
  const { data } = await api.post('/store/products/sync-website/', {}, { timeout: 120_000 });
  return data;
}

// ============================
// Invoices API
// ============================

export async function fetchInvoices(params?: {
  child_id?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
}): Promise<StoreInvoice[]> {
  const { data } = await api.get('/store/invoices/', { params });
  return unwrapList<StoreInvoice>(data);
}

export async function fetchAllInvoices(): Promise<StoreInvoice[]> {
  const items: StoreInvoice[] = [];
  let page = 1;
  while (page <= 10) {
    const { data } = await api.get('/store/invoices/', {
      params: { page, page_size: 100 },
    });
    if (Array.isArray(data)) {
      return data;
    }
    const batch = data?.results ?? [];
    items.push(...batch);
    if (!data?.next || batch.length === 0) break;
    page += 1;
  }
  return items;
}

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'results' in data) {
    return ((data as { results?: T[] }).results) ?? [];
  }
  return [];
}

export async function fetchInvoice(id: string): Promise<StoreInvoice> {
  const { data } = await api.get(`/store/invoices/${id}/`);
  return data;
}

export async function downloadStoreInvoicePdf(id: string, invoiceNumber: string): Promise<void> {
  const response = await api.get(`/store/invoices/${id}/download/`, {
    responseType: 'blob',
  });
  const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `${invoiceNumber}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export async function createCashInvoice(
  items: CartItem[],
  childId: string,
  paymentMethod: 'cash' | 'monthly_billing'
): Promise<StoreInvoice> {
  const { data } = await api.post('/store/invoices/', {
    items,
    child_id: childId,
    payment_method: paymentMethod
  });
  return data;
}

// ============================
// Sales API
// ============================

export async function fetchSales(params?: {
  start_date?: string;
  end_date?: string;
}): Promise<StoreSale[]> {
  const { data } = await api.get('/store/sales/', { params });
  return data;
}

export async function fetchAnalytics(params?: {
  days?: number;
  branch?: string;
  city?: string;
  /** Explicit window; takes precedence over `days` when both are given. */
  date_from?: string;
  date_to?: string;
}): Promise<StoreAnalytics> {
  const { days = 30, branch, city, date_from, date_to } = params || {};
  const queryParams: Record<string, string | number> = {};
  if (date_from && date_to) {
    queryParams.date_from = date_from;
    queryParams.date_to = date_to;
  } else {
    queryParams.days = days;
  }
  if (branch && branch !== 'all') queryParams.branch = branch;
  if (city && city !== 'all') queryParams.city = city;
  const { data } = await api.get('/store/sales/analytics/', { params: queryParams });
  return data;
}

// ============================
// Payment API
// ============================

export async function initiatePayment(
  items: CartItem[],
  childId?: string,
  customerInfo?: CustomerInfo,
  callbackUrl?: string
): Promise<PaymentInitiationResponse> {
  const { data } = await api.post('/store/payment/initiate/', {
    items,
    child_id: childId,
    customer_info: customerInfo,
    callback_url: callbackUrl
  });
  return data;
}

// ============================
// Utility Functions
// ============================

export function calculateCartTotal(items: CartItem[], products: StoreProduct[]): number {
  return items.reduce((total, item) => {
    const product = products.find(p => p.id === item.product_id);
    if (product) {
      return total + (product.sale_price * item.quantity);
    }
    return total;
  }, 0);
}

export function formatCurrency(amount: number): string {
  return `₪${amount.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    'credit_card': 'אשראי',
    'cash': 'מזומן',
    'monthly_billing': 'הוראת קבע'
  };
  return labels[method] || method;
}

export function getPaymentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    'pending': 'ממתין',
    'completed': 'הושלם',
    'failed': 'נכשל'
  };
  return labels[status] || status;
}

