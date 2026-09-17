'use client';

import {
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { prefersReducedMotion } from '@/components/ui/motion';
import { CLEAR_BLUR_FACTOR, GLASS_OPTICS, MAX_MAP_PIXELS, buildDisplacementPixels, type GlassSize } from './refraction';
import { luminanceBehind, toneFor, type Tone } from './tone';
import styles from './LiquidGlass.module.css';

export type LiquidGlassVariant = 'regular' | 'clear';
export type LiquidGlassTone = 'light' | 'dark' | 'auto';

export interface LiquidGlassProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  children?: ReactNode;
  /** The element to render. A nav, a button, a div — the material does not care. */
  as?: ElementType;
  /** `regular` is the default material; `clear` is for rich media behind it. */
  variant?: LiquidGlassVariant;
  /** Thickness. A larger surface bends more light and casts a deeper shadow. */
  size?: GlassSize;
  /**
   * What the glass sits over. Decides ink, fill and how bright the highlights
   * may be. `auto` reads the content underneath when scrolling settles and
   * switches by itself — for a bar that content travels beneath.
   */
  tone?: LiquidGlassTone;
  /** Reacts to the pointer: moving highlight, inner light, a soft give when pressed. */
  interactive?: boolean;
  /** An HSL triplet ("173 58% 39%"). Functional tint only — leave most glass untinted. */
  tint?: string;
  /** 0..1.5 — scales the bend and the rim. 1 is the designed strength. */
  intensity?: number;
  /** Corner radius in px. Omit for a capsule. */
  radius?: number;
  /** Class for the content wrapper (the layer children render into). */
  contentClassName?: string;
}

/**
 * `backdrop-filter: url(#…)` renders in Chromium and nowhere else today. A
 * browser that does not support it drops the whole declaration, so the bend is
 * switched on from script, only where it is known to draw; everyone else keeps
 * the blur-and-saturate backdrop plus the rim lens.
 */
function canRefractBackdrop(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const chromium = /Chrom(e|ium)\/|Edg\//.test(ua) && !/Firefox\/|FxiOS|OPR\/.*Mini/.test(ua);
  const ios = /iPad|iPhone|iPod/.test(ua); // every iOS browser is WebKit underneath
  return chromium && !ios && typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'blur(1px)');
}

type MapState = { url: string; w: number; h: number } | null;

/** Draws the displacement map for the element's current size. Runs on mount and on resize only. */
function useDisplacementMap(target: React.RefObject<HTMLElement>, size: GlassSize, radius: number | undefined, enabled: boolean): MapState {
  const [map, setMap] = useState<MapState>(null);

  useEffect(() => {
    const el = target.current;
    if (!enabled || !el || typeof ResizeObserver === 'undefined') {
      setMap(null);
      return;
    }
    let frame = 0;
    const draw = () => {
      frame = 0;
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      if (w < 8 || h < 8 || w * h > MAX_MAP_PIXELS) {
        setMap(null);
        return;
      }
      const r = radius ?? h / 2;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const image = ctx.createImageData(w, h);
      image.data.set(buildDisplacementPixels(w, h, r, GLASS_OPTICS[size].bezel));
      ctx.putImageData(image, 0, 0);
      setMap({ url: canvas.toDataURL('image/png'), w, h });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    schedule();
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [target, size, radius, enabled]);

  return map;
}

/**
 * The SVG filter the backdrop is drawn through: bend first, then the little
 * scatter a clear material has, then saturation. With dispersion, red and blue
 * are bent by slightly different amounts — the faint colour fringe a thick
 * glass edge throws — and recombined.
 */
function RefractionFilter({ id, map, size, intensity, clear }: { id: string; map: NonNullable<MapState>; size: GlassSize; intensity: number; clear: boolean }) {
  const optics = GLASS_OPTICS[size];
  const blur = optics.blur * (clear ? CLEAR_BLUR_FACTOR : 1);
  const scale = optics.scale * intensity;
  const spread = optics.dispersion;
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <defs>
        <filter
          id={id}
          x="0"
          y="0"
          width={map.w}
          height={map.h}
          filterUnits="userSpaceOnUse"
          primitiveUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feImage href={map.url} x="0" y="0" width={map.w} height={map.h} preserveAspectRatio="none" result="map" />
          {spread > 0 ? (
            <>
              <feDisplacementMap in="SourceGraphic" in2="map" scale={scale * (1 + spread)} xChannelSelector="R" yChannelSelector="G" result="bentR" />
              <feColorMatrix in="bentR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />
              <feDisplacementMap in="SourceGraphic" in2="map" scale={scale} xChannelSelector="R" yChannelSelector="G" result="bentG" />
              <feColorMatrix in="bentG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green" />
              <feDisplacementMap in="SourceGraphic" in2="map" scale={scale * (1 - spread)} xChannelSelector="R" yChannelSelector="G" result="bentB" />
              <feColorMatrix in="bentB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />
              <feBlend in="red" in2="green" mode="screen" result="rg" />
              <feBlend in="rg" in2="blue" mode="screen" result="bent" />
            </>
          ) : (
            <feDisplacementMap in="SourceGraphic" in2="map" scale={scale} xChannelSelector="R" yChannelSelector="G" result="bent" />
          )}
          <feGaussianBlur in="bent" stdDeviation={blur} result="soft" />
          <feColorMatrix in="soft" type="saturate" values="1.5" />
        </filter>
      </defs>
    </svg>
  );
}

/**
 * Tracks the pointer as two custom properties on the element, so the highlight
 * and the inner light can follow it in CSS. One rAF per pointer event burst,
 * nothing while the pointer is elsewhere, nothing at all under reduced motion.
 */
function usePointerLight(enabled: boolean) {
  const frame = useRef(0);
  const last = useRef<{ el: HTMLElement; x: number; y: number } | null>(null);

  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current);
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || prefersReducedMotion()) return;
      const el = event.currentTarget;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      last.current = {
        el,
        x: ((event.clientX - rect.left) / rect.width) * 100,
        y: ((event.clientY - rect.top) / rect.height) * 100,
      };
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        const next = last.current;
        if (!next) return;
        next.el.style.setProperty('--lg-px', `${next.x.toFixed(1)}%`);
        next.el.style.setProperty('--lg-py', `${next.y.toFixed(1)}%`);
      });
    },
    [enabled],
  );

  const onPointerLeave = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    // Back to the resting key light, top-leading.
    event.currentTarget.style.removeProperty('--lg-px');
    event.currentTarget.style.removeProperty('--lg-py');
  }, []);

  return { onPointerMove, onPointerLeave };
}

