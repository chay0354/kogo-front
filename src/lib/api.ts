import axios from 'axios';
import type {
  EarlySignupDiscount,
  SecondChildDiscount,
  AdditionalLessonDiscount,
  EarlySignupDiscountFormData,
  SecondChildDiscountFormData,
  AdditionalLessonDiscountFormData,
  DiscountEvaluation,
  DiscountEvaluationRequest
} from '@/types/discount';
import type { BusinessCustomer, BusinessCustomerFormData } from '@/components/dialogs/NewDocumentDialog/types';
import { dedupeCitiesByName } from '@/lib/cityUtils';
import type { City } from '@/types/branch';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

/** DRF Token auth for cross-origin (Vercel front + API); cookie still set for same-site. */
export const AUTH_TOKEN_STORAGE_KEY = 'kogomalo_auth_token';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 10000,
});

// Request interceptor: Bearer-style Token header when stored (cross-site); cookies still used withCredentials.
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      if (token) {
        config.headers.Authorization = `Token ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
      console.error('Response headers:', error.response.headers);
    }
    return Promise.reject(error);
  }
);

export default api;

// ============================
// Discount API Functions
// ============================

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Fetch all early sign-up discounts (date ranges)
 */
export const fetchEarlySignupDiscounts = async (): Promise<EarlySignupDiscount[]> => {
  const response = await api.get('/customers/discounts/early-signup/');
  const data = response.data;
  if (!Array.isArray(data)) return [];
  return data.map((d: any) => ({
    ...d,
    value: toNumber(d?.value),
  }));
};

/**
 * Create a new early sign-up discount date range
 */
export const createEarlySignupDiscount = async (
  data: EarlySignupDiscountFormData
): Promise<EarlySignupDiscount> => {
  const response = await api.post('/customers/discounts/early-signup/', data);
  return {
    ...response.data,
    value: toNumber(response.data?.value),
  };
};

/**
 * Update an early sign-up discount
 */
export const updateEarlySignupDiscount = async (
  id: string,
  data: Partial<EarlySignupDiscountFormData>
): Promise<EarlySignupDiscount> => {
  const response = await api.patch(`/customers/discounts/${id}/`, data);
  return {
    ...response.data,
    value: toNumber(response.data?.value),
  };
};

/**
 * Delete an early sign-up discount date range
 */
export const deleteEarlySignupDiscount = async (id: string): Promise<void> => {
  await api.delete(`/customers/discounts/${id}/`);
};

/**
 * Fetch the second child discount configuration
 */
export const fetchSecondChildDiscount = async (): Promise<SecondChildDiscount> => {
  const response = await api.get('/customers/discounts/second-child/');
  return {
    ...response.data,
    value: toNumber(response.data?.value),
  };
};

/**
 * Update the second child discount value
 */
export const updateSecondChildDiscount = async (
  data: SecondChildDiscountFormData
): Promise<SecondChildDiscount> => {
  const response = await api.put('/customers/discounts/second-child/', data);
  return {
    ...response.data,
    value: toNumber(response.data?.value),
  };
};

/**
 * Fetch the additional lesson discount (for active children with multiple lessons)
 */
export const fetchAdditionalLessonDiscount = async (): Promise<AdditionalLessonDiscount> => {
  const response = await api.get('/customers/discounts/additional-lesson/');
  return {
    ...response.data,
    value: toNumber(response.data?.value),
  };
};

/**
 * Update the additional lesson discount value
 */
export const updateAdditionalLessonDiscount = async (
  data: AdditionalLessonDiscountFormData
): Promise<AdditionalLessonDiscount> => {
  const response = await api.put('/customers/discounts/additional-lesson/', data);
  return {
    ...response.data,
    value: toNumber(response.data?.value),
  };
};

/**
 * Evaluate applicable discounts for a payment
 */
export const evaluateDiscounts = async (
  request: DiscountEvaluationRequest
): Promise<DiscountEvaluation> => {
  const response = await api.post('/customers/discounts/evaluate/', request);
  return response.data;
};

// ============================
// Dashboard API Functions
// ============================

export interface DashboardFilters {
  branch_id?: string;
  date_from?: string;
  date_to?: string;
}

export interface FinancialFilters extends DashboardFilters {}

export interface InstructorsFilters extends DashboardFilters {
  instructor_id?: string;
}

export interface StudentsFilters extends DashboardFilters {
  search_query?: string;
  course_id?: string;
  student_status?: string;
  /** When set with quit_date_to, churn stats use this window instead of date_from/date_to */
  quit_date_from?: string;
  quit_date_to?: string;
  /** Bar chart grouping: course_type (תחום) or course (חוג) */
  quit_chart_breakdown?: 'course_type' | 'course';
  /** Optional filter for the quit bar chart only */
  quit_chart_filter_id?: string;
}

export interface CoursesFilters extends DashboardFilters {
  course_type_id?: string;
  course_id?: string;
}

export interface BranchesFilters {
  branch_id?: string;
  date_from?: string;
  date_to?: string;
}

/**
 * Fetch financial dashboard data
 */
export const fetchFinancialData = async (filters: FinancialFilters) => {
  const response = await api.get('/core/dashboard/financial/', { params: filters });
  return response.data;
};

/**
 * Fetch instructors dashboard data
 */
export const fetchInstructorsData = async (filters: InstructorsFilters) => {
  const response = await api.get('/core/dashboard/instructors/', { params: filters });
  return response.data;
};

/**
 * Fetch students dashboard data
 */
export const fetchStudentsData = async (filters: StudentsFilters) => {
  const response = await api.get('/core/dashboard/students/', { params: filters });
  return response.data;
};

/**
 * Fetch courses dashboard data
 */
export const fetchCoursesData = async (filters: CoursesFilters) => {
  const response = await api.get('/core/dashboard/courses/', { params: filters });
  return response.data;
};

/**
 * Fetch branches dashboard data
 */
export const fetchBranchesData = async (filters: BranchesFilters) => {
  const response = await api.get('/core/dashboard/branches/', { params: filters });
  return response.data;
};

/**
 * Refresh current month snapshots
 * Recalculates all dashboard data for the current month and saves it
 */
export const refreshCurrentMonthSnapshots = async () => {
  const response = await api.post('/core/dashboard/refresh-current-month/');
  return response.data;
};

// ============================
// Reference Data API Functions
// ============================

/**
 * Fetch all active branches for dropdowns
 */
export const fetchBranchesList = async () => {
  const response = await api.get('/core/branches/', { params: { simple: 'true' } });
  return response.data;
};

/**
 * Fetch list of all cities (for dropdowns)
 */
export const fetchCitiesList = async () => {
  const response = await api.get('/core/cities/');
  const data = response.data.results || response.data;
  const list = Array.isArray(data) ? data : [];
  return dedupeCitiesByName(list as City[]);
};

/**
 * Fetch all active courses for dropdowns
 */
export const fetchCoursesList = async () => {
  const response = await api.get('/courses/courses/');
  return response.data;
};

/**
 * Fetch all course types for dropdowns
 */
export const fetchCourseTypesList = async () => {
  const response = await api.get('/courses/types/');
  return response.data;
};

/**
 * Fetch active instructors for dropdowns (fast — no salary metrics).
 */
export const fetchInstructorsDropdown = async () => {
  const response = await api.get('/instructors/', { params: { dropdown: 'true' } });
  const data = response.data;
  if (Array.isArray(data)) return data;
  return data?.instructors || data?.results || [];
};

/**
 * Fetch all active instructors for dropdowns
 * @deprecated Prefer fetchInstructorsDropdown for pickers.
 */
export const fetchInstructorsList = async () => {
  return fetchInstructorsDropdown();
};

export const searchBusinessCustomers = async (query: string): Promise<BusinessCustomer[]> => {
  const res = await api.get('/customers/business-customers/', { params: { search: query } });
  return res.data?.results ?? res.data ?? [];
};

export const createBusinessCustomer = async (data: BusinessCustomerFormData): Promise<BusinessCustomer> => {
  const res = await api.post('/customers/business-customers/', data);
  return res.data;
};

