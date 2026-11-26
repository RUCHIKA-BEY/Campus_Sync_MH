import { useRouteError } from 'react-router';
import { isChunkLoadError, reloadForNewVersion } from '../lib/staleBuild';

/**
 * Shown instead of a blank screen when a page crashes. Kept in the main bundle
 * (not code-split) so it still works when page files fail to load.
 */
export function AppError() {
  const error = useRouteError();
  const stale = isChunkLoadError(error);
  if (stale && reloadForNewVersion()) return null;
  if (import.meta.env.DEV) console.error(error);
  return (
    <div className="grid min-h-dvh place-items-center bg-ivory px-4">
      <div role="alert" className="max-w-md rounded-[22px] border border-line bg-white p-8 text-center shadow-soft">
        <h1 className="text-xl font-bold">{stale ? 'CampusSync was updated' : 'Something went wrong'}</h1>
        <p className="mt-2 text-sm text-plum-soft">
          {stale ? 'A new version is available. Reload to continue.' : 'This page hit an unexpected error. Reloading usually fixes it.'}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()}
                  className="rounded-xl bg-terracotta px-4 py-2 text-sm font-semibold text-white hover:bg-terracotta-deep">Reload</button>
          <a href="/" className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-plum hover:bg-cream">Go home</a>
        </div>
      </div>
    </div>
  );
}
