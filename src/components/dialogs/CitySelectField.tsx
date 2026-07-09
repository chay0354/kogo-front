'use client';

import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { City } from '@/types/branch';
import { dedupeCitiesByName, findCityByName, normalizeCityName } from '@/lib/cityUtils';
import styles from './CitySelectField.module.css';

interface CitySelectFieldProps {
  value: string;
  onChange: (cityId: string) => void;
  required?: boolean;
  label?: string;
  onError?: (message: string | null) => void;
}

export default function CitySelectField({
  value,
  onChange,
  required = false,
  label = 'עיר',
  onError,
}: CitySelectFieldProps) {
  const [cities, setCities] = useState<City[]>([]);
  const [showAddCity, setShowAddCity] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [loading, setLoading] = useState(false);

  const setFieldError = (message: string | null) => {
    onError?.(message);
  };

  const fetchCities = useCallback(async () => {
    try {
      const response = await api.get('/core/cities/');
      const data = response.data.results || response.data;
      const list = Array.isArray(data) ? data : [];
      setCities(dedupeCitiesByName(list));
    } catch (error) {
      console.error('Error fetching cities:', error);
      setCities([]);
    }
  }, []);

  useEffect(() => {
    fetchCities();
  }, [fetchCities]);

  const handleAddCity = async () => {
    const trimmed = normalizeCityName(newCityName);
    if (!trimmed) return;

    const existing = findCityByName(cities, trimmed);
    if (existing) {
      onChange(existing.id);
      setNewCityName('');
      setShowAddCity(false);
      setFieldError(null);
      return;
    }

    setLoading(true);
    setFieldError(null);
    try {
      const response = await api.post('/core/cities/', { name: trimmed });
      setCities((prev) => dedupeCitiesByName([...prev, response.data]));
      onChange(response.data.id);
      setNewCityName('');
      setShowAddCity(false);
    } catch (error: any) {
      console.error('Error adding city:', error);
      const message =
        error.response?.data?.name?.[0] ||
        error.response?.data?.detail ||
        'שגיאה בהוספת עיר';
      setFieldError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCity = async () => {
    if (!value) {
      setFieldError('יש לבחור עיר למחיקה');
      return;
    }

    const city = cities.find((item) => item.id === value);
    if (!city) return;

    const confirmed = window.confirm(
      `האם למחוק את העיר "${city.name}"?\nסניפים המשויכים אליה יישארו ללא עיר.`
    );
    if (!confirmed) return;

    setLoading(true);
    setFieldError(null);
    try {
      await api.delete(`/core/cities/${value}/`);
      setCities((prev) => prev.filter((item) => item.id !== value));
      onChange('');
      await fetchCities();
    } catch (error: any) {
      console.error('Error deleting city:', error);
      const message =
        error.response?.data?.detail ||
        error.response?.data?.error ||
        'שגיאה במחיקת עיר';
      setFieldError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <label className={styles.label}>
        {label} {required && <span className="text-destructive">*</span>}
      </label>

      {!showAddCity ? (
        <div className={styles.cityRow}>
          <select
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setFieldError(null);
            }}
            className="input flex-1 min-w-0"
            required={required}
            disabled={loading}
          >
            <option value="">בחר עיר</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowAddCity(true)}
            className="btn-secondary whitespace-nowrap"
            disabled={loading}
          >
            + עיר חדשה
          </button>
          <button
            type="button"
            onClick={handleDeleteCity}
            className="btn-secondary text-destructive hover:bg-destructive/10"
            title="מחק עיר"
            disabled={loading || !value}
            aria-label="מחק עיר"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className={styles.cityRow}>
          <input
            type="text"
            value={newCityName}
            onChange={(e) => setNewCityName(e.target.value)}
            className="input flex-1 min-w-0"
            placeholder="שם העיר"
            disabled={loading}
          />
          <button type="button" onClick={handleAddCity} className="btn-primary" disabled={loading}>
            הוסף
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAddCity(false);
              setNewCityName('');
            }}
            className="btn-secondary"
            disabled={loading}
          >
            ביטול
          </button>
        </div>
      )}
    </div>
  );
}
