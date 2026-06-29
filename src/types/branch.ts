/**
 * Branch related types
 */

export interface CustomDetail {
  label: string;
  value: string;
}

export interface City {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  purpose: string;
  notes: string;
  branch: string;
  branch_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  manager_name: string;
  city: string | null;
  city_name: string | null;
  branch_codes: string[];
  cleaning_managers: string[];
  cleaning_cost: number | null;
  monthly_cost: number | null;
  wifi_name: string;
  wifi_code: string;
  bluetooth_codes: string[];
  custom_details: CustomDetail[];
  is_external: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BranchDetail extends Branch {
  rooms: Room[];
  rooms_count: number;
}

export interface BranchListItem {
  id: string;
  name: string;
  address: string;
  city_name: string | null;
  branch_codes: string[];
  monthly_cost: number | null;
  is_external: boolean;
  is_active: boolean;
  families_count: number;
  courses_count: number;
  instructors_count: number;
  rooms_count: number;
}

export interface BranchFile {
  id: string;
  branch: string;
  branch_name: string;
  file_name: string;
  file_type: 'video' | 'document';
  file: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  updated_at: string;
}

export interface BranchStatistics {
  branch_id: string;
  branch_name: string;
  families_count: number;
  courses_count: number;
  lessons_count: number;
  instructors_count: number;
  rooms_count: number;
  products_count: number;
  active_students: number;
  monthly_revenue: number;
  monthly_costs: number;
  profit: number;
}

export interface BranchFormData {
  name: string;
  address: string;
  phone: string;
  email: string;
  manager_name: string;
  city: string | null;
  branch_codes: string[];
  cleaning_managers: string[];
  cleaning_cost: number | null;
  monthly_cost: number | null;
  wifi_name: string;
  wifi_code: string;
  bluetooth_codes: string[];
  custom_details: CustomDetail[];
  is_active: boolean;
  studios?: Array<{ name: string; notes: string }>;
}

export interface RoomFormData {
  name: string;
  capacity: number;
  purpose: string;
  notes: string;
  branch: string;
}

export interface ProductStock {
  id: string;
  product: string;
  product_name: string;
  product_category: string;
  product_sale_price: number;
  branch: string;
  branch_name: string;
  quantity: number;
  min_stock_alert: number;
  is_low_stock: boolean;
  created_at: string;
  updated_at: string;
}

// Constants
export const STUDENT_MONTHLY_FEE = 350;
export const INSTRUCTOR_LESSON_SALARY = 250;
export const WEEKS_PER_MONTH = 4;
export const DEFAULT_ROOM_CAPACITY = 20;

export const ROOM_PURPOSES = [
  { value: '', label: 'ללא ייעוד' },
  { value: 'ריקוד', label: 'ריקוד' },
  { value: 'יוגה', label: 'יוגה' },
  { value: 'התעמלות', label: 'התעמלות' },
  { value: 'רב-תחומי', label: 'רב-תחומי' },
  { value: 'מוזיקה', label: 'מוזיקה' },
  { value: 'אומנות', label: 'אומנות' },
  { value: 'ספורט קרבי', label: 'ספורט קרבי' },
  { value: 'אחר', label: 'אחר' },
];

export const BRANCH_STATUS_CONFIG = {
  active: {
    label: 'פעיל',
    className: 'bg-success/10 text-success border-success/20',
  },
  maintenance: {
    label: 'בתחזוקה',
    className: 'bg-warning/10 text-warning border-warning/20',
  },
  closed: {
    label: 'סגור',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
};

export const DAY_OF_WEEK_HEBREW: Record<number, string> = {
  0: 'ראשון',
  1: 'שני',
  2: 'שלישי',
  3: 'רביעי',
  4: 'חמישי',
  5: 'שישי',
  6: 'שבת',
};

