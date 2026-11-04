import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Landmark, MapPin, Search } from "lucide-react";
import { PublicShell } from "@/components/naada/public-shell";
import { Avatar } from "@/components/naada/avatar";
import { IconTile } from "@/components/naada/icon-tile";
import { useStore } from "@/store/app-store";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { usePageMeta } from "@/lib/use-meta";
import { today } from "@/lib/format";

export function VenuesScreen() {
  usePageMeta({ title: "Venues", description: "Intimate spaces hosting live art across Mysuru and Bengaluru." });
  const { venues, events } = useStore();
  const { open: openAuth } = useAuthSheet();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return venues.filter((v) => !q || v.name.toLowerCase().includes(q) || v.area?.toLowerCase().includes(q));
  }, [venues, query]);

  return (
    <PublicShell>
      <div className="px-[var(--page-pad)] pb-20 pt-8 md:pt-10">
        <h1 className="font-megrim text-[clamp(30px,4vw,44px)] font-normal uppercase leading-tight">Venues</h1>
        <p className="mt-1 max-w-[56ch] text-[15px] text-muted">
          Intimate spaces hosting live art across Mysuru and Bengaluru. Open one to see what's on, what it has hosted and what people said.
        </p>

        <label className="relative mt-6 block max-w-[400px]">
          <span className="sr-only">Search venues or areas</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search venues or areas"
            className="h-11 w-full rounded-md border border-[var(--field-border)] bg-[var(--field-bg)] pl-10 pr-3 text-[15px] text-paper placeholder:text-muted focus:border-signal focus:outline-none"
          />
        </label>

        <p className="mt-5 text-[13px] text-muted" aria-live="polite">
          {filtered.length} venue{filtered.length !== 1 ? "s" : ""}
        </p>

        {filtered.length === 0 ? (
          <div className="glass-soft mt-4 rounded-xl border-dashed p-10 text-center">
            <p className="text-[17px] font-semibold">No venues found</p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((v) => {
              const upcoming = events.filter((e) => e.venueId === v.id && e.status === "published" && e.date >= today());
              const card = (
                <>
                  <div className="relative aspect-[16/10] overflow-hidden bg-surface-2">
                    <Avatar src={v.photo} name={v.name} rounded="rounded-none" className="transition-transform duration-500 group-hover:scale-[1.03]" />
                  </div>
                  <div className="p-4">
                    <h3 className="line-clamp-1 text-[17px] font-semibold">{v.name}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-[14px] text-muted">
                      <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="line-clamp-1">
                        {[v.area, v.capacity > 0 ? `${v.capacity} seats` : "Intimate room"].filter(Boolean).join(" · ")}
                      </span>
                    </p>
                    <p className="mt-3 border-t border-[var(--glass-border-soft)] pt-3 text-[13px] text-muted">
                      {upcoming.length > 0
                        ? `${upcoming.length} ${upcoming.length === 1 ? "night" : "nights"} coming up`
                        : "Nothing announced yet"}
                    </p>
                  </div>
                </>
              );
              const cls = "glass-soft group block overflow-hidden rounded-xl text-paper no-underline transition-transform duration-300 hover:-translate-y-1";
              return (
                <li key={v.id}>
                  {v.slug ? (
                    <Link to={`/v/${v.slug}`} className={cls}>
                      {card}
                    </Link>
                  ) : (
                    <div className={cls}>{card}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <section className="glass-soft mt-14 flex flex-col items-center gap-4 rounded-2xl px-6 py-10 text-center">
          <IconTile icon={Landmark} />
          <h2 className="font-megrim text-[clamp(22px,3vw,30px)] font-normal uppercase leading-tight">Host events at your space?</h2>
          <p className="max-w-[48ch] text-[15px] text-muted">
            List your venue on Showzy and connect with artists looking for intimate performance spaces.
          </p>
          <button
            type="button"
            onClick={() => openAuth("Host your event on Showzy", { preferRole: "host" })}
            className="min-h-11 rounded-full bg-signal px-7 text-[15px] font-bold text-white transition-opacity hover:opacity-90"
          >
            Start hosting
          </button>
        </section>
      </div>
    </PublicShell>
  );
}
