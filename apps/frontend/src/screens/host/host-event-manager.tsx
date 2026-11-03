import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ExternalLink, Pencil, ScanLine, Users } from "lucide-react";
import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { StatTile } from "@/components/naada/stat-tile";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Pill, statusLabel } from "@/components/ui/pill";
import { Poster } from "@/components/naada/poster";
import { useStore } from "@/store/app-store";
import { adaptEvent } from "@/lib/adapters";
import { money } from "@/lib/format";
import {
  get,
  getEvent,
  publishEvent,
  reviewGigApplication,
  type ApiEvent,
  type ApiVenue,
} from "@/lib/api";
import { ErrorNote, LoadingNote, formatDateTime, friendlyError } from "./host-shared";
import { GuestList, TierManager } from "./host-event-tickets";

/**
 * Event manager — the hub each event row opens into, and the home of the
 * publish control. Everything on this screen is server state: the status pill
 * reflects what the API returned, not an optimistic guess.
 */

interface ApiGigApplication {
  id: string;
  event: string;
  event_title?: string;
  artist: string;
  artist_name?: string;
  proposed_fee?: string | null;
  note?: string;
  status: "pending" | "shortlisted" | "rejected" | "accepted";
  reviewed_at?: string | null;
  created_at: string;
}

const OPEN_STATUSES = new Set(["pending", "shortlisted"]);

