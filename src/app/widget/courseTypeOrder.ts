const WIDGET_COURSE_TYPE_PRIORITY = [
  ['קפואירה', 'קפוארה', 'capoeira'],
  ['מחול', 'היפ-הופ', 'היפהופ', 'hip-hop', 'hiphop'],
  ['אקרובטיקה אווירית', 'אווירית', 'aerial'],
  ['ברייקדאנס', 'ברייק דאנס', 'ברייק', 'breakdance', 'break dance'],
] as const;

function normalizeTypeName(name: string): string {
  return name.trim().toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ');
}

function widgetCourseTypeRank(name: string): number {
  const normalized = normalizeTypeName(name);
  if (!normalized) return WIDGET_COURSE_TYPE_PRIORITY.length;
  const index = WIDGET_COURSE_TYPE_PRIORITY.findIndex((keywords) =>
    keywords.some((keyword) => normalized.includes(normalizeTypeName(keyword))),
  );
  return index === -1 ? WIDGET_COURSE_TYPE_PRIORITY.length : index;
}

export function sortWidgetCourseTypes<T extends { name: string }>(types: T[]): T[] {
  return [...types].sort((a, b) => {
    const rankCmp = widgetCourseTypeRank(a.name) - widgetCourseTypeRank(b.name);
    if (rankCmp !== 0) return rankCmp;
    return a.name.localeCompare(b.name, 'he');
  });
}
