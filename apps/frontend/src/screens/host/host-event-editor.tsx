import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Pill, statusLabel } from "@/components/ui/pill";
import { Poster } from "@/components/naada/poster";
import { useStore } from "@/store/app-store";
import { adaptEvent } from "@/lib/adapters";
import { money } from "@/lib/format";
import {
  createEvent,
  getAllPages,
  getCities,
  getEvent,
  getGenres,
  updateEvent,
  type ApiCity,
  type ApiEvent,
  type ApiGenre,
  type ApiVenue,
  type EventWritePayload,
} from "@/lib/api";
import {
  ErrorNote,
  LoadingNote,
  SaveStatusLine,
  friendlyError,
  isoToLocalInput,
  localInputToIso,
  useDebouncedSave,
} from "./host-shared";

/**
 * Section 7.10 — event editor, in both modes.
 *
 *   /host/events/new       → create, one explicit submit
 *   /host/events/:id/edit  → edit, debounced PATCH per change
 *
 * Edits used to be written to React state only: the "Saved at HH:MM" stamp
 * appeared instantly and the change was gone on reload. Every write here now
 * goes to the API and the stamp is set from the server's answer.
 */

interface EventForm {
  title: string;
  title_kn: string;
  description: string;
  venue: string;
  start: string;
  end: string;
  genres: number[];
  is_free: boolean;
  is_seeking_artists: boolean;
  budget_min: string;
  budget_max: string;
}

const EMPTY_FORM: EventForm = {
  title: "",
  title_kn: "",
  description: "",
  venue: "",
  start: "",
  end: "",
  genres: [],
  is_free: false,
  is_seeking_artists: false,
  budget_min: "",
  budget_max: "",
};

type FieldErrors = Partial<Record<"title" | "venue" | "start" | "end", string>>;

/** The rules the API can't be asked to enforce politely — checked before submit. */
function validate(form: EventForm): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.title.trim()) errors.title = "Give the night a name — this is the headline on the ticket.";
  if (!form.venue) errors.venue = "Pick the venue. Ticket buyers need somewhere to turn up.";
  if (!form.start) errors.start = "Set the date and start time.";
  if (!form.end) {
    errors.end = "Set an end time so the door and settlement know when the night closes.";
  } else if (form.start && new Date(form.end) <= new Date(form.start)) {
    errors.end = "The end time has to be after the start time.";
  }
  return errors;
}

function toPayload(form: EventForm): EventWritePayload {
  const payload: EventWritePayload = {
    title: form.title.trim(),
    title_kn: form.title_kn.trim(),
    description: form.description,
    venue: form.venue,
    genres: form.genres,
    is_free: form.is_free,
    is_seeking_artists: form.is_seeking_artists,
  };
  const start = localInputToIso(form.start);
  const end = localInputToIso(form.end);
  if (start) payload.start_datetime = start;
  if (end) payload.end_datetime = end;
  if (form.is_seeking_artists) {
    payload.performance_budget_min = form.budget_min || undefined;
    payload.performance_budget_max = form.budget_max || undefined;
  }
  return payload;
}

function fromApi(event: ApiEvent): EventForm {
  const venueId = typeof event.venue === "string" ? event.venue : event.venue?.id ?? "";
  return {
    title: event.title ?? "",
    title_kn: event.title_kn ?? "",
    description: event.description ?? "",
    venue: venueId,
    start: isoToLocalInput(event.start_datetime),
    end: isoToLocalInput(event.end_datetime),
    genres: (event.genres ?? []).map((g) => g.id),
    is_free: Boolean(event.is_free),
    is_seeking_artists: Boolean(event.is_seeking_artists),
    budget_min: event.performance_budget_min ?? "",
    budget_max: event.performance_budget_max ?? "",
  };
}

function venueLabel(v: ApiVenue): string {
  const where = v.area_name ?? (typeof v.area === "string" ? v.area : undefined);
  const city = v.city_name;
  const tail = [where, city].filter(Boolean).join(", ");
  return tail ? `${v.name} · ${tail}` : v.name;
}

