'use client';

import { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import api from '@/lib/api';
import {
  InstructorListItem,
  BulkBonusFormData
} from '@/types/instructor';
import { formatCurrency, getLastNMonths } from '@/lib/instructorUtils';

interface AddBulkBonusDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function AddBulkBonusDialog({ isOpen, onClose, onSave }: AddBulkBonusDialogProps) {
  const [instructors, setInstructors] = useState<InstructorListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState<BulkBonusFormData>({
    instructor_ids: [],
    bonus_type: 'one_time',
    amount: 0,
    bonus_date: '',
    description: '',
    notes: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const monthOptions = getLastNMonths(12);
  
  useEffect(() => {
    const loadInstructors = async () => {
      try {
        const response = await api.get('/instructors/');
        const data = response.data;
        setInstructors(data.instructors || []);
      } catch (error) {
        console.error('Error loading instructors:', error);
      }
    };
    
    if (isOpen) {
      loadInstructors();
      // Set default month to current month
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      setFormData(prev => ({ ...prev, bonus_date: currentMonth }));
    }
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  const filteredInstructors = instructors.filter(instructor =>
    instructor.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    instructor.phone.includes(searchQuery) ||
    instructor.email.toLowerCase().includes(searchQuery)
  );
  
  const handleSelectAll = () => {
    setFormData(prev => ({
      ...prev,
      instructor_ids: filteredInstructors.map(i => i.id)
    }));
  };
  
  const handleClearSelection = () => {
    setFormData(prev => ({ ...prev, instructor_ids: [] }));
  };
  
  const handleToggleInstructor = (instructorId: string) => {
    setFormData(prev => ({
      ...prev,
      instructor_ids: prev.instructor_ids.includes(instructorId)
        ? prev.instructor_ids.filter(id => id !== instructorId)
        : [...prev.instructor_ids, instructorId]
    }));
  };
  
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (formData.instructor_ids.length === 0) {
      newErrors.instructor_ids = 'חובה לבחור לפחות מדריך אחד';
    }
    
    if (!formData.amount || formData.amount <= 0) {
      newErrors.amount = 'סכום חייב להיות גדול מ-0';
    }
    
    if (!formData.bonus_date) {
      newErrors.bonus_date = 'חובה לבחור תאריך';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await api.post('/instructors/bulk_bonus/', formData);
      onSave();
      onClose();
      
      // Reset form
      setFormData({
        instructor_ids: [],
        bonus_type: 'one_time',
        amount: 0,
        bonus_date: '',
        description: '',
        notes: ''
      });
      setErrors({});
      setSearchQuery('');
    } catch (error: any) {
      console.error('Error creating bulk bonus:', error);
      
      // Handle validation errors from server
      if (error.response?.data) {
        if (error.response.data.error) {
          setErrors({ general: error.response.data.error });
        } else {
          const serverErrors: Record<string, string> = {};
          Object.keys(error.response.data).forEach(key => {
            const value = error.response.data[key];
            serverErrors[key] = Array.isArray(value) ? value[0] : value;
          });
          setErrors(serverErrors);
        }
      } else {
        setErrors({ general: 'שגיאה ביצירת בונוסים. נסה שוב.' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const totalAmount = formData.instructor_ids.length * formData.amount;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div 
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl animate-scale-in m-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-bold">הוסף בונוס קבוצתי</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {errors.general && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
                {errors.general}
              </div>
            )}
            
            {/* Bonus Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">פרטי בונוס</h3>
              
              <div>
                <label className="block text-sm font-medium mb-2">
                  סכום (₪) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.amount || ''}
                  onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  className={`input ${errors.amount ? 'border-red-500' : ''}`}
                  placeholder="סכום הבונוס"
                  min="1"
                />
                {errors.amount && (
                  <p className="text-red-500 text-xs mt-1">{errors.amount}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  חודש <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.bonus_date}
                  onChange={(e) => setFormData({ ...formData, bonus_date: e.target.value })}
                  className={`input ${errors.bonus_date ? 'border-red-500' : ''}`}
                >
                  <option value="">בחר חודש</option>
                  {monthOptions.map(month => (
                    <option key={month.value} value={`${month.value}-01`}>
                      {month.label}
                    </option>
                  ))}
                </select>
                {errors.bonus_date && (
                  <p className="text-red-500 text-xs mt-1">{errors.bonus_date}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">תיאור</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input"
                  placeholder="תיאור הבונוס"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">הערות</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="input"
                  rows={3}
                  placeholder="הערות נוספות"
                />
              </div>
            </div>
            
            {/* Instructor Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  בחר מדריכים ({formData.instructor_ids.length} נבחרו)
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="btn-sm btn-secondary"
                  >
                    בחר הכל
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="btn-sm btn-secondary"
                  >
                    נקה בחירה
                  </button>
                </div>
              </div>
              
              {errors.instructor_ids && (
                <p className="text-red-500 text-sm">{errors.instructor_ids}</p>
              )}
              
              {/* Search */}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input pr-10"
                  placeholder="חיפוש מדריך..."
                />
              </div>
              
              {/* Instructor List */}
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                {filteredInstructors.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">לא נמצאו מדריכים</p>
                ) : (
                  <div className="divide-y">
                    {filteredInstructors.map(instructor => (
                      <label
                        key={instructor.id}
                        className="flex items-center p-3 hover:bg-muted/30 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={formData.instructor_ids.includes(instructor.id)}
                          onChange={() => handleToggleInstructor(instructor.id)}
                          className="form-checkbox ml-3"
                        />
                        <div className="flex-1">
                          <p className="font-medium">{instructor.full_name}</p>
                          <p className="text-sm text-muted-foreground">{instructor.phone}</p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {instructor.branches.map((branch: any) => (
                            <span key={branch.id} className="badge badge-blue text-xs">
                              {branch.name}
                            </span>
                          ))}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {/* Summary */}
            {formData.instructor_ids.length > 0 && formData.amount > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">סה״כ לתשלום</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrency(totalAmount)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.instructor_ids.length} מדריכים × {formatCurrency(formData.amount)}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/30">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
              ביטול
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'יוצר בונוסים...' : 'צור בונוסים'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

