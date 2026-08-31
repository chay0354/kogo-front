import type { Course } from './types';

const pendingPreloads = new Map<string, HTMLImageElement>();
const startedPreloads = new Set<string>();

export function collectInstructorPhotoUrls(courses: Course[]): string[] {
  const urls = new Set<string>();

  for (const course of courses) {
    for (const lesson of course.lessons ?? []) {
      const url = lesson.instructor_photo_url?.trim();
      if (url) urls.add(url);
    }

    for (const bundle of course.bundles ?? []) {
      for (const lesson of bundle.lessons ?? []) {
        const url = lesson.instructor_photo_url?.trim();
        if (url) urls.add(url);
      }
    }
  }

  return [...urls];
}

/**
 * Warm the browser cache as soon as a branch catalog arrives. The real card can
 * then reuse the downloaded bytes instead of starting the request on tap.
 */
export function preloadInstructorPhotos(courses: Course[]): void {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return;

  for (const url of collectInstructorPhotoUrls(courses)) {
    if (startedPreloads.has(url)) continue;
    startedPreloads.add(url);

    const image = new Image();
    pendingPreloads.set(url, image);
    const release = () => pendingPreloads.delete(url);
    image.onload = release;
    image.onerror = release;
    image.decoding = 'async';
    image.src = url;
  }
}
