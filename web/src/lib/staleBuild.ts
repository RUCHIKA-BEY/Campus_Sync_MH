/**
 * After a new deploy, a tab that was opened earlier still asks for the old
 * page files (their names change with every build) and they no longer exist.
 * The fix is to reload once so the tab picks up the new version.
 */
const KEY = 'campussync:reloaded-for-new-version';

/** True for the errors browsers raise when a code-split file can't be loaded. */
export function isChunkLoadError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch dynamically|ChunkLoadError|Unable to preload CSS|is not a valid JavaScript MIME type|MIME type/i.test(text);
}

/** Reloads the page unless we already did so in the last 30 seconds (avoids a reload loop). Returns whether it reloaded. */
export function reloadForNewVersion(): boolean {
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY)) || 0; } catch { /* storage blocked */ }
  if (Date.now() - last < 30_000) return false;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
  window.location.reload();
  return true;
}
