/**
 * A file ManyChat kept on its own storage and passed on as a bare address.
 *
 * Before Kogo learned to keep recordings and pictures, a voice note or a photo
 * a customer sent was stored as a "text" message whose whole text is that
 * address. The screen shows it as what it is — a player, a thumbnail — and
 * never prints the address.
 */

export type ExternalMediaKind = 'voice' | 'image' | 'video';

export interface ExternalMedia {
  kind: ExternalMediaKind;
  url: string;
}

/** ManyChat's file storage: manybot-files.s3.<region>.amazonaws.com. */
const MANYCHAT_FILE = /^https?:\/\/manybot-files\.s3[a-z0-9.-]*\.amazonaws\.com\/\S+$/i;
const EXTENSION = /\.([a-z0-9]{2,5})(?:[?#]\S*)?$/i;

const KIND_BY_EXTENSION: Record<string, ExternalMediaKind> = {
  ogg: 'voice',
  oga: 'voice',
  opus: 'voice',
  mp3: 'voice',
  m4a: 'voice',
  aac: 'voice',
  amr: 'voice',
  wav: 'voice',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  webp: 'image',
  gif: 'image',
  heic: 'image',
  heif: 'image',
  mp4: 'video',
  mov: 'video',
  '3gp': 'video',
  webm: 'video',
};

/**
 * The text is one ManyChat file address ending in a media extension, and
 * nothing else: what kind of file, and where. Anything else — words, a link
 * inside a sentence, another site's address, a document — is null and stays text.
 */
export function externalMedia(text: string | null | undefined): ExternalMedia | null {
  const url = (text || '').trim();
  if (!MANYCHAT_FILE.test(url)) return null;
  const extension = EXTENSION.exec(url)?.[1]?.toLowerCase();
  const kind = extension ? KIND_BY_EXTENSION[extension] : undefined;
  return kind ? { kind, url } : null;
}

/** What stands for a file where only a line of text fits (the list's preview), or where it cannot be shown. */
export const MEDIA_WORDS: Record<ExternalMediaKind, string> = {
  voice: '🎤 הודעה קולית',
  image: '🖼️ תמונה',
  video: '🎬 סרטון',
};
