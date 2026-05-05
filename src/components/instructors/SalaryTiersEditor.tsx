'use client';

import { useState } from 'react';
import { Plus, Edit, Trash2, Check, X } from 'lucide-react';
import { SalaryTier } from '@/types/instructor';
import { validateSalaryTiers, formatCurrency } from '@/lib/instructorUtils';

interface SalaryTiersEditorProps {
  tiers: SalaryTier[];
  onChange: (tiers: SalaryTier[]) => void;
}

export default function SalaryTiersEditor({ tiers, onChange }: SalaryTiersEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTier, setEditingTier] = useState<SalaryTier | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newTier, setNewTier] = useState<SalaryTier>({
    min_students: 1,
    max_students: null,
    salary_per_lesson: 250
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  
  const sortedTiers = [...tiers].sort((a, b) => a.min_students - b.min_students);
  
  const handleAdd = () => {
    setIsAdding(true);
    // Suggest next tier based on existing ones
    if (sortedTiers.length > 0) {
      const lastTier = sortedTiers[sortedTiers.length - 1];
      setNewTier({
        min_students: (lastTier.max_students || 0) + 1,
        max_students: null,
        salary_per_lesson: 250
      });
    }
  };
  
  const handleSaveNew = () => {
    const updatedTiers = [...tiers, { ...newTier, id: `temp-${Date.now()}` }];
    const validation = validateSalaryTiers(updatedTiers);
    
    if (!validation.valid) {
      setValidationError(validation.error || 'שגיאה בולידציה');
      return;
    }
    
    onChange(updatedTiers);
    setIsAdding(false);
    setNewTier({ min_students: 1, max_students: null, salary_per_lesson: 250 });
    setValidationError(null);
  };
  
  const handleCancelNew = () => {
    setIsAdding(false);
    setNewTier({ min_students: 1, max_students: null, salary_per_lesson: 250 });
    setValidationError(null);
  };
  
  const handleEdit = (tier: SalaryTier) => {
    setEditingId(tier.id || null);
    setEditingTier({ ...tier });
  };
  
  const handleSaveEdit = () => {
    if (!editingTier) return;
    
    const updatedTiers = tiers.map(t => t.id === editingId ? editingTier : t);
    const validation = validateSalaryTiers(updatedTiers);
    
    if (!validation.valid) {
      setValidationError(validation.error || 'שגיאה בולידציה');
      return;
    }
    
    onChange(updatedTiers);
    setEditingId(null);
    setEditingTier(null);
    setValidationError(null);
  };
  
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingTier(null);
    setValidationError(null);
  };
  
  const handleDelete = (id: string | undefined) => {
    const updatedTiers = tiers.filter(t => t.id !== id);
    onChange(updatedTiers);
  };
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">מדרגות שכר</h3>
        {!isAdding && (
          <button
            type="button"
            onClick={handleAdd}
            className="btn-sm btn-secondary"
          >
            <Plus className="w-3 h-3 ml-1" />
            הוסף מדרגה
          </button>
        )}
      </div>
      
      {validationError && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm">
          {validationError}
        </div>
      )}
      
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-2 text-right">מינימום תלמידים</th>
              <th className="px-4 py-2 text-right">מקסימום תלמידים</th>
              <th className="px-4 py-2 text-right">שכר לשיעור</th>
              <th className="px-4 py-2 text-center">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedTiers.map((tier) => (
              <tr key={tier.id} className="hover:bg-muted/30">
                {editingId === tier.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={editingTier?.min_students || 1}
                        onChange={(e) => setEditingTier(prev => prev ? { ...prev, min_students: parseInt(e.target.value) || 1 } : null)}
                        className="input input-sm w-full"
                        min="1"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={editingTier?.max_students || ''}
                        onChange={(e) => setEditingTier(prev => prev ? { ...prev, max_students: e.target.value ? parseInt(e.target.value) : null } : null)}
                        className="input input-sm w-full"
                        placeholder="ללא הגבלה"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={editingTier?.salary_per_lesson || 0}
                        onChange={(e) => setEditingTier(prev => prev ? { ...prev, salary_per_lesson: parseFloat(e.target.value) || 0 } : null)}
                        className="input input-sm w-full"
                        min="0"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          className="btn-icon btn-sm hover:bg-green-50 hover:text-green-600"
                          title="שמור"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="btn-icon btn-sm hover:bg-red-50 hover:text-red-600"
                          title="ביטול"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2">{tier.min_students}</td>
                    <td className="px-4 py-2">
                      {tier.max_students !== null ? tier.max_students : 'ומעלה'}
                    </td>
                    <td className="px-4 py-2 font-medium">
                      {formatCurrency(tier.salary_per_lesson)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(tier)}
                          className="btn-icon btn-sm hover:bg-blue-50 hover:text-blue-600"
                          title="עריכה"
                        >
                          <Edit className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(tier.id)}
                          className="btn-icon btn-sm hover:bg-red-50 hover:text-red-600"
                          title="מחיקה"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            
            {isAdding && (
              <tr className="bg-blue-50/30">
                <td className="px-4 py-2">
                  <input
                    type="number"
                    value={newTier.min_students}
                    onChange={(e) => setNewTier(prev => ({ ...prev, min_students: parseInt(e.target.value) || 1 }))}
                    className="input input-sm w-full"
                    min="1"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    value={newTier.max_students || ''}
                    onChange={(e) => setNewTier(prev => ({ ...prev, max_students: e.target.value ? parseInt(e.target.value) : null }))}
                    className="input input-sm w-full"
                    placeholder="ללא הגבלה"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    value={newTier.salary_per_lesson}
                    onChange={(e) => setNewTier(prev => ({ ...prev, salary_per_lesson: parseFloat(e.target.value) || 0 }))}
                    className="input input-sm w-full"
                    min="0"
                  />
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={handleSaveNew}
                      className="btn-icon btn-sm hover:bg-green-50 hover:text-green-600"
                      title="שמור"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelNew}
                      className="btn-icon btn-sm hover:bg-red-50 hover:text-red-600"
                      title="ביטול"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {sortedTiers.length === 0 && !isAdding && (
        <p className="text-sm text-muted-foreground text-center py-4">
          לא הוגדרו מדרגות שכר. לחץ על &quot;הוסף מדרגה&quot; כדי להתחיל.
        </p>
      )}
      
      <div className="text-xs text-muted-foreground space-y-1 bg-blue-50 p-3 rounded-lg">
        <p className="font-medium">כללי מדרגות שכר:</p>
        <ul className="list-disc list-inside space-y-1 mr-2">
          <li>המדרגה הראשונה חייבת להתחיל מ-1 תלמיד</li>
          <li>לא יכולים להיות פערים או חפיפות בין מדרגות</li>
          <li>רק המדרגה האחרונה יכולה להיות &quot;ומעלה&quot; (ללא מקסימום)</li>
        </ul>
      </div>
    </div>
  );
}

