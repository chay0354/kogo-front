import { afterEach, describe, expect, test, vi } from 'vitest';
import { collectInstructorPhotoUrls, preloadInstructorPhotos } from './instructorPhotoPreload';
import type { Course } from './types';

const course = {
  lessons: [
    { instructor_photo_url: 'https://cdn.test/alice.png' },
    { instructor_photo_url: 'https://cdn.test/alice.png' },
    { instructor_photo_url: null },
  ],
  bundles: [
    {
      lessons: [
        { instructor_photo_url: 'https://cdn.test/bob.png' },
        { instructor_photo_url: '  ' },
      ],
    },
  ],
} as Course;

describe('instructor photo preloading', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('collects every unique photo from lessons and bundles', () => {
    expect(collectInstructorPhotoUrls([course])).toEqual([
      'https://cdn.test/alice.png',
      'https://cdn.test/bob.png',
    ]);
  });

  test('is safe during server rendering where Image does not exist', () => {
    expect(() => preloadInstructorPhotos([course])).not.toThrow();
  });

  test('starts every unique browser request once before a card is opened', () => {
    const requested: string[] = [];
    class FakeImage {
      decoding = 'auto';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(url: string) {
        requested.push(url);
      }
    }

    vi.stubGlobal('window', {});
    vi.stubGlobal('Image', FakeImage);

    preloadInstructorPhotos([course]);
    preloadInstructorPhotos([course]);

    expect(requested).toEqual([
      'https://cdn.test/alice.png',
      'https://cdn.test/bob.png',
    ]);
  });
});
