import type { Lesson, ScheduleEvent } from '@/types/schedule';

/**
 * The dimension the calendar is currently layered by.
 *
 * The office thinks about the week in three ways — which site is busy, how a
 * course runs across the week, and what one instructor's week looks like. Each
 * is the same grid with a different thing carrying the colour, so the dimension
 * is a single value rather than three separate screens.
 */
export type LayerDimension = 'branch' | 'course' | 'instructor';

export const LAYER_DIMENSION_LABELS: Record<LayerDimension, string> = {
  branch: 'סניף',
  course: 'קורס',
  instructor: 'מדריך',
};

/**
 * Rentals and one-off events carry no course and no instructor, so under those
 * two dimensions they have nothing to be keyed by. Rather than dropping them
 * out of the week — the room is genuinely occupied, and that is exactly what
 * the office needs to see — they collect into one layer of their own that can
 * be switched off like any other. An event with no branch at all lands here
 * under the branch dimension too, for the same reason.
 */
export const EVENT_LAYER_KEY = '__events__';

export type CalendarLayer = {
  key: string;
  label: string;
  /** Two or three characters shown on every chip so the hue is never the only cue. */
  initials: string;
  colorIndex: number;
  count: number;
};

/**
 * Ten hues that stay inside the dashboard's palette family — the indigo the
 * theme is built on, then hues walked around the wheel far enough that
 * neighbours in the list never land next to each other.
 *
 * Each entry carries its own ink rather than a computed one: these are read as
 * small text on a tinted ground, and eyeballed contrast is not good enough for
 * a screen someone reads all day.
 */
export const LAYER_COLORS: ReadonlyArray<{ base: string; ink: string; tint: string }> = [
  { base: '#5b54d6', ink: '#2c277f', tint: '#ecebfa' },
  { base: '#0d8f6f', ink: '#075442', tint: '#e4f4ef' },
  { base: '#c2410c', ink: '#7a2907', tint: '#fbeae1' },
  { base: '#2563c9', ink: '#173f80', tint: '#e6eefa' },
  { base: '#a21caf', ink: '#66116e', tint: '#f7e6f8' },
  { base: '#0f766e', ink: '#0a4a45', tint: '#e2f1f0' },
  { base: '#b45309', ink: '#713505', tint: '#fbf0e0' },
  { base: '#4d7c0f', ink: '#314e09', tint: '#eef4e3' },
  { base: '#be123c', ink: '#780b26', tint: '#fce7ec' },
  { base: '#5b21b6', ink: '#3a1574', tint: '#efe8fa' },
];

export function layerColor(colorIndex: number) {
  return LAYER_COLORS[colorIndex % LAYER_COLORS.length];
}

/**
 * A short badge for a layer, so someone who cannot tell two hues apart still
 * reads the chip. Hebrew has no case, so the first letter of each of the first
 * two words carries more than a truncation would.
 */
export function layerInitials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '—';
  if (words.length === 1) return words[0].slice(0, 2);
  return `${words[0][0]}${words[1][0]}`;
}

/** The key a lesson falls under for a given dimension. */
export function lessonLayerKey(lesson: Lesson, dimension: LayerDimension): string {
  if (dimension === 'branch') return lesson.branch_id || '';
  if (dimension === 'instructor') return lesson.instructor_id || '';
  return lesson.course_display_id != null
    ? `c${lesson.course_display_id}`
    : lesson.course_name || '';
}

function lessonLayerLabel(lesson: Lesson, dimension: LayerDimension): string {
  if (dimension === 'branch') return lesson.branch_name || 'ללא סניף';
  if (dimension === 'instructor') return lesson.instructor_name || 'ללא מדריך';
  return lesson.course_name || 'ללא קורס';
}

/**
 * Build the layer catalogue from the week that was actually loaded.
 *
 * Colour is assigned by position in the sorted catalogue rather than by hashing
 * the key: a hash is stable but collides, and two branches sharing a hue is the
 * one failure this screen cannot afford. Sorting by label keeps the assignment
 * steady from one week to the next as long as the same branches are in play.
 */
