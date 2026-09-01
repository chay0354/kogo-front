'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import api from '@/lib/api';
import { Branch } from '@/types/customer';
import { PartnerFormData, PartnerListItem } from '@/types/partner';
import { normalizePartnerErrors } from './AddPartnerDialog';
import dialogMotion from '@/components/ui/motion.module.css';
import { useDialogExit } from '@/components/ui/motion';

interface EditPartnerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  partner: PartnerListItem;
  onSave: () => void;
}

export default function EditPartnerDialog({ isOpen, onClose: dismiss, partner, onSave }: EditPartnerDialogProps) {
  const { closing, requestClose: onClose } = useDialogExit(dismiss);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [formData, setFormData] = useState<PartnerFormData>({
    email: '',
    first_name: '',
    last_name: '',
    is_active: true,
    branch_ids: [],
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      email: partner.email,
      first_name: partner.first_name || '',
      last_name: partner.last_name || '',
      is_active: partner.is_active,
      branch_ids: partner.branches?.map((b) => b.id) || [],
      password: '',
    });
    setErrors({});
    api.get('/core/branches/').then((response) => {
      setBranches(response.data.results || response.data || []);
    }).catch(console.error);
  }, [isOpen, partner]);

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
    if (formData.branch_ids.length === 0) next.branch_ids = 'יש לבחור לפחות סניף אחד';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const payload: PartnerFormData = { ...formData };
      if (!payload.password) delete payload.password;
      await api.patch(`/core/partners/${partner.id}/`, payload);
      onSave();
      onClose();
    } catch (error: any) {
      setErrors(normalizePartnerErrors(error?.response?.data));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 ${dialogMotion.overlay} ${closing ? dialogMotion.overlayClosing : ''}`}>
      <div className={`bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto ${dialogMotion.panel} ${closing ? dialogMotion.panelClosing : ''}`}>
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">עריכת שותף</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {errors.general && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {errors.general}
            </div>
          )}
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
            <label className="block text-sm font-medium mb-1">סיסמה חדשה (אופציונלי)</label>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
            {errors.password ? (
              <p className="text-sm text-red-500 mt-1">{errors.password}</p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">לפחות 8 תווים, לא רק ספרות</p>
            )}
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
            {isSubmitting ? 'שומר...' : 'שמור שינויים'}
          </button>
        </div>
      </div>
    </div>
  );
}
