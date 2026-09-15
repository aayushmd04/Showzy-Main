import { useMemo, useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { useStore } from "@/store/app-store";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { NotificationBell } from "@/components/naada/notification-bell";
import { AccountMenu } from "@/components/naada/account-menu";
import { today, daysFromNow } from "@/lib/format";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { getCities, type ApiCity } from "@/lib/api";
import type { NaadaEvent, Artist, Venue } from "@/data/fixtures";

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

function totalCapacity(event: NaadaEvent): number {
  return event.tiers.reduce((s, t) => s + t.capacity, 0);
}

function seatsLeft(event: NaadaEvent): number {
  const sold = event.tiers.reduce((s, t) => s + t.sold, 0);
  return Math.max(0, totalCapacity(event) - sold);
}

/**
 * True only when we know the capacity and it has all gone.
 *
 * A host who lists a night before adding ticket tiers has an event whose
 * capacity is zero, and `every(sold >= capacity)` is vacuously true on an
 * empty list — so the listing announced "Sold out" for a room nobody had been
 * able to buy into yet, next to a price of "Free". Unknown capacity is not the
 * same as no seats.
 */
function capacityKnown(event: NaadaEvent): boolean {
  return totalCapacity(event) > 0;
}

function lowestPrice(event: NaadaEvent): number {
  return Math.min(...event.tiers.map((t) => t.price));
}

function isFree(event: NaadaEvent): boolean {
  return lowestPrice(event) === 0;
}

function isSoldOut(event: NaadaEvent): boolean {
  return capacityKnown(event) && event.tiers.every((t) => t.sold >= t.capacity);
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
      : capacityKnown(event)
        ? (lang === "en" ? `${left} seats left` : `${left} ಆಸನಗಳು ಉಳಿದಿವೆ`)
        // No tiers yet, so no seat count to quote — say what is true instead
        // of "0 seats left", which reads as sold out.
        : (lang === "en" ? "Tickets on the event page" : "ಟಿಕೆಟ್ ವಿವರ ಕಾರ್ಯಕ್ರಮದ ಪುಟದಲ್ಲಿ");

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
        {/* "Tonight" only when it genuinely is tonight — the hero rotates
            through the next five events, and calling a gig three weeks out
            "Tonight" is the sort of thing a buyer notices immediately. */}
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: tok.gold }}>
          {[
            event.date === today()
              ? lang === "en" ? "Tonight" : "ಇಂದು"
              : `${fmt(event.date, "dow")} ${fmt(event.date, "d")} ${fmt(event.date, "mon")}`,
            venue?.name,
          ]
            .filter(Boolean)
            .join(" · ")}
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
        {left > 0 && capacityKnown(event) && !isSoldOut(event) && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 13, color: "rgba(243,233,214,.6)" }}>
            <PulsingDot color={tok.signal} />
            <span>{lang === "en" ? `${left} seats left` : `${left} ಆಸನಗಳು ಉಳಿದಿವೆ`}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section header, shared by every rail below the fold ──────────────────────
function SectionHead({
  title,
  blurb,
  action,
  tok,
}: {
  title: string;
  blurb?: string;
  action?: { label: string; to?: string; onClick?: () => void };
  tok: typeof T.dark;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, marginBottom: 24, flexWrap: "wrap" }}>
      <div>
        <h2
          style={{
            fontFamily: "'Baloo Tamma 2',system-ui",
            fontWeight: 800,
            fontSize: "clamp(28px,3.4vw,42px)",
            lineHeight: 1.1,
            color: tok.paper,
            margin: 0,
            textWrap: "balance",
          }}
        >
          {title}
        </h2>
        {blurb && (
          <p style={{ fontSize: 15, color: tok.muted, margin: "8px 0 0", maxWidth: "58ch" }}>{blurb}</p>
        )}
      </div>
      {action &&
        (action.to ? (
          <Link
            to={action.to}
            style={{ fontSize: 16, fontWeight: 600, color: tok.signal, textDecoration: "none", whiteSpace: "nowrap" }}
          >
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: tok.signal,
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontFamily: "'Archivo',sans-serif",
              whiteSpace: "nowrap",
            }}
          >
            {action.label}
          </button>
        ))}
    </div>
  );
}

