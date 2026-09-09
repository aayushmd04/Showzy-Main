import { Link } from "react-router-dom";
import { CalendarPlus, ChevronRight, Music2, Users } from "lucide-react";
import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store/app-store";
import { TODAY, dateListing, money } from "@/lib/format";

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function tableDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2,"0")} ${MONTHS[m - 1]}`;
}

function statusColor(status: string): string {
  if (status === "published" || status === "sales_closed" || status === "live") return "#1EA874";
  if (status === "completed") return "rgba(0,0,0,.35)";
  if (status === "cancelled") return "#CF1322";
  return "#E8B33C"; // draft
}

/** Host dashboard — overview on login. */
export function HostHomeLetterpressScreen() {
  const { events, users, venueOf, soldOf, capacityOf, artists, emptyLists } = useStore();

  const upcoming = [...events]
    .filter((e) => (e.status === "published" || e.status === "live") && e.date >= TODAY)
    .sort((a, b) => a.date.localeCompare(b.date));

  const nextUp = upcoming[0] ?? null;
  const nextVenue = nextUp ? venueOf(nextUp) : null;

  const allRows = emptyLists
    ? []
    : [...events].sort((a, b) => {
        const done = (s: string) => (s === "completed" || s === "cancelled" ? 1 : 0);
        return done(a.status) - done(b.status) || a.date.localeCompare(b.date);
      });

  const totalRevenue = events
    .filter((e) => e.status === "completed" || e.status === "published")
    .reduce((sum, e) => sum + soldOf(e) * (e.tiers[0]?.price ?? 0), 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <ConsoleShell nav={HOST_NAV} breadcrumb={["Overview"]}>
      {/* ── Greeting ──────────────────────────────────────────────────── */}
      <div
        style={{
          borderRadius: 14,
          padding: "28px 32px",
          marginBottom: 28,
          background: "linear-gradient(135deg, #FBF3E3 0%, #F6E8D0 60%, #EDD5B5 100%)",
          border: "1px solid rgba(212,56,13,.12)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 20,
        }}
      >
        <div>
          <p
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 10,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "rgba(20,18,16,.4)",
              marginBottom: 4,
            }}
          >
            {greeting}
          </p>
          <h1
            style={{
              fontVariationSettings: "'wdth' 80,'wght' 900",
              fontSize: "clamp(28px,3.5vw,42px)",
              letterSpacing: "-.04em",
              textTransform: "uppercase",
              color: "#141210",
              lineHeight: 0.95,
            }}
          >
            {users.host.name.split(" ")[0]}
          </h1>
          <p
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 10,
              letterSpacing: ".1em",
              color: "rgba(20,18,16,.4)",
              textTransform: "uppercase",
              marginTop: 6,
            }}
          >
            {users.host.org}
          </p>
        </div>

        {/* Quick stats */}
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {[
            { label: "Upcoming", value: upcoming.length },
            { label: "Artists booked", value: new Set(events.flatMap((e) => e.lineup)).size },
            { label: "Revenue (est.)", value: money(totalRevenue) },
          ].map(({ label, value }) => (
            <div key={label} style={{ textAlign: "right" }}>
              <div
                style={{
                  fontVariationSettings: "'wdth' 70,'wght' 900",
                  fontSize: 26,
                  letterSpacing: "-.03em",
                  color: "#141210",
                  lineHeight: 1,
                }}
              >
                {value}
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 9,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: "rgba(20,18,16,.4)",
                  marginTop: 2,
                }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>

        {/* ── Next Up ───────────────────────────────────────────────── */}
        <div className="border border-line bg-surface" style={{ borderRadius: 12, overflow: "hidden" }}>
          <div
            className="border-b border-line"
            style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}
          >
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 9,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                color: "#1EA874",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontWeight: 700,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#1EA874",
                  boxShadow: "0 0 6px rgba(30,168,116,.6)",
                  display: "inline-block",
                  animation: "naada-live-pulse 1.8s ease-in-out infinite",
                }}
              />
              Next Up
            </span>
            {nextUp && (
              <span
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 9,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "rgba(0,0,0,.35)",
                }}
              >
                {dateListing(nextUp.date)} · {nextUp.time}
              </span>
            )}
          </div>

          {nextUp ? (
            <div style={{ padding: "16px" }}>
              <div
                style={{
                  fontVariationSettings: "'wdth' 80,'wght' 900",
                  fontSize: 22,
                  letterSpacing: "-.03em",
                  textTransform: "uppercase",
                  color: "#141210",
                  lineHeight: 1,
                  marginBottom: 6,
                }}
              >
                {nextUp.name}
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 10,
                  color: "rgba(0,0,0,.4)",
                  letterSpacing: ".05em",
                  marginBottom: 16,
                }}
              >
                {nextVenue?.name} · {nextVenue?.area}
              </div>

              {/* Sold bar */}
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 10,
                    letterSpacing: ".06em",
                  }}
                >
                  <span style={{ color: "rgba(0,0,0,.5)" }}>Sold</span>
                  <span style={{ color: "#141210", fontWeight: 700 }}>
                    {soldOf(nextUp)}/{capacityOf(nextUp)}
                  </span>
                </div>
                <div
                  style={{
                    height: 3,
                    background: "rgba(0,0,0,.08)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, (soldOf(nextUp) / capacityOf(nextUp)) * 100)}%`,
                      background: "linear-gradient(90deg, #D4380D, #E8763A)",
                      borderRadius: 2,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <Link
                  to={`/host/events/${nextUp.id}`}
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: 12, flex: 1, justifyContent: "center" }}
                >
                  Manage event
                </Link>
                <Link
                  to={`/e/${nextUp.id}`}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: 12 }}
                >
                  Public page
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ padding: "24px 16px", textAlign: "center" }}>
              <p className="t-small text-muted">No upcoming events</p>
              <Link to="/host/events" className="btn btn-primary btn-sm mt-3">
                Create your first
              </Link>
            </div>
          )}
        </div>

        {/* ── Quick Actions ─────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Publish event */}
          <Link
            to="/host/events"
            style={{
              flex: 1,
              borderRadius: 12,
              padding: "20px",
              background: "linear-gradient(135deg,#D4380D,#C42E08)",
              display: "flex",
              alignItems: "center",
              gap: 14,
              textDecoration: "none",
              boxShadow: "0 4px 20px rgba(212,56,13,.3)",
              color: "#fff",
            }}
          >
            <CalendarPlus size={22} strokeWidth={1.8} style={{ flexShrink: 0, opacity: 0.9 }} />
            <div>
              <div
                style={{
                  fontVariationSettings: "'wdth' 90,'wght' 700",
                  fontSize: 15,
                  letterSpacing: "-.01em",
                  marginBottom: 2,
                }}
              >
                Publish an Event
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, fontFamily: "'JetBrains Mono',monospace", letterSpacing: ".04em" }}>
                Create · set tiers · go live
              </div>
            </div>
            <ChevronRight size={16} style={{ marginLeft: "auto", opacity: 0.6 }} />
          </Link>

          {/* Discover Artists */}
          <Link
            to="/host/artists"
            className="border border-line bg-surface"
            style={{
              flex: 1,
              borderRadius: 12,
              padding: "20px",
              display: "flex",
              alignItems: "center",
              gap: 14,
              textDecoration: "none",
              color: "#141210",
              transition: "background .15s",
            }}
          >
            <Users size={22} strokeWidth={1.5} style={{ flexShrink: 0, color: "#D4380D" }} />
            <div>
              <div
                style={{
                  fontVariationSettings: "'wdth' 90,'wght' 700",
                  fontSize: 15,
                  letterSpacing: "-.01em",
                  color: "#141210",
                  marginBottom: 2,
                }}
              >
                Discover Artists
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(0,0,0,.4)",
                  fontFamily: "'JetBrains Mono',monospace",
                  letterSpacing: ".04em",
                }}
              >
                {artists.length} artists · browse by genre
              </div>
            </div>
            <ChevronRight size={16} style={{ marginLeft: "auto", color: "rgba(0,0,0,.3)" }} />
          </Link>

          {/* Bookings shortcut */}
          <Link
            to="/host/bookings"
            className="border border-line bg-surface"
            style={{
              borderRadius: 12,
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              gap: 14,
              textDecoration: "none",
              color: "#141210",
            }}
          >
            <Music2 size={18} strokeWidth={1.5} style={{ flexShrink: 0, color: "rgba(0,0,0,.35)" }} />
            <span
              style={{
                fontVariationSettings: "'wdth' 90,'wght' 600",
                fontSize: 14,
                color: "rgba(0,0,0,.6)",
              }}
            >
              View Bookings
            </span>
            <ChevronRight size={14} style={{ marginLeft: "auto", color: "rgba(0,0,0,.25)" }} />
          </Link>
        </div>
      </div>

      {/* ── Your Events ───────────────────────────────────────────────── */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <h2
            style={{
              fontVariationSettings: "'wdth' 90,'wght' 800",
              fontSize: 13,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "#141210",
            }}
          >
            Your Events
          </h2>
          <Link
            to="/host/events"
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 10,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: "#D4380D",
              textDecoration: "none",
            }}
          >
            View all →
          </Link>
        </div>

        {allRows.length === 0 ? (
          <div
            className="border border-line"
            style={{ borderRadius: 12, padding: "32px 16px", textAlign: "center" }}
          >
            <p className="t-small text-muted">No events yet</p>
            <Button variant="primary" className="mt-3" onClick={() => {}}>
              Create your first event
            </Button>
          </div>
        ) : (
          <div className="border border-line" style={{ borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr className="border-b border-line" style={{ background: "rgba(0,0,0,.02)" }}>
                  {["Date", "Event", "Venue", "Sold", "Status"].map((h) => (
                    <th
                      key={h}
                      style={{
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 9,
                        letterSpacing: ".14em",
                        textTransform: "uppercase",
                        color: "rgba(0,0,0,.4)",
                        fontWeight: 500,
                        textAlign: "left",
                        padding: "10px 16px",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRows.map((ev, i) => {
                  const venue = venueOf(ev);
                  const sold = soldOf(ev);
                  const cap = capacityOf(ev);
                  const isDone = ev.status === "completed" || ev.status === "cancelled";
                  return (
                    <tr
                      key={ev.id}
                      className={i < allRows.length - 1 ? "border-b border-line" : ""}
                      style={{ opacity: isDone ? 0.55 : 1 }}
                    >
                      <td
                        style={{
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: 11,
                          color: "rgba(0,0,0,.5)",
                          padding: "12px 16px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tableDate(ev.date)}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <Link
                          to={`/host/events/${ev.id}`}
                          style={{
                            fontVariationSettings: "'wdth' 90,'wght' 600",
                            fontSize: 14,
                            color: "#141210",
                            textDecoration: "none",
                          }}
                        >
                          {ev.name}
                        </Link>
                      </td>
                      <td
                        style={{
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: 11,
                          color: "rgba(0,0,0,.4)",
                          padding: "12px 16px",
                        }}
                      >
                        {venue?.name ?? "—"}
                      </td>
                      <td
                        style={{
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: 11,
                          color: "#141210",
                          padding: "12px 16px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {sold}/{cap}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono',monospace",
                            fontSize: 9,
                            letterSpacing: ".1em",
                            textTransform: "uppercase",
                            color: statusColor(ev.status),
                            fontWeight: 600,
                          }}
                        >
                          {ev.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
