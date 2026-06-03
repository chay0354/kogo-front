'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import api from '@/lib/api';
import { Branch, ROOM_PURPOSES, DEFAULT_ROOM_CAPACITY } from '@/types/branch';

interface AddRoomDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedBranchId?: string;
}

export default function AddRoomDialog({ 
  isOpen, 
  onClose, 
  onSuccess, 
  preselectedBranchId 
}: AddRoomDialogProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    branch: preselectedBranchId || '',
    name: '',
    purpose: '',
    capacity: DEFAULT_ROOM_CAPACITY,
    notes: '',
  });

  useEffect(() => {
    if (isOpen) {
      fetchBranches();
    }
  }, [isOpen]);

  useEffect(() => {
    if (preselectedBranchId) {
      setFormData(prev => ({ ...prev, branch: preselectedBranchId }));
    }
  }, [preselectedBranchId]);

  const fetchBranches = async () => {
    try {
      const response = await api.get('/core/branches/?simple=true');
      // Handle paginated response
      const data = response.data.results || response.data;
      setBranches(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching branches:', error);
      setBranches([]);
    }
  };

  const validateForm = (): string | null => {
    if (!formData.branch) return 'יש לבחור סניף';
    if (!formData.name.trim()) return 'שם החדר הוא שדה חובה';
    if (formData.name.length > 50) return 'שם החדר לא יכול להכיל יותר מ-50 תווים';
    if (formData.capacity < 1) return 'קיבולת החדר חייבת להיות לפחות 1';
    if (formData.notes.length > 500) return 'הערות לא יכולות להכיל יותר מ-500 תווים';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.post('/core/rooms/', {
        branch: formData.branch,
        name: formData.name,
        purpose: formData.purpose || '',
        capacity: formData.capacity,
        notes: formData.notes || '',
        is_active: true,
      });

      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error creating room:', error);
      setError(error.response?.data?.detail || 'שגיאה ביצירת החדר');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      branch: preselectedBranchId || '',
      name: '',
      purpose: '',
      capacity: DEFAULT_ROOM_CAPACITY,
      notes: '',
    });
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-background">
          <h2 className="text-2xl font-bold">הוספת חדר/סטודיו<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #8</span></h2>
          <button onClick={handleClose} className="p-2 hover:bg-accent rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">
              סניף <span className="text-destructive">*</span>
            </label>
            <select
              value={formData.branch}
              onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
              className="input w-full"
              required
              disabled={!!preselectedBranchId}
            >
              <option value="">בחר סניף</option>
              {branches.map((branch: any) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              שם החדר <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input w-full"
              placeholder="לדוגמה: סטודיו 1, חדר ריקוד"
              required
              maxLength={50}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">ייעוד החדר</label>
            <select
              value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              className="input w-full"
            >
              {ROOM_PURPOSES.map((purpose) => (
                <option key={purpose.value} value={purpose.value}>
                  {purpose.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              קיבולת (מספר משתתפים)
            </label>
            <input
              type="number"
              value={formData.capacity}
              onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 0 })}
              className="input w-full"
              min="1"
              placeholder="20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">הערות</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="input w-full"
              rows={4}
              placeholder="הערות נוספות לגבי החדר..."
              maxLength={500}
            />
            <div className="text-xs text-muted-foreground mt-1">
              {formData.notes.length}/500 תווים
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={handleClose}
              className="btn-secondary"
              disabled={loading}
            >
              ביטול
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? 'שומר...' : 'הוסף חדר'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

