'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { City } from '@/types/branch';
import { AddBranchDialogProps } from './types';
import styles from './index.module.css';

export default function AddBranchDialog({ isOpen, onClose, onSuccess }: AddBranchDialogProps) {
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddCity, setShowAddCity] = useState(false);
  const [newCityName, setNewCityName] = useState('');

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
    notes: '',
  });

  const [studios, setStudios] = useState([
    { name: 'סטודיו 1', capacity: 20, notes: '' },
    { name: 'סטודיו 2', capacity: 20, notes: '' },
  ]);

  useEffect(() => {
    if (isOpen) {
      fetchCities();
    }
  }, [isOpen]);

  const fetchCities = async () => {
    try {
      const response = await api.get('/core/cities/');
      const data = response.data.results || response.data;
      setCities(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching cities:', error);
      setCities([]);
    }
  };

  const handleAddCity = async () => {
    if (!newCityName.trim()) return;

    try {
      const response = await api.post('/core/cities/', { name: newCityName });
      setCities([...cities, response.data]);
      setFormData({ ...formData, city: response.data.id });
      setNewCityName('');
      setShowAddCity(false);
    } catch (error) {
      console.error('Error adding city:', error);
      setError('שגיאה בהוספת עיר');
    }
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

  const handleStudioCapacityChange = (index: number, capacity: string) => {
    const capacityNum = parseInt(capacity) || 0;
    const newStudios = [...studios];
    newStudios[index] = { ...newStudios[index], capacity: capacityNum };
    setStudios(newStudios);
  };

  const validateForm = (): string | null => {
    if (!formData.name.trim()) return 'שם הסניף הוא שדה חובה';
    if (formData.name.length < 2) return 'שם הסניף חייב להכיל לפחות 2 תווים';
    if (formData.name.length > 100) return 'שם הסניף לא יכול להכיל יותר מ-100 תווים';
    if (!formData.city) return 'יש לבחור עיר';
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
      const cleanedData = {
        name: formData.name,
        branch_codes: formData.branch_codes.filter(c => c.trim()),
        city: formData.city,
        address: formData.address || '',
        cleaning_managers: formData.cleaning_managers.filter(m => m.trim()),
        cleaning_cost: formData.cleaning_cost ? parseFloat(formData.cleaning_cost) : null,
        monthly_cost: formData.monthly_cost ? parseFloat(formData.monthly_cost) : null,
        wifi_name: formData.wifi_name || '',
        wifi_code: formData.wifi_code || '',
        bluetooth_codes: formData.bluetooth_codes.filter(b => b.trim()),
        custom_details: [],
        is_active: true,
      };

      const branchResponse = await api.post('/core/branches/', cleanedData);
      const branchId = branchResponse.data.id;

      const studioPromises = studios.map(studio =>
        api.post('/core/rooms/', {
          name: studio.name,
          notes: studio.notes,
          branch: branchId,
          capacity: studio.capacity,
          is_active: true,
        })
      );

      await Promise.all(studioPromises);

      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error creating branch:', error);
      setError(error.response?.data?.detail || 'שגיאה ביצירת הסניף');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
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
      notes: '',
    });
    setStudios([
      { name: 'סטודיו 1', capacity: 20, notes: '' },
      { name: 'סטודיו 2', capacity: 20, notes: '' },
    ]);
    setError(null);
    setShowAddCity(false);
    setNewCityName('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>הוספת סניף חדש</h2>
          <button onClick={handleClose} className={styles.closeButton}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && (
            <div className={styles.errorAlert}>
              {error}
            </div>
          )}

          {/* Basic Info */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>פרטים בסיסיים</h3>

            <div>
              <label className={styles.label}>
                שם הסניף <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input w-full"
                placeholder="לדוגמה: סניף מרכז"
                required
              />
            </div>

            <div>
              <label className={styles.label}>
                עיר <span className="text-destructive">*</span>
              </label>
              {!showAddCity ? (
                <div className={styles.cityRow}>
                  <select
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="input flex-1"
                    required
                  >
                    <option value="">בחר עיר</option>
                    {cities.map((city: any) => (
                      <option key={city.id} value={city.id}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowAddCity(true)}
                    className="btn-secondary whitespace-nowrap"
                  >
                    + עיר חדשה
                  </button>
                </div>
              ) : (
                <div className={styles.cityRow}>
                  <input
                    type="text"
                    value={newCityName}
                    onChange={(e) => setNewCityName(e.target.value)}
                    className="input flex-1"
                    placeholder="שם העיר"
                  />
                  <button type="button" onClick={handleAddCity} className="btn-primary">
                    הוסף
                  </button>
                  <button type="button" onClick={() => setShowAddCity(false)} className="btn-secondary">
                    ביטול
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className={styles.label}>כתובת</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="input w-full"
                placeholder="רחוב, מספר בית, עיר"
              />
            </div>

            {/* Branch Codes */}
            <div>
              <label className={styles.label}>קודי סניף</label>
              {formData.branch_codes.map((code, index) => (
                <div key={index} className={styles.arrayFieldRow}>
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
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>עלויות</h3>

            <div className={styles.twoColGrid}>
              <div>
                <label className={styles.label}>עלות חודשית (₪)</label>
                <input
                  type="number"
                  value={formData.monthly_cost}
                  onChange={(e) => setFormData({ ...formData, monthly_cost: e.target.value })}
                  className="input w-full"
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
              </div>

              <div>
                <label className={styles.label}>עלות ניקיון (₪)</label>
                <input
                  type="number"
                  value={formData.cleaning_cost}
                  onChange={(e) => setFormData({ ...formData, cleaning_cost: e.target.value })}
                  className="input w-full"
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            {/* Cleaning Managers */}
            <div>
              <label className={styles.label}>אחראי ניקיון</label>
              {formData.cleaning_managers.map((manager, index) => (
                <div key={index} className={styles.arrayFieldRow}>
                  <input
                    type="text"
                    value={manager}
                    onChange={(e) => handleArrayFieldChange('cleaning_managers', index, e.target.value)}
                    className="input flex-1"
                    placeholder="שם אחראי הניקיון"
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
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>חיבורים</h3>

            <div className={styles.twoColGrid}>
              <div>
                <label className={styles.label}>שם WiFi</label>
                <input
                  type="text"
                  value={formData.wifi_name}
                  onChange={(e) => setFormData({ ...formData, wifi_name: e.target.value })}
                  className="input w-full"
                  placeholder="שם רשת WiFi"
                />
              </div>

              <div>
                <label className={styles.label}>סיסמת WiFi</label>
                <input
                  type="text"
                  value={formData.wifi_code}
                  onChange={(e) => setFormData({ ...formData, wifi_code: e.target.value })}
                  className="input w-full"
                  placeholder="סיסמה"
                />
              </div>
            </div>

            {/* Bluetooth Codes */}
            <div>
              <label className={styles.label}>קודי Bluetooth</label>
              {formData.bluetooth_codes.map((code, index) => (
                <div key={index} className={styles.arrayFieldRow}>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => handleArrayFieldChange('bluetooth_codes', index, e.target.value)}
                    className="input flex-1"
                    placeholder="קוד Bluetooth"
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
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>חדרים וסטודיואים</h3>
            <p className="text-sm text-muted-foreground">הגדר את קיבולת החדרים שייווצרו עם הסניף</p>
            <div className={styles.twoColGrid}>
              {studios.map((studio, index) => (
                <div key={index} className={styles.studioCard}>
                  <div className={styles.studioName}>{studio.name}</div>
                  <div>
                    <label className={styles.studioLabel}>קיבולת החדר</label>
                    <input
                      type="number"
                      value={studio.capacity}
                      onChange={(e) => handleStudioCapacityChange(index, e.target.value)}
                      className="input w-full"
                      min="0"
                      placeholder="מספר אנשים"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className={styles.actions}>
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
              {loading ? 'שומר...' : 'צור סניף'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
