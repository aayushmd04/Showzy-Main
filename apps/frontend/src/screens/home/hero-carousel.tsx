/**
 * The signed-out front door: a three-slide hero carousel that says what Naada
 * is, then hands over to the discover feed below it.
 *
 * Photography first, copy second, in the manner of a ticketing-site banner:
 * a full-bleed photo, a dark scrim for legibility, plain white type, arrows
 * and dots. Every slide carries Sign up and Sign in in the same place. Slides
 * advance on a timer that stops on hover/focus and never starts when the
 * visitor prefers reduced motion; arrow keys and swipes also work.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion, type PanInfo } from "motion/react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { usePageMeta } from "@/lib/use-meta";

import { Wordmark } from "@/components/naada/wordmark";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { useStore } from "@/store/app-store";
import { setNearbyCity } from "@/lib/nearby";
import { hideNearbyLoader, runNearbyLoader } from "@/components/naada/nearby-loader";
import { getCities } from "@/lib/api";
import { CityPicker } from "@/components/naada/city-picker";
import { Modal } from "@/components/ui/modal";

const INTERVAL_MS = 3000;
/** Crossfade between slides, and the fade-out before leaving for the main site. */
const FADE_MS = 900;
/** Asks the carousel to fade out, then go to a path. */
const LEAVE_EVENT = "naada:leave-hero";
const leaveTo = (to: string) => window.dispatchEvent(new CustomEvent(LEAVE_EVENT, { detail: to }));

interface Slide {
  image: string;
  alt: string;
  /** Where the photo's subject sits, so cropping keeps it in frame. */
  position: string;
  content: ReactNode;
}

const HEADLINE =
  "font-hero font-light uppercase leading-[1.14] tracking-[0.06em] text-white [text-shadow:0_2px_24px_rgba(0,0,0,.6)]";
const BODY = "max-w-xl text-[17px] leading-[1.6] text-white/85 md:text-[20px]";

const SLIDES: Slide[] = [
  {
    image: "/media/events/classical-dancer-stage.jpg",
    alt: "A classical dancer holding a pose in a single warm spotlight",
    position: "50% 35%",
    content: (
      <>
        <h2 className={`${HEADLINE} text-[clamp(28px,5.4vw,72px)]`}>
          Art is happening everywhere.
          {" "}
          <br className="hidden md:block" />
          Finding it shouldn’t be difficult.
        </h2>
        <p className={`mt-6 ${BODY}`}>Discover live art happening around you.</p>
        <p className="mt-4 text-[16px] font-medium tracking-[0.04em] text-white md:text-[18px]">
          Music · Dance · Theatre · Poetry · Comedy · More
        </p>
      </>
    ),
  },
  {
    image: "/media/events/acoustic-band-bar-night.jpg",
    alt: "A three-piece acoustic band playing to a close crowd in a low-lit bar",
    position: "50% 50%",
    content: (
      <>
        <h2 className={`${HEADLINE} text-[clamp(28px,6vw,88px)] [@media(max-height:720px)]:text-[26px]`}>
          Small rooms.
          <br />
          Good art.
          <br />
          Real audiences.
        </h2>
        <dl className="mt-6 max-w-xl divide-y divide-white/20 border-y border-white/20 text-[16px] text-white/85 md:text-[18px] [@media(max-height:720px)]:text-[15px]">
          {[
            ["For Audiences", "Find close-knit events around you and support art in your community."],
            ["For Artists", "Find spaces to perform, collaborate and host yourself."],
            ["For Hosts", "Find artists, build your event and bring your audience together."],
          ].map(([who, line]) => (
            <div key={who} className="grid gap-x-5 py-2.5 [@media(max-height:720px)]:py-1.5 md:grid-cols-[8.5rem_1fr]">
              <dt className="font-semibold text-white">{who}</dt>
              <dd>{line}</dd>
            </div>
          ))}
        </dl>
      </>
    ),
  },
  {
    image: "/media/events/cafe-acoustic-performance.jpg",
    alt: "A woman playing an acoustic guitar in a warmly lit cafe",
    position: "50% 45%",
    content: (
      <>
        <h2 className={`${HEADLINE} text-[clamp(26px,4.8vw,64px)]`}>
          Not everything needs
          {" "}
          <br className="hidden md:block" />
          to be a 5,000-person event.
        </h2>
        <p className={`mt-6 ${BODY}`}>Some of the best experiences happen in smaller rooms.</p>
        <p className="mt-4 text-[17px] font-medium leading-relaxed text-white md:text-[20px]">
          A café. A studio. A pub. A theatre. A courtyard.
        </p>
        <p className={`mt-4 ${BODY}`}>Naada helps you find them, create them and be part of them.</p>
      </>
    ),
  },
];


