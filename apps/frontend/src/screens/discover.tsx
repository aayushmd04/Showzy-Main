import { useMemo, useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { useStore } from "@/store/app-store";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { NotificationBell } from "@/components/naada/notification-bell";
import { AccountMenu } from "@/components/naada/account-menu";
import { TODAY } from "@/lib/format";
import { getCities, type ApiCity } from "@/lib/api";
import type { NaadaEvent } from "@/data/fixtures";

// ─── Design tokens per theme ─────────────────────────────────────────────────
// These mirror the exact hex values from the design handoff DC file.

const T = {
  dark: {
    bg:            "#120E0B",
    surface:       "#1A1512",
    navBg:         "rgba(18,14,11,.88)",
    navBorder:     "rgba(243,233,214,.14)",
    paper:         "#F3E9D6",
    muted:         "rgba(243,233,214,.55)",
    muted2:        "rgba(243,233,214,.45)",
    signal:        "#C4472E",
    gold:          "#E8B85C",
    logoName:      "#E8B85C",
    logoKn:        "#C4472E",
    cardBorder:    "rgba(243,233,214,.16)",
    cardBg:        "#1A1512",
    stripBorder:   "rgba(243,233,214,.1)",
    photoBorder:   "rgba(232,184,92,.55)",
    captionBg:     "rgba(18,14,11,.32)",
    captionBorder: "rgba(232,184,92,.25)",
    tickerBg:      "#C4472E",
    footerBandBg:  "#1A1512",
    footerBandBorder: "rgba(243,233,214,.14)",
    btnSecBorder:  "rgba(243,233,214,.3)",
    tagBorder:     "rgba(243,233,214,.2)",
    tagBg:         "rgba(243,233,214,.06)",
    navLinkActive: "#F3E9D6",
    navLinkInactive: "rgba(243,233,214,.55)",
    navActiveBorder: "#E8B85C",
    badgeBg:       "rgba(196,71,46,.14)",
    badgeBorder:   "rgba(196,71,46,.5)",
    badgeText:     "#E8B85C",
    searchBg:      "#1A1512",
    searchBorder:  "rgba(243,233,214,.18)",
    searchIcon:    "rgba(243,233,214,.4)",
    searchPlaceholder: "rgba(243,233,214,.38)",
  },
  light: {
    bg:            "#F7F0E2",
    surface:       "#FFFCF4",
    navBg:         "rgba(255,252,244,.92)",
    navBorder:     "rgba(36,28,21,.14)",
    paper:         "#241C15",
    muted:         "rgba(36,28,21,.62)",
    muted2:        "rgba(36,28,21,.5)",
    signal:        "#8C2B3E",
    gold:          "#D98324",
    logoName:      "#8C2B3E",
    logoKn:        "#D98324",
    cardBorder:    "rgba(36,28,21,.16)",
    cardBg:        "#FFFCF4",
    stripBorder:   "rgba(36,28,21,.1)",
    photoBorder:   "rgba(36,28,21,.22)",
    captionBg:     "rgba(24,18,14,.28)",
    captionBorder: "rgba(247,240,226,.15)",
    tickerBg:      "#8C2B3E",
    footerBandBg:  "#FFFCF4",
    footerBandBorder: "rgba(36,28,21,.14)",
    btnSecBorder:  "rgba(36,28,21,.28)",
    tagBorder:     "rgba(36,28,21,.2)",
    tagBg:         "#FFFCF4",
    navLinkActive: "#241C15",
    navLinkInactive: "rgba(36,28,21,.62)",
    navActiveBorder: "#8C2B3E",
    badgeBg:       "#FFF6E4",
    badgeBorder:   "rgba(217,131,36,.5)",
    badgeText:     "#241C15",
    searchBg:      "#FFFCF4",
    searchBorder:  "rgba(36,28,21,.18)",
    searchIcon:    "rgba(36,28,21,.38)",
    searchPlaceholder: "rgba(36,28,21,.4)",
  },
};

// ─── Photo mapping for events ─────────────────────────────────────────────────
const GIG_PHOTOS = ["/gig-1.jpg", "/gig-2.jpg", "/gig-3.jpg", "/gig-4.jpg", "/gig-5.jpg"];

function gigPhoto(index: number) {
  return GIG_PHOTOS[index % GIG_PHOTOS.length];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(date: string, part: "dow" | "d" | "mon") {
  const d = new Date(date + "T00:00:00");
  if (part === "dow") return d.toLocaleString("en", { weekday: "short" }).toUpperCase();
  if (part === "d")   return d.getDate().toString();
  return d.toLocaleString("en", { month: "short" }).toUpperCase();
}

function seatsLeft(event: NaadaEvent): number {
  const total  = event.tiers.reduce((s, t) => s + t.capacity, 0);
  const sold   = event.tiers.reduce((s, t) => s + t.sold, 0);
  return Math.max(0, total - sold);
}

function lowestPrice(event: NaadaEvent): number {
  return Math.min(...event.tiers.map((t) => t.price));
}

function isFree(event: NaadaEvent): boolean {
  return lowestPrice(event) === 0;
}

function isSoldOut(event: NaadaEvent): boolean {
  return event.tiers.every((t) => t.sold >= t.capacity);
}

function priceLabel(event: NaadaEvent, lang: "en" | "kn"): string {
  const p = lowestPrice(event);
  if (p !== 0) return `₹${p}`;
  return lang === "en" ? "Free" : "ಉಚಿತ";
}

function soldPct(event: NaadaEvent): number {
  const cap = event.tiers.reduce((s, t) => s + t.capacity, 0);
  if (cap === 0) return 0;
  const sold = event.tiers.reduce((s, t) => s + t.sold, 0);
  return Math.min(100, Math.round((sold / cap) * 100));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NaadaLogo({ tok, size = 27 }: { tok: typeof T.dark; size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontFamily: "'Baloo Tamma 2',system-ui", fontWeight: 800, fontSize: size, lineHeight: 1, color: tok.logoName }}>
        Naada
      </span>
      <span style={{ fontFamily: "'Anek Kannada',sans-serif", fontWeight: 600, fontSize: size * 0.74, color: tok.logoKn }}>
        ನಾದ
      </span>
    </div>
  );
}

function PulsingDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 8px ${color}88`,
        flexShrink: 0,
        animation: "naada-pulse 1.8s ease-in-out infinite",
      }}
    />
  );
}

// ─── Event card (the featured "This week" card) ───────────────────────────────
function EventCard({
  event,
  index,
  tok,
  isDark,
  lang,
  onGetTicket,
}: {
  event: NaadaEvent;
  index: number;
  tok: typeof T.dark;
  isDark: boolean;
  lang: "en" | "kn";
  onGetTicket: (eventId: string) => void;
}) {
  // Prefer the event's own image; the rotating set is the fallback so cards
  // never repeat the same five photos when real ones exist.
  const photo = (event as NaadaEvent & { _posterImage?: string })._posterImage ?? gigPhoto(index);
  const pct   = soldPct(event);
  const left  = seatsLeft(event);
  const sold  = isSoldOut(event);
  const free  = isFree(event);
  const price = priceLabel(event, lang);

  const seatsText = sold
    ? (lang === "en" ? "Sold out" : "ಟಿಕೆಟ್ ಮುಗಿದಿದೆ")
    : free
      ? (lang === "en" ? "Free entry" : "ಉಚಿತ ಪ್ರವೇಶ")
      : (lang === "en" ? `${left} seats left` : `${left} ಆಸನಗಳು ಉಳಿದಿವೆ`);

  return (
    <div
      style={{
        background: tok.cardBg,
        border: `1px solid ${tok.cardBorder}`,
        borderRadius: 18,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Photo */}
      <div style={{ position: "relative", height: 240, flexShrink: 0 }}>
        <img
          src={photo}
          alt={event.name}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(18,14,11,0) 38%,rgba(18,14,11,.55) 100%)" }} />
        {/* Frosted caption band */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "16px 18px",
            background: tok.captionBg,
            backdropFilter: "blur(6px) saturate(140%)",
            WebkitBackdropFilter: "blur(6px) saturate(140%)",
            borderTop: `1px solid ${tok.captionBorder}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 700, color: tok.gold }}>
            <span>{fmt(event.date, "dow")} {fmt(event.date, "d")} {fmt(event.date, "mon")}</span>
            <span style={{ color: "rgba(247,240,226,.7)", fontWeight: 500 }}>{event.time}</span>
          </div>
          <div
            style={{
              fontFamily: "'Baloo Tamma 2',system-ui",
              fontWeight: 700,
              fontSize: 22,
              lineHeight: 1.2,
              marginTop: 6,
              color: "#F3E9D6",
              textShadow: "0 1px 4px rgba(0,0,0,.4)",
            }}
          >
            {event.name}
          </div>
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {/* Genre tags */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {event.genres.map((g) => (
            <span
              key={g}
              style={{
                background: tok.tagBg,
                border: `1px solid ${tok.tagBorder}`,
                borderRadius: 999,
                padding: "3px 10px",
                fontSize: 12,
                fontWeight: 600,
                color: tok.muted,
                whiteSpace: "nowrap",
              }}
            >
              {g}
            </span>
          ))}
        </div>

        {/* Sold progress bar */}
        <div>
          <div
            style={{
              background: isDark ? "rgba(243,233,214,.12)" : "rgba(36,28,21,.1)",
              borderRadius: 999,
              height: 5,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                borderRadius: 999,
                background: sold ? tok.muted : tok.signal,
                transition: "width .4s ease",
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: tok.muted2, marginTop: 4 }}>
            {seatsText}
          </div>
        </div>

        {/* Price + CTA */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
          <div>
            <div
              style={{
                fontFamily: "'Baloo Tamma 2',system-ui",
                fontWeight: 800,
                fontSize: 22,
                lineHeight: 1.2,
                color: tok.paper,
              }}
            >
              {price}
            </div>
            <div style={{ fontSize: 12, color: tok.muted2 }}>
              {lang === "en" ? "₹0 booking fee" : "₹0 ಬುಕಿಂಗ್ ಶುಲ್ಕ"}
            </div>
          </div>
          <button
            onClick={() => onGetTicket(event.id)}
            disabled={sold}
            style={{
              minHeight: 44,
              border: "none",
              borderRadius: 12,
              background: sold ? (isDark ? "rgba(243,233,214,.12)" : "rgba(36,28,21,.1)") : tok.signal,
              color: sold ? tok.muted : "#F3E9D6",
              fontFamily: "'Archivo',sans-serif",
              fontSize: 14,
              fontWeight: 700,
              padding: "0 18px",
              cursor: sold ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              transition: "opacity .15s",
            }}
          >
            {sold
              ? (lang === "en" ? "Sold out" : "ಮುಗಿದಿದೆ")
              : (lang === "en" ? "Get ticket" : "ಟಿಕೆಟ್ ಪಡೆಯಿರಿ")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Hero photo panel ─────────────────────────────────────────────────────────
function HeroPhotoPanel({ event, index, venue, tok, lang }: {
  event: NaadaEvent;
  index: number;
  venue?: { name: string; area: string };
  tok: typeof T.dark;
  lang: "en" | "kn";
}) {
  const price = priceLabel(event, lang);
  const left  = seatsLeft(event);
  // Prefer the event's own image, exactly like EventCard — a hardcoded photo
  // here meant the hero never actually looked like whichever event it named.
  const photo = (event as NaadaEvent & { _posterImage?: string })._posterImage ?? gigPhoto(index);

  return (
    <div
      style={{
        position: "relative",
        height: 480,
        borderRadius: 8,
        overflow: "hidden",
        border: `2px solid ${tok.photoBorder}`,
        flexShrink: 0,
      }}
    >
      <img
        src={photo}
        alt={event.name}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "saturate(1.05) contrast(1.05)" }}
      />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(18,14,11,0) 40%,rgba(18,14,11,.72) 100%)" }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "20px 22px",
          background: tok.captionBg,
          backdropFilter: "blur(6px) saturate(140%)",
          WebkitBackdropFilter: "blur(6px) saturate(140%)",
          borderTop: `1px solid ${tok.captionBorder}`,
          color: "#F3E9D6",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: tok.gold }}>
          {lang === "en"
            ? (venue ? `Tonight · ${venue.name}` : "Tonight")
            : (venue ? `ಇಂದು · ${venue.name}` : "ಇಂದು")}
        </div>
        <div style={{ fontFamily: "'Baloo Tamma 2',system-ui", fontWeight: 800, fontSize: 24, lineHeight: 1.2, marginTop: 8 }}>
          {event.name}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 10 }}>
          <span style={{ fontSize: 14, color: "rgba(243,233,214,.72)" }}>
            {event.time}{venue?.area ? ` · ${venue.area}` : ""}
          </span>
          <span style={{ fontFamily: "'Baloo Tamma 2',system-ui", fontWeight: 800, fontSize: 20, color: tok.gold }}>
            {isFree(event) ? (lang === "en" ? "Free entry" : "ಉಚಿತ ಪ್ರವೇಶ") : price}
          </span>
        </div>
        {left > 0 && !isSoldOut(event) && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 13, color: "rgba(243,233,214,.6)" }}>
            <PulsingDot color={tok.signal} />
            <span>{lang === "en" ? `${left} seats left` : `${left} ಆಸನಗಳು ಉಳಿದಿವೆ`}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main DiscoverScreen ──────────────────────────────────────────────────────
