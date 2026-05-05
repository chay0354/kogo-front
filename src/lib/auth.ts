import api from '@/lib/api';

export type UserRole = 'manager' | 'worker';

export type CurrentUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  role: UserRole | null;
};

export async function login(email: string, password: string): Promise<CurrentUser> {
  const res = await api.post('/core/auth/login/', { email, password });
  return res.data.user as CurrentUser;
}

export async function logout(): Promise<void> {
  await api.post('/core/auth/logout/');
}

export async function me(): Promise<CurrentUser> {
  const res = await api.get('/core/auth/me/');
  return res.data.user as CurrentUser;
}
