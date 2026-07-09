'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { Branch, CustomDetail, BranchDetail, Room } from '@/types/branch';
import CitySelectField from '@/components/dialogs/CitySelectField';

interface EditBranchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  branch: BranchDetail | null;
}

export default function EditBranchDialog({ isOpen, onClose, onSuccess, branch }: EditBranchDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    branch_codes: [''],
    city: '',
    address: '',
    cleaning_managers: [''],
    cleaning_cost: '',
    monthly_cost: '',
    wifi_name: '',
    wifi_code: '',
    bluetooth_codes: [''],
    custom_details: [] as CustomDetail[],
    is_external: false,
    external_link: '',
    is_active: true,
  });

  const [newCustomDetail, setNewCustomDetail] = useState({ label: '', value: '' });
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    if (isOpen && branch) {
      populateForm(branch);
      setRooms(branch.rooms || []);
    }
  }, [isOpen, branch]);

  const populateForm = (branchData: Branch) => {
    setFormData({
      name: branchData.name || '',
      branch_codes: branchData.branch_codes && branchData.branch_codes.length > 0 
        ? branchData.branch_codes 
        : [''],
      city: branchData.city || '',
      address: branchData.address || '',
      cleaning_managers: branchData.cleaning_managers && branchData.cleaning_managers.length > 0
        ? branchData.cleaning_managers
        : [''],
      cleaning_cost: branchData.cleaning_cost ? String(branchData.cleaning_cost) : '',
      monthly_cost: branchData.monthly_cost ? String(branchData.monthly_cost) : '',
      wifi_name: branchData.wifi_name || '',
      wifi_code: branchData.wifi_code || '',
      bluetooth_codes: branchData.bluetooth_codes && branchData.bluetooth_codes.length > 0
        ? branchData.bluetooth_codes
        : [''],
      custom_details: branchData.custom_details || [],
      is_external: branchData.is_external ?? false,
      external_link: branchData.external_link || '',
      is_active: branchData.is_active,
    });
  };

  const handleArrayFieldChange = (field: keyof typeof formData, index: number, value: string) => {
    const array = formData[field] as string[];
    const newArray = [...array];
    newArray[index] = value;
    setFormData({ ...formData, [field]: newArray });
  };

  const handleAddArrayField = (field: keyof typeof formData) => {
    const array = formData[field] as string[];
    setFormData({ ...formData, [field]: [...array, ''] });
  };

  const handleRemoveArrayField = (field: keyof typeof formData, index: number) => {
    const array = formData[field] as string[];
    if (array.length > 1) {
      const newArray = array.filter((_, i) => i !== index);
      setFormData({ ...formData, [field]: newArray });
    }
  };

  const handleAddCustomDetail = () => {
    if (newCustomDetail.label.trim() && newCustomDetail.value.trim()) {
      setFormData({
        ...formData,
        custom_details: [...formData.custom_details, { ...newCustomDetail }],
      });
      setNewCustomDetail({ label: '', value: '' });
    }
  };

  const handleRemoveCustomDetail = (index: number) => {
    const newDetails = formData.custom_details.filter((_, i) => i !== index);
    setFormData({ ...formData, custom_details: newDetails });
  };

  const handleRoomCapacityChange = (roomId: string, newCapacity: string) => {
    const capacityNum = parseInt(newCapacity) || 0;
    setRooms(rooms.map(room => 
      room.id === roomId ? { ...room, capacity: capacityNum } : room
    ));
  };

  const validateForm = (): string | null => {
    if (!formData.name.trim()) return 'שם הסניף הוא שדה חובה';
    if (formData.name.length < 2) return 'שם הסניף חייב להכיל לפחות 2 תווים';
    if (formData.name.length > 100) return 'שם הסניף לא יכול להכיל יותר מ-100 תווים';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!branch) return;

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const cleanedData = {
        name: formData.name,
        branch_codes: formData.branch_codes.filter(c => c.trim()),
        city: formData.city || null,
        address: formData.address || '',
        cleaning_managers: formData.cleaning_managers.filter(m => m.trim()),
        cleaning_cost: formData.cleaning_cost ? parseFloat(formData.cleaning_cost) : null,
        monthly_cost: formData.monthly_cost ? parseFloat(formData.monthly_cost) : null,
        wifi_name: formData.wifi_name || '',
        wifi_code: formData.wifi_code || '',
        bluetooth_codes: formData.bluetooth_codes.filter(b => b.trim()),
        custom_details: formData.custom_details,
        is_external: formData.is_external,
        external_link: formData.is_external ? formData.external_link : '',
        is_active: formData.is_active,
      };

      await api.patch(`/core/branches/${branch.id}/`, cleanedData);

      // Update room capacities
      const originalRooms = branch.rooms || [];
      for (const room of rooms) {
        const originalRoom = originalRooms.find(r => r.id === room.id);
        if (originalRoom && originalRoom.capacity !== room.capacity) {
          await api.patch(`/core/rooms/${room.id}/`, { capacity: room.capacity });
        }
      }

      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error updating branch:', error);
      setError(error.response?.data?.detail || 'שגיאה בעדכון הסניף');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setNewCustomDetail({ label: '', value: '' });
    onClose();
  };

  if (!isOpen || !branch) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-background">
          <h2 className="text-2xl font-bold">עריכת סניף: {branch.name}<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #16</span></h2>
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

          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">פרטים בסיסיים</h3>
            
            <div>
              <label className="block text-sm font-medium mb-2">
                שם הסניף <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input w-full"
                required
              />
            </div>

            <CitySelectField
              value={formData.city}
              onChange={(cityId) => setFormData({ ...formData, city: cityId })}
              onError={setError}
            />

            <div>
              <label className="block text-sm font-medium mb-2">כתובת</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="input w-full"
              />
            </div>

            {/* External branch toggle */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium" htmlFor="edit_is_external">
                סניף חיצוני
              </label>
              <button
                id="edit_is_external"
                type="button"
                role="switch"
                aria-checked={formData.is_external}
                onClick={() => setFormData({ ...formData, is_external: !formData.is_external })}
                className={`relative inline-flex w-10 h-6 rounded-full transition-colors cursor-pointer border-0 ${formData.is_external ? 'bg-primary' : 'bg-muted'}`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${formData.is_external ? 'right-1 -translate-x-4' : 'right-1'}`}
                />
              </button>
            </div>

            {/* External link — shown only when is_external is on */}
            {formData.is_external && (
              <div>
                <label className="block text-sm font-medium mb-1">לינק לסניף</label>
                <input
                  type="url"
                  value={formData.external_link}
                  onChange={(e) => setFormData({ ...formData, external_link: e.target.value })}
                  placeholder="https://..."
                  className="input w-full"
                />
              </div>
            )}

            {/* Branch Codes */}
            <div>
              <label className="block text-sm font-medium mb-2">קודי סניף</label>
              {formData.branch_codes.map((code, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => handleArrayFieldChange('branch_codes', index, e.target.value)}
                    className="input flex-1"
                    placeholder="לדוגמה: TLV01"
                  />
                  {formData.branch_codes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveArrayField('branch_codes', index)}
                      className="btn-secondary"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => handleAddArrayField('branch_codes')}
                className="btn-secondary text-sm"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                הוסף קוד
              </button>
            </div>
          </div>

          {/* Costs */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">עלויות</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">עלות חודשית (₪)</label>
                <input
                  type="number"
                  value={formData.monthly_cost}
                  onChange={(e) => setFormData({ ...formData, monthly_cost: e.target.value })}
                  className="input w-full"
                  min="0"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">עלות ניקיון (₪)</label>
                <input
                  type="number"
                  value={formData.cleaning_cost}
                  onChange={(e) => setFormData({ ...formData, cleaning_cost: e.target.value })}
                  className="input w-full"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            {/* Cleaning Managers */}
            <div>
              <label className="block text-sm font-medium mb-2">אחראי ניקיון</label>
              {formData.cleaning_managers.map((manager, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={manager}
                    onChange={(e) => handleArrayFieldChange('cleaning_managers', index, e.target.value)}
                    className="input flex-1"
                  />
                  {formData.cleaning_managers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveArrayField('cleaning_managers', index)}
                      className="btn-secondary"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => handleAddArrayField('cleaning_managers')}
                className="btn-secondary text-sm"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                הוסף אחראי
              </button>
            </div>
          </div>

          {/* WiFi & Bluetooth */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">חיבורים</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">שם WiFi</label>
                <input
                  type="text"
                  value={formData.wifi_name}
                  onChange={(e) => setFormData({ ...formData, wifi_name: e.target.value })}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">סיסמת WiFi</label>
                <input
                  type="text"
                  value={formData.wifi_code}
                  onChange={(e) => setFormData({ ...formData, wifi_code: e.target.value })}
                  className="input w-full"
                />
              </div>
            </div>

            {/* Bluetooth Codes */}
            <div>
              <label className="block text-sm font-medium mb-2">קודי Bluetooth</label>
              {formData.bluetooth_codes.map((code, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => handleArrayFieldChange('bluetooth_codes', index, e.target.value)}
                    className="input flex-1"
                  />
                  {formData.bluetooth_codes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveArrayField('bluetooth_codes', index)}
                      className="btn-secondary"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => handleAddArrayField('bluetooth_codes')}
                className="btn-secondary text-sm"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                הוסף קוד
              </button>
            </div>
          </div>

          {/* Rooms and Studios */}
          {rooms.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">חדרים וסטודיואים</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rooms.map((room: any) => (
                  <div key={room.id} className="p-4 border border-border rounded-lg">
                    <div className="font-medium mb-2">{room.name}</div>
                    {room.purpose && (
                      <div className="text-sm text-muted-foreground mb-2">ייעוד: {room.purpose}</div>
                    )}
                    <div>
                      <label className="block text-sm font-medium mb-1">קיבולת החדר</label>
                      <input
                        type="number"
                        value={room.capacity}
                        onChange={(e) => handleRoomCapacityChange(room.id, e.target.value)}
                        className="input w-full"
                        min="0"
                        placeholder="מספר אנשים"
                      />
                    </div>
                    {room.notes && (
                      <div className="text-sm text-muted-foreground mt-2">{room.notes}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom Details */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">פרטים מותאמים אישית</h3>
            
            {formData.custom_details.length > 0 && (
              <div className="space-y-2">
                {formData.custom_details.map((detail, index) => (
                  <div key={index} className="flex items-center gap-2 p-3 border border-border rounded-lg">
                    <div className="flex-1">
                      <span className="text-sm font-medium">{detail.label}:</span>
                      <span className="text-sm mr-2">{detail.value}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomDetail(index)}
                      className="btn-secondary"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={newCustomDetail.label}
                onChange={(e) => setNewCustomDetail({ ...newCustomDetail, label: e.target.value })}
                className="input flex-1"
                placeholder="תווית (לדוגמה: קוד אזעקה)"
              />
              <input
                type="text"
                value={newCustomDetail.value}
                onChange={(e) => setNewCustomDetail({ ...newCustomDetail, value: e.target.value })}
                className="input flex-1"
                placeholder="ערך"
              />
              <button
                type="button"
                onClick={handleAddCustomDetail}
                className="px-3 py-0.5 border border-green-500 bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors font-medium text-xs"
              >
                הוסף
              </button>
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
              {loading ? 'שומר...' : 'שמור שינויים'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

