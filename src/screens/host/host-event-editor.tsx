import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Pill, statusLabel } from "@/components/ui/pill";
import { Poster } from "@/components/naada/poster";
import { QrBlock } from "@/components/naada/qr-block";
import { useStore } from "@/store/app-store";
import { useBriefComposer } from "@/components/naada/brief-composer";
import { money } from "@/lib/format";
import { NotFoundScreen } from "../not-found";

/** Section 7.10 — Event editor. Autosaves on every change. */
export function HostEventEditorScreen() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { eventById, updateEvent, addTier, removeTier, venues, bookings, artistById, toast, artists } =
    useStore();
  const { open: openBrief } = useBriefComposer();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [newTier, setNewTier] = useState({ name: "", price: "", capacity: "" });

  const event = eventById(id);
  if (!event) return <NotFoundScreen />;

  const eventBookings = bookings.filter((b) => b.eventId === event.id);
  const unbooked = artists.filter((a) => !event.lineup.includes(a.id));

  const patch = (changes: Parameters<typeof updateEvent>[1]) => {
    updateEvent(event.id, changes);
    setSavedAt(
      new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    );
  };

  const publish = () => {
    patch({ status: "published" });
    setPublishOpen(true);
    toast("Published", "success");
  };

  const shareLink = `${window.location.origin}/e/${event.id}`;

  return (
    <ConsoleShell
      nav={HOST_NAV}
      breadcrumb={["Events", event.name]}
      actions={
        <span className="t-mono hidden text-[12px] text-muted sm:block" aria-live="polite">
          {savedAt ? `Draft saved ${savedAt}` : "All changes saved"}
        </span>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t-h1">Edit event</h1>
        <Pill>{statusLabel(event.status)}</Pill>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* Left — the event itself */}
        <div className="min-w-0 space-y-5">
          <Field label="Event name" htmlFor="ev-name">
            <Input
              id="ev-name"
              value={event.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" htmlFor="ev-date">
              <Input
                id="ev-date"
                type="date"
                value={event.date}
                onChange={(e) => patch({ date: e.target.value })}
                className="t-mono"
              />
            </Field>
            <Field label="Time" htmlFor="ev-time">
              <Input
                id="ev-time"
                type="time"
                value={event.time}
                onChange={(e) => patch({ time: e.target.value })}
                className="t-mono"
              />
            </Field>
          </div>

          <Field label="Venue" htmlFor="ev-venue">
            <Select
              id="ev-venue"
              value={event.venueId}
              onChange={(v) => patch({ venueId: v })}
              options={venues.map((v) => ({ value: v.id, label: `${v.name} · ${v.area}` }))}
            />
          </Field>

          <Field
            label="Description"
            htmlFor="ev-desc"
            hint="Shown on the public page. Say what the night actually is."
          >
            <Textarea
              id="ev-desc"
              value={event.description}
              onChange={(e) => patch({ description: e.target.value })}
              rows={4}
            />
          </Field>

          <div>
            <Label>Poster</Label>
            <div className="flex items-center gap-4">
              <div className="w-[120px]">
                <Poster event={event} compact />
              </div>
              <div className="min-w-0">
                <Button
                  size="sm"
                  onClick={() => toast("Uploads aren't in this prototype — posters are typeset")}
                >
                  Upload
                </Button>
                <p className="t-small mt-2 max-w-[34ch] text-muted">
                  Naada typesets a poster from the event name. Upload one if you have artwork.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right — tiers, artist slots, publish */}
        <div className="space-y-8">
          <section>
            <h2 className="t-micro">Ticket tiers</h2>
            <ul className="mt-3 space-y-2">
              {event.tiers.map((t) => (
                <li
                  key={t.name}
                  className="flex items-start gap-3 border border-line bg-surface p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px]">{t.name}</p>
                    <p className="t-mono mt-1 text-[13px] text-muted">
                      {t.price === 0 ? "FREE" : money(t.price)} · {t.capacity} seats
                      {t.sold > 0 && ` · ${t.sold} sold`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      removeTier(event.id, t.name);
                      setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
                      toast(`Removed ${t.name}`);
                    }}
                    aria-label={`Remove ${t.name} tier`}
                    className="grid size-9 shrink-0 place-items-center border border-line text-muted transition-colors hover:border-fault hover:text-fault"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>

            <form
              className="mt-3 border border-dashed border-line p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTier.name.trim()) return;
                addTier(event.id, {
                  name: newTier.name.trim(),
                  price: Number(newTier.price) || 0,
                  capacity: Number(newTier.capacity) || 0,
                  sold: 0,
                });
                setNewTier({ name: "", price: "", capacity: "" });
                setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
                toast("Tier added");
              }}
            >
              <Input
                aria-label="Tier name"
                placeholder="Tier name"
                value={newTier.name}
                onChange={(e) => setNewTier((p) => ({ ...p, name: e.target.value }))}
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input
                  aria-label="Price"
                  inputMode="numeric"
                  placeholder="₹ price"
                  className="t-mono"
                  value={newTier.price}
                  onChange={(e) =>
                    setNewTier((p) => ({ ...p, price: e.target.value.replace(/\D/g, "") }))
                  }
                />
                <Input
                  aria-label="Seats"
                  inputMode="numeric"
                  placeholder="seats"
                  className="t-mono"
                  value={newTier.capacity}
                  onChange={(e) =>
                    setNewTier((p) => ({ ...p, capacity: e.target.value.replace(/\D/g, "") }))
                  }
                />
              </div>
              <Button type="submit" size="sm" full className="mt-2">
                <Plus className="size-4" aria-hidden="true" />
                Add tier
              </Button>
            </form>
          </section>

          <section>
            <h2 className="t-micro">Artist slots</h2>
            <ul className="mt-3 space-y-2">
              {eventBookings.map((b) => {
                const artist = artistById(b.artistId);
                return (
                  <li key={b.id} className="border border-line bg-surface p-3">
                    <Link to={`/bookings/${b.id}`} className="block hover:text-signal">
                      <p className="truncate text-[15px]">{artist?.name}</p>
                      <p className="mt-1.5 flex items-center gap-2">
                        <Pill>{statusLabel(b.state)}</Pill>
                        <span className="t-mono text-[13px] text-muted">
                          {money(b.agreedFee ?? b.quotes[b.quotes.length - 1]?.amount ?? 0)}
                        </span>
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Button
              size="sm"
              full
              className="mt-2"
              onClick={() => {
                if (unbooked[0]) openBrief(unbooked[0].id, event.id);
                else navigate("/host/artists");
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Find an artist
            </Button>
          </section>

          <section className="border-t border-line pt-5">
            {event.status === "draft" ? (
              <Button variant="primary" full onClick={publish}>
                Publish
              </Button>
            ) : (
              <Link to={`/e/${event.id}`} className="btn btn-secondary w-full">
                View public page
              </Link>
            )}
            <p className="t-small mt-3 text-muted">
              Publishing makes the page shareable and opens ticket sales.
            </p>
          </section>
        </div>
      </div>

      <Modal open={publishOpen} onClose={() => setPublishOpen(false)} title="Published">
        <p className="t-body text-paper/90">
          {event.name} is live. Share the link — it's the WhatsApp forward and the bio link.
        </p>

        <div className="mt-5 flex gap-4">
          <div className="w-[110px] shrink-0 border border-line bg-paper p-2">
            <QrBlock code={shareLink} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="t-micro">Share link</p>
            <p className="t-mono mt-1 break-all text-[12px] text-muted">{shareLink}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareLink);
                  } catch {
                    /* no clipboard in this browser — the toast still confirms intent */
                  }
                  toast("Link copied");
                }}
              >
                Copy link
              </Button>
              <Button size="sm" onClick={() => toast("Downloads aren't in this prototype")}>
                Download poster
              </Button>
            </div>
          </div>
        </div>

        <Link
          to={`/e/${event.id}`}
          className="btn btn-primary mt-6 w-full"
          onClick={() => setPublishOpen(false)}
        >
          View public page
        </Link>
      </Modal>
    </ConsoleShell>
  );
}
