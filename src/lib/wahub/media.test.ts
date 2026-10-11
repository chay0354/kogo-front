import { describe, expect, test } from 'vitest';

import { previewText } from './format';
import { externalMedia, MEDIA_WORDS } from './media';
import {
  bubbleMedia,
  bubbleText,
  hasStoredMedia,
  isNewBotMessage,
  makeOptimisticDemoMessage,
  MEDIA_PLACEHOLDER,
} from './messages';
import { makeMessage } from './testFixtures';

const OGG = 'https://manybot-files.s3.eu-central-1.amazonaws.com/1234/ig_messages/abc_def.ogg';
const JPG = 'https://manybot-files.s3.eu-central-1.amazonaws.com/1234/wa/photo.JPG?X-Amz-Signature=abc';

describe('a file ManyChat passed as a bare address', () => {
  test('is known by its storage and its extension: a recording, a picture, a film', () => {
    expect(externalMedia(OGG)).toEqual({ kind: 'voice', url: OGG });
    expect(externalMedia(`  ${JPG}\n`)).toEqual({ kind: 'image', url: JPG });
    expect(externalMedia('https://manybot-files.s3.amazonaws.com/1/clip.mp4')).toMatchObject({ kind: 'video' });
  });

  test('anything else stays text: words around it, another site, a document, no extension', () => {
    expect(externalMedia(`תראו ${OGG}`)).toBeNull();
    expect(externalMedia('https://example.com/voice.ogg')).toBeNull();
    expect(externalMedia('https://manybot-files.s3.eu-central-1.amazonaws.com/1/terms.pdf')).toBeNull();
    expect(externalMedia('https://manybot-files.s3.eu-central-1.amazonaws.com/1/file')).toBeNull();
    expect(externalMedia('')).toBeNull();
    expect(externalMedia(null)).toBeNull();
  });

  test('the list\'s preview names it in a word and never prints the address', () => {
    expect(previewText({ text: OGG, direction: 'in', sender: 'customer', sent_at: '' })).toBe('🎤 הודעה קולית');
    expect(previewText({ text: JPG, direction: 'in', sender: 'customer', sent_at: '' })).toBe('🖼️ תמונה');
    expect(previewText({ text: 'כמה עולה?', direction: 'in', sender: 'customer', sent_at: '' })).toBe('כמה עולה?');
  });
});

describe('what a bubble shows for a recording or a picture', () => {
  test('a file Kogo keeps: asked for by the message, whatever the path says', () => {
    const voice = makeMessage(5, { message_type: 'voice', text: '', media_url: 'demo/7/abc.webm', has_media: true });
    expect(bubbleMedia(voice)).toEqual({ source: 'stored', kind: 'voice' });
    expect(bubbleText(voice)).toBe('');
    const image = makeMessage(6, { message_type: 'image', text: 'זה המקום?', media_url: 'demo/7/abc.jpg', has_media: true });
    expect(bubbleMedia(image)).toEqual({ source: 'stored', kind: 'image' });
    // The caption is still printed under the picture.
    expect(bubbleText(image)).toBe('זה המקום?');
  });

  test('an older server without has_media: the path alone says a file is kept', () => {
    expect(hasStoredMedia({ media_url: 'demo/7/abc.webm' })).toBe(true);
    expect(hasStoredMedia({ media_url: null })).toBe(false);
    expect(hasStoredMedia({ media_url: 'demo/7/abc.webm', has_media: false })).toBe(false);
  });

  test('voice or image with no file: a placeholder, never the raw address', () => {
    const voice = makeMessage(7, { message_type: 'voice', text: '' });
    expect(bubbleMedia(voice)).toEqual({ source: 'none', kind: 'voice', link: null });
    expect(MEDIA_PLACEHOLDER.voice).toBe('🎤 הודעה קולית');
    expect(MEDIA_PLACEHOLDER.image).toBe('🖼️ תמונה');

    // Some other site's address as the whole text: the placeholder, and the address only behind "פתח את הקובץ".
    const linked = makeMessage(8, { message_type: 'image', text: 'https://cdn.example.com/x/y' });
    expect(bubbleMedia(linked)).toEqual({ source: 'none', kind: 'image', link: 'https://cdn.example.com/x/y' });
    expect(bubbleText(linked)).toBe('');
  });

  test('an old message kept as text whose text is ManyChat\'s file address: played straight from it', () => {
    const old = makeMessage(9, { message_type: 'text', text: OGG });
    expect(bubbleMedia(old)).toEqual({ source: 'link', kind: 'voice', url: OGG });
    expect(bubbleText(old)).toBe('');
    const picture = makeMessage(10, { message_type: 'other', text: JPG });
    expect(bubbleMedia(picture)).toEqual({ source: 'link', kind: 'image', url: JPG });
    // And a voice-typed message with the same kind of address plays too, rather than showing a placeholder.
    expect(bubbleMedia(makeMessage(11, { message_type: 'voice', text: OGG }))).toEqual({ source: 'link', kind: 'voice', url: OGG });
  });

  test('words are words', () => {
    const words = makeMessage(12, { text: 'היי, יש ניסיון?' });
    expect(bubbleMedia(words)).toBeNull();
    expect(bubbleText(words)).toBe('היי, יש ניסיון?');
    // A link inside a sentence is part of the sentence.
    const sentence = makeMessage(13, { text: `הנה ${OGG}` });
    expect(bubbleMedia(sentence)).toBeNull();
    expect(bubbleText(sentence)).toBe(`הנה ${OGG}`);
  });

  test('a bubble still on its way has no file to ask for yet', () => {
    const typed = makeOptimisticDemoMessage({ kind: 'voice' }, -5, new Date('2026-10-11T09:00:00Z'));
    expect(typed).toMatchObject({ id: -5, direction: 'in', sender: 'customer', message_type: 'voice', local_state: 'sending' });
    expect(bubbleMedia(typed)).toEqual({ source: 'none', kind: 'voice', link: null });
    expect(bubbleMedia({ ...typed, has_media: true, media_url: 'demo/1/x.webm' })).toEqual({ source: 'none', kind: 'voice', link: null });
  });

  test('the words for each kind', () => {
    expect(MEDIA_WORDS).toEqual({ voice: '🎤 הודעה קולית', image: '🖼️ תמונה', video: '🎬 סרטון' });
  });
});

describe('the new bot\'s own message', () => {
  test('is the bot\'s, flagged new_bot — not the old bot\'s copy, and not the office', () => {
    expect(isNewBotMessage({ sender: 'bot', new_bot: true })).toBe(true);
    expect(isNewBotMessage({ sender: 'bot', new_bot: false })).toBe(false);
    expect(isNewBotMessage({ sender: 'bot' })).toBe(false);
    expect(isNewBotMessage({ sender: 'office', new_bot: true })).toBe(false);
  });
});
