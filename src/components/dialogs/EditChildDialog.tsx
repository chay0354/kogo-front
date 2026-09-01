'use client';

import { useState, useEffect } from 'react';
import { ChildWithDetails } from '@/types/customer';
import { X, Loader2 } from 'lucide-react';
import dialogMotion from '@/components/ui/motion.module.css';
import { useDialogExit } from '@/components/ui/motion';

interface EditChildDialogProps {
  child: ChildWithDetails;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}

export default function EditChildDialog({ child, isOpen, onClose: dismiss, onSave }: EditChildDialogProps) {
  const { closing, requestClose: onClose } = useDialogExit(dismiss);
  const [formData, setFormData] = useState({
    first_name: child.first_name,
    last_name: child.last_name,
    birth_date: child.birth_date || '',
    gender: child.gender || 'male',
    id_number: child.id_number || '',
  });

  // Update form data when child changes
  useEffect(() => {
    if (isOpen && child) {
      setFormData({
        first_name: child.first_name,
        last_name: child.last_name,
        birth_date: child.birth_date || '',
        gender: child.gender || 'male',
        id_number: child.id_number || '',
      });
    }
  }, [child, isOpen]);

  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch {
      // parent surfaces the error; keep the dialog open so the user can retry
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${dialogMotion.overlay} ${closing ? dialogMotion.overlayClosing : ''}`} onClick={onClose}>
      <div 
        className={`bg-white rounded-lg shadow-xl w-full max-w-md ${dialogMotion.panel} ${closing ? dialogMotion.panelClosing : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-bold">עריכת פרופיל - {child.full_name}<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #17</span></h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">שם פרטי</label>
            <input
              type="text"
              value={formData.first_name}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">שם משפחה</label>
            <input
              type="text"
              value={formData.last_name}
              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">תאריך לידה</label>
            <input
              type="date"
              value={formData.birth_date}
              onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">מין</label>
            <select
              value={formData.gender}
              onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'male' | 'female' })}
              className="input"
              required
            >
              <option value="male">זכר</option>
              <option value="female">נקבה</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">ת.ז.</label>
            <input
              type="text"
              value={formData.id_number}
              onChange={(e) => setFormData({ ...formData, id_number: e.target.value })}
              className="input"
              placeholder="אופציונלי"
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>
              ביטול
            </button>
            <button type="submit" className="btn-primary flex items-center justify-center gap-2" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              שמור שינויים
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