// ─── Browse-by tile (genres, free entry, this weekend) ────────────────────────
function BrowseTile({
  label,
  count,
  countLabel,
  active,
  tok,
  onClick,
}: {
  label: string;
  count: number;
  countLabel: string;
  active: boolean;
  tok: typeof T.dark;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 6,
        minHeight: 96,
        padding: "16px 18px",
        textAlign: "left",
        borderRadius: 14,
        border: `1.5px solid ${active ? tok.signal : tok.cardBorder}`,
        background: active ? `${tok.signal}14` : tok.cardBg,
        cursor: "pointer",
        fontFamily: "'Archivo',sans-serif",
        transition: "border-color .15s, background .15s",
      }}
    >
      <span
        style={{
          fontFamily: "'Baloo Tamma 2',system-ui",
          fontWeight: 700,
          fontSize: 19,
          lineHeight: 1.2,
          color: tok.paper,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: active ? tok.signal : tok.muted2 }}>
        {count} {countLabel}
      </span>
    </button>
  );
}

// ─── Artist card (the "Artists on Naada" rail) ────────────────────────────────
function ArtistRailCard({ artist, tok, lang }: { artist: Artist; tok: typeof T.dark; lang: "en" | "kn" }) {
  const initials = artist.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <Link
      to={`/a/${artist.id}`}
      style={{
        display: "flex",
        flexDirection: "column",
        textDecoration: "none",
        borderRadius: 16,
        overflow: "hidden",
        border: `1px solid ${tok.cardBorder}`,
        background: tok.cardBg,
      }}
    >
      <div style={{ position: "relative", height: 190, background: tok.surface, flexShrink: 0 }}>
        {artist.photo ? (
          <img
            src={artist.photo}
            alt={artist.name}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: "100%",
              height: "100%",
              display: "grid",
              placeItems: "center",
              fontFamily: "'Baloo Tamma 2',system-ui",
              fontWeight: 800,
              fontSize: 54,
              color: tok.muted2,
              background: `linear-gradient(150deg,${tok.surface} 0%,${tok.cardBg} 100%)`,
            }}
          >
            {initials}
          </div>
        )}
      </div>
      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <div
          style={{
            fontFamily: "'Baloo Tamma 2',system-ui",
            fontWeight: 700,
            fontSize: 19,
            lineHeight: 1.2,
            color: tok.paper,
          }}
        >
          {artist.name}
        </div>
        <div style={{ fontSize: 13, color: tok.muted, minHeight: 18 }}>
          {[artist.genres.slice(0, 2).join(" · "), artist.city].filter(Boolean).join(" — ")}
        </div>
        <div style={{ fontSize: 13, color: tok.muted2, marginTop: "auto", paddingTop: 6 }}>
          {artist.gigsPlayed > 0
            ? lang === "en"
              ? `${artist.gigsPlayed} ${artist.gigsPlayed === 1 ? "gig" : "gigs"} on Naada`
              : `Naada ನಲ್ಲಿ ${artist.gigsPlayed} ಕಾರ್ಯಕ್ರಮ`
            : lang === "en"
              ? "New to Naada"
              : "Naada ಗೆ ಹೊಸಬರು"}
        </div>
      </div>
    </Link>
  );
}

