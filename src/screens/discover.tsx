import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "@/store/app-store";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { TODAY } from "@/lib/format";
import type { NaadaEvent } from "@/data/fixtures";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function posterStyle(genres: string[]): { bg: string; accent: string } {
  const g = genres[0] ?? "";
  if (g === "Jazz")              return { bg: "linear-gradient(160deg,#0A0C18,#121626)", accent: "#8BBCF0" };
  if (g === "Blues" || g === "Rock") return { bg: "linear-gradient(160deg,#141210,#2A1208)", accent: "#D4380D" };
  if (g === "Open Mic")          return { bg: "linear-gradient(160deg,#0A1810,#0E2216)", accent: "#3DDC91" };
  if (g === "Folk" || g === "Indie") return { bg: "linear-gradient(160deg,#16100A,#281808)", accent: "#E8B33C" };
  if (g === "Carnatic Fusion")   return { bg: "linear-gradient(160deg,#100C08,#201810)", accent: "#E8B33C" };
  if (g === "Hindustani Fusion") return { bg: "linear-gradient(160deg,#100A0E,#201016)", accent: "#F472B6" };
  if (g === "Electronic" || g === "Experimental") return { bg: "linear-gradient(160deg,#0E0A18,#1A1226)", accent: "#C084FC" };
  if (g === "Post-rock")         return { bg: "linear-gradient(160deg,#0A0E12,#121820)", accent: "#94A3B8" };
  return                                { bg: "linear-gradient(160deg,#0E0E12,#1A1A22)", accent: "#D4380D" };
}

function posterWords(name: string): [string, string] {
  const words = name.toUpperCase().split(" ");
  if (words.length === 1) return [words[0].slice(0, 9), ""];
  return [words[0].slice(0, 9), words.slice(1).join(" ").slice(0, 11)];
}

function monthLabel(date: string) {
  return new Date(date + "T00:00:00").toLocaleString("en", { month: "short" }).toUpperCase();
}

function dayLabel(date: string) {
  return new Date(date + "T00:00:00").getDate().toString().padStart(2, "0");
}

function dateGradient(genres: string[]) {
  const g = genres[0] ?? "";
  if (g === "Open Mic") return "linear-gradient(90deg,#1EA874,#39C98A)";
  return "linear-gradient(90deg,#D4380D,#E8763A)";
}

// ─── Gradient-border wrapper ──────────────────────────────────────────────────
function GradBorder({
  children,
  gradient = "linear-gradient(135deg,rgba(255,255,255,.75) 0%,rgba(212,56,13,.15) 50%,rgba(232,179,60,.2) 100%)",
  radius = 32,
  shadow = "0 2px 8px rgba(100,60,20,.06)",
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  gradient?: string;
  radius?: number;
  shadow?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={className} style={{ padding: 1, borderRadius: radius, background: gradient, boxShadow: shadow, ...style }}>
      {children}
    </div>
  );
}

// ─── Price pill ───────────────────────────────────────────────────────────────
function PricePill({ price, free, sold }: { price: string; free: boolean; sold: boolean }) {
  const grad = free
    ? "linear-gradient(135deg,rgba(30,168,116,.5),rgba(57,201,138,.3))"
    : sold
      ? "linear-gradient(135deg,rgba(0,0,0,.15),rgba(0,0,0,.08))"
      : "linear-gradient(135deg,rgba(212,56,13,.5),rgba(232,120,58,.3))";
  const innerBg = free ? "rgba(240,252,247,.85)" : sold ? "rgba(245,245,245,.8)" : "rgba(255,248,245,.85)";
  const color   = free ? "#19956A" : sold ? "rgba(0,0,0,.35)" : "#C42E08";
  return (
    <div style={{ padding: 1, borderRadius: 28, background: grad }}>
      <span style={{ display: "block", fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700, padding: "4px 10px", borderRadius: 27, background: innerBg, color, letterSpacing: ".02em" }}>
        {price}{!sold && " →"}
      </span>
    </div>
  );
}

