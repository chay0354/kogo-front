'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import api from '@/lib/api';
import { Branch } from '@/types/customer';
import {
  InstructorFormData,
  SalaryTier,
  SalaryModelType
} from '@/types/instructor';
import { validatePhoneNumber } from '@/lib/instructorUtils';
import SalaryTiersEditor from '@/components/instructors/SalaryTiersEditor';

interface AddInstructorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function AddInstructorDialog({ isOpen, onClose, onSave }: AddInstructorDialogProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [formData, setFormData] = useState<InstructorFormData>({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    specialization: '',
    primary_branch: null,
    salary_model_type: 'fixed_per_lesson',
    fixed_salary_per_lesson: 250,
    salary_tiers: [],
    branch_ids: [],
    is_active: true
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const response = await api.get('/core/branches/');
        setBranches(response.data.results || response.data || []);
      } catch (error) {
        console.error('Error loading branches:', error);
      }
    };
    
    if (isOpen) {
      loadBranches();
    }
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  const handleSalaryModelChange = (type: SalaryModelType) => {
    setFormData(prev => ({
      ...prev,
      salary_model_type: type,
      // Start empty by default; user must add tiers manually.
      salary_tiers: []
    }));
  };
  
  const handleBranchToggle = (branchId: string) => {
    setFormData(prev => ({
      ...prev,
      branch_ids: prev.branch_ids.includes(branchId)
        ? prev.branch_ids.filter(id => id !== branchId)
        : [...prev.branch_ids, branchId]
    }));
  };
  
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.first_name.trim()) {
      newErrors.first_name = 'שדה חובה';
    }
    
    if (!formData.last_name.trim()) {
      newErrors.last_name = 'שדה חובה';
    }
    
    if (!formData.phone.trim()) {
      newErrors.phone = 'שדה חובה';
    } else if (!validatePhoneNumber(formData.phone)) {
      newErrors.phone = 'מספר טלפון לא תקין (10 ספרות, מתחיל ב-0)';
    }
    
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'כתובת מייל לא תקינה';
    }
    
    if (formData.salary_model_type === 'fixed_per_lesson' && formData.fixed_salary_per_lesson < 1) {
      newErrors.fixed_salary_per_lesson = 'שכר חייב להיות גדול מ-0';
    }
    
    if (formData.salary_model_type === 'tiered_by_students' && (formData.salary_tiers?.length ?? 0) === 0) {
      newErrors.salary_tiers = 'חובה להגדיר לפחות מדרגה אחת';
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
      await api.post('/instructors/', formData);
      onSave();
      onClose();
      
      // Reset form
      setFormData({
        first_name: '',
        last_name: '',
        phone: '',
        email: '',
        specialization: '',
        primary_branch: null,
        salary_model_type: 'fixed_per_lesson',
        fixed_salary_per_lesson: 250,
        salary_tiers: [],
        branch_ids: [],
        is_active: true
      });
      setErrors({});
    } catch (error: any) {
      console.error('Error creating instructor:', error);
      
      // Handle validation errors from server
      if (error.response?.data) {
        const serverErrors: Record<string, string> = {};
        Object.keys(error.response.data).forEach(key => {
          const value = error.response.data[key];
          serverErrors[key] = Array.isArray(value) ? value[0] : value;
        });
        setErrors(serverErrors);
      } else {
        setErrors({ general: 'שגיאה ביצירת מדריך. נסה שוב.' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in overflow-y-auto py-8" onClick={onClose}>
      <div 
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl animate-scale-in m-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold">הוסף מדריך חדש<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #6</span></h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {errors.general && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
              {errors.general}
            </div>
          )}
          
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">פרטים אישיים</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  שם פרטי <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className={`input ${errors.first_name ? 'border-red-500' : ''}`}
                  placeholder="שם פרטי"
                />
                {errors.first_name && (
                  <p className="text-red-500 text-xs mt-1">{errors.first_name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  שם משפחה <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className={`input ${errors.last_name ? 'border-red-500' : ''}`}
                  placeholder="שם משפחה"
                />
                {errors.last_name && (
                  <p className="text-red-500 text-xs mt-1">{errors.last_name}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  טלפון <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className={`input ${errors.phone ? 'border-red-500' : ''}`}
                  placeholder="05X-XXX-XXXX"
                />
                {errors.phone && (
                  <p className="text-red-500 text-xs mt-1">{errors.phone}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">אימייל</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={`input ${errors.email ? 'border-red-500' : ''}`}
                  placeholder="email@example.com"
                />
                {errors.email && (
                  <p className="text-red-500 text-xs mt-1">{errors.email}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">התמחות</label>
              <input
                type="text"
                value={formData.specialization}
                onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                className="input"
                placeholder="קפואירה, כדורסל, ג'ודו..."
              />
            </div>
          </div>
          
          {/* Branches */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">סניפים</h3>
            
            <div>
              <label className="block text-sm font-medium mb-2">סניף ראשי</label>
              <select
                value={formData.primary_branch || ''}
                onChange={(e) => setFormData({ ...formData, primary_branch: e.target.value || null })}
                className="input"
              >
                <option value="">ללא סניף ראשי</option>
                {branches.map((branch: any) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">סניפים נוספים</label>
              <div className="border rounded-lg p-4 space-y-2 max-h-40 overflow-y-auto">
                {branches.map((branch: any) => (
                  <label key={branch.id} className="flex items-center space-x-2 space-x-reverse cursor-pointer hover:bg-muted/30 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={formData.branch_ids.includes(branch.id)}
                      onChange={() => handleBranchToggle(branch.id)}
                      className="form-checkbox"
                    />
                    <span>{branch.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          
          {/* Salary Model */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">מודל שכר</h3>
            
            <div className="space-y-2">
              <label className="flex items-center space-x-3 space-x-reverse cursor-pointer p-3 border rounded-lg hover:bg-muted/30">
                <input
                  type="radio"
                  checked={formData.salary_model_type === 'fixed_per_lesson'}
                  onChange={() => handleSalaryModelChange('fixed_per_lesson')}
                  className="form-radio"
                />
                <span className="flex-1">שכר קבוע לשיעור</span>
              </label>
              
              {formData.salary_model_type === 'fixed_per_lesson' && (
                <div className="mr-8">
                  <label className="block text-sm font-medium mb-2">
                    שכר לשיעור (₪) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.fixed_salary_per_lesson}
                    onChange={(e) => setFormData({ ...formData, fixed_salary_per_lesson: parseFloat(e.target.value) || 0 })}
                    className={`input ${errors.fixed_salary_per_lesson ? 'border-red-500' : ''}`}
                    min="1"
                  />
                  {errors.fixed_salary_per_lesson && (
                    <p className="text-red-500 text-xs mt-1">{errors.fixed_salary_per_lesson}</p>
                  )}
                </div>
              )}
              
              <label className="flex items-center space-x-3 space-x-reverse cursor-pointer p-3 border rounded-lg hover:bg-muted/30">
                <input
                  type="radio"
                  checked={formData.salary_model_type === 'tiered_by_students'}
                  onChange={() => handleSalaryModelChange('tiered_by_students')}
                  className="form-radio"
                />
                <span className="flex-1">מדורג לפי מספר תלמידים</span>
              </label>
              
              {formData.salary_model_type === 'tiered_by_students' && (
                <div className="mr-8">
                  <SalaryTiersEditor
                    tiers={formData.salary_tiers || []}
                    onChange={(tiers) => setFormData({ ...formData, salary_tiers: tiers })}
                  />
                  {errors.salary_tiers && (
                    <p className="text-red-500 text-xs mt-1">{errors.salary_tiers}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
              ביטול
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'שומר...' : 'שמור מדריך'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

