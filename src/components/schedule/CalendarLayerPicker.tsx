'use client';

import { Check, PanelRightClose, PanelRightOpen } from 'lucide-react';
import {
  LAYER_DIMENSION_LABELS,
  layerColor,
  type CalendarLayer,
  type LayerDimension,
  type LayerRailMode,
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
  mode: LayerRailMode;
  onToggleMode: () => void;
};

const DIMENSIONS: LayerDimension[] = ['branch', 'course', 'instructor'];

/**
 * The calendars on the left of a calendar app, and the same idea: the office
 * does not pick one branch, it decides which branches are on the board.
 *
 * The dimension switch above the list is what makes one control serve all
 * three questions — the list underneath is rebuilt from the same week's data,
 * so switching to "מדריך" is a re-key, not a reload.
 *
 * It is also a card the office spends most of its day not touching, so it
 * narrows the way the menu on the other side of the screen narrows: down to a
 * strip of badges that still says which layers are on and still lets them be
 * switched, with the button that widens it again sitting at the top of the
 * strip. Narrowed or wide it stays a column of the page, so the hours behind it
 * are never covered by it.
 */
export default function CalendarLayerPicker({
  dimension,
  onDimensionChange,
  layers,
  selected,
  onToggle,
  onAll,
  onNone,
  mode,
  onToggleMode,
}: Props) {
  if (mode === 'hidden') return null;

  const narrow = mode === 'rail';

  return (
    <div className={`${styles.rail} ${narrow ? styles.railNarrow : ''}`}>
      <div className={styles.railHead}>
        <button
          type="button"
          className={styles.railToggle}
          onClick={onToggleMode}
          aria-expanded={!narrow}
          aria-label={narrow ? 'הרחב את שכבות הלוח' : 'כווץ את שכבות הלוח'}
          title={narrow ? 'הצג לפי' : 'כווץ'}
        >
          {narrow ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
        </button>
        {!narrow ? <p className={styles.railTitle}>הצג לפי</p> : null}
      </div>

      {narrow ? (
        // The dimension is a caption rather than a switch down here: three tabs
        // do not read at this width, and the office changes what it is layering
        // by far less often than it switches a branch on and off.
        <p className={styles.railDim} title={`הצג לפי ${LAYER_DIMENSION_LABELS[dimension]}`}>
          {LAYER_DIMENSION_LABELS[dimension]}
        </p>
      ) : (
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
      )}

      <div className={narrow ? styles.badges : styles.layers}>
        {layers.length === 0 && !narrow ? (
          <p className={styles.railTitle}>אין נתונים בשבוע זה</p>
        ) : null}

        {layers.map((layer) => {
          const on = selected.has(layer.key);
          const color = layerColor(layer.colorIndex);
          const label = `${layer.label}, ${layer.count}`;

          if (narrow) {
            return (
              <button
                key={layer.key}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onToggle(layer.key)}
                className={`${styles.badge} ${on ? '' : styles.badgeOff}`}
                style={{ ['--layer-base' as string]: color.base }}
                title={label}
                aria-label={label}
              >
                {layer.initials}
              </button>
            );
          }

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

      {layers.length > 0 && !narrow ? (
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
