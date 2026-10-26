/**
 * The banner carousel at the top of the main page: one big, wide banner that
 * rotates on its own, spanning the full width of the page. The slides are
 * supplied by the page, so they can be a trending event, an invitation to host,
 * or anything else worth a banner.
 *
 * Controls follow the usual carousel guidance: arrows on the picture (from tablet
 * up; phones swipe), dots and a pause button on a strip under it so nothing sits
 * on the photo, rotation that stops on hover, focus, the pause button, and for
 * visitors who ask for reduced motion.
 */
import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion, type PanInfo } from "motion/react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

export interface FeedSlide {
  id: string;
  image: string;
  /** A WebP of `image`, offered first to browsers that can show it. */
  imageWebp?: string;
  /** A phone-shaped picture (about 1.2:1), used below 720px wide in place of `image`. */
  mobileImage?: string;
  mobileImageWebp?: string;
  /** CSS object-position, so the subject stays in frame when cropped. */
  position?: string;
  /** Small label above the title, e.g. "Trending". */
  badge?: string;
  title: string;
  body: string;
  /** Optional short rows under the title, e.g. one line per kind of visitor. Replaces `body`. */
  lines?: { label: string; text: string }[];
  cta: string;
  onClick: () => void;
}

const INTERVAL_MS = 5000;

export function FeedCarousel({ slides, label }: { slides: FeedSlide[]; label: string }) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // The visitor's own pause button, on top of the pause that hover and focus already give.
  const [userPaused, setUserPaused] = useState(false);
  const n = slides.length;

  const next = useCallback(() => setIndex((i) => (i + 1) % n), [n]);
  const prev = useCallback(() => setIndex((i) => (i - 1 + n) % n), [n]);

  // While the opening loading screen hides the page, the banner waits on its first slide;
  // `restart` begins its timer again when the page appears.
  const [restart, setRestart] = useState(0);
  useEffect(() => {
    const onBloom = () => {
      setIndex(0);
      setRestart((r) => r + 1);
    };
    window.addEventListener("showzy:bloom", onBloom);
    return () => window.removeEventListener("showzy:bloom", onBloom);
  }, []);

  useEffect(() => {
    if (reduce || paused || userPaused || n < 2) return;
    if (document.documentElement.classList.contains("bloom-wait")) return;
    const t = window.setTimeout(next, INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [index, paused, userPaused, reduce, next, n, restart]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -50) next();
    else if (info.offset.x > 50) prev();
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className="relative overflow-x-clip"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") next();
        if (e.key === "ArrowLeft") prev();
      }}
    >
      <div className="relative">
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.1}
          onDragEnd={onDragEnd}
          // Announce a slide change only when the visitor moved it, not on every automatic turn.
          aria-live={paused || userPaused ? "polite" : "off"}
          className="relative h-[320px] touch-pan-y sm:h-[400px] lg:h-[clamp(500px,60vh,680px)]"
        >
          {slides.map((s, i) => {
            const active = i === index;
            return (
              <div
                key={s.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${n}`}
                aria-hidden={!active}
                className={`absolute inset-0 transition-[opacity,visibility] duration-700 ease-in-out ${
                  active ? "visible opacity-100" : "invisible opacity-0"
                }`}
              >
                <div className="banner-fade absolute inset-x-0">
                  <picture>
                    {s.mobileImageWebp && <source media="(max-width: 719px)" srcSet={s.mobileImageWebp} type="image/webp" />}
                    {s.mobileImage && <source media="(max-width: 719px)" srcSet={s.mobileImage} />}
                    {s.imageWebp && <source srcSet={s.imageWebp} type="image/webp" />}
                    <img
                      src={s.image}
                      alt=""
                      draggable={false}
                      style={{ objectPosition: s.position ?? "50% 50%" }}
                      className="absolute inset-0 size-full object-cover"
                    />
                  </picture>
                  <div aria-hidden className="absolute inset-0 bg-black/25 md:bg-transparent" />
                  <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent" />
                </div>

                {/* Text lines up with the page column on very wide screens. */}
                <div className="relative flex h-full items-center px-[var(--page-pad)] md:pl-16 min-[1440px]:pl-[calc(var(--page-pad)+21px)]">
                <div className="flex w-full max-w-2xl [text-shadow:0_1px_14px_rgba(0,0,0,.5)] flex-col items-start justify-center gap-2 md:gap-3 2xl:max-w-3xl">
                  {s.badge && (
                    <span className="rounded bg-signal px-2 py-0.5 text-[12px] font-bold uppercase tracking-wider text-white">
                      {s.badge}
                    </span>
                  )}
                  <h2 className="font-hero text-[clamp(22px,3.6vw,56px)] font-normal uppercase leading-[1.12] tracking-[0.05em] text-white">
                    {s.title}
                  </h2>
                  {s.lines ? (
                    <dl className="max-w-xl divide-y divide-white/20 border-y border-white/20 text-[12.5px] leading-snug text-white/85 md:text-[16px]">
                      {s.lines.map((l) => (
                        <div key={l.label} className="py-1 md:grid md:grid-cols-[7.5rem_1fr] md:gap-x-4 md:py-2">
                          <dt className="inline font-semibold text-white after:mx-1.5 after:opacity-60 after:content-['—'] md:block md:after:content-none">{l.label}</dt>{" "}
                          <dd className="inline md:block">{l.text}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="line-clamp-2 text-[14px] leading-snug text-white/85 md:text-[17px]">{s.body}</p>
                  )}
                  <button
                    type="button"
                    onClick={s.onClick}
                    tabIndex={active ? 0 : -1}
                    className="mt-1 min-h-11 rounded-md bg-signal px-5 text-[15px] font-semibold text-white transition-colors hover:bg-[#d4503a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    {s.cta}
                  </button>
                </div>
                </div>
              </div>
            );
          })}
        </motion.div>

        {n > 1 &&
          (["prev", "next"] as const).map((dir) => {
            const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
            return (
              <button
                key={dir}
                type="button"
                onClick={dir === "prev" ? prev : next}
                aria-label={dir === "prev" ? "Previous banner" : "Next banner"}
                className={`absolute top-1/2 hidden size-12 -translate-y-1/2 place-items-center rounded-md bg-white text-[#1A1A1A] shadow-[0_2px_10px_rgba(0,0,0,.4)] transition-colors hover:bg-[#ECECEC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:grid ${
                  dir === "prev" ? "left-4" : "right-4"
                }`}
              >
                <Icon className="size-7" aria-hidden />
              </button>
            );
          })}
      </div>

      {n > 1 && (
        <div className="flex items-center justify-center gap-2 px-[var(--page-pad)] pt-2">
          <div role="tablist" aria-label="Choose banner" className="flex">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Banner ${i + 1}`}
                onClick={() => setIndex(i)}
                className="grid h-11 place-items-center px-1.5 focus-visible:outline-2 focus-visible:outline-signal"
              >
                <span
                  className={`block h-2 rounded-full transition-all duration-300 ${
                    i === index ? "w-7 bg-paper" : "w-2 bg-paper/30"
                  }`}
                />
              </button>
            ))}
          </div>
          {!reduce && (
            <button
              type="button"
              onClick={() => setUserPaused((v) => !v)}
              aria-label={userPaused ? "Play banner rotation" : "Pause banner rotation"}
              className="grid size-11 place-items-center rounded-md text-paper transition-colors hover:bg-paper/10 focus-visible:outline-2 focus-visible:outline-signal"
            >
              {userPaused ? <Play className="size-5" aria-hidden /> : <Pause className="size-5" aria-hidden />}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
