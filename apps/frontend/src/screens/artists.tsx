import { useState } from "react";
import { Link } from "react-router-dom";
import { PublicShell } from "@/components/naada/public-shell";
import { useStore } from "@/store/app-store";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { money } from "@/lib/format";

function ArtistCard({ artist, tok }: { artist: import("@/data/fixtures").Artist; tok: { paper: string; muted: string; signal: string; surface: string; cardBorder: string } }) {
  return (
    <Link
      to={`/a/${artist.id}`}
      style={{
        display: "block", textDecoration: "none",
        border: `1px solid ${tok.cardBorder}`,
        background: tok.surface,
        borderRadius: 4,
        padding: "20px 20px 16px",
        transition: "border-color .15s",
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 52, height: 52, borderRadius: "50%",
        background: `linear-gradient(135deg, ${tok.signal}55, ${tok.signal}22)`,
        border: `2px solid ${tok.signal}66`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 22, fontWeight: 800, color: tok.signal,
        marginBottom: 12,
      }}>
        {artist.name.charAt(0)}
      </div>

      <p style={{ fontSize: 16, fontWeight: 700, color: tok.paper, margin: 0 }}>{artist.name}</p>
      <p style={{ fontSize: 13, color: tok.muted, margin: "4px 0 0" }}>{artist.city || "India"}</p>

      {/* Genres */}
      {artist.genres.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {artist.genres.slice(0, 3).map((g) => (
            <span key={g} style={{ fontSize: 11, padding: "2px 8px", border: `1px solid ${tok.cardBorder}`, borderRadius: 999, color: tok.muted }}>
              {g}
            </span>
          ))}
        </div>
      )}

      {/* Fee */}
      {(artist.feeMin > 0 || artist.feeMax > 0) && (
        <p style={{ fontSize: 12, color: tok.muted, marginTop: 10 }}>
          Fee: {money(artist.feeMin)}–{money(artist.feeMax)}
        </p>
      )}

      {/* Stats */}
      <div style={{ display: "flex", gap: 16, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${tok.cardBorder}` }}>
        {artist.gigsPlayed > 0 && (
          <span style={{ fontSize: 12, color: tok.muted }}>{artist.gigsPlayed} gigs</span>
        )}
        {artist.rating > 0 && (
          <span style={{ fontSize: 12, color: tok.muted }}>★ {artist.rating.toFixed(1)}</span>
        )}
      </div>
    </Link>
  );
}

const CARD_TOKENS = {
  dark:  { paper: "#F3E9D6", muted: "rgba(243,233,214,.55)", signal: "#C4472E", surface: "#1A1512", cardBorder: "rgba(243,233,214,.16)" },
  light: { paper: "#241C15", muted: "rgba(36,28,21,.62)",    signal: "#8C2B3E", surface: "#FFFCF4", cardBorder: "rgba(36,28,21,.16)" },
};

export function ArtistsScreen() {
  const { artists, theme } = useStore();
  const { open: openAuth } = useAuthSheet();
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("All");
  const isDark = theme === "dark";
  const tok = isDark ? CARD_TOKENS.dark : CARD_TOKENS.light;

  const genres = ["All", ...Array.from(new Set(artists.flatMap((a) => a.genres))).sort()];

  const filtered = artists.filter((a) => {
    const matchQuery = !query || a.name.toLowerCase().includes(query.toLowerCase()) || a.genres.some((g) => g.toLowerCase().includes(query.toLowerCase()));
    const matchGenre = genre === "All" || a.genres.includes(genre);
    return matchQuery && matchGenre;
  });

  return (
    <PublicShell>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 24px 80px" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: tok.paper, margin: 0 }}>Artists</h1>
          <p style={{ fontSize: 15, color: tok.muted, marginTop: 8 }}>
            Discover independent artists performing across Mysuru and Bengaluru.
          </p>
        </div>

        {/* Search + filter row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 32 }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search artists or genres…"
            style={{
              flex: "1 1 240px", minHeight: 42, border: `1px solid ${tok.cardBorder}`,
              background: tok.surface, borderRadius: 6, padding: "0 14px",
              fontFamily: "inherit", fontSize: 14, color: tok.paper, outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {genres.slice(0, 8).map((g) => (
              <button
                key={g}
                onClick={() => setGenre(g)}
                style={{
                  padding: "6px 14px", borderRadius: 999, fontSize: 13, cursor: "pointer",
                  border: `1px solid ${genre === g ? tok.signal : tok.cardBorder}`,
                  background: genre === g ? tok.signal : "transparent",
                  color: genre === g ? "#F3E9D6" : tok.muted,
                  fontFamily: "inherit", fontWeight: 600,
                }}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Artist count */}
        <p style={{ fontSize: 13, color: tok.muted, marginBottom: 20 }}>
          {filtered.length} artist{filtered.length !== 1 ? "s" : ""}
        </p>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: tok.muted }}>
            <p style={{ fontSize: 18 }}>No artists found</p>
            <button onClick={() => { setQuery(""); setGenre("All"); }} style={{ marginTop: 16, background: "none", border: "none", color: tok.signal, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
              Clear filters
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
            {filtered.map((a) => (
              <ArtistCard key={a.id} artist={a} tok={tok} />
            ))}
          </div>
        )}

        {/* Are you an artist? CTA */}
        <div style={{ marginTop: 64, textAlign: "center", padding: "40px 24px", border: `1px solid ${tok.cardBorder}`, borderRadius: 8, background: tok.surface }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: tok.paper, margin: 0 }}>Are you an artist?</h2>
          <p style={{ fontSize: 15, color: tok.muted, marginTop: 8, maxWidth: 480, margin: "8px auto 0" }}>
            Join Naada to get booked for gigs, manage your calendar, and receive payments directly.
          </p>
          <button
            onClick={() => openAuth("Join as an artist")}
            style={{
              marginTop: 20, background: tok.signal, border: "none", borderRadius: 999,
              padding: "12px 28px", fontFamily: "inherit", fontSize: 15,
              fontWeight: 700, color: "#F3E9D6", cursor: "pointer",
            }}
          >
            Join as an artist
          </button>
        </div>
      </div>
    </PublicShell>
  );
}
