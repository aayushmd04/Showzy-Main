import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarX, CheckCircle2, Globe, Instagram, Lock, Users, Youtube } from "lucide-react";
import { PublicShell } from "@/components/naada/public-shell";
import { Avatar } from "@/components/naada/avatar";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { useBriefComposer } from "@/components/naada/brief-composer";
import { followArtist } from "@/lib/api";
import { mediaUrl } from "@/lib/adapters";
import { usePageMeta } from "@/lib/use-meta";
import { dateCompact, dateListing, money } from "@/lib/format";
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

/** Only ever link to a web address someone typed into a profile. */
function webUrl(raw: string): string | null {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Section 7.3 — an artist's public page.
 *
 * What a visitor sees depends on who they are. Everyone gets the artist: photos,
 * bio, links, shows coming up. A fee range and a calendar are business
 * information for the people hiring, so they are shown to hosts (and to the
 * artist themselves) and to no one else: not the audience, not a signed-out
 * visitor, and not another artist. Gig history is for people in the scene.
 * The server withholds those fields from everyone else as well, so hiding them
 * here is a courtesy, not the protection.
 */
export function ArtistProfileScreen() {
  const { id = "" } = useParams();
  const { events, venueOf, role, currentUser, toast } = useStore();
  const { open: openBrief } = useBriefComposer();
  const { open: openAuth } = useAuthSheet();

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
    // Reloading when the viewer changes (signing in as a host) brings in the
    // fee range and calendar the server only sends to them.
  }, [id, currentUser?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  usePageMeta({
    title: artist?.stage_name,
    description: artist
      ? [
          [artist.genres.map((g) => g.name).join(", "), artist.city_name].filter(Boolean).join(" · "),
          artist.bio,
        ]
          .filter(Boolean)
          .join(" — ")
          .slice(0, 300)
      : undefined,
    image: mediaUrl(artist?.primary_photo ?? artist?.profile_image),
  });

  /** Optimistic: the button and the follower count move on the tap, and go back if the server refuses. */
  const sendFollow = useCallback(
    async (target: ArtistDetail, next: boolean) => {
      const wasFollowing = !next;
      setFollowBusy(true);
      setFollowError("");
      setFollowing(next);
      setArtist((a) => (a ? { ...a, follower_count: Math.max(0, (a.follower_count ?? 0) + (next ? 1 : -1)) } : a));
      try {
        const res = await followArtist(target.id, next);
        setFollowing(res.following);
        toast(res.following ? `Following ${target.stage_name}` : `Unfollowed ${target.stage_name}`);
      } catch (err) {
        setFollowing(wasFollowing);
        setArtist((a) => (a ? { ...a, follower_count: Math.max(0, (a.follower_count ?? 0) + (next ? -1 : 1)) } : a));
        setFollowError(apiMessage(err, "That didn't go through. Try again."));
      } finally {
        setFollowBusy(false);
      }
    },
    [toast],
  );

  const toggleFollow = () => {
    if (!artist || followBusy) return;
    const next = !following;
    if (!currentUser) {
      openAuth(`Sign in to follow ${artist.stage_name || "this artist"}`, {
        onDone: (outcome) => {
          if (outcome !== "authed") return;
          void sendFollow(artist, next);
        },
      });
      return;
    }
    void sendFollow(artist, next);
  };

  if (state === "missing") return <NotFoundScreen />;

  if (state !== "ready" || !artist) {
    return (
      <PublicShell>
        <div className="mx-auto w-full max-w-[1080px] px-[var(--page-pad)] py-10">
          {state === "loading" ? (
            <div className="animate-pulse" role="status" aria-label="Loading this artist">
              <div className="flex gap-5">
                <div className="size-32 rounded-2xl bg-paper/10" />
                <div className="flex-1 space-y-3 pt-2">
                  <div className="h-8 w-1/2 rounded bg-paper/10" />
                  <div className="h-4 w-1/3 rounded bg-paper/10" />
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-soft mx-auto max-w-[42ch] rounded-xl p-6 text-center">
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
  const isOwn = Boolean(currentUser && artist.user?.id === currentUser.id);
  const isHost = role === "host" || role === "admin";
  const inScene = isHost || role === "artist" || isOwn;
  // Business details: shown when the viewer is allowed AND the server sent them.
  const showBusiness = (isHost || isOwn) && artist.availability !== undefined;
  const showFee = (isHost || isOwn) && Boolean(artist.fee_range_min || artist.fee_range_max);
  const photos = artist.photos ?? [];
  const cover = photos.find((p) => p.is_primary) ?? photos[0];
  const gallery = photos.filter((p) => p.id !== cover?.id);
  const availability = readAvailability(artist.availability);
  const genreNames = (artist.genres ?? []).map((g) => g.name).filter(Boolean);
  const links = [
    artist.instagram && { href: instagramUrl(artist.instagram), label: "Instagram", Icon: Instagram },
    artist.youtube && webUrl(artist.youtube) && { href: webUrl(artist.youtube)!, label: "YouTube", Icon: Youtube },
    artist.website && webUrl(artist.website) && { href: webUrl(artist.website)!, label: "Website", Icon: Globe },
  ].filter(Boolean) as Array<{ href: string; label: string; Icon: typeof Globe }>;

  // Appearances come from the store's event list — there is no per-artist
  // events endpoint, so this is only as complete as what's loaded.
  const appearances = events
    .filter((e) => e.lineup.includes(artist.id) && e.status !== "draft")
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = appearances.filter((e) => e.status === "published");
  const past = appearances.filter((e) => e.status === "completed");
  const gigs = artist.total_gigs ?? 0;

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[1080px] px-[var(--page-pad)] py-8 md:py-10">
        <header className="glass-soft flex flex-col gap-6 rounded-2xl p-5 sm:flex-row sm:items-center md:p-7">
          <div className="size-[132px] shrink-0 overflow-hidden rounded-2xl border border-line sm:size-[156px]">
            <Avatar src={mediaUrl(cover?.image ?? artist.primary_photo)} name={name} rounded="rounded-none" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-megrim break-words text-[clamp(30px,5vw,52px)] font-normal uppercase leading-none">
              {name}
              {artist.is_verified && (
                <CheckCircle2 className="ml-2 inline size-5 align-middle text-live" aria-label="Verified by Showzy" />
              )}
            </h1>
            {genreNames.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {genreNames.map((g) => (
                  <li key={g}>
                    <Pill tone="paper">{g}</Pill>
                  </li>
                ))}
              </ul>
            )}
            <p className="t-small mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
              {artist.city_name && <span>{artist.city_name}</span>}
              {artist.follower_count > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-3.5" aria-hidden="true" />
                  <span className="tabular-nums">{artist.follower_count}</span>{" "}
                  {artist.follower_count === 1 ? "follower" : "followers"}
                </span>
              )}
              {inScene && gigs > 0 && (
                <span className="tabular-nums">
                  {gigs} {gigs === 1 ? "gig" : "gigs"} on Showzy
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2">
            {role === "host" ? (
              <Button variant="primary" onClick={() => openBrief(artist.id)}>
                Book this artist
              </Button>
            ) : isOwn ? (
              <Link to="/artist/profile" className="btn btn-secondary">
                Edit your profile
              </Link>
            ) : (
              <Button onClick={toggleFollow} disabled={followBusy} aria-pressed={following} aria-label={following ? `Unfollow ${name}` : `Follow ${name}`}>
                {following ? "Following" : "Follow"}
              </Button>
            )}
            {followError && (
              <p className="t-small max-w-[24ch] text-fault" role="alert">
                {followError}
              </p>
            )}
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-10">
            <section aria-label="About">
              <h2 className="t-micro">About</h2>
              {artist.bio ? (
                <p className="t-body mt-3 max-w-[62ch]">{artist.bio}</p>
              ) : (
                <p className="t-body mt-3 max-w-[62ch] text-muted">{name} hasn't written a bio yet.</p>
              )}
              {links.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-4">
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
            </section>

            {gallery.length > 0 && (
              <section aria-label="Photos">
                <h2 className="t-micro">Photos</h2>
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {gallery.map((photo) => (
                    <li key={photo.id} className="overflow-hidden rounded-xl">
                      <PhotoTile src={mediaUrl(photo.image) ?? photo.image} alt={photo.caption || `${name} performing`} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-label="Upcoming shows">
              <h2 className="t-micro">Upcoming shows</h2>
              {upcoming.length > 0 ? (
                <ul className="glass-soft mt-3 divide-y divide-[var(--glass-border-soft)] overflow-hidden rounded-xl">
                  {upcoming.map((e) => (
                    <li key={e.id}>
                      <Link
                        to={`/e/${e.id}`}
                        className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-paper/5"
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
                <p className="t-small mt-3 text-muted">No shows announced yet.</p>
              )}
            </section>

            {inScene && (
              <section aria-label="Past gigs">
                <h2 className="t-micro">Past gigs</h2>
                {past.length > 0 ? (
                  <ul className="glass-soft mt-3 divide-y divide-[var(--glass-border-soft)] overflow-hidden rounded-xl">
                    {past.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                        <span className="t-mono shrink-0 text-[13px] text-muted">{dateCompact(e.date)}</span>
                        <span className="min-w-0 truncate text-[15px]">{venueOf(e)?.name}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="t-small mt-3 text-muted">Nothing on record yet.</p>
                )}
              </section>
            )}
          </div>

          {(showFee || showBusiness) && (
            <aside aria-label="For hosts" className="space-y-4 lg:pt-7">
              <p className="t-small flex items-center gap-1.5 text-muted">
                <Lock className="size-3.5" aria-hidden="true" />
                {isOwn ? "Only hosts see this" : "Visible to hosts only"}
              </p>

              {showFee && (
                <section className="glass-soft rounded-xl p-4">
                  <h2 className="t-micro">Booking fee</h2>
                  <p className="tabular-nums mt-2 text-[22px] font-semibold">
                    {money(Number(artist.fee_range_min ?? 0))}–{money(Number(artist.fee_range_max ?? 0))}
                  </p>
                  <p className="t-small mt-1 text-muted">A range to start from. The offer is yours to make.</p>
                </section>
              )}

              {showBusiness && (
                <section className="glass-soft rounded-xl p-4">
                  <h2 className="t-micro">Availability</h2>
                  {availability.blackout_dates.length === 0 && !availability.notes ? (
                    <p className="t-small mt-2 text-muted">No dates blocked — ask about any date.</p>
                  ) : (
                    <div className="mt-2">
                      {availability.notes && <p className="t-body">{availability.notes}</p>}
                      {availability.blackout_dates.length > 0 && (
                        <>
                          <p className="t-small mt-2 flex items-center gap-2 text-muted">
                            <CalendarX className="size-3.5 shrink-0" aria-hidden="true" />
                            Not available on:
                          </p>
                          <ul className="mt-2 flex flex-wrap gap-2">
                            {availability.blackout_dates.map((iso) => (
                              <li key={iso} className="t-mono rounded-md border border-line px-2.5 py-1 text-[13px] text-muted">
                                {availabilityDate(iso)}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </section>
              )}
            </aside>
          )}
        </div>
      </div>
    </PublicShell>
  );
}

/** A gallery photo that says so when its file can't be fetched, rather than showing a broken-image icon. */
function PhotoTile({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) {
    return (
      <span role="img" aria-label="Photo couldn't be loaded" className="grid aspect-video w-full place-items-center bg-surface-2 text-[12px] text-muted">
        Couldn't load photo
      </span>
    );
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className="aspect-video w-full object-cover" />;
}