/**
 * `tone="auto"`: sample under the surface at three points, on mount and when
 * scrolling or resizing has settled. No per-frame work — one read ~150ms after
 * the last scroll event.
 */
function useAutoTone(target: React.RefObject<HTMLElement>, enabled: boolean): Tone {
  const [tone, setTone] = useState<Tone>('light');
  const current = useRef<Tone>('light');

  useEffect(() => {
    if (!enabled) return undefined;
    let timer = 0;
    const read = () => {
      timer = 0;
      const el = target.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      if (!box.width || box.bottom < 0 || box.top > window.innerHeight) return;
      const y = box.top + box.height / 2;
      const samples = [0.2, 0.5, 0.8]
        .map((f) => luminanceBehind(el, box.left + box.width * f, y))
        .filter((v): v is number => v !== null);
      const next = toneFor(samples, current.current);
      if (next !== current.current) {
        current.current = next;
        setTone(next);
      }
    };
    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(read, 150);
    };
    read();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [target, enabled]);

  return tone;
}

/**
 * The reusable surface. Everything glass in the app is this, configured.
 *
 * Use it for the navigation and control layer — bars, floating controls, menus.
 * Content stays on the content layer, and glass is never laid on glass: inside
 * a glass surface use type, icons and light fills, not another LiquidGlass.
 */
const LiquidGlass = forwardRef<HTMLElement, LiquidGlassProps>(function LiquidGlass(
  {
    as = 'div',
    variant = 'regular',
    size = 'md',
    tone = 'light',
    interactive = false,
    tint,
    intensity = 1,
    radius,
    className,
    contentClassName,
    style,
    children,
    onPointerMove,
    onPointerLeave,
    ...rest
  },
  forwardedRef,
) {
  const localRef = useRef<HTMLElement | null>(null);
  const filterId = `lg-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [refracts, setRefracts] = useState(false);

  useEffect(() => {
    setRefracts(canRefractBackdrop());
  }, []);

  const map = useDisplacementMap(localRef, size, radius, refracts && intensity > 0);
  const sampledTone = useAutoTone(localRef, tone === 'auto');
  const resolvedTone: Tone = tone === 'auto' ? sampledTone : tone;
  const pointer = usePointerLight(interactive);

  const setRef = useCallback(
    (node: HTMLElement | null) => {
      localRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  const vars: Record<string, string | number> = {};
  if (radius !== undefined) vars['--lg-radius'] = `${radius}px`;
  if (tint) vars['--lg-tint-hsl'] = tint;
  if (map) vars['--lg-refraction'] = `url(#${filterId})`;
  if (intensity !== 1) vars['--lg-rim-strength'] = String(Math.max(0, Math.min(1.5, intensity)));

  const classes = [
    styles.glass,
    styles[size],
    variant === 'clear' ? styles.clear : '',
    resolvedTone === 'dark' ? styles.toneDark : '',
    tint ? styles.tinted : '',
    interactive ? styles.interactive : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return createElement(
    as,
    {
      ...rest,
      ref: setRef,
      className: classes,
      style: { ...(vars as CSSProperties), ...style },
      'data-refract': map ? 'on' : 'off',
      'data-tone': resolvedTone,
      onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
        pointer.onPointerMove(event);
        onPointerMove?.(event);
      },
      onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => {
        pointer.onPointerLeave(event);
        onPointerLeave?.(event);
      },
    },
    map ? <RefractionFilter key="filter" id={filterId} map={map} size={size} intensity={intensity} clear={variant === 'clear'} /> : null,
    <span key="backdrop" className={`${styles.layer} ${styles.backdrop}`} aria-hidden="true" />,
    <span key="rimLens" className={`${styles.layer} ${styles.rimLens}`} aria-hidden="true" />,
    <span key="ambient" className={`${styles.layer} ${styles.ambient}`} aria-hidden="true" />,
    <span key="light" className={`${styles.layer} ${styles.light}`} aria-hidden="true" />,
    <span key="rim" className={`${styles.layer} ${styles.rim}`} aria-hidden="true" />,
    <div key="content" className={`${styles.content} ${contentClassName ?? ''}`}>
      {children}
    </div>,
  );
});

export default LiquidGlass;
