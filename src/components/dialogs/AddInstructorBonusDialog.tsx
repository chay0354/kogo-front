'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import api from '@/lib/api';

interface AddInstructorBonusDialogProps {
  instructorId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function AddInstructorBonusDialog({
  instructorId,
  isOpen,
  onClose,
  onSaved,
}: AddInstructorBonusDialogProps) {
  const defaultDate = useMemo(() => todayISO(), []);

  const [amount, setAmount] = useState<number>(0);
  const [bonusDate, setBonusDate] = useState<string>(defaultDate);
  const [description, setDescription] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // reset on open
    setAmount(0);
    setBonusDate(defaultDate);
    setDescription('');
    setNotes('');
    setError(null);
    setIsSubmitting(false);
  }, [isOpen, defaultDate]);

  if (!isOpen) return null;

  const validate = () => {
    if (!bonusDate) return 'חובה לבחור תאריך';
    if (!amount || amount <= 0) return 'סכום חייב להיות גדול מ-0';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await api.post(`/instructors/${instructorId}/add_bonus/`, {
        bonus_type: 'one_time',
        amount,
        bonus_date: bonusDate,
        description,
        notes,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        (typeof err?.response?.data === 'string' ? err.response.data : null) ||
        'שגיאה בהוספת בונוס';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg animate-scale-in m-4"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-bold">הוספת בונוס<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #5</span></h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-semibold mb-2">סכום (₪)</label>
            <input
              type="number"
              value={amount === 0 ? '' : amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              className="input h-11 text-sm"
              min={0}
              placeholder="0"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-semibold mb-2">תאריך</label>
            <input
              type="date"
              value={bonusDate}
              onChange={(e) => setBonusDate(e.target.value)}
              className="input h-11 text-sm"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold mb-2">תיאור (אופציונלי)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input h-11 text-sm"
              placeholder="תיאור הבונוס"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold mb-2">הערות (אופציונלי)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input h-11 text-sm"
              placeholder="הערות"
            />
          </div>

          {/* Footer */}
          <div className="flex justify-start gap-3 pt-2">
            <button type="submit" className="btn-primary px-8 h-11 text-sm" disabled={isSubmitting}>
              {isSubmitting ? 'שומר...' : 'שמור'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-8 h-11 text-sm" disabled={isSubmitting}>
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


