// Official CampusSync branding.
//
// The artwork is extracted from the approved brand image without redrawing
// (see docs/brand/official). Never recolour, rotate, crop or stretch it:
// every component below keeps the original aspect ratio and colours.
import { cx } from '../ui';
import logoUrl from '../../assets/brand/campussync-c-logo-256.png';
import bannerUrl from '../../assets/brand/campussync-banner.webp';

/** Intrinsic size of the banner artwork (prevents layout shift). */
const BANNER_W = 1542;
const BANNER_H = 473;

/**
 * The standalone C symbol. Square; transparent padding is part of the asset.
 * Decorative by default (next to the "CampusSync" name); pass `label` when it
 * stands alone so screen readers hear the brand.
 */
export function BrandMark({ size = 36, label, className }: { size?: number; label?: string; className?: string }) {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      decoding="async"
      draggable={false}
      className={cx('block shrink-0 select-none object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}

/** The full CampusSync wordmark banner. Scales with its container, never distorts. */
export function BrandBanner({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <img
      src={bannerUrl}
      width={BANNER_W}
      height={BANNER_H}
      alt="CampusSync"
      decoding="async"
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      draggable={false}
      className={cx('block h-auto w-full select-none object-contain', className)}
      style={{ aspectRatio: `${BANNER_W} / ${BANNER_H}` }}
    />
  );
}

/**
 * Page-loading state: the whole logo fades gently. Its arrows are never
 * rotated or animated individually, and the fade stops for reduced motion.
 */
export function BrandLoader({ label = 'Loading page', className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cx('grid place-items-center gap-3 text-plum-soft', className)}>
      <BrandMark size={52} className="motion-safe:animate-[brand-breathe_1.6s_ease-in-out_infinite]" />
      <span className="text-sm font-semibold">{label}…</span>
    </div>
  );
}
