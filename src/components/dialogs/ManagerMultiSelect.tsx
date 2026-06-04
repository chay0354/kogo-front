'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface ManagerOption {
  id: string;
  name: string;
  email: string;
}

interface ManagerMultiSelectProps {
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  helperText?: string;
}

/**
 * Multi-select list of manager users. Used in the course create/edit dialogs to
 * control which managers can see and manage a course.
 */
export default function ManagerMultiSelect({
  value,
  onChange,
  label = 'מנהלים מורשים',
  helperText = 'רק המנהלים שנבחרו יראו את החוג הזה (בלוח, בקטלוג ובכל המסכים).',
}: ManagerMultiSelectProps) {
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get('/core/users/');
        const raw = Array.isArray(res.data) ? res.data : res.data?.results || [];
        const onlyManagers: ManagerOption[] = raw
          .filter((u: any) => (u.role_display || u.role) === 'manager')
          .map((u: any) => ({
            id: String(u.id),
            name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
            email: u.email,
          }));
        if (!cancelled) setManagers(onlyManagers);
      } catch {
        if (!cancelled) setManagers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {loading ? (
        <div className="text-sm text-gray-400">טוען מנהלים...</div>
      ) : managers.length === 0 ? (
        <div className="text-sm text-gray-400">לא נמצאו מנהלים</div>
      ) : (
        <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-lg p-2 space-y-1">
          {managers.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={value.includes(m.id)}
                onChange={() => toggle(m.id)}
                className="accent-teal-600"
              />
              <span className="text-sm text-gray-800">{m.name}</span>
            </label>
          ))}
        </div>
      )}
      {helperText && <p className="text-xs text-gray-400 mt-1">{helperText}</p>}
    </div>
  );
}