export function HostEventEditorScreen() {
  const { id } = useParams();
  const isCreate = !id;
  const navigate = useNavigate();
  const { toast } = useStore();

  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [event, setEvent] = useState<ApiEvent | null>(null);
  const [loading, setLoading] = useState(!isCreate);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showErrors, setShowErrors] = useState(false);

  // Reference data for the pickers — real rows, not a hardcoded list.
  const [venues, setVenues] = useState<ApiVenue[]>([]);
  const [cities, setCities] = useState<ApiCity[]>([]);
  const [genres, setGenres] = useState<ApiGenre[]>([]);
  const [refLoading, setRefLoading] = useState(true);
  const [refError, setRefError] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState("all");

  const dirtyRef = useRef(false);

  const saver = useDebouncedSave<EventWritePayload>(
    useCallback(
      async (payload: EventWritePayload) => {
        if (!id) return;
        const updated = await updateEvent(id, payload);
        setEvent(updated);
      },
      [id],
    ),
    { errorFallback: "Couldn't save that change to the event." },
  );

  const loadReference = useCallback(async () => {
    setRefLoading(true);
    setRefError(null);
    try {
      const [venueRows, cityRows, genreRows] = await Promise.all([
        // Only the venues this host owns: the server refuses an event at
        // anyone else's, so offering them here ended in a 403 on save.
        getAllPages<ApiVenue>("/venues/?mine=true", true),
        getCities(),
        getGenres(),
      ]);
      setVenues(venueRows);
      setCities(cityRows);
      setGenres(genreRows);
    } catch (err) {
      setRefError(
        friendlyError(err, "Couldn't load venues and genres, so the pickers are empty."),
      );
    } finally {
      setRefLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReference();
  }, [loadReference]);

  const loadEvent = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getEvent(id);
      setEvent(data);
      setForm(fromApi(data));
      dirtyRef.current = false;
    } catch (err) {
      setLoadError(friendlyError(err, "Couldn't load this event."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  // Autosave, but only once the host has actually changed something and only
  // when the result is something the API will accept.
  useEffect(() => {
    if (isCreate || !dirtyRef.current) return;
    const next = validate(form);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    saver.schedule(toPayload(form));
    // `saver` is stable enough — scheduling is keyed on the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, isCreate]);

  const setField = <K extends keyof EventForm>(key: K, value: EventForm[K]) => {
    dirtyRef.current = true;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const visibleVenues = useMemo(() => {
    if (cityFilter === "all") return venues;
    return venues.filter((v) => v.city === cityFilter || v.city_name === cityFilter);
  }, [venues, cityFilter]);

  const tiers = event?.ticket_tiers ?? [];

  const submit = async () => {
    const next = validate(form);
    setErrors(next);
    setShowErrors(true);
    if (Object.keys(next).length > 0) {
      setSubmitError("Fix the highlighted fields and try again.");
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const created = await createEvent(toPayload(form));
      toast("Event created as a draft", "success");
      navigate(`/host/events/${created.id}`, { replace: true });
    } catch (err) {
      setSubmitError(friendlyError(err, "Couldn't create the event. Nothing was saved."));
      setSubmitting(false);
    }
  };

  const errorFor = (key: keyof FieldErrors) =>
    showErrors || (!isCreate && dirtyRef.current) ? errors[key] : undefined;

  if (loading) {
    return (
      <ConsoleShell nav={HOST_NAV} breadcrumb={["Events", "Loading"]}>
        <h1 className="t-h1">Edit event</h1>
        <LoadingNote label="Loading this event…" />
      </ConsoleShell>
    );
  }

  if (loadError) {
    return (
      <ConsoleShell nav={HOST_NAV} breadcrumb={["Events", "Unavailable"]}>
        <h1 className="t-h1">Edit event</h1>
        <div className="mt-6 max-w-[60ch]">
          <ErrorNote message={loadError} onRetry={() => void loadEvent()} />
          <Link to="/host/events" className="btn btn-secondary mt-4">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to events
          </Link>
        </div>
      </ConsoleShell>
    );
  }

  const previewEvent = event
    ? adaptEvent(event)
    : adaptEvent({
        id: "preview",
        title: form.title || "Untitled night",
        title_kn: "",
        description: form.description,
        description_kn: "",
        venue: form.venue,
        start_datetime: localInputToIso(form.start) ?? new Date().toISOString(),
        end_datetime: localInputToIso(form.end) ?? new Date().toISOString(),
        status: "draft",
        genres: [],
        ticket_tiers: [],
        is_featured: false,
      });

  return (
    <ConsoleShell
      nav={HOST_NAV}
      breadcrumb={["Events", isCreate ? "New event" : event?.title || "Event"]}
      actions={
        isCreate ? undefined : (
          <SaveStatusLine state={saver} className="hidden sm:inline" />
        )
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t-h1">{isCreate ? "New event" : "Edit event"}</h1>
        {event && <Pill>{statusLabel(event.status)}</Pill>}
      </div>
      {isCreate && (
        <p className="t-body mt-2 max-w-[56ch] text-muted">
          This saves as a draft. Nothing is public and no tickets sell until you publish it.
        </p>
      )}

      {!isCreate && saver.error && (
        <ErrorNote className="mt-5" message={saver.error} onRetry={saver.retry} retryLabel="Retry save" />
      )}
      {refError && (
        <ErrorNote className="mt-5" message={refError} onRetry={() => void loadReference()} />
      )}
      {submitError && <ErrorNote className="mt-5" message={submitError} />}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* Left — the event itself */}
        <div className="min-w-0 space-y-5">
          <Field
            label="Event name"
            htmlFor="ev-title"
            hint={errorFor("title")}
            className={errorFor("title") ? "[&_p]:text-fault" : undefined}
          >
            <Input
              id="ev-title"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              aria-invalid={Boolean(errorFor("title"))}
              placeholder="Sunday Sessions: Rohan Trio"
            />
          </Field>

          <Field label="Event name in Kannada" htmlFor="ev-title-kn" hint="Optional. Shown to readers who switch the app to Kannada.">
            <Input
              id="ev-title-kn"
              value={form.title_kn}
              onChange={(e) => setField("title_kn", e.target.value)}
              className="font-[Anek_Kannada]"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Starts"
              htmlFor="ev-start"
              hint={errorFor("start")}
              className={errorFor("start") ? "[&_p]:text-fault" : undefined}
            >
              <Input
                id="ev-start"
                type="datetime-local"
                className="t-mono"
                value={form.start}
                onChange={(e) => setField("start", e.target.value)}
                aria-invalid={Boolean(errorFor("start"))}
              />
            </Field>
            <Field
              label="Ends"
              htmlFor="ev-end"
              hint={errorFor("end")}
              className={errorFor("end") ? "[&_p]:text-fault" : undefined}
            >
              <Input
                id="ev-end"
                type="datetime-local"
                className="t-mono"
                value={form.end}
                onChange={(e) => setField("end", e.target.value)}
                aria-invalid={Boolean(errorFor("end"))}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <Field label="City" htmlFor="ev-city" hint="Narrows the venue list.">
              <Select
                id="ev-city"
                value={cityFilter}
                onChange={setCityFilter}
                options={[
                  { value: "all", label: "All cities" },
                  ...cities.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </Field>
            <Field
              label="Venue"
              htmlFor="ev-venue"
              hint={
                errorFor("venue") ??
                (refLoading
                  ? "Loading venues…"
                  : visibleVenues.length === 0
                    ? "No venues in this city yet. Add yours under Venue in the sidebar."
                    : undefined)
              }
              className={errorFor("venue") ? "[&_p]:text-fault" : undefined}
            >
              <Select
                id="ev-venue"
                value={form.venue}
                onChange={(v) => setField("venue", v)}
                options={[
                  { value: "", label: refLoading ? "Loading…" : "Choose a venue" },
                  ...visibleVenues.map((v) => ({ value: v.id, label: venueLabel(v) })),
                ]}
              />
            </Field>
          </div>

          <Field
            label="Description"
            htmlFor="ev-desc"
            hint="Shown on the public page. Say what the night actually is."
          >
            <Textarea
              id="ev-desc"
              rows={5}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
            />
          </Field>

          <div>
            <Label>Genres</Label>
            {refLoading ? (
              <p className="t-small text-muted">Loading genres…</p>
            ) : genres.length === 0 ? (
              <p className="t-small text-muted">No genres are set up yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {genres.map((g) => {
                  const on = form.genres.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setField(
                          "genres",
                          on ? form.genres.filter((x) => x !== g.id) : [...form.genres, g.id],
                        )
                      }
                      className={
                        on
                          ? "pill border-signal text-signal"
                          : "pill border-line text-muted hover:text-paper"
                      }
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-line pt-5">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={form.is_free}
                onChange={(e) => setField("is_free", e.target.checked)}
                className="mt-1 size-4 accent-[var(--color-signal)]"
              />
              <span>
                <span className="block text-[15px]">Free entry</span>
                <span className="t-small block text-muted">
                  Listed as free on the public page. You still need a ticket tier so the door has
                  something to scan.
                </span>
              </span>
            </label>

            <label className="mt-4 flex items-start gap-3">
              <input
                type="checkbox"
                checked={form.is_seeking_artists}
                onChange={(e) => setField("is_seeking_artists", e.target.checked)}
                className="mt-1 size-4 accent-[var(--color-signal)]"
              />
              <span>
                <span className="block text-[15px]">List this on the artist gig board</span>
                <span className="t-small block text-muted">
                  Artists can apply. You review applications from the event page.
                </span>
              </span>
            </label>

            {form.is_seeking_artists && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Budget from" htmlFor="ev-bmin">
                  <Input
                    id="ev-bmin"
                    inputMode="numeric"
                    className="t-mono"
                    placeholder="₹ minimum"
                    value={form.budget_min}
                    onChange={(e) => setField("budget_min", e.target.value.replace(/\D/g, ""))}
                  />
                </Field>
                <Field label="Budget to" htmlFor="ev-bmax">
                  <Input
                    id="ev-bmax"
                    inputMode="numeric"
                    className="t-mono"
                    placeholder="₹ maximum"
                    value={form.budget_max}
                    onChange={(e) => setField("budget_max", e.target.value.replace(/\D/g, ""))}
                  />
                </Field>
              </div>
            )}
          </div>

          {isCreate && (
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
              <Button variant="primary" onClick={() => void submit()} disabled={submitting}>
                {submitting ? "Creating…" : "Create draft event"}
              </Button>
              <Link to="/host/events" className="btn btn-ghost">
                Cancel
              </Link>
            </div>
          )}
        </div>

        {/* Right — poster preview and tiers */}
        <div className="space-y-8">
          <section>
            <h2 className="t-section">Poster</h2>
            <div className="mt-3">
              <Poster event={previewEvent} />
            </div>
            <p className="t-small mt-2 text-muted">
              Showzy typesets the poster from the event name and date.
            </p>
          </section>

          <section>
            <h2 className="t-section">Ticket tiers</h2>
            {isCreate ? (
              <p className="t-small mt-3 border border-dashed border-line px-4 py-5 text-muted">
                Tiers are set up once the draft exists. Create the event first — you'll land on its
                event page.
              </p>
            ) : tiers.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {tiers.map((t) => (
                  <li key={t.id} className="glass-soft rounded-xl p-3">
                    <p className="truncate text-[15px]">{t.name}</p>
                    <p className="t-mono mt-1 text-[13px] text-muted">
                      {Number(t.price) === 0 ? "FREE" : money(Number(t.price))} ·{" "}
                      {t.sold_quantity}/{t.total_quantity} sold
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-small mt-3 border border-dashed border-line px-4 py-5 text-muted">
                No ticket tiers yet. An event needs at least one before it can be published — the
                door scanner has nothing to check people in against without it.
              </p>
            )}
          </section>

          {!isCreate && event && (
            <section className="border-t border-line pt-5">
              <Link to={`/host/events/${event.id}`} className="btn btn-secondary w-full">
                Back to the event page
              </Link>
              <p className="t-small mt-3 text-muted">
                Publishing, the door scanner and artist applications all live there.
              </p>
              <SaveStatusLine state={saver} className="mt-3 block sm:hidden" />
            </section>
          )}
        </div>
      </div>
    </ConsoleShell>
  );
}
