/**
 * Store Types - TypeScript type definitions for store management
 */

export interface ProductSizeStock {
  id?: string;
  size: string;
  stock_quantity: number;
  sort_order?: number;
  /** Branch UUID, or null / omitted for delivery */
  branch?: string | null;
  /** Display name when API includes it (read-only) */
  branch_name?: string | null;
}

export interface StoreProduct {
  id: string;
  name: string;
  category: string;
  size: string | null;
  cost_price: number;
  sale_price: number;
  branch: string | null;
  branch_name: string | null;
  stock_quantity: number;
  min_stock_alert: number;
  is_low_stock: boolean;
  image_url: string | null;
  notes: string;
  is_active: boolean;
  profit_margin: number;
  size_stocks?: ProductSizeStock[];
  created_at: string;
  updated_at: string;
}

export interface StoreSale {
  id: string;
  invoice: string;
  product: string;
  product_name: string;
  child: string | null;
  child_name: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  size: string;
  payment_method: 'credit_card' | 'cash' | 'monthly_billing';
  branch: string | null;
  branch_name: string | null;
  sale_date: string;
  created_at: string;
}

export interface StoreInvoice {
  id: string;
  invoice_number: string;
  child: string | null;
  child_name: string | null;
  customer_name: string;
  customer_phone: string;
  total_amount: number;
  payment_method: 'credit_card' | 'cash' | 'monthly_billing';
  payment_status: 'pending' | 'completed' | 'failed';
  tranzila_transaction_id: string;
  tranzila_confirmation_code: string;
  charged_with_token: boolean;
  branch: string | null;
  branch_name: string | null;
  issue_date: string;
  notes: string;
  line_items: StoreSale[];
  created_at: string;
}

export interface CartItem {
  product_id: string;
  quantity: number;
  size?: string;
  /** Inventory row branch UUID, or omit / null for משלוח row */
  branch?: string | null;
  /** Exact `StoreProductSize` row when multiple rows share the same size label */
  size_stock_id?: string | null;
}

export interface PaymentInitiationResponse {
  requires_iframe: boolean;
  iframe_url?: string;
  invoice_id?: string;
  invoice?: StoreInvoice;
  success?: boolean;
  error?: string;
}

export interface StoreAnalytics {
  total_revenue: number;
  net_profit: number;
  total_sales_count: number;
  low_stock_count: number;
  monthly_revenue: Array<{ month: string; revenue: number }>;
  sales_by_product: Array<{ product: string; quantity: number; revenue: number }>;
  sales_by_category: Array<{ category: string; total: number }>;
  sales_by_branch: Array<{ branch: string; total: number }>;
  sales_by_payment_method: Array<{ method: string; total: number }>;
  low_stock_products: StoreProduct[];
  recent_sales: StoreSale[];
}

// Form data types
export interface ProductFormData {
  name: string;
  category: string;
  size: string;
  cost_price: number;
  sale_price: number;
  branch: string | null;
  stock_quantity: number;
  min_stock_alert: number;
  image_url: string;
  notes: string;
  size_stocks?: ProductSizeStock[];
}

export interface StockUpdateData {
  mode: 'add' | 'subtract' | 'set';
  quantity: number;
  size?: string | null;
  /** Exact `StoreProductSize` row (size + location); preferred when product has size_stocks */
  size_stock_id?: string | null;
}

export interface CustomerInfo {
  name: string;
  phone: string;
}