export function DiscoverScreen() {
  const { role, currentUser, events, artists, venueOf, theme, setTheme, lang, setLang } = useStore();
  const { open: openAuth } = useAuthSheet();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput]   = useState(searchParams.get("q") ?? "");
  const [activeFilter, setActiveFilter] = useState(0);
  const [cityFilter, setCityFilter]     = useState("all");
  const [cities, setCities]             = useState<ApiCity[]>([]);
  const tickerRef = useRef<HTMLDivElement>(null);
  const cardsStripRef = useRef<HTMLDivElement>(null);
  const [cardsStripPaused, setCardsStripPaused] = useState(false);

  // Cities come from the API. They used to be hardcoded, matched by substrings
  // like "gokulam" and "koramangala", so launching in a third city meant
  // editing React and any venue in an unlisted area was unreachable by filter.
  useEffect(() => {
    getCities()
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  const cityOptions = useMemo(
    () => ["all", ...cities.map((c) => c.name)],
    [cities],
  );

  const cycleCity = () => {
    const i = cityOptions.indexOf(cityFilter);
    setCityFilter(cityOptions[(i + 1) % cityOptions.length] ?? "all");
  };

  const cityLabel = (value: string) => {
    if (value === "all") return lang === "en" ? "All cities" : "ಎಲ್ಲಾ ನಗರಗಳು";
    const match = cities.find((c) => c.name === value);
    return lang === "kn" ? match?.name_kn || value : value;
  };

  const isDark = theme === "dark";
  const tok    = isDark ? T.dark : T.light;
  const urlQuery = searchParams.get("q")?.toLowerCase().trim() ?? "";

  // Published upcoming events sorted by date (city-filtered)
  const published = useMemo(() => {
    return events
      .filter((e) => e.status === "published" && e.date >= TODAY)
      .filter((e) => {
        if (cityFilter === "all") return true;
        const ev = e as NaadaEvent & { _cityName?: string };
        return (ev._cityName ?? "").toLowerCase() === cityFilter.toLowerCase();
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [events, cityFilter, venueOf]);

  // Filter tabs
  const filterTabs = useMemo(() => {
    const genreCount: Record<string, number> = {};
    published.forEach((e) => e.genres.forEach((g) => { genreCount[g] = (genreCount[g] ?? 0) + 1; }));
    const genres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
    return ["All", ...genres, "Free"];
  }, [published]);

  const activeTabName = filterTabs[activeFilter] ?? "All";

  const filtered = useMemo(() =>
    published
      .filter((e) => {
        if (activeTabName === "All") return true;
        if (activeTabName === "Free") return isFree(e);
        return e.genres.includes(activeTabName);
      })
      .filter((e) => {
        if (!urlQuery) return true;
        const venue      = venueOf(e);
        const lineupStr  = e.lineup.map((id) => artists.find((a) => a.id === id)?.name ?? "").join(" ");
        return `${e.name} ${venue?.name ?? ""} ${venue?.area ?? ""} ${e.genres.join(" ")} ${lineupStr}`
          .toLowerCase()
          .includes(urlQuery);
      }),
    [published, activeTabName, urlQuery, venueOf, artists],
  );

  // A primitive fingerprint of `filtered`, not the array itself — `filtered`
  // is a fresh array reference on plenty of renders that don't actually
  // change which events are in it (e.g. an unrelated store update), and an
  // effect keyed on the array itself would tear down and rebuild every one
  // of those times, never surviving long enough for its own interval to fire.
  const filteredKey = useMemo(() => filtered.map((e) => e.id).join(","), [filtered]);

  // The hero rotates through the next 5 published events rather than
  // freezing on whichever one happened to sort first.
  const heroEvents = useMemo(() => published.slice(0, 5), [published]);
  // Same reasoning as `filteredKey` above — key the rotation effects on the
  // actual set of ids, not the `heroEvents` array reference.
  const heroEventsKey = useMemo(() => heroEvents.map((e) => e.id).join(","), [heroEvents]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  // A city switch or a fresher list can leave the old index pointing past
  // the end of the new one — snap back to the start rather than show nothing.
  useEffect(() => {
    setHeroIndex(0);
  }, [heroEventsKey]);

  useEffect(() => {
    if (reduceMotion || heroPaused || heroEvents.length <= 1) return;
    const id = window.setInterval(() => {
      setHeroIndex((i) => (i + 1) % heroEvents.length);
    }, 6000);
    return () => window.clearInterval(id);
  }, [heroEventsKey, heroEvents.length, reduceMotion, heroPaused]);

  const heroEvent = heroEvents[heroIndex] ?? published[0];
  const heroVenue = heroEvent ? venueOf(heroEvent) : undefined;

  // "This week" is a horizontally auto-scrolling strip (see the
  // `.discover-cards` flex-row CSS), not a grid that just wraps once it runs
  // out of room. Reset to the start whenever the filtered list changes, so
  // switching tabs never leaves the strip scrolled into what used to be there.
  useEffect(() => {
    cardsStripRef.current?.scrollTo({ left: 0 });
  }, [filteredKey]);

  useEffect(() => {
    if (reduceMotion || cardsStripPaused) return;
    const el = cardsStripRef.current;
    if (!el || el.scrollWidth <= el.clientWidth + 4) return;

    const id = window.setInterval(() => {
      const nearEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      el.scrollTo({ left: nearEnd ? 0 : el.scrollLeft + 320, behavior: "smooth" });
    }, 3500);
    return () => window.clearInterval(id);
  }, [filteredKey, reduceMotion, cardsStripPaused]);

  // Ticker items: areas + genres
  const tickerItems = useMemo(() => {
    const areas  = Array.from(new Set(published.map((e) => venueOf(e)?.area).filter(Boolean))) as string[];
    const genres = Array.from(new Set(published.flatMap((e) => e.genres)));
    const combined = [...areas, ...genres];
    return [...combined, ...combined];
  }, [published, venueOf]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    setSearchParams(q ? { q } : {});
  };

  const handleGetTicket = (eventId: string) => {
    if (role === "out") {
      openAuth("Sign in to get tickets");
    } else {
      navigate(`/e/${eventId}`);
    }
  };

  const langLabel = lang === "en" ? "ಕನ್ನಡ" : "English";

  return (
    <div
      style={{
        minHeight: "100dvh",
        fontFamily: "'Archivo',sans-serif",
        WebkitFontSmoothing: "antialiased",
        overflowX: "hidden",
        background: tok.bg,
        color: tok.paper,
        transition: "background .3s, color .3s",
      }}
    >
      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav
        className="discover-nav"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 64,
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: tok.navBg,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: `1px solid ${tok.navBorder}`,
        }}
      >
        {/* Left: logo + nav links */}
        <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
          <Link to="/" style={{ textDecoration: "none" }}>
            <NaadaLogo tok={tok} size={27} />
          </Link>
          <div className="discover-nav-links">
            {[
              { label: lang === "en" ? "What's on" : "ಏನಿದೆ",                          path: "/",            active: true },
              { label: lang === "en" ? "Artists" : "ಕಲಾವಿದರು",                          path: "/artists",     active: false },
              { label: lang === "en" ? "Venues" : "ಸ್ಥಳಗಳು",                             path: "/venues",      active: false },
              { label: lang === "en" ? "How it works" : "ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ",         path: "/how-it-works", active: false },
            ].map(({ label, path, active }) => (
              <Link
                key={path}
                to={path}
                style={{
                  textDecoration: "none",
                  color: active ? tok.navLinkActive : tok.navLinkInactive,
                  borderBottom: active ? `2px solid ${tok.navActiveBorder}` : "none",
                  paddingBottom: active ? 3 : 0,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        {/* Right: city, lang toggle, log in, CTA */}
        <div className="discover-nav-right" style={{ alignItems: "center" }}>
          {/* City selector — cycles All → Mysuru → Bengaluru → All */}
          <button
            onClick={cycleCity}
            disabled={cityOptions.length <= 1}
            title={
              cityFilter === "all"
                ? "Showing all cities"
                : `Showing ${cityFilter} events`
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              minHeight: 44,
              border: `1.5px solid ${cityFilter !== "all" ? tok.signal : isDark ? "rgba(243,233,214,.25)" : "rgba(36,28,21,.22)"}`,
              background: cityFilter !== "all" ? `${tok.signal}18` : "transparent",
              borderRadius: 999,
              padding: "0 15px",
              fontSize: 15,
              fontWeight: 600,
              color: tok.paper,
              cursor: "pointer",
              fontFamily: "'Archivo',sans-serif",
              transition: "all .15s",
            }}
          >
            <span style={{ fontSize: 13, color: tok.signal }}>◎</span>
            <span>{cityLabel(cityFilter)}</span>
          </button>

          {/* Language toggle */}
          <button
            onClick={() => setLang(lang === "en" ? "kn" : "en")}
            aria-label="Toggle language"
            style={{
              minHeight: 44,
              border: `1.5px solid ${isDark ? "rgba(243,233,214,.25)" : "rgba(36,28,21,.22)"}`,
              background: "transparent",
              borderRadius: 999,
              padding: "0 16px",
              fontFamily: "'Anek Kannada',sans-serif",
              fontSize: 16,
              fontWeight: 600,
              color: tok.paper,
              cursor: "pointer",
            }}
          >
            {langLabel}
          </button>

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label="Toggle theme"
            style={{
              minHeight: 40,
              width: 40,
              border: `1.5px solid ${isDark ? "rgba(243,233,214,.2)" : "rgba(36,28,21,.2)"}`,
              background: "transparent",
              borderRadius: 999,
              fontSize: 17,
              cursor: "pointer",
              color: tok.paper,
            }}
          >
            {isDark ? "☀" : "🌙"}
          </button>

          {/* Log in */}
          {role === "out" && (
            <span
              onClick={() => openAuth("Sign in to Naada")}
              style={{ fontSize: 15, fontWeight: 600, padding: "0 8px", cursor: "pointer", color: tok.paper }}
            >
              {lang === "en" ? "Sign in" : "ಸೈನ್ ಇನ್"}
            </span>
          )}

          {/* Find tonight's show CTA */}
          <button
            onClick={() => heroEvent && navigate(`/e/${heroEvent.id}`)}
            style={{
              minHeight: 46,
              border: "none",
              borderRadius: 999,
              background: tok.signal,
              color: "#F3E9D6",
              fontFamily: "'Archivo',sans-serif",
              fontSize: 15,
              fontWeight: 700,
              padding: "0 22px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {lang === "en" ? "Find tonight's show" : "ಇಂದಿನ ಕಾರ್ಯಕ್ರಮ"}
          </button>

          {role !== "out" && currentUser && <NotificationBell />}

          {/* Account avatar + sign out */}
          {role !== "out" && currentUser && <AccountMenu />}
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section
        className="discover-hero"
        style={{
          background: isDark
            ? "linear-gradient(155deg,#120E0B 0%,#1A1209 40%,#120E0B 100%)"
            : "linear-gradient(155deg,#F7F0E2 0%,#FDEFD4 40%,#F7F0E2 100%)",
        }}
      >
        {/* Left: copy + CTAs */}
        <div>
          {/* Kicker badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 9,
              background: tok.badgeBg,
              border: `1.5px solid ${tok.badgeBorder}`,
              borderRadius: 999,
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 600,
              color: tok.badgeText,
              marginBottom: 22,
            }}
          >
            <PulsingDot color={tok.signal} />
            {heroEvent
              ? (lang === "en"
                  ? `${seatsLeft(heroEvent)} seats left tonight`
                  : `ಇಂದು ${seatsLeft(heroEvent)} ಆಸನಗಳು ಉಳಿದಿವೆ`)
              : (lang === "en" ? "Live events near you" : "ನಿಮ್ಮ ಹತ್ತಿರ ಲೈವ್ ಕಾರ್ಯಕ್ರಮಗಳು")}
          </div>

          {/* Headline */}
          <h1
            style={{
              fontFamily: "'Baloo Tamma 2',system-ui",
              fontWeight: 800,
              fontSize: "clamp(38px,4.8vw,70px)",
              lineHeight: 1.28,
              letterSpacing: "-.01em",
              color: tok.paper,
              marginBottom: 16,
              maxWidth: 640,
            }}
          >
            {lang === "en" ? (
              <>
                Small rooms.<br />
                Real artists.<br />
                <span style={{ color: tok.signal }}>No extra fees.</span>
              </>
            ) : (
              <>
                ಸಣ್ಣ ಸಭಾಂಗಣ.<br />
                ನಿಜವಾದ ಕಲಾವಿದರು.<br />
                <span style={{ color: tok.signal }}>ಹೆಚ್ಚುವರಿ ಶುಲ್ಕ ಇಲ್ಲ.</span>
              </>
            )}
          </h1>

          {/* Body copy */}
          <p
            style={{
              fontSize: 18,
              lineHeight: 1.6,
              color: tok.muted,
              maxWidth: 500,
              margin: "0 0 32px",
            }}
          >
            {lang === "en"
              ? "Music, theatre, open mics and classical nights in Mysuru and Bengaluru. Book in your language, pay by UPI."
              : "ಮೈಸೂರು ಮತ್ತು ಬೆಂಗಳೂರಿನಲ್ಲಿ ಸಂಗೀತ, ರಂಗಭೂಮಿ ಮತ್ತು ಕ್ಲಾಸಿಕಲ್ ರಾತ್ರಿಗಳು. ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ ಬುಕ್ ಮಾಡಿ."}
          </p>

          {/* CTAs */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <button
              onClick={() => heroEvent && navigate(`/e/${heroEvent.id}`)}
              style={{
                minHeight: 62,
                border: "none",
                borderRadius: 16,
                background: tok.signal,
                color: "#F3E9D6",
                fontFamily: "'Archivo',sans-serif",
                fontSize: 19,
                fontWeight: 700,
                padding: "0 32px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                lineHeight: 1.3,
              }}
            >
              {lang === "en" ? (
                <span>Show me tonight's gigs</span>
              ) : (
                <span style={{ fontFamily: "'Anek Kannada',sans-serif", fontWeight: 700, fontSize: 19 }}>
                  ಇಂದಿನ ಕಾರ್ಯಕ್ರಮ ತೋರಿಸಿ
                </span>
              )}
            </button>

            <button
              onClick={() => { setActiveFilter(0); document.getElementById("this-week")?.scrollIntoView({ behavior: "smooth" }); }}
              style={{
                minHeight: 62,
                border: `1.5px solid ${tok.btnSecBorder}`,
                background: "transparent",
                borderRadius: 16,
                fontFamily: "'Archivo',sans-serif",
                fontSize: 18,
                fontWeight: 600,
                color: tok.paper,
                padding: "0 26px",
                cursor: "pointer",
              }}
            >
              {lang === "en" ? "Browse this week" : "ಈ ವಾರ ನೋಡಿ"}
            </button>
          </div>

          {/* Trust micro-copy */}
          <div style={{ fontSize: 14, color: tok.muted, marginTop: 16 }}>
            {lang === "en"
              ? "₹0 booking fee · UPI, card or cash at the door"
              : "₹0 ಬುಕಿಂಗ್ ಶುಲ್ಕ · UPI, ಕಾರ್ಡ್ ಅಥವಾ ಬಾಗಿಲಲ್ಲಿ ನಗದು"}
          </div>
        </div>

        {/* Right: hero photo — rotates through the top 5 events; hovering
            pauses it so reading the caption doesn't race the timer. */}
        {heroEvent && (
          <div
            className="discover-hero-photo"
            onMouseEnter={() => setHeroPaused(true)}
            onMouseLeave={() => setHeroPaused(false)}
          >
            {/* A fresh `key` per event forces a real remount rather than an
                update — simpler than AnimatePresence, and correct by
                construction: there is no "old" instance left holding stale
                props to get stuck showing. */}
            <motion.div
              key={heroEvent.id}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <HeroPhotoPanel event={heroEvent} index={heroIndex} venue={heroVenue} tok={tok} lang={lang} />
            </motion.div>

            {heroEvents.length > 1 && (
              <div
                role="tablist"
                aria-label="Featured events"
                style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}
              >
                {heroEvents.map((ev, i) => (
                  <button
                    key={ev.id}
                    role="tab"
                    aria-selected={i === heroIndex}
                    aria-label={`Show ${ev.name}`}
                    onClick={() => setHeroIndex(i)}
                    style={{
                      width: i === heroIndex ? 22 : 8,
                      height: 8,
                      borderRadius: 999,
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      background: i === heroIndex ? tok.signal : tok.cardBorder,
                      transition: "all .25s ease",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── TICKER ──────────────────────────────────────────────────────── */}
      {tickerItems.length > 0 && (
        <div
          role="marquee"
          aria-label="Venues and genres"
          style={{ background: tok.tickerBg, padding: "10px 0", overflow: "hidden" }}
        >
          <div
            ref={tickerRef}
            aria-hidden="true"
            style={{ display: "inline-flex", whiteSpace: "nowrap", animation: "naada-ticker 28s linear infinite" }}
          >
            {tickerItems.map((item, i) => (
              <span
                key={i}
                style={{
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: "#F3E9D6",
                  padding: "0 28px",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {item}
                <span style={{ marginLeft: 28, opacity: 0.55 }}>·</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── TRUST STRIP ─────────────────────────────────────────────────── */}
      <div
        className="discover-trust"
        style={{
          borderTop: `1px solid ${tok.navBorder}`,
          borderBottom: `1px solid ${tok.navBorder}`,
          background: tok.surface,
        }}
      >
        {[
          { val: "₹0", label: lang === "en" ? "Booking fee, always" : "ಯಾವಾಗಲೂ ₹0 ಬುಕಿಂಗ್ ಶುಲ್ಕ" },
          { val: "UPI", label: "GPay, PhonePe, Paytm" },
          {
            val: lang === "en" ? "Kannada" : "ಕನ್ನಡ",
            label: lang === "en" ? "Book in your language" : "ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ ಬುಕ್ ಮಾಡಿ",
            kannada: lang === "kn",
          },
          {
            val: lang === "en" ? "2 cities" : "2 ನಗರಗಳು",
            label: lang === "en" ? "Mysuru & Bengaluru" : "ಮೈಸೂರು & ಬೆಂಗಳೂರು",
          },
        ].map(({ val, label, kannada }, i) => (
          <div
            key={i}
            style={{
              padding: "26px 32px",
              borderRight: i < 3 ? `1px solid ${tok.stripBorder}` : "none",
            }}
          >
            <div
              style={{
                fontFamily: kannada ? "'Anek Kannada',sans-serif" : "'Baloo Tamma 2',system-ui",
                fontWeight: 800,
                fontSize: 30,
                lineHeight: 1,
                color: tok.signal,
              }}
            >
              {val}
            </div>
            <div style={{ fontSize: 14, color: tok.muted, marginTop: 5 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── THIS WEEK ────────────────────────────────────────────────────── */}
      <section id="this-week" className="discover-section" style={{ background: tok.bg }}>
        {/* Section header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <div
              style={{
                fontFamily: "'Baloo Tamma 2',system-ui",
                fontWeight: 800,
                fontSize: 42,
                lineHeight: 1.1,
                color: tok.paper,
              }}
            >
              {lang === "en" ? "This week" : "ಈ ವಾರ"}
            </div>
          </div>
          <span
            style={{ fontSize: 16, fontWeight: 600, color: tok.signal, cursor: "pointer" }}
            onClick={() => { setActiveFilter(0); setSearchInput(""); setSearchParams({}); }}
          >
            {lang === "en" ? `See all ${filtered.length} →` : `ಎಲ್ಲಾ ${filtered.length} ನೋಡಿ →`}
          </span>
        </div>

        {/* Filter chips */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
          {filterTabs.map((label, i) => {
            const isActive = activeFilter === i;
            return (
              <button
                key={label}
                onClick={() => setActiveFilter(i)}
                aria-pressed={isActive}
                style={{
                  border: `1.5px solid ${isActive ? tok.signal : tok.cardBorder}`,
                  background: isActive ? tok.signal : "transparent",
                  borderRadius: 999,
                  padding: "7px 16px",
                  fontFamily: "'Archivo',sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  color: isActive ? "#F3E9D6" : tok.muted,
                  cursor: "pointer",
                  transition: "all .15s",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </button>
            );
          })}

          {/* Search bar */}
          <form
            onSubmit={handleSearch}
            role="search"
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: `1.5px solid ${tok.searchBorder}`,
                background: tok.searchBg,
                borderRadius: 999,
                padding: "0 16px",
                height: 40,
              }}
            >
              <span style={{ color: tok.searchIcon, fontSize: 15 }}>⌕</span>
              <input
                type="search"
                value={searchInput}
                placeholder={lang === "en" ? "Search…" : "ಹುಡುಕಿ…"}
                onChange={(e) => setSearchInput(e.target.value)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontFamily: "'Archivo',sans-serif",
                  fontSize: 14,
                  color: tok.paper,
                  outline: "none",
                  width: 160,
                }}
              />
              {urlQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchInput(""); setSearchParams({}); }}
                  style={{ border: "none", background: "transparent", color: tok.muted, cursor: "pointer", fontSize: 16, padding: 0 }}
                >
                  ×
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Cards strip — auto-scrolls horizontally; hovering or touching it
            pauses the advance so browsing doesn't fight the timer. */}
        {filtered.length > 0 ? (
          <div
            className="discover-cards"
            ref={cardsStripRef}
            onMouseEnter={() => setCardsStripPaused(true)}
            onMouseLeave={() => setCardsStripPaused(false)}
            onTouchStart={() => setCardsStripPaused(true)}
            onTouchEnd={() => setCardsStripPaused(false)}
            onTouchCancel={() => setCardsStripPaused(false)}
          >
            {filtered.map((ev, i) => (
              <EventCard
                key={ev.id}
                event={ev}
                index={i}
                tok={tok}
                isDark={isDark}
                lang={lang}
                onGetTicket={handleGetTicket}
              />
            ))}
          </div>
        ) : (
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <div
              style={{
                fontFamily: "'Baloo Tamma 2',system-ui",
                fontWeight: 700,
                fontSize: 22,
                color: tok.paper,
                marginBottom: 8,
              }}
            >
              {urlQuery ? `Nothing matches "${searchParams.get("q")}"` : "Nothing here yet"}
            </div>
            <div style={{ fontSize: 14, color: tok.muted, marginBottom: 20 }}>
              Try a different filter or clear your search
            </div>
            {(urlQuery || activeFilter !== 0) && (
              <button
                onClick={() => { setActiveFilter(0); setSearchInput(""); setSearchParams({}); }}
                style={{
                  border: `1.5px solid ${tok.signal}`,
                  background: "transparent",
                  borderRadius: 999,
                  padding: "10px 24px",
                  fontFamily: "'Archivo',sans-serif",
                  fontWeight: 600,
                  fontSize: 14,
                  color: tok.signal,
                  cursor: "pointer",
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── ROOTED IN KARNATAKA (dark theme only) ──────────────────────── */}
      {isDark && (
        <section className="discover-section" style={{ paddingTop: 0 }}>
          <div style={{ marginBottom: 26 }}>
            <div
              style={{
                fontFamily: "'Baloo Tamma 2',system-ui",
                fontWeight: 800,
                fontSize: 34,
                lineHeight: 1.3,
                color: tok.paper,
              }}
            >
              {lang === "en" ? "Rooted in Karnataka" : "ಕರ್ನಾಟಕದ ಬೇರುಗಳಲ್ಲಿ"}
            </div>
          </div>
          <div className="discover-karnataka">
            {[
              {
                src: "/mysore-palace.jpg",
                label: lang === "en" ? "Mysore Palace" : "ಮೈಸೂರು ಅರಮನೆ",
                credit: "Wikimedia Commons / CC BY-SA",
              },
              {
                src: "/vidhana-soudha.jpg",
                label: lang === "en" ? "Vidhana Soudha, Bengaluru" : "ವಿಧಾನ ಸೌಧ, ಬೆಂಗಳೂರು",
                credit: "Wikimedia Commons / CC BY-SA",
              },
            ].map(({ src, label, credit }) => (
              <div
                key={label}
                style={{
                  position: "relative",
                  height: 280,
                  borderRadius: 8,
                  overflow: "hidden",
                  border: `1px solid ${tok.cardBorder}`,
                }}
              >
                <img
                  src={src}
                  alt={label}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  crossOrigin="anonymous"
                />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,transparent 50%,rgba(18,14,11,.7) 100%)" }} />
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "14px 18px" }}>
                  <div style={{ fontFamily: "'Baloo Tamma 2',system-ui", fontWeight: 700, fontSize: 16, color: "#F3E9D6" }}>{label}</div>
                  <div style={{ fontSize: 11, color: "rgba(243,233,214,.5)", marginTop: 2 }}>{credit}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── FOOTER CTA BAND ─────────────────────────────────────────────── */}
      <div
        className="discover-footer-cta"
        style={{
          background: tok.footerBandBg,
          borderTop: `1px solid ${tok.footerBandBorder}`,
          borderBottom: `1px solid ${tok.footerBandBorder}`,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Baloo Tamma 2',system-ui",
              fontWeight: 800,
              fontSize: 40,
              lineHeight: 1.3,
              color: tok.paper,
            }}
          >
            {lang === "en" ? "Something is on tonight." : "ಇಂದು ರಾತ್ರಿ ಏನೋ ನಡೆಯುತ್ತಿದೆ."}
          </div>
        </div>
        <button
          onClick={() => heroEvent && navigate(`/e/${heroEvent.id}`)}
          style={{
            flexShrink: 0,
            minHeight: 64,
            border: "none",
            borderRadius: 16,
            background: tok.signal,
            color: "#F3E9D6",
            fontFamily: "'Archivo',sans-serif",
            fontSize: 20,
            fontWeight: 700,
            padding: "0 36px",
            cursor: "pointer",
          }}
        >
          {lang === "en" ? "Show me tonight's gigs" : "ಇಂದಿನ ಕಾರ್ಯಕ್ರಮ ತೋರಿಸಿ"}
        </button>
      </div>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer
        className="discover-footer"
        style={{ background: tok.bg }}
      >
        <NaadaLogo tok={tok} size={19} />
        <div style={{ display: "flex", gap: 24, fontSize: 14, color: tok.muted }}>
          <Link to="/artists"      style={{ color: tok.muted, textDecoration: "none" }}>{lang === "en" ? "Artists" : "ಕಲಾವಿದರು"}</Link>
          <Link to="/venues"       style={{ color: tok.muted, textDecoration: "none" }}>{lang === "en" ? "Venues" : "ಸ್ಥಳಗಳು"}</Link>
          <Link to="/how-it-works" style={{ color: tok.muted, textDecoration: "none" }}>{lang === "en" ? "How it works" : "ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ"}</Link>
          <Link to="/terms" style={{ color: tok.muted, textDecoration: "none" }}>{lang === "en" ? "Terms" : "ನಿಯಮಗಳು"}</Link>
          <Link to="/privacy" style={{ color: tok.muted, textDecoration: "none" }}>{lang === "en" ? "Privacy" : "ಗೌಪ್ಯತೆ"}</Link>
          <Link to="/refunds" style={{ color: tok.muted, textDecoration: "none" }}>{lang === "en" ? "Refunds" : "ಮರುಪಾವತಿ"}</Link>
          <Link to="/contact" style={{ color: tok.muted, textDecoration: "none" }}>{lang === "en" ? "Contact" : "ಸಂಪರ್ಕ"}</Link>
        </div>
        <span style={{ fontSize: 14, color: tok.muted }}>
          {lang === "en" ? "Grassroots live music · Mysuru & Bengaluru" : "ಮೈಸೂರು ಮತ್ತು ಬೆಂಗಳೂರಿನಲ್ಲಿ ಸಂಗೀತ"}
        </span>
      </footer>
    </div>
  );
}
