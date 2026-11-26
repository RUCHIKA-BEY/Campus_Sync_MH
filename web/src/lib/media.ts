// Event posters and banners in Supabase Storage (bucket 'event-media').
// The bucket is PUBLIC to read, like the event images on Discover.
// Writes are limited by Storage policies: only the event's managers, only
// while the event is a draft or has changes requested. The bucket itself
// rejects other file types and files over 2 MB; we check first for a
// friendlier message.
import { requireSupabase } from './supabase';

export const MEDIA_BUCKET = 'event-media';
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export type MediaKind = 'poster' | 'banner';

/** null if the file is acceptable, otherwise a plain-language problem. */
export function checkImageFile(file: File): string | null {
  if (!(file.type in IMAGE_TYPES)) return 'Use a JPG, PNG or WebP image.';
  if (file.size > MAX_IMAGE_BYTES) return `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB.`;
  return null;
}

/** Uploads to "<eventId>/<kind>-<time>.<ext>" and returns the public URL. */
export async function uploadEventImage(eventId: string, kind: MediaKind, file: File): Promise<string> {
  const problem = checkImageFile(file);
  if (problem) throw new Error(problem);
  const storage = requireSupabase().storage.from(MEDIA_BUCKET);
  const path = `${eventId}/${kind}-${Date.now()}.${IMAGE_TYPES[file.type]}`;
  const { error } = await storage.upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return storage.getPublicUrl(path).data.publicUrl;
}

/** Path inside the bucket for one of OUR public URLs, else null. */
export function mediaPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

/** Best-effort removal of a replaced image (an orphan file is harmless). */
export async function removeEventImage(url: string | null | undefined): Promise<void> {
  const path = mediaPathFromUrl(url);
  if (!path) return;
  await requireSupabase().storage.from(MEDIA_BUCKET).remove([path]).catch(() => undefined);
}
