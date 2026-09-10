import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarX, CheckCircle2, Instagram, Youtube, Globe } from "lucide-react";
import { PublicShell } from "@/components/naada/public-shell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store/app-store";
import { useBriefComposer } from "@/components/naada/brief-composer";
import { followArtist } from "@/lib/api";
import { dateCompact, dateListing } from "@/lib/format";
import {
  apiMessage,
  availabilityDate,
  isMissingProfile,
  loadArtist,
  readAvailability,
  type ArtistDetail,
} from "./artist/artist-data";
import { NotFoundScreen } from "./not-found";

function instagramUrl(handle: string): string {
  if (/^https?:\/\//i.test(handle)) return handle;
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}

/**
 * Section 7.3. The fee range is deliberately absent here — it only appears in
 * the host's artist search.
 */
export function ArtistProfileScreen() {
  const { id = "" } = useParams();
  const { events, venueOf, role, currentUser, toast } = useStore();
  const { open: openBrief } = useBriefComposer();

  const [artist, setArtist] = useState<ArtistDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [error, setError] = useState("");
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const data = await loadArtist(id);
      setArtist(data);
      // Follow state comes from the server on every load, so it survives a
      // reload rather than living in component state.
      setFollowing(Boolean(data.is_following));
      setState("ready");
    } catch (err) {
      if (isMissingProfile(err)) {
        setState("missing");
        return;
      }
      setError(apiMessage(err, "This artist's page didn't load."));
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleFollow = async () => {
    if (!artist) return;
    if (!currentUser) {
      setFollowError("Sign in to follow artists and hear when they announce a date.");
      return;
    }
    const next = !following;
    setFollowBusy(true);
    setFollowError("");
    try {
      const res = await followArtist(artist.id, next);
      setFollowing(res.following);
      setArtist((a) =>
        a
          ? {
              ...a,
              follower_count: Math.max(0, (a.follower_count ?? 0) + (res.following ? 1 : -1)),
            }
          : a,
      );
      toast(res.following ? `Following ${artist.stage_name}` : `Unfollowed ${artist.stage_name}`);
    } catch (err) {
      setFollowError(apiMessage(err, "That didn't go through. Try again."));
    } finally {
      setFollowBusy(false);
    }
  };

  if (state === "missing") return <NotFoundScreen />;

  if (state !== "ready" || !artist) {
    return (
      <PublicShell>
        <div className="mx-auto w-full max-w-[1080px] px-4 py-16 md:px-8">
          {state === "loading" ? (
            <p className="t-body text-center text-muted">Loading this artist…</p>
          ) : (
            <div className="mx-auto max-w-[42ch] border border-fault bg-surface p-6 text-center">
              <p className="t-body">{error}</p>
              <Button variant="primary" className="mt-4" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          )}
        </div>
      </PublicShell>
    );
  }

  const name = artist.stage_name || artist.user?.full_name || "This artist";
  const photos = artist.photos ?? [];
  const cover = photos.find((p) => p.is_primary) ?? photos[0];
  const gallery = photos.filter((p) => p.id !== cover?.id);
  const availability = readAvailability(artist.availability);
  const genreNames = (artist.genres ?? []).map((g) => g.name).filter(Boolean);
  const links = [
    artist.instagram && { href: instagramUrl(artist.instagram), label: "Instagram", Icon: Instagram },
    artist.youtube && { href: artist.youtube, label: "YouTube", Icon: Youtube },
    artist.website && { href: artist.website, label: "Website", Icon: Globe },
  ].filter(Boolean) as Array<{ href: string; label: string; Icon: typeof Globe }>;

  // Appearances still come from the store's event list — there is no
  // per-artist events endpoint, so this is only as complete as what's loaded.
  const appearances = events
    .filter((e) => e.lineup.includes(artist.id) && e.status !== "draft")
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = appearances.filter((e) => e.status === "published");
  const past = appearances.filter((e) => e.status === "completed");

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[1080px] px-4 py-8 md:px-8 md:py-10">
        <header className="flex flex-col gap-5 border-b border-line pb-8 sm:flex-row sm:items-start">
          {cover ? (
            <img
              src={cover.image}
              alt={cover.caption || `${name} performing`}
              className="size-[104px] shrink-0 border border-line object-cover"
            />
          ) : (
            <div
              aria-hidden="true"
              className="grid size-[104px] shrink-0 place-items-center border border-line bg-surface-2 font-display text-[40px] font-extrabold text-signal"
            >
              {name.charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="t-display break-words">
              {name}
              {artist.is_verified && (
                <CheckCircle2
                  className="ml-2 inline size-5 align-middle text-live"
                  aria-label="Verified by Naada"
                />
              )}
            </h1>
            <p className="t-body mt-2 text-muted">
              {[genreNames.join(" · "), artist.city_name].filter(Boolean).join(" · ") ||
                "Genres and city not filled in yet"}
            </p>
            <p className="t-small mt-2 flex flex-wrap items-center gap-3 text-muted">
              {artist.total_gigs > 0 && (
                <span className="t-mono">
                  {artist.total_gigs} {artist.total_gigs === 1 ? "gig" : "gigs"} on Naada
                </span>
              )}
              {artist.follower_count > 0 && (
                <span className="t-mono">
                  {artist.follower_count}{" "}
                  {artist.follower_count === 1 ? "follower" : "followers"}
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2">
            {role === "host" ? (
              <Button variant="primary" onClick={() => openBrief(artist.id)}>
                Book this artist
              </Button>
            ) : (
              <Button onClick={() => void toggleFollow()} disabled={followBusy}>
                {followBusy ? "…" : following ? "Following" : "Follow"}
              </Button>
            )}
            {followError && (
              <p className="t-small max-w-[24ch] text-fault" role="alert">
                {followError}
              </p>
            )}
          </div>
        </header>

        {artist.bio ? (
          <p className="t-body mt-6 max-w-[62ch]">{artist.bio}</p>
        ) : (
          <p className="t-body mt-6 max-w-[62ch] text-muted">
            {name} hasn't written a bio yet.
          </p>
        )}

        {links.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-4">
            {links.map(({ href, label, Icon }) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="t-small flex min-h-11 items-center gap-2 text-muted transition-colors hover:text-signal"
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        )}

        <section className="mt-10">
          <h2 className="t-micro">Availability</h2>
          {availability.blackout_dates.length === 0 && !availability.notes ? (
            <p className="t-small mt-3 text-muted">
              No dates blocked — ask about any date.
            </p>
          ) : (
            <div className="mt-3 border border-line bg-surface p-4">
              {availability.notes && <p className="t-body">{availability.notes}</p>}
              {availability.blackout_dates.length > 0 && (
                <>
                  <p className="t-small mt-1 flex items-center gap-2 text-muted">
                    <CalendarX className="size-3.5 shrink-0" aria-hidden="true" />
                    Not available on these dates:
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {availability.blackout_dates.map((iso) => (
                      <li
                        key={iso}
                        className="t-mono border border-line px-2.5 py-1 text-[13px] text-muted"
                      >
                        {availabilityDate(iso)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </section>

        {gallery.length > 0 && (
          <section className="mt-10">
            <h2 className="t-micro">Photos</h2>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {gallery.map((photo) => (
                <li key={photo.id}>
                  <img
                    src={photo.image}
                    alt={photo.caption || `${name} performing`}
                    loading="lazy"
                    className="aspect-video w-full border border-line object-cover"
                  />
                  {photo.caption && (
                    <p className="t-small mt-1 text-muted">{photo.caption}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <section>
            <h2 className="t-micro">Upcoming</h2>
            {upcoming.length > 0 ? (
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {upcoming.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`/e/${e.id}`}
                      className="flex min-h-11 items-center justify-between gap-3 py-3 transition-colors hover:text-signal"
                    >
                      <span className="min-w-0">
                        <span className="t-mono block text-[11px] uppercase tracking-[0.08em] text-muted">
                          {dateListing(e.date)}
                        </span>
                        <span className="block truncate text-[15px]">{e.name}</span>
                      </span>
                      <span aria-hidden="true" className="text-muted">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-small mt-3 text-muted">No dates announced.</p>
            )}
          </section>

          <section>
            <h2 className="t-micro">Past gigs</h2>
            {past.length > 0 ? (
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {past.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-3">
                    <span className="t-mono shrink-0 text-[13px] text-muted">
                      {dateCompact(e.date)}
                    </span>
                    <span className="min-w-0 truncate text-[15px]">{venueOf(e)?.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-small mt-3 text-muted">Nothing on record yet.</p>
            )}
          </section>
        </div>
      </div>
    </PublicShell>
  );
}
