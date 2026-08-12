import api, { AUTH_TOKEN_STORAGE_KEY } from '@/lib/api';

export type UserRole = 'manager' | 'worker' | 'partner';

export type CurrentUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  role: UserRole | null;
  branch_ids?: string[];
};

export async function login(email: string, password: string): Promise<CurrentUser> {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
  const res = await api.post('/core/auth/login/', { email, password });
  const token = res.data?.token as string | undefined;
  if (token && typeof window !== 'undefined') {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  }
  return res.data.user as CurrentUser;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/core/auth/logout/');
  } finally {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  }
}

export async function me(): Promise<CurrentUser> {
  const res = await api.get('/core/auth/me/');
  return res.data.user as CurrentUser;
}

export async function requestPasswordReset(email: string): Promise<string> {
  const res = await api.post('/core/auth/forgot-password/', { email });
  return (res.data?.message as string) || 'אם כתובת האימייל קיימת במערכת, נשלח אליך קישור לאיפוס סיסמה.';
}

export async function resetPassword(uid: string, token: string, password: string): Promise<string> {
  const res = await api.post('/core/auth/reset-password/', { uid, token, password });
  return (res.data?.message as string) || 'הסיסמה עודכנה בהצלחה.';
}