const N = SLIDES.length;

type WhyPrompt = "denied" | "unavailable";

const PROMPT_COPY: Record<WhyPrompt, string> = {
  denied: "Location is off, so pick the city you want events for.",
  unavailable: "We couldn’t find your location. Pick the city you want events for.",
};

/**
 * One button. It asks the browser for the visitor's location (Chrome answers
 * from the device GPS or Google's location service), maps it to the nearest
 * city Naada lists, filters the feed to it and scrolls there. If the visitor
 * says no, or the location is unusable, they choose a city by hand instead.
 */
function Actions() {
  const { toast } = useStore();
  const navigate = useNavigate();
  const [locating, setLocating] = useState(false);
  const [why, setWhy] = useState<WhyPrompt | null>(null);
  const [cityNames, setCityNames] = useState<string[]>(["Bengaluru", "Mysuru"]);

  useEffect(() => {
    getCities()
      .then((cs) => cs.length && setCityNames(cs.map((c) => c.name)))
      .catch(() => undefined);
  }, []);

  const show = (city: string) => {
    setNearbyCity(city);
    toast(city === "all" ? "Showing Mysuru and Bengaluru" : `Showing events in ${city}`, "default");
    setWhy(null);
    leaveTo("/whats-on");
  };

  const exploreNearby = async () => {
    setLocating(true);
    // Full-screen "Finding events near you" with a fun fact, for at least 3s.
    const result = await runNearbyLoader();
    setLocating(false);
    if (result.status === "city") {
      setNearbyCity(result.city);
      toast(`Showing events in ${result.city}`, "default");
      navigate("/whats-on");
      // Let the new page mount underneath, then fade the loader away over it.
      window.setTimeout(hideNearbyLoader, 250);
    } else {
      hideNearbyLoader();
      setWhy(result.status);
    }
  };

  return (
    <div className="mt-7 [@media(max-height:720px)]:mt-5">
      <button
        type="button"
        onClick={exploreNearby}
        disabled={locating}
        className="inline-flex min-h-12 items-center gap-2.5 rounded-md bg-signal px-7 text-[16px] font-semibold text-white transition-colors hover:bg-[#d4503a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-80"
      >
        <MapPin className="size-5" aria-hidden />
        {locating ? "Finding events near you…" : "Explore events near you"}
      </button>

      <Modal open={why !== null} onClose={() => setWhy(null)} title="Choose your city">
        <p className="text-[15px] leading-relaxed text-paper/80">{why ? PROMPT_COPY[why] : ""}</p>
        <ul className="mt-4 grid gap-2">
          {cityNames.map((c) => (
            <li key={c}>
              <button
                type="button"
                onClick={() => show(c)}
                className="flex min-h-12 w-full items-center gap-3 rounded-md border border-line px-4 text-left text-[16px] font-semibold text-paper transition-colors hover:border-signal hover:bg-signal/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              >
                <MapPin className="size-4 text-signal" aria-hidden />
                {c}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => show("all")}
              className="min-h-11 w-full rounded-md px-4 text-left text-[15px] text-paper/70 underline underline-offset-4 hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            >
              Show all cities
            </button>
          </li>
        </ul>
      </Modal>
    </div>
  );
}

function ArrowButton({ dir, onClick }: { dir: "prev" | "next"; onClick: () => void }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === "prev" ? "Previous slide" : "Next slide"}
      className={`absolute top-1/2 z-20 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white transition-colors hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-white md:grid ${
        dir === "prev" ? "left-4 lg:left-6" : "right-4 lg:right-6"
      }`}
    >
      <Icon className="size-6" aria-hidden />
    </button>
  );
}

/** Hosts are the supply side: one clear way in from every slide. */
function HostButton() {
  const { open } = useAuthSheet();
  return (
    <button
      type="button"
      onClick={() => open("Host your event on Naada", { preferRole: "host" })}
      className="min-h-11 whitespace-nowrap rounded-md bg-white px-4 text-[14px] font-semibold text-[#14100D] transition-colors hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:px-5 md:text-[15px]"
    >
      <span className="md:hidden">Host for free</span>
      <span className="hidden md:inline">Host your event for free</span>
    </button>
  );
}