export function HostEventManagerScreen() {
  const { id = "" } = useParams();
  const { toast } = useStore();

  const [event, setEvent] = useState<ApiEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedOpen, setPublishedOpen] = useState(false);

  const load = useCallback(async (quiet = false) => {
    // A quiet reload (after editing a ticket) keeps the page on screen instead
    // of flashing back to "Loading…" and losing the scroll position.
    if (!quiet) setLoading(true);
    setLoadError(null);
    try {
      setEvent(await getEvent(id));
    } catch (err) {
      setLoadError(friendlyError(err, "Couldn't load this event."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async () => {
    if (!event) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const result = await publishEvent(event.id);
      // Trust the server's answer for the status shown in the UI.
      setEvent((prev) => (prev ? { ...prev, status: result.status } : prev));
      setPublishedOpen(true);
      toast("Event published", "success");
    } catch (err) {
      setPublishError(
        friendlyError(err, "Couldn't publish the event. It's still a draft — try again."),
      );
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <ConsoleShell nav={HOST_NAV} breadcrumb={["Events", "Loading"]}>
        <h1 className="t-h1">Event</h1>
        <LoadingNote label="Loading this event…" />
      </ConsoleShell>
    );
  }

  if (loadError || !event) {
    return (
      <ConsoleShell nav={HOST_NAV} breadcrumb={["Events", "Unavailable"]}>
        <h1 className="t-h1">Event</h1>
        <div className="mt-6 max-w-[60ch]">
          <ErrorNote
            message={loadError ?? "This event couldn't be loaded."}
            onRetry={() => void load()}
          />
          <Link to="/host/events" className="btn btn-secondary mt-4">
            Back to events
          </Link>
        </div>
      </ConsoleShell>
    );
  }

  const venue = typeof event.venue === "string" ? undefined : (event.venue as ApiVenue);
  const tiers = event.ticket_tiers ?? [];
  const onSale = tiers.filter((t) => t.is_active);
  // Sales and revenue count every tier, paused ones included — those tickets
  // were still sold. Capacity counts only what can still be bought.
  const sold = tiers.reduce((s, t) => s + t.sold_quantity, 0);
  const capacity = onSale.reduce((s, t) => s + t.total_quantity, 0) +
    tiers.filter((t) => !t.is_active).reduce((s, t) => s + t.sold_quantity, 0);
  const revenue = tiers.reduce((s, t) => s + Number(t.price) * t.sold_quantity, 0);
  const isDraft = event.status === "draft";
  const canPublish = onSale.length > 0;
  const shareLink = `${window.location.origin}/e/${event.id}`;

  return (
    <ConsoleShell nav={HOST_NAV} breadcrumb={["Events", event.title]}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="t-h1">{event.title}</h1>
            <Pill>{statusLabel(event.status)}</Pill>
          </div>
          <p className="t-body mt-2 text-muted">
            {venue?.name ?? "Venue not set"} ·{" "}
            <span className="t-mono">{formatDateTime(event.start_datetime)}</span>
          </p>
        </div>

        {isDraft ? (
          <div className="max-w-[38ch]">
            <Button variant="primary" onClick={() => void publish()} disabled={publishing || !canPublish}>
              {publishing ? "Publishing…" : "Publish event"}
            </Button>
            <p className="t-small mt-2 text-muted">
              {canPublish
                ? "Publishing makes the page shareable and opens ticket sales."
                : "Add a ticket tier first — publishing with nothing to sell would put a dead page in front of buyers."}
            </p>
          </div>
        ) : (
          <Link to={`/e/${event.id}`} className="btn btn-secondary">
            <ExternalLink className="size-4" aria-hidden="true" />
            View public page
          </Link>
        )}
      </div>

      {publishError && <ErrorNote className="mt-5" message={publishError} onRetry={() => void publish()} />}

      <div className="mt-6 flex flex-wrap gap-2">
        <Link to={`/host/events/${event.id}/edit`} className="btn btn-secondary">
          <Pencil className="size-4" aria-hidden="true" />
          Edit event
        </Link>
        <Link to={`/host/events/${event.id}/door`} className="btn btn-secondary">
          <ScanLine className="size-4" aria-hidden="true" />
          Open door scanner
        </Link>
        <Link to={`/host/events/${event.id}/gate`} className="btn btn-secondary">
          <Users className="size-4" aria-hidden="true" />
          Gate team
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={`${sold}/${capacity}`} label="Tickets sold" />
        <StatTile value={money(revenue)} label="Gross ticket revenue" />
        <StatTile value={String(onSale.length)} label="Tickets on sale" />
        <StatTile
          value={String(event.genres?.length ?? 0)}
          label="Genres tagged"
          tone={event.genres?.length ? undefined : "brass"}
        />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_240px]">
        <div className="min-w-0">
          <TierManager eventId={event.id} tiers={tiers} onChanged={() => load(true)} />

          {!isDraft && <GuestList eventId={event.id} eventName={event.title} />}

          {event.is_seeking_artists && <ApplicationQueue eventId={event.id} />}
        </div>

        <div>
          <h2 className="t-section">Poster</h2>
          <div className="mt-3">
            <Poster event={adaptEvent(event)} />
          </div>
        </div>
      </div>

      <Modal open={publishedOpen} onClose={() => setPublishedOpen(false)} title="Published">
        <p className="t-body text-paper/90">
          {event.title} is live. Share the link — it's the WhatsApp forward and the bio link.
        </p>
        <p className="t-mono mt-4 break-all text-[12px] text-muted">{shareLink}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareLink);
                toast("Link copied");
              } catch {
                toast("This browser wouldn't let Showzy copy — select the link above", "fault");
              }
            }}
          >
            Copy link
          </Button>
          <Link
            to={`/e/${event.id}`}
            className="btn btn-primary btn-sm"
            onClick={() => setPublishedOpen(false)}
          >
            View public page
          </Link>
        </div>
      </Modal>
    </ConsoleShell>
  );
}

// ─── Gig application review queue ─────────────────────────────────────────────

/**
 * Artists can already apply to any event flagged as seeking performers; this is
 * the other half of that flow. Accepting or rejecting writes straight through
 * to the API — the row moves only after the server confirms.
 */
