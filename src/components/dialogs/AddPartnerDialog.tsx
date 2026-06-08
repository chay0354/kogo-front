'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import api from '@/lib/api';
import { Branch } from '@/types/customer';
import { PartnerFormData } from '@/types/partner';

interface AddPartnerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

const emptyForm: PartnerFormData = {
  email: '',
  first_name: '',
  last_name: '',
  is_active: true,
  branch_ids: [],
  password: '',
};

export default function AddPartnerDialog({ isOpen, onClose, onSave }: AddPartnerDialogProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [formData, setFormData] = useState<PartnerFormData>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFormData(emptyForm);
    setErrors({});
    api.get('/core/branches/').then((response) => {
      setBranches(response.data.results || response.data || []);
    }).catch(console.error);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBranchToggle = (branchId: string) => {
    setFormData((prev) => ({
      ...prev,
      branch_ids: prev.branch_ids.includes(branchId)
        ? prev.branch_ids.filter((id) => id !== branchId)
        : [...prev.branch_ids, branchId],
    }));
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!formData.email.trim()) next.email = 'שדה חובה';
    if (!formData.password?.trim()) next.password = 'שדה חובה';
    if (formData.branch_ids.length === 0) next.branch_ids = 'יש לבחור לפחות סניף אחד';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await api.post('/core/partners/', formData);
      onSave();
      onClose();
    } catch (error: any) {
      const data = error?.response?.data;
      setErrors(typeof data === 'object' ? data : { general: 'שגיאה בשמירה' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">הוספת שותף</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">אימייל</label>
            <input
              type="email"
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
            {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">שם פרטי</label>
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">שם משפחה</label>
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">סיסמה</label>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
            {errors.password && <p className="text-sm text-red-500 mt-1">{errors.password}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">סניפים משויכים</label>
            <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-3">
              {branches.map((branch) => (
                <label key={branch.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formData.branch_ids.includes(branch.id)}
                    onChange={() => handleBranchToggle(branch.id)}
                  />
                  {branch.name}
                </label>
              ))}
            </div>
            {errors.branch_ids && <p className="text-sm text-red-500 mt-1">{errors.branch_ids}</p>}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
            />
            פעיל
          </label>
        </div>

        <div className="flex justify-end gap-2 p-6 border-t">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg" disabled={isSubmitting}>
            ביטול
          </button>
          <button onClick={handleSubmit} className="btn-primary px-4 py-2 rounded-lg" disabled={isSubmitting}>
            {isSubmitting ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </div>
    </div>
  );
}
