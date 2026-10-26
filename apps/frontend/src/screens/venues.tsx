import { useState } from "react";
import { PublicShell } from "@/components/naada/public-shell";
import { useStore } from "@/store/app-store";
import { usePageMeta } from "@/lib/use-meta";

const CARD_TOKENS = {
  dark:  { paper: "#ECECEC", muted: "rgba(255,255,255,.62)", signal: "#C4472E", surface: "#1E1E1E", cardBorder: "rgba(255,255,255,.16)" },
  light: { paper: "#241C15", muted: "rgba(36,28,21,.62)",    signal: "#8C2B3E", surface: "#FFFCF4", cardBorder: "rgba(36,28,21,.16)" },
};

export function VenuesScreen() {
  usePageMeta({ title: "Venues", description: "Intimate spaces hosting grassroots live music across Mysuru and Bengaluru." });
  const { venues, theme, events } = useStore();
  const [query, setQuery] = useState("");
  const isDark = theme === "dark";
  const tok = isDark ? CARD_TOKENS.dark : CARD_TOKENS.light;

  const filtered = venues.filter((v) =>
    !query || v.name.toLowerCase().includes(query.toLowerCase()) || v.area?.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <PublicShell>
      <div style={{ padding: "40px var(--page-pad) 80px" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: tok.paper, margin: 0 }}>Venues</h1>
          <p style={{ fontSize: 15, color: tok.muted, marginTop: 8 }}>
            Intimate spaces hosting grassroots live music across Mysuru and Bengaluru.
          </p>
        </div>

        {/* Search */}
        <div style={{ marginBottom: 28 }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search venues or areas…"
            style={{
              width: "100%", maxWidth: 400, minHeight: 42,
              border: `1px solid ${tok.cardBorder}`,
              background: tok.surface, borderRadius: 6, padding: "0 14px",
              fontFamily: "inherit", fontSize: 14, color: tok.paper, outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <p style={{ fontSize: 13, color: tok.muted, marginBottom: 20 }}>
          {filtered.length} venue{filtered.length !== 1 ? "s" : ""}
        </p>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: tok.muted }}>
            <p style={{ fontSize: 18 }}>No venues found</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {filtered.map((v) => {
              const venueEvents = events.filter((e) => e.venueId === v.id && e.status === "published");
              return (
                <div
                  key={v.id}
                  style={{
                    border: `1px solid ${tok.cardBorder}`, background: tok.surface,
                    borderRadius: 4, overflow: "hidden",
                  }}
                >
                  {/* A room is worth showing. The mark stands in when there's no photo yet. */}
                  {v.photo ? (
                    <div style={{ aspectRatio: "16 / 9", overflow: "hidden", background: `${tok.signal}12` }}>
                      <img
                        src={v.photo}
                        alt={`Inside ${v.name}`}
                        loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </div>
                  ) : (
                    <div style={{
                      aspectRatio: "16 / 9",
                      background: `${tok.signal}12`, borderBottom: `1px solid ${tok.cardBorder}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 26, color: tok.signal,
                    }}>
                      ♪
                    </div>
                  )}

                  <div style={{ padding: "20px" }}>
                  <p style={{ fontSize: 17, fontWeight: 700, color: tok.paper, margin: 0 }}>{v.name}</p>
                  <p style={{ fontSize: 13, color: tok.muted, margin: "4px 0 0" }}>
                    {v.area}{v.area ? " · " : ""}{v.capacity > 0 ? `Capacity ${v.capacity}` : "Intimate venue"}
                  </p>

                  {venueEvents.length > 0 && (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${tok.cardBorder}` }}>
                      <p style={{ fontSize: 11, color: tok.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>
                        Upcoming
                      </p>
                      {venueEvents.slice(0, 2).map((e) => (
                        <p key={e.id} style={{ fontSize: 13, color: tok.muted, margin: "4px 0" }}>
                          · {e.name}
                        </p>
                      ))}
                    </div>
                  )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Host CTA */}
        <div style={{ marginTop: 64, textAlign: "center", padding: "40px 24px", border: `1px solid ${tok.cardBorder}`, borderRadius: 8, background: tok.surface }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: tok.paper, margin: 0 }}>Host events at your space?</h2>
          <p style={{ fontSize: 15, color: tok.muted, marginTop: 8, maxWidth: 480, margin: "8px auto 0" }}>
            List your venue on Showzy and connect with artists looking for intimate performance spaces.
          </p>
          <a
            href="mailto:hello@naada.live"
            style={{
              display: "inline-block", marginTop: 20, background: tok.signal, borderRadius: 999,
              padding: "12px 28px", fontSize: 15, fontWeight: 700, color: "#ECECEC", textDecoration: "none",
            }}
          >
            Get in touch
          </a>
        </div>
      </div>
    </PublicShell>
  );
}