export function buildLayers(
  lessons: Lesson[],
  events: ScheduleEvent[],
  dimension: LayerDimension,
): CalendarLayer[] {
  const byKey = new Map<string, { label: string; count: number }>();

  for (const lesson of lessons) {
    const key = lessonLayerKey(lesson, dimension);
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) existing.count += 1;
    else byKey.set(key, { label: lessonLayerLabel(lesson, dimension), count: 1 });
  }

  let looseEvents = 0;
  if (dimension === 'branch') {
    // The event list endpoint sends branch_name but not the branch id, so an
    // event is matched onto the branch its lessons already created. Falling
    // back to the name keeps a branch that rents its room out but teaches
    // nothing this week on the board instead of silently dropping it.
    const keyByName = new Map<string, string>();
    byKey.forEach((value, key) => keyByName.set(value.label, key));

    for (const event of events) {
      const name = event.branch_name?.trim();
      if (!name) {
        looseEvents += 1;
        continue;
      }
      const key = event.branch || keyByName.get(name) || `name:${name}`;
      const existing = byKey.get(key);
      if (existing) existing.count += 1;
      else byKey.set(key, { label: name, count: 1 });
    }
  }

  const layers = Array.from(byKey.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.label.localeCompare(b.label, 'he'))
    .map((entry, index) => ({
      key: entry.key,
      label: entry.label,
      initials: layerInitials(entry.label),
      colorIndex: index,
      count: entry.count,
    }));

  if (dimension === 'branch' ? looseEvents > 0 : events.length > 0) {
    layers.push({
      key: EVENT_LAYER_KEY,
      label: 'שכירויות ואירועים',
      initials: 'שכ',
      colorIndex: LAYER_COLORS.length - 1,
      count: dimension === 'branch' ? looseEvents : events.length,
    });
  }

  return layers;
}

/**
 * The layer an event belongs to, resolved the same way on the grid and in the
 * filter so a chip can never be drawn in a colour the rail has switched off.
 */
export function eventLayerKey(
  event: ScheduleEvent,
  dimension: LayerDimension,
  layers: CalendarLayer[],
): string {
  if (dimension !== 'branch') return EVENT_LAYER_KEY;
  if (event.branch) return event.branch;
  const name = event.branch_name?.trim();
  if (!name) return EVENT_LAYER_KEY;
  return layers.find((layer) => layer.label === name)?.key ?? `name:${name}`;
}

export type PlacedItem<T> = {
  item: T;
  startMin: number;
  endMin: number;
  lane: number;
  lanes: number;
};

/**
 * Lay overlapping items out side by side, the way a calendar week does it.
 *
 * Two rules matter and they pull against each other: an item takes all the
 * width it can, but items that collide must be the same width or the eye reads
 * the wider one as more important. Resolving that per item gives a ragged grid,
 * so the run is split into clusters — maximal stretches with no gap — and the
 * lane count is settled once for the whole cluster. Every item in a cluster is
 * then the same width, and a cluster that is alone on the hour still spans it.
 */
export function layoutOverlaps<T>(
  items: T[],
  bounds: (item: T) => { startMin: number; endMin: number },
): PlacedItem<T>[] {
  const sorted = items
    .map((item) => ({ item, ...bounds(item) }))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const placed: PlacedItem<T>[] = [];
  let cluster: PlacedItem<T>[] = [];
  let clusterEnd = -Infinity;
  let laneEnds: number[] = [];

  const closeCluster = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const entry of cluster) entry.lanes = lanes;
    placed.push(...cluster);
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  };

  for (const entry of sorted) {
    if (entry.startMin >= clusterEnd && cluster.length > 0) closeCluster();

    let lane = laneEnds.findIndex((end) => end <= entry.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(entry.endMin);
    } else {
      laneEnds[lane] = entry.endMin;
    }

    cluster.push({ ...entry, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, entry.endMin);
  }

  if (cluster.length > 0) closeCluster();
  return placed;
}

/** "HH:MM[:SS]" to minutes past midnight. */
export function timeToMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(':').map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}