// ─── Venue card (the "Rooms" rail) ────────────────────────────────────────────
function VenueRailCard({
  venue,
  photoIndex,
  liveCount,
  tok,
  lang,
}: {
  venue: Venue;
  photoIndex: number;
  liveCount: number;
  tok: typeof T.dark;
  lang: "en" | "kn";
}) {
  const photo = venue.photo ?? gigPhoto(photoIndex);
  return (
    <div
      style={{
        position: "relative",
        height: 230,
        borderRadius: 16,
        overflow: "hidden",
        border: `1px solid ${tok.cardBorder}`,
      }}
    >
      <img src={photo} alt={venue.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(18,14,11,0) 42%,rgba(18,14,11,.82) 100%)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "16px 18px", color: "#F3E9D6" }}>
        <div style={{ fontFamily: "'Baloo Tamma 2',system-ui", fontWeight: 700, fontSize: 20, lineHeight: 1.2 }}>
          {venue.name}
        </div>
        <div style={{ fontSize: 13, color: "rgba(243,233,214,.72)", marginTop: 4 }}>
          {[venue.area, venue.capacity > 0 ? (lang === "en" ? `${venue.capacity} seats` : `${venue.capacity} ಆಸನ`) : ""]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {liveCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 13, color: tok.gold, fontWeight: 600 }}>
            <PulsingDot color={tok.gold} />
            <span>
              {lang === "en"
                ? `${liveCount} ${liveCount === 1 ? "night" : "nights"} on sale`
                : `${liveCount} ಕಾರ್ಯಕ್ರಮ ಮಾರಾಟದಲ್ಲಿ`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main DiscoverScreen ──────────────────────────────────────────────────────
export function DiscoverScreen() {
  const { role, currentUser, events, artists, venues, venueOf, theme, setTheme, lang, setLang } = useStore();
  const { open: openAuth } = useAuthSheet();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput]   = useState(searchParams.get("q") ?? "");
  const [activeFilter, setActiveFilter] = useState(0);
  const [cityFilter, setCityFilter]     = useState("all");
  const [cities, setCities]             = useState<ApiCity[]>([]);
  const tickerRef = useRef<HTMLDivElement>(null);

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
      .filter((e) => e.status === "published" && e.date >= today())
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

  // "This week" used to mean "every upcoming event we have", which reads as a
  // lie the moment the calendar stretches past Sunday. Split it: the next
  // seven days here, everything after that in its own rail below.
  const weekEnd = useMemo(() => daysFromNow(7), []);
  const thisWeek = useMemo(() => filtered.filter((e) => e.date <= weekEnd), [filtered, weekEnd]);
  const later = useMemo(() => filtered.filter((e) => e.date > weekEnd), [filtered, weekEnd]);

  // Primitive fingerprints, not the arrays themselves — a fresh array
  // reference arrives on plenty of renders that don't change which events are
  // in it (an unrelated store update, say), and a rail keyed on the array
  // tears itself down and rebuilds every one of those times, never surviving
  // long enough for its own interval to fire.
  const thisWeekKey = useMemo(() => thisWeek.map((e) => e.id).join(","), [thisWeek]);
  const laterKey = useMemo(() => later.map((e) => e.id).join(","), [later]);

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

  // Three buttons say "tonight's gigs", and they used to follow whichever
  // event the hero had rotated to — so pressing one could land you on a gig a
  // month out. `published` is date-sorted, so its head is the real next night.
  const soonest = published[0];

  // Each rail is a horizontally auto-scrolling strip (see the `.discover-cards`
  // flex-row CSS), not a grid that just wraps once it runs out of room.
  const weekRail = useAutoScroll(thisWeekKey);
  const laterRail = useAutoScroll(laterKey, 300, 4500);

  // ── Artists and rooms: real rows, or the rail simply isn't rendered ───────
  // A brand-new deployment has none of either, and an empty carousel reads
  // worse than no carousel.
  const railArtists = useMemo(() => {
    // Whoever is actually on a bill this month leads; the rest fill in behind.
    const onBill = new Set(published.flatMap((e) => e.lineup));
    return [...artists]
      .sort((a, b) => {
        const billed = Number(onBill.has(b.id)) - Number(onBill.has(a.id));
        return billed !== 0 ? billed : b.gigsPlayed - a.gigsPlayed;
      })
      .slice(0, 10);
  }, [artists, published]);

  const railVenues = useMemo(() => {
    const nightsAt = new Map<string, number>();
    published.forEach((e) => nightsAt.set(e.venueId, (nightsAt.get(e.venueId) ?? 0) + 1));
    const inScope =
      cityFilter === "all"
        ? venues
        : venues.filter((v) => published.some((e) => e.venueId === v.id));
    return [...inScope]
      .sort((a, b) => (nightsAt.get(b.id) ?? 0) - (nightsAt.get(a.id) ?? 0))
      .slice(0, 10)
      .map((v) => ({ venue: v, liveCount: nightsAt.get(v.id) ?? 0 }));
  }, [venues, published, cityFilter]);

  const artistsKey = useMemo(() => railArtists.map((a) => a.id).join(","), [railArtists]);
  const venuesKey = useMemo(() => railVenues.map((v) => v.venue.id).join(","), [railVenues]);
  const artistRail = useAutoScroll(artistsKey, 280, 5000);
  const venueRail = useAutoScroll(venuesKey, 320, 5500);

  // ── "Browse by" tiles ─────────────────────────────────────────────────────
  // Built from the same `filterTabs` the chips use, so a tile can never offer
  // a genre the chips have no room for and quietly fall back to "All". Counts
  // come off the real published list — a genre nobody is playing gets no tile.
  const browseTiles = useMemo(
    () =>
      filterTabs
        .filter((name) => name !== "All")
        .map((name) => ({
          name,
          count:
            name === "Free"
              ? published.filter(isFree).length
              : published.filter((e) => e.genres.includes(name)).length,
        }))
        .filter((t) => t.count > 0),
    [filterTabs, published],
  );

  const goToTab = (name: string) => {
    const i = filterTabs.indexOf(name);
    setActiveFilter(i >= 0 ? i : 0);
    document.getElementById("this-week")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
            onClick={() => soonest && navigate(`/e/${soonest.id}`)}
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
            {/* Quote a seat count only when there is a real one to quote.
                The hero rotates, and an event whose tiers aren't up yet was
                producing "0 seats left tonight" — the most discouraging thing
                the page could possibly say. */}
            {heroEvent && capacityKnown(heroEvent) && seatsLeft(heroEvent) > 0
              ? (lang === "en"
                  ? `${seatsLeft(heroEvent)} seats left ${heroEvent.date === today() ? "tonight" : "on this one"}`
                  : `${seatsLeft(heroEvent)} ಆಸನಗಳು ಉಳಿದಿವೆ`)
              : published.length > 0
                ? (lang === "en"
                    ? `${published.length} ${published.length === 1 ? "night" : "nights"} on sale now`
                    : `${published.length} ಕಾರ್ಯಕ್ರಮ ಮಾರಾಟದಲ್ಲಿ`)
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
              onClick={() => soonest && navigate(`/e/${soonest.id}`)}
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

      {/* ── BROWSE BY ────────────────────────────────────────────────────── */}
      {browseTiles.length > 0 && (
        <section className="discover-section" style={{ background: tok.bg, paddingBottom: 0 }}>
          <SectionHead
            tok={tok}
            title={lang === "en" ? "What do you feel like?" : "ನಿಮಗೆ ಏನು ಬೇಕು?"}
            blurb={
              lang === "en"
                ? "Pick a sound and the listing below follows you."
                : "ಒಂದು ಶೈಲಿ ಆರಿಸಿ — ಕೆಳಗಿನ ಪಟ್ಟಿ ಬದಲಾಗುತ್ತದೆ."
            }
          />
          <div className="discover-browse">
            {browseTiles.map(({ name, count }) => (
              <BrowseTile
                key={name}
                label={name === "Free" && lang === "kn" ? "ಉಚಿತ" : name}
                count={count}
                countLabel={
                  lang === "en" ? (count === 1 ? "night" : "nights") : "ಕಾರ್ಯಕ್ರಮ"
                }
                active={activeTabName === name}
                tok={tok}
                onClick={() => goToTab(name)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── THIS WEEK ────────────────────────────────────────────────────── */}
      <section id="this-week" className="discover-section" style={{ background: tok.bg }}>
        <SectionHead
          tok={tok}
          title={lang === "en" ? "This week" : "ಈ ವಾರ"}
          blurb={
            lang === "en"
              ? "The next seven nights, in the rooms closest to you."
              : "ಮುಂದಿನ ಏಳು ರಾತ್ರಿಗಳು, ನಿಮ್ಮ ಹತ್ತಿರದ ಸಭಾಂಗಣಗಳಲ್ಲಿ."
          }
          action={
            activeTabName !== "All" || urlQuery
              ? {
                  label: lang === "en" ? `See all ${published.length} →` : `ಎಲ್ಲಾ ${published.length} ನೋಡಿ →`,
                  onClick: () => { setActiveFilter(0); setSearchInput(""); setSearchParams({}); },
                }
              : undefined
          }
        />

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
        {thisWeek.length > 0 ? (
          <div className="discover-cards" ref={weekRail.ref} {...weekRail.handlers}>
            {thisWeek.map((ev, i) => (
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
          <div
            style={{
              padding: "40px 24px",
              textAlign: "center",
              border: `1px dashed ${tok.cardBorder}`,
              borderRadius: 16,
            }}
          >
            <div
              style={{
                fontFamily: "'Baloo Tamma 2',system-ui",
                fontWeight: 700,
                fontSize: 22,
                color: tok.paper,
                marginBottom: 8,
              }}
            >
              {urlQuery
                ? lang === "en"
                  ? `Nothing matches "${searchParams.get("q")}"`
                  : `"${searchParams.get("q")}" ಗೆ ಏನೂ ಸಿಗಲಿಲ್ಲ`
                : later.length > 0
                  ? lang === "en"
                    ? "Nothing in the next seven days"
                    : "ಮುಂದಿನ ಏಳು ದಿನಗಳಲ್ಲಿ ಏನೂ ಇಲ್ಲ"
                  : lang === "en"
                    ? "Nothing on sale right now"
                    : "ಸದ್ಯಕ್ಕೆ ಯಾವುದೇ ಕಾರ್ಯಕ್ರಮ ಇಲ್ಲ"}
            </div>
            <div style={{ fontSize: 14, color: tok.muted, marginBottom: 20 }}>
              {later.length > 0
                ? lang === "en"
                  ? "Scroll on — there's more further out."
                  : "ಕೆಳಗೆ ನೋಡಿ — ಮುಂದೆ ಇನ್ನಷ್ಟು ಇದೆ."
                : lang === "en"
                  ? "Try another city, or check back soon."
                  : "ಬೇರೆ ನಗರ ನೋಡಿ, ಅಥವಾ ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಬನ್ನಿ."}
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
                {lang === "en" ? "Clear filters" : "ಫಿಲ್ಟರ್ ತೆಗೆಯಿರಿ"}
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── COMING UP (everything past the seven-day window) ─────────────── */}
      {later.length > 0 && (
        <section className="discover-section" style={{ background: tok.surface }}>
          <SectionHead
            tok={tok}
            title={lang === "en" ? "Coming up" : "ಮುಂದೆ ಬರಲಿದೆ"}
            blurb={
              lang === "en"
                ? `${later.length} more ${later.length === 1 ? "night" : "nights"} already on sale. Seats go first at the small rooms.`
                : `ಇನ್ನೂ ${later.length} ಕಾರ್ಯಕ್ರಮ ಮಾರಾಟದಲ್ಲಿದೆ. ಸಣ್ಣ ಸಭಾಂಗಣಗಳಲ್ಲಿ ಆಸನ ಬೇಗ ಮುಗಿಯುತ್ತದೆ.`
            }
          />
          <div className="discover-cards" ref={laterRail.ref} {...laterRail.handlers}>
            {later.map((ev, i) => (
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
        </section>
      )}

      {/* ── ARTISTS ─────────────────────────────────────────────────────── */}
      {railArtists.length > 0 && (
        <section className="discover-section" style={{ background: tok.bg }}>
          <SectionHead
            tok={tok}
            title={lang === "en" ? "Artists on Naada" : "Naada ನಲ್ಲಿ ಕಲಾವಿದರು"}
            blurb={
              lang === "en"
                ? "Whoever is playing this month, first. Every one of them is booked through here."
                : "ಈ ತಿಂಗಳು ನುಡಿಸುತ್ತಿರುವವರು ಮೊದಲು. ಎಲ್ಲರನ್ನೂ ಇಲ್ಲಿಂದಲೇ ಬುಕ್ ಮಾಡಲಾಗುತ್ತದೆ."
            }
            action={{ label: lang === "en" ? "All artists →" : "ಎಲ್ಲಾ ಕಲಾವಿದರು →", to: "/artists" }}
          />
          <div className="discover-cards discover-cards-sm" ref={artistRail.ref} {...artistRail.handlers}>
            {railArtists.map((a) => (
              <ArtistRailCard key={a.id} artist={a} tok={tok} lang={lang} />
            ))}
          </div>
        </section>
      )}

      {/* ── ROOMS ───────────────────────────────────────────────────────── */}
      {railVenues.length > 0 && (
        <section className="discover-section" style={{ background: tok.surface }}>
          <SectionHead
            tok={tok}
            title={lang === "en" ? "Rooms worth sitting in" : "ಕುಳಿತು ಕೇಳಬೇಕಾದ ಸಭಾಂಗಣಗಳು"}
            blurb={
              lang === "en"
                ? "Courtyards, cafés and studios — most of them hold under a hundred people."
                : "ಅಂಗಳ, ಕೆಫೆ ಮತ್ತು ಸ್ಟುಡಿಯೋ — ಹೆಚ್ಚಿನವು ನೂರಕ್ಕಿಂತ ಕಡಿಮೆ ಜನರಿಗೆ."
            }
            action={{ label: lang === "en" ? "All venues →" : "ಎಲ್ಲಾ ಸ್ಥಳಗಳು →", to: "/venues" }}
          />
          <div className="discover-cards" ref={venueRail.ref} {...venueRail.handlers}>
            {railVenues.map(({ venue, liveCount }, i) => (
              <VenueRailCard
                key={venue.id}
                venue={venue}
                photoIndex={i}
                liveCount={liveCount}
                tok={tok}
                lang={lang}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
      <section className="discover-section" style={{ background: tok.bg }}>
        <SectionHead
          tok={tok}
          title={lang === "en" ? "Three steps, no queue" : "ಮೂರು ಹೆಜ್ಜೆ, ಸರತಿ ಇಲ್ಲ"}
          action={{ label: lang === "en" ? "How it works →" : "ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ →", to: "/how-it-works" }}
        />
        <ol className="discover-steps">
          {(lang === "en"
            ? [
                ["Find the night", "Filter by sound, room or city. Every listing shows what's actually left."],
                ["Pay by UPI", "GPay, PhonePe, Paytm or card. The price on the card is the price you pay."],
                ["Show the code", "Your QR arrives straight away. The door scans it — no printout, no queue."],
              ]
            : [
                ["ಕಾರ್ಯಕ್ರಮ ಹುಡುಕಿ", "ಶೈಲಿ, ಸಭಾಂಗಣ ಅಥವಾ ನಗರದ ಪ್ರಕಾರ ಹುಡುಕಿ. ಉಳಿದಿರುವ ಆಸನ ಎಷ್ಟು ಎಂದು ಕಾಣಿಸುತ್ತದೆ."],
                ["UPI ಮೂಲಕ ಪಾವತಿಸಿ", "GPay, PhonePe, Paytm ಅಥವಾ ಕಾರ್ಡ್. ತೋರಿಸಿದ ಬೆಲೆಯೇ ನೀವು ಕೊಡುವ ಬೆಲೆ."],
                ["ಕೋಡ್ ತೋರಿಸಿ", "ನಿಮ್ಮ QR ತಕ್ಷಣ ಬರುತ್ತದೆ. ಬಾಗಿಲಲ್ಲಿ ಸ್ಕ್ಯಾನ್ ಮಾಡುತ್ತಾರೆ — ಪ್ರಿಂಟ್ ಬೇಡ, ಸರತಿ ಬೇಡ."],
              ]
          ).map(([title, body], i) => (
            <li
              key={title}
              style={{
                border: `1px solid ${tok.cardBorder}`,
                background: tok.cardBg,
                borderRadius: 16,
                padding: "22px 22px 24px",
                listStyle: "none",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  fontFamily: "'Baloo Tamma 2',system-ui",
                  fontWeight: 800,
                  fontSize: 15,
                  letterSpacing: ".12em",
                  color: tok.signal,
                  marginBottom: 10,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
              <div
                style={{
                  fontFamily: "'Baloo Tamma 2',system-ui",
                  fontWeight: 700,
                  fontSize: 21,
                  lineHeight: 1.25,
                  color: tok.paper,
                  marginBottom: 8,
                }}
              >
                {title}
              </div>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: tok.muted, margin: 0 }}>{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── FOR ARTISTS & HOSTS ─────────────────────────────────────────── */}
      {role === "out" && (
        <section className="discover-section" style={{ background: tok.surface }}>
          <SectionHead
            tok={tok}
            title={lang === "en" ? "On the other side of the mic" : "ಮೈಕ್‌ನ ಇನ್ನೊಂದು ಬದಿಯಲ್ಲಿ"}
            blurb={
              lang === "en"
                ? "Naada is free to list on. You keep the door money; we take nothing off the top."
                : "Naada ನಲ್ಲಿ ಪಟ್ಟಿ ಮಾಡುವುದು ಉಚಿತ. ಬಾಗಿಲ ಹಣ ನಿಮ್ಮದೇ."
            }
          />
          <div className="discover-audience">
            {[
              {
                who: lang === "en" ? "You play music" : "ನೀವು ಸಂಗೀತ ನುಡಿಸುತ್ತೀರಿ",
                body:
                  lang === "en"
                    ? "Put up a profile, answer open gigs, agree a fee in writing and get paid after the show."
                    : "ಪ್ರೊಫೈಲ್ ಮಾಡಿ, ಗಿಗ್‌ಗಳಿಗೆ ಅರ್ಜಿ ಹಾಕಿ, ಶುಲ್ಕ ಒಪ್ಪಿ, ಕಾರ್ಯಕ್ರಮದ ನಂತರ ಹಣ ಪಡೆಯಿರಿ.",
                cta: lang === "en" ? "Join as an artist" : "ಕಲಾವಿದರಾಗಿ ಸೇರಿ",
              },
              {
                who: lang === "en" ? "You have a room" : "ನಿಮ್ಮ ಬಳಿ ಸಭಾಂಗಣ ಇದೆ",
                body:
                  lang === "en"
                    ? "Draw your floor plan once, list a night, sell seats and scan people in at the door."
                    : "ಒಮ್ಮೆ ನಕ್ಷೆ ಬಿಡಿಸಿ, ಕಾರ್ಯಕ್ರಮ ಸೇರಿಸಿ, ಆಸನ ಮಾರಿ, ಬಾಗಿಲಲ್ಲಿ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ.",
                cta: lang === "en" ? "List your venue" : "ನಿಮ್ಮ ಸ್ಥಳ ಸೇರಿಸಿ",
              },
            ].map(({ who, body, cta }) => (
              <div
                key={who}
                style={{
                  border: `1px solid ${tok.cardBorder}`,
                  background: tok.cardBg,
                  borderRadius: 16,
                  padding: "24px 24px 26px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    fontFamily: "'Baloo Tamma 2',system-ui",
                    fontWeight: 700,
                    fontSize: 24,
                    lineHeight: 1.2,
                    color: tok.paper,
                  }}
                >
                  {who}
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.6, color: tok.muted, margin: 0 }}>{body}</p>
                <button
                  type="button"
                  onClick={() => openAuth(cta)}
                  style={{
                    alignSelf: "flex-start",
                    marginTop: 8,
                    minHeight: 46,
                    border: `1.5px solid ${tok.signal}`,
                    background: "transparent",
                    borderRadius: 12,
                    padding: "0 22px",
                    fontFamily: "'Archivo',sans-serif",
                    fontSize: 15,
                    fontWeight: 700,
                    color: tok.signal,
                    cursor: "pointer",
                  }}
                >
                  {cta}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── ROOTED IN KARNATAKA ─────────────────────────────────────────── */}
      <section className="discover-section" style={{ background: tok.bg }}>
        <SectionHead
          tok={tok}
          title={lang === "en" ? "Rooted in Karnataka" : "ಕರ್ನಾಟಕದ ಬೇರುಗಳಲ್ಲಿ"}
          blurb={
            lang === "en"
              ? "Two cities to begin with, and the music that already lives in them."
              : "ಮೊದಲಿಗೆ ಎರಡು ನಗರಗಳು, ಮತ್ತು ಅಲ್ಲಿ ಈಗಾಗಲೇ ಇರುವ ಸಂಗೀತ."
          }
        />
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
          onClick={() => soonest && navigate(`/e/${soonest.id}`)}
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