// ─── Glass event card (real data) ─────────────────────────────────────────────
function EventGlassCard({ event, soldCount, capCount }: { event: NaadaEvent; soldCount: number; capCount: number }) {
  const { bg, accent } = posterStyle(event.genres);
  const [line1, line2] = posterWords(event.name);
  const dateGrad = dateGradient(event.genres);
  const lowestPrice = Math.min(...event.tiers.map((t) => t.price));
  const isFree = lowestPrice === 0;
  const isSold = event.tiers.every((t) => t.sold >= t.capacity);
  const priceLabel = isFree ? "Free" : `₹ ${lowestPrice}`;

  return (
    <Link to={`/e/${event.id}`} style={{ textDecoration: "none" }}>
      <GradBorder
        radius={16}
        gradient="linear-gradient(145deg,rgba(255,255,255,.9) 0%,rgba(212,56,13,.12) 50%,rgba(232,179,60,.15) 100%)"
        shadow="0 4px 22px rgba(100,60,20,.09)"
        style={{ flexShrink: 0, width: 196, cursor: "pointer" }}
      >
        <div style={{ background: "rgba(255,255,255,0.62)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderRadius: 15, overflow: "hidden" }}>
          {/* Date */}
          <div style={{ padding: "13px 15px 9px" }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", background: dateGrad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              {monthLabel(event.date)}
            </div>
            <div style={{ fontVariationSettings: "'wdth' 70,'wght' 900", fontSize: 42, lineHeight: 1, letterSpacing: "-.04em", background: dateGrad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              {dayLabel(event.date)}
            </div>
          </div>
          {/* Poster */}
          <div style={{ height: 86, display: "flex", alignItems: "flex-end", padding: "8px 11px", background: bg }}>
            <div style={{ fontVariationSettings: "'wdth' 68,'wght' 900", fontSize: 18, lineHeight: 0.9, letterSpacing: "-.03em", textTransform: "uppercase", color: "rgba(255,255,255,.92)" }}>
              {line1}
              {line2 && <><br /><span style={{ color: accent }}>{line2}</span></>}
            </div>
          </div>
          {/* Body */}
          <div style={{ padding: "10px 15px 13px" }}>
            <div style={{ fontSize: 12, fontVariationSettings: "'wdth' 90,'wght' 700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#111", marginBottom: 2 }}>
              {event.name}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: ".07em", textTransform: "uppercase", color: "rgba(0,0,0,.37)", marginBottom: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {/* venue name comes from parent — passed via prop below */}
              {event.genres.join(", ")}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <PricePill price={priceLabel} free={isFree} sold={isSold} />
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: "rgba(0,0,0,.3)", textAlign: "right", lineHeight: 1.5 }}>
                {soldCount}/{capCount}<br />{isSold ? "full" : isFree ? "going" : "sold"}
              </span>
            </div>
          </div>
        </div>
      </GradBorder>
    </Link>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export function DiscoverScreen() {
  const { role, users, events, artists, venueOf, soldOf, capacityOf } = useStore();
  const { open: openAuth } = useAuthSheet();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q")?.toLowerCase().trim() ?? "";

  const [searchInput, setSearchInput] = useState(urlQuery);
  const [activeFilter, setActiveFilter] = useState(0); // 0 = All
  const [carouselPos, setCarouselPos] = useState(0);

  const account =
    role === "listener" ? users.listener
    : role === "artist"  ? users.artist
    : role === "host"    ? users.host
    : null;

  // Published, not past
  const published = useMemo(
    () => events.filter((e) => e.status === "published" && e.date >= TODAY).sort((a, b) => a.date.localeCompare(b.date)),
    [events],
  );

  // Filter tabs: All + top 5 genres by event count + Free
  const filterTabs = useMemo(() => {
    const genreCount: Record<string, number> = {};
    published.forEach((e) => e.genres.forEach((g) => { genreCount[g] = (genreCount[g] ?? 0) + 1; }));
    const genres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
    return ["All", ...genres, "Free"];
  }, [published]);

  // Active filter name
  const activeTabName = filterTabs[activeFilter] ?? "All";

  // Filtered events
  const filtered = useMemo(() => {
    return published
      .filter((e) => {
        if (activeTabName === "All") return true;
        if (activeTabName === "Free") return e.tiers.some((t) => t.price === 0);
        return e.genres.includes(activeTabName);
      })
      .filter((e) => {
        if (!urlQuery) return true;
        const venue = venueOf(e);
        const lineupNames = e.lineup.map((id) => artists.find((a) => a.id === id)?.name ?? "").join(" ");
        return `${e.name} ${venue?.name ?? ""} ${venue?.area ?? ""} ${e.genres.join(" ")} ${lineupNames}`
          .toLowerCase()
          .includes(urlQuery);
      });
  }, [published, activeTabName, urlQuery, venueOf, artists]);

  const carouselMax = Math.max(0, filtered.length - 2);
  const clampedPos = Math.min(carouselPos, carouselMax);

  const moveCarousel = (dir: number) => {
    setCarouselPos((p) => Math.max(0, Math.min(carouselMax, p + dir)));
  };

  // Tonight: first event that is today, or fallback to next upcoming
  const tonightEvent = useMemo(() => published[0], [published]);
  const tonightVenue = tonightEvent ? venueOf(tonightEvent) : null;

  // Ticker: unique areas + genres from published events
  const tickerItems = useMemo(() => {
    const areas  = Array.from(new Set(published.map((e) => venueOf(e)?.area).filter(Boolean))) as string[];
    const genres = Array.from(new Set(published.flatMap((e) => e.genres)));
    const combined = [...areas, ...genres];
    // duplicate for seamless loop
    return [...combined, ...combined];
  }, [published, venueOf]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    setSearchParams(q ? { q } : {});
  };

  return (
    <div style={{ minHeight: "100dvh", fontFamily: "'Archivo',sans-serif", WebkitFontSmoothing: "antialiased", overflowX: "hidden", background: "#F5F3EF" }}>

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <nav style={{ display: "flex", alignItems: "center", padding: "18px 32px", position: "sticky", top: 0, zIndex: 40, background: "rgba(251,243,227,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "1px solid rgba(100,60,20,.1)" }}>
        <div style={{ fontSize: 20, letterSpacing: "-.05em", textTransform: "uppercase", color: "#111", display: "flex", alignItems: "center", marginRight: "auto" }}>
          <span style={{ fontVariationSettings: "'wdth' 62,'wght' 900" }}>NAA</span>
          <span style={{ color: "#D4380D", margin: "0 1px", fontVariationSettings: "'wdth' 62,'wght' 900" }}>·</span>
          <span style={{ fontVariationSettings: "'wdth' 125,'wght' 900" }}>DA</span>
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#111", fontVariationSettings: "'wdth' 90,'wght' 700", cursor: "default" }}>Discover</span>
          {role !== "out" && (
            <Link to="/tickets" style={{ fontSize: 13, color: "rgba(0,0,0,.35)", textDecoration: "none", fontVariationSettings: "'wdth' 90,'wght' 500" }}>
              My Tickets
            </Link>
          )}
          {account ? (
            <Link
              to={role === "host" ? "/host" : role === "artist" ? "/artist" : "/tickets"}
              aria-label={`Account — ${account.name}`}
              style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#D4380D,#C42E08)", color: "#fff", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", boxShadow: "0 2px 12px rgba(212,56,13,.35)" }}
            >
              {account.name.charAt(0)}
            </Link>
          ) : (
            <GradBorder radius={28} gradient="linear-gradient(135deg,rgba(212,56,13,.6),rgba(212,56,13,.2))" shadow="0 2px 8px rgba(212,56,13,.15)">
              <button onClick={() => openAuth("Log in to Naada")} style={{ display: "block", background: "rgba(255,255,255,.65)", backdropFilter: "blur(8px)", border: "none", borderRadius: 27, padding: "7px 18px", fontFamily: "'Archivo',sans-serif", fontVariationSettings: "'wdth' 90,'wght' 700", fontSize: 13, color: "#C42E08", cursor: "pointer" }}>
                Log in
              </button>
            </GradBorder>
          )}
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section style={{ background: "radial-gradient(ellipse 55% 60% at 75% 40%,rgba(212,56,13,0.13) 0%,transparent 60%),radial-gradient(ellipse 40% 40% at 10% 80%,rgba(232,179,60,0.1) 0%,transparent 55%),linear-gradient(155deg,#FBF3E3 0%,#F6E8D0 35%,#EDD5B5 65%,#E4C9A0 100%)", paddingBottom: 36, overflow: "hidden" }}>
        <div style={{ padding: "12px 32px 0" }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "rgba(17,17,17,.4)", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-block", width: 32, height: 1, background: "rgba(17,17,17,.2)" }} />
            Mysuru, Karnataka · Grassroots Live Music
          </div>

          <h1 aria-label="Live in the City of Palaces" style={{ fontVariationSettings: "'wdth' 80,'wght' 900", fontSize: "clamp(42px,5.5vw,66px)", lineHeight: 0.92, letterSpacing: "-.045em", textTransform: "uppercase", color: "#111", marginBottom: 28 }}>
            <div>LIVE IN THE</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
              <span>CITY OF</span>
              <span style={{ position: "relative", padding: "0 6px" }}>
                PALACES
                <svg aria-hidden="true" style={{ position: "absolute", left: -14, top: -12, width: "calc(100% + 28px)", height: "calc(100% + 24px)", pointerEvents: "none", overflow: "visible" }} viewBox="0 0 240 64" xmlns="http://www.w3.org/2000/svg">
                  <path d="M16 34 C14 10 70 2 120 5 C170 8 226 14 228 34 C230 54 172 62 120 59 C68 56 12 56 16 34 Z" fill="none" stroke="#D4380D" strokeWidth="2.5" strokeLinecap="round" style={{ strokeDasharray: 600, strokeDashoffset: 600, animation: "naada-circle-draw 1.2s cubic-bezier(.4,0,.2,1) .3s forwards" }} />
                </svg>
              </span>
            </div>
          </h1>

          {/* Search */}
          <form onSubmit={handleSearch} role="search">
            <GradBorder radius={50} gradient="linear-gradient(135deg,rgba(255,255,255,.9) 0%,rgba(212,56,13,.2) 50%,rgba(232,179,60,.3) 100%)" shadow="0 8px 32px rgba(100,60,20,.12)" style={{ maxWidth: 560 }}>
              <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 50, padding: "7px 7px 7px 22px" }}>
                <span aria-hidden="true" style={{ color: "rgba(17,17,17,.3)", marginRight: 10, fontSize: 15 }}>⌕</span>
                <input
                  type="search"
                  value={searchInput}
                  placeholder="Search gigs, artists, venues…"
                  aria-label="Search gigs, artists and venues"
                  onChange={(e) => setSearchInput(e.target.value)}
                  style={{ flex: 1, border: "none", background: "transparent", fontFamily: "'Archivo',sans-serif", fontSize: 14, color: "#111", outline: "none", fontVariationSettings: "'wdth' 90,'wght' 400" }}
                />
                {urlQuery && (
                  <button type="button" onClick={() => { setSearchInput(""); setSearchParams({}); }} aria-label="Clear search" style={{ border: "none", background: "transparent", color: "rgba(17,17,17,.4)", fontSize: 16, cursor: "pointer", padding: "0 8px" }}>×</button>
                )}
                <div style={{ width: 1, height: 22, background: "rgba(17,17,17,.1)", margin: "0 16px" }} />
                <button type="submit" style={{ background: "linear-gradient(135deg,#D4380D 0%,#C42E08 100%)", color: "#fff", border: "none", borderRadius: 40, padding: "10px 24px", fontFamily: "'Archivo',sans-serif", fontVariationSettings: "'wdth' 90,'wght' 700", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 4px 16px rgba(212,56,13,.4),inset 0 1px 0 rgba(255,255,255,.15)" }}>
                  Search
                </button>
              </div>
            </GradBorder>
          </form>
        </div>

        {/* Tonight strip */}
        {tonightEvent && (
          <div style={{ margin: "24px 32px 0" }}>
            <GradBorder radius={16} gradient="linear-gradient(135deg,rgba(255,255,255,.85) 0%,rgba(30,168,116,.25) 60%,rgba(255,255,255,.5) 100%)" shadow="0 4px 20px rgba(100,60,20,.08)">
              <div style={{ display: "flex", alignItems: "center", gap: 16, background: "rgba(255,255,255,0.6)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: 15, padding: "14px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase", color: "#1EA874", fontWeight: 700, flexShrink: 0 }}>
                  <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: "#1EA874", boxShadow: "0 0 8px rgba(30,168,116,.6)", display: "inline-block", animation: "naada-live-pulse 1.8s ease-in-out infinite" }} />
                  Next up
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontVariationSettings: "'wdth' 78,'wght' 800", fontSize: 16, letterSpacing: "-.02em", textTransform: "uppercase", color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {tonightEvent.name}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "rgba(17,17,17,.4)", letterSpacing: ".05em", marginTop: 2 }}>
                    {tonightVenue?.name}{tonightVenue?.area ? ` · ${tonightVenue.area}` : ""} · {tonightEvent.time} · {tonightEvent.tiers[0]?.price === 0 ? "Free entry" : `₹ ${tonightEvent.tiers[0]?.price}`}
                  </div>
                </div>
                <GradBorder radius={32} gradient="linear-gradient(135deg,rgba(30,168,116,.6) 0%,rgba(30,168,116,.2) 100%)" shadow="none" style={{ flexShrink: 0 }}>
                  <button onClick={() => navigate(`/e/${tonightEvent.id}`)} style={{ display: "block", background: "rgba(255,255,255,0.55)", backdropFilter: "blur(8px)", color: "#1EA874", border: "none", borderRadius: 31, padding: "9px 18px", fontFamily: "'Archivo',sans-serif", fontVariationSettings: "'wdth' 90,'wght' 700", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                    See event →
                  </button>
                </GradBorder>
              </div>
            </GradBorder>
          </div>
        )}
      </section>

      {/* ── TICKER ───────────────────────────────────────────────────────── */}
      {tickerItems.length > 0 && (
        <div role="marquee" aria-label="Areas and genres" style={{ background: "#D4380D", padding: "10px 0", overflow: "hidden" }}>
          <div aria-hidden="true" style={{ display: "inline-flex", whiteSpace: "nowrap", animation: "naada-ticker 22s linear infinite" }}>
            {tickerItems.map((item, i) => (
              <span key={i} style={{ fontVariationSettings: "'wdth' 90,'wght' 700", fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "#fff", padding: "0 24px", whiteSpace: "nowrap", flexShrink: 0 }}>
                {item}<span style={{ marginLeft: 24, opacity: 0.6 }}>·</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── CARDS SECTION ────────────────────────────────────────────────── */}
      <section style={{ background: "#F5F3EF", padding: "32px 32px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontVariationSettings: "'wdth' 90,'wght' 900", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "#111" }}>
            {urlQuery ? `Results for "${searchParams.get("q")}"` : "What's On"}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(0,0,0,.32)" }}>
            {filtered.length} {filtered.length === 1 ? "event" : "events"}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "156px 1fr", gap: "0 28px" }}>

          {/* Filter column */}
          <div>
            <div style={{ fontVariationSettings: "'wdth' 90,'wght' 800", fontSize: 18, letterSpacing: "-.02em", color: "#111", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              Browse
              <span aria-hidden="true" style={{ flex: 1, height: 2, background: "linear-gradient(90deg,#D4380D,transparent)", borderRadius: 1 }} />
            </div>

            {filterTabs.map((label, i) => {
              const isActive = activeFilter === i;
              return (
                <GradBorder
                  key={label}
                  radius={32}
                  gradient={isActive
                    ? "linear-gradient(135deg,rgba(212,56,13,.7) 0%,rgba(200,46,8,.5) 100%)"
                    : "linear-gradient(135deg,rgba(255,255,255,.7) 0%,rgba(212,56,13,.08) 50%,rgba(232,179,60,.1) 100%)"}
                  shadow={isActive ? "0 4px 16px rgba(212,56,13,.25)" : "0 2px 8px rgba(100,60,20,.06)"}
                  style={{ display: "block", marginBottom: 7, cursor: "pointer" }}
                >
                  <button
                    onClick={() => { setActiveFilter(i); setCarouselPos(0); }}
                    aria-pressed={isActive}
                    style={{ display: "block", width: "100%", background: isActive ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.65)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "none", borderRadius: 31, padding: "8px 14px", fontFamily: "'Archivo',sans-serif", fontSize: 12, color: isActive ? "#fff" : "rgba(0,0,0,.55)", fontVariationSettings: isActive ? "'wdth' 90,'wght' 700" : "'wdth' 90,'wght' 600", textAlign: "left", cursor: "pointer" }}
                  >
                    {label}
                  </button>
                </GradBorder>
              );
            })}

            {/* Carousel arrows */}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {([{ dir: -1, label: "←", ariaLabel: "Previous" }, { dir: 1, label: "→", ariaLabel: "Next" }] as const).map(({ dir, label, ariaLabel }) => {
                const disabled = dir === -1 ? clampedPos === 0 : clampedPos >= carouselMax;
                return (
                  <GradBorder key={dir} radius={50} gradient={disabled ? "rgba(0,0,0,.05)" : "linear-gradient(135deg,rgba(255,255,255,.8) 0%,rgba(212,56,13,.2) 100%)"} shadow={disabled ? "none" : "0 2px 8px rgba(100,60,20,.08)"}>
                    <button onClick={() => moveCarousel(dir)} disabled={disabled} aria-label={ariaLabel} style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.65)", backdropFilter: "blur(8px)", border: "none", color: "#111", fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: disabled ? 0.22 : 1 }}>
                      {label}
                    </button>
                  </GradBorder>
                );
              })}
            </div>

            {/* Dots */}
            {carouselMax > 0 && (
              <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 10 }}>
                {Array.from({ length: Math.min(carouselMax + 1, 5) }).map((_, i) => {
                  const active = i === Math.round((clampedPos / Math.max(carouselMax, 1)) * Math.min(carouselMax, 4));
                  return (
                    <div key={i} aria-hidden="true" style={{ height: 5, width: active ? 18 : 5, borderRadius: active ? 3 : "50%", background: active ? "#D4380D" : "rgba(0,0,0,.15)", transition: "all .25s" }} />
                  );
                })}
              </div>
            )}
          </div>

          {/* Carousel */}
          <div style={{ overflow: "hidden" }}>
            {filtered.length > 0 ? (
              <div style={{ display: "flex", gap: 14, transform: `translateX(-${clampedPos * 210}px)`, transition: "transform .45s cubic-bezier(.4,0,.2,1)" }}>
                {filtered.map((ev) => (
                  <EventGlassCard
                    key={ev.id}
                    event={ev}
                    soldCount={soldOf(ev)}
                    capCount={capacityOf(ev)}
                  />
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "32px 0", gap: 12 }}>
                <div style={{ fontVariationSettings: "'wdth' 90,'wght' 800", fontSize: 20, color: "#111", letterSpacing: "-.02em" }}>
                  {urlQuery ? `Nothing matches "${searchParams.get("q")}"` : "Nothing here yet"}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "rgba(0,0,0,.4)", letterSpacing: ".05em" }}>
                  Try a different filter or clear your search
                </div>
                {(urlQuery || activeFilter !== 0) && (
                  <GradBorder radius={32} gradient="linear-gradient(135deg,rgba(212,56,13,.5),rgba(212,56,13,.2))" shadow="0 2px 8px rgba(212,56,13,.15)">
                    <button onClick={() => { setActiveFilter(0); setSearchInput(""); setSearchParams({}); }} style={{ display: "block", background: "rgba(255,255,255,.65)", backdropFilter: "blur(8px)", border: "none", borderRadius: 31, padding: "9px 18px", fontFamily: "'Archivo',sans-serif", fontVariationSettings: "'wdth' 90,'wght' 700", fontSize: 13, color: "#C42E08", cursor: "pointer" }}>
                      Clear filters
                    </button>
                  </GradBorder>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid rgba(100,60,20,.12)", padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontSize: 16, letterSpacing: "-.05em", textTransform: "uppercase", color: "#111", display: "flex", alignItems: "center" }}>
          <span style={{ fontVariationSettings: "'wdth' 62,'wght' 900" }}>NAA</span>
          <span style={{ color: "#D4380D", margin: "0 1px", fontVariationSettings: "'wdth' 62,'wght' 900" }}>·</span>
          <span style={{ fontVariationSettings: "'wdth' 125,'wght' 900" }}>DA</span>
        </div>
        <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "rgba(0,0,0,.35)", letterSpacing: ".04em" }}>
          Grassroots live music in Mysuru. Prototype — no real payments, no real accounts.
        </p>
      </footer>

    </div>
  );
}