function ApplicationQueue({ eventId }: { eventId: string }) {
  const { toast } = useStore();
  const [rows, setRows] = useState<ApiGigApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ApiGigApplication | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<{ results?: ApiGigApplication[] } | ApiGigApplication[]>(
        `/gig-applications/?event=${encodeURIComponent(eventId)}`,
      );
      const list = Array.isArray(data) ? data : (data.results ?? []);
      setRows(list.filter((a) => a.event === eventId));
    } catch (err) {
      setError(friendlyError(err, "Couldn't load the applications for this event."));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (app: ApiGigApplication, status: "accepted" | "rejected", why = "") => {
    setBusyId(app.id);
    setError(null);
    try {
      await reviewGigApplication(app.id, status, why);
      setRows((prev) => prev.map((r) => (r.id === app.id ? { ...r, status } : r)));
      toast(
        status === "accepted"
          ? `${app.artist_name ?? "Artist"} accepted`
          : `${app.artist_name ?? "Artist"} declined`,
        status === "accepted" ? "success" : "default",
      );
    } catch (err) {
      setError(
        friendlyError(
          err,
          `Couldn't record that decision. ${app.artist_name ?? "The artist"} hasn't been told anything.`,
        ),
      );
    } finally {
      setBusyId(null);
      setRejecting(null);
      setNote("");
    }
  };

  const open = rows.filter((r) => OPEN_STATUSES.has(r.status));
  const decided = rows.filter((r) => !OPEN_STATUSES.has(r.status));

  return (
    <section className="mt-10">
      <h2 className="t-section">
        Artist applications{open.length > 0 && ` (${open.length} to review)`}
      </h2>

      {loading && <LoadingNote label="Loading applications…" />}

      {error && <ErrorNote className="mt-3" message={error} onRetry={() => void load()} />}

      {!loading && !error && rows.length === 0 && (
        <p className="t-small mt-3 border border-dashed border-line px-4 py-6 text-muted">
          No applications yet. This event is on the artist gig board — applications land here as
          they come in.
        </p>
      )}

      {open.length > 0 && (
        <ul className="mt-3 space-y-2">
          {open.map((app) => (
            <li
              key={app.id}
              className="flex flex-wrap items-start gap-3 glass-soft rounded-xl p-3"
            >
              <div className="min-w-0 flex-1 basis-[220px]">
                <p className="text-[15px]">{app.artist_name ?? "Artist"}</p>
                {app.note && <p className="t-small mt-1 text-muted">{app.note}</p>}
                {app.proposed_fee && (
                  <p className="t-mono mt-1 text-[13px] text-brass">
                    {money(Number(app.proposed_fee))} proposed
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Pill>{statusLabel(app.status)}</Pill>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busyId === app.id}
                    onClick={() => {
                      setRejecting(app);
                      setNote("");
                    }}
                  >
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busyId === app.id}
                    onClick={() => void review(app, "accepted")}
                  >
                    {busyId === app.id ? "Saving…" : "Accept"}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {decided.length > 0 && (
        <ul className="mt-3 divide-y divide-[var(--glass-border-soft)] glass-soft overflow-hidden rounded-xl">
          {decided.map((app) => (
            <li key={app.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0 truncate text-[15px] text-muted">
                {app.artist_name ?? "Artist"}
              </span>
              <Pill>{statusLabel(app.status)}</Pill>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title={`Decline ${rejecting?.artist_name ?? "this artist"}?`}
      >
        <p className="t-body text-paper/90">
          Their application closes and the slot stays open for someone else. You can't undo this
          from the console — they'd have to apply again.
        </p>

        <label htmlFor="decline-note" className="t-micro mt-5 block">
          Reason (optional)
        </label>
        <textarea
          id="decline-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="Not the right fit for this night — we'd book you for a weekend slot."
          className="field mt-2 h-[72px] w-full resize-none text-[14px]"
        />
        <p className="t-small mt-1 text-muted">
          Shared with the artist. A line of context makes it far more likely they apply again.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            variant="destructive"
            disabled={busyId !== null}
            onClick={() => rejecting && void review(rejecting, "rejected", note.trim())}
          >
            {busyId ? "Saving…" : "Decline application"}
          </Button>
          <Button variant="ghost" onClick={() => setRejecting(null)}>
            Keep it open
          </Button>
        </div>
      </Modal>
    </section>
  );
}
