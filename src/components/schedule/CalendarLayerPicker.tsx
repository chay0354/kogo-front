'use client';

import { Check } from 'lucide-react';
import {
  LAYER_DIMENSION_LABELS,
  layerColor,
  type CalendarLayer,
  type LayerDimension,
} from './calendarLayers';
import styles from './theme/calendar.module.css';

type Props = {
  dimension: LayerDimension;
  onDimensionChange: (dimension: LayerDimension) => void;
  layers: CalendarLayer[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onAll: () => void;
  onNone: () => void;
};

const DIMENSIONS: LayerDimension[] = ['branch', 'course', 'instructor'];

/**
 * The calendars on the left of a calendar app, and the same idea: the office
 * does not pick one branch, it decides which branches are on the board.
 *
 * The dimension switch above the list is what makes one control serve all
 * three questions — the list underneath is rebuilt from the same week's data,
 * so switching to "מדריך" is a re-key, not a reload.
 */
export default function CalendarLayerPicker({
  dimension,
  onDimensionChange,
  layers,
  selected,
  onToggle,
  onAll,
  onNone,
}: Props) {
  return (
    <div className={styles.rail}>
      <p className={styles.railTitle}>הצג לפי</p>

      <div className={styles.dims} role="tablist" aria-label="ממד תצוגה">
        {DIMENSIONS.map((dim) => (
          <button
            key={dim}
            type="button"
            role="tab"
            aria-selected={dim === dimension}
            onClick={() => onDimensionChange(dim)}
            className={`${styles.dim} ${dim === dimension ? styles.dimOn : ''}`}
          >
            {LAYER_DIMENSION_LABELS[dim]}
          </button>
        ))}
      </div>

      <div className={styles.layers}>
        {layers.length === 0 ? (
          <p className={styles.railTitle}>אין נתונים בשבוע זה</p>
        ) : null}

        {layers.map((layer) => {
          const on = selected.has(layer.key);
          const color = layerColor(layer.colorIndex);
          return (
            <button
              key={layer.key}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => onToggle(layer.key)}
              className={`${styles.layer} ${on ? '' : styles.layerOff}`}
              style={{ ['--layer-base' as string]: color.base }}
            >
              <span className={`${styles.box} ${on ? styles.boxOn : ''}`}>
                {on ? <Check size={11} strokeWidth={3.5} /> : null}
              </span>
              <span className={styles.layerName} title={layer.label}>
                {layer.label}
              </span>
              <span className={styles.layerCount}>{layer.count}</span>
            </button>
          );
        })}
      </div>

      {layers.length > 0 ? (
        <div className={styles.railActions}>
          <button type="button" className={styles.railBtn} onClick={onAll}>
            הצג הכל
          </button>
          <button type="button" className={styles.railBtn} onClick={onNone}>
            נקה
          </button>
        </div>
      ) : null}
    </div>
  );
}