export function HeroCarousel() {
  usePageMeta({
    description:
      "Live art in Mysuru and Bengaluru: music, theatre, dance, comedy and more, in small rooms near you.",
  });
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const navigate = useNavigate();

  // Fade the whole page out, then change page, so the hand-over is never a cut.
  useEffect(() => {
    const onLeave = (e: Event) => {
      const to = (e as CustomEvent<string>).detail;
      if (reduce) return navigate(to);
      setLeaving(true);
      window.setTimeout(() => navigate(to), 450);
    };
    window.addEventListener(LEAVE_EVENT, onLeave);
    return () => window.removeEventListener(LEAVE_EVENT, onLeave);
  }, [navigate, reduce]);

  const go = useCallback((i: number) => setIndex(((i % N) + N) % N), []);
  const next = useCallback(() => setIndex((i) => (i + 1) % N), []);
  const prev = useCallback(() => setIndex((i) => (i - 1 + N) % N), []);

  useEffect(() => {
    if (reduce || paused) return;
    const t = window.setTimeout(next, INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [index, paused, reduce, next]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60) next();
    else if (info.offset.x > 60) prev();
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Why Naada"
      className={`theme-dark relative h-dvh min-h-[600px] w-full overflow-hidden bg-ink font-support transition-opacity duration-[450ms] ease-in ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") next();
        if (e.key === "ArrowLeft") prev();
      }}
    >
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.12}
        onDragEnd={onDragEnd}
        className="absolute inset-0 touch-pan-y"
      >
        {SLIDES.map((s, i) => {
          const active = i === index;
          return (
            <div
              key={s.image}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${N}`}
              aria-hidden={!active}
              className={`absolute inset-0 transition-[opacity,visibility] duration-[900ms] ease-in-out ${
                active ? "visible opacity-100" : "invisible opacity-0"
              }`}
            >
              <motion.img
                src={s.image}
                alt={active ? s.alt : ""}
                draggable={false}
                style={{ objectPosition: s.position }}
                className="absolute inset-0 size-full object-cover"
                animate={{ scale: active && !reduce ? 1 : 1.07 }}
                transition={{ duration: active ? INTERVAL_MS / 1000 + 1 : 0, ease: "linear" }}
              />
              {/* Scrim: keeps white type readable over any part of the photo */}
              <div aria-hidden className="absolute inset-0 bg-black/30 md:bg-transparent" />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/15" />
              <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />

              <div className="relative flex h-full w-full items-center px-5 pb-24 pt-24 md:px-[max(96px,var(--page-pad))] [@media(max-height:720px)]:pb-20 [@media(max-height:720px)]:pt-16">
                {/* Fades in after its slide arrives. On the way out it stays put and
                    fades with the slide; it is only reset once the slide is hidden,
                    so nothing ever vanishes in a cut. */}
                <motion.div
                  initial={reduce ? false : { opacity: 0, y: 18 }}
                  animate={
                    active
                      ? { opacity: 1, y: 0, transition: { duration: 0.8, delay: reduce ? 0 : 0.35, ease: "easeOut" } }
                      : { opacity: reduce ? 1 : 0, y: reduce ? 0 : 18, transition: { duration: 0, delay: FADE_MS / 1000 } }
                  }
                  className="max-w-3xl"
                >
                  {s.content}
                  <Actions />
                </motion.div>
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Top bar */}
      <header className="absolute inset-x-0 top-0 z-20 flex w-full items-center justify-between px-4 py-4 md:px-[max(96px,var(--page-pad))] md:py-5">
        <Wordmark className="text-[17px] md:text-[22px]" />
        <div className="flex items-center gap-2 md:gap-6">
          <CityPicker onPhoto />
          <Link
            to="/whats-on"
            onClick={(e) => {
              e.preventDefault();
              leaveTo("/whats-on");
            }}
            className="hidden items-center gap-1.5 text-[15px] font-medium text-white/90 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white md:flex"
          >
            Browse events <ChevronRight className="size-4" aria-hidden />
          </Link>
          <HostButton />
        </div>
      </header>

      <ArrowButton dir="prev" onClick={prev} />
      <ArrowButton dir="next" onClick={next} />

      {/* Same line on every slide */}
      <p className="pointer-events-none absolute inset-x-0 bottom-14 [@media(max-height:720px)]:hidden z-10 w-full px-5 text-[14px] text-white/75 md:px-[max(96px,var(--page-pad))] md:text-[15px]">
        Built by artists. For the live arts community.
      </p>

      {/* Dots */}
      <div className="absolute inset-x-0 bottom-7 z-20 flex justify-center gap-2" role="tablist" aria-label="Choose slide">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Slide ${i + 1}`}
            onClick={() => go(i)}
            className="grid h-8 place-items-center px-1.5 focus-visible:outline-2 focus-visible:outline-white"
          >
            <span
              className={`block h-2 rounded-full transition-all duration-300 ${
                i === index ? "w-7 bg-white" : "w-2 bg-white/50"
              }`}
            />
          </button>
        ))}
      </div>
    </section>
  );
}
