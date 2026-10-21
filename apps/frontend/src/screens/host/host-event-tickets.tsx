import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import { money } from "@/lib/format";
import {
  createTier,
  deleteTier,
  getEventAttendees,
  updateTier,
  type ApiAttendee,
  type ApiTier,
  type TierWritePayload,
} from "@/lib/api";
import { ErrorNote, LoadingNote, friendlyError } from "./host-shared";

/**
 * The two halves of "my tickets" on the event page: what is on sale
 * (`TierManager`), and who has bought (`GuestList`). Both read and write the
 * server directly — a row changes only after the server says it did.
 */

// ─── Ticket types ─────────────────────────────────────────────────────────────

interface TierForm {
  name: string;
  price: string;
  quantity: string;
  maxPerOrder: string;
}

const EMPTY_FORM: TierForm = { name: "", price: "", quantity: "", maxPerOrder: "10" };

function toForm(t: ApiTier): TierForm {
  return {
    name: t.name,
    price: String(Number(t.price)),
    quantity: String(t.total_quantity),
    maxPerOrder: String(t.max_per_order ?? 10),
  };
}

/** Turns the form into what the API takes, or says what's wrong with it. */
function parseForm(f: TierForm): { body: TierWritePayload } | { error: string } {
  const name = f.name.trim();
  if (!name) return { error: "Give the ticket a name, like General or Front row." };
  const price = f.price.trim() === "" ? NaN : Number(f.price);
  if (!Number.isFinite(price) || price < 0) return { error: "Enter a price. Use 0 for a free ticket." };
  const quantity = Number(f.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) return { error: "Say how many tickets you're offering." };
  const max = Number(f.maxPerOrder);
  if (!Number.isInteger(max) || max < 1 || max > 10) return { error: "Tickets per booking must be between 1 and 10." };
  return {
    body: { name, price: price.toFixed(2), total_quantity: quantity, max_per_order: max },
  };
}

export function TierManager({
  eventId,
  tiers,
  onChanged,
}: {
  eventId: string;
  tiers: ApiTier[];
  /** Reload the event so the stats, publish button and poster follow. */
  onChanged: () => void | Promise<void>;
}) {
  const { toast } = useStore();
  const [editing, setEditing] = useState<ApiTier | "new" | null>(null);
  const [removing, setRemoving] = useState<ApiTier | null>(null);
  const [form, setForm] = useState<TierForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (target: ApiTier | "new") => {
    setForm(target === "new" ? EMPTY_FORM : toForm(target));
    setFormError(null);
    setEditing(target);
  };

  const save = async () => {
    const parsed = parseForm(form);
    if ("error" in parsed) {
      setFormError(parsed.error);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      if (editing === "new") {
        await createTier(eventId, parsed.body);
        toast("Ticket added", "success");
      } else if (editing) {
        // A price can't change once people hold tickets at the old one; the
        // server refuses, so don't send it.
        const body = { ...parsed.body };
        if (soldSoFar > 0) delete body.price;
        await updateTier(eventId, editing.id, body);
        toast("Ticket updated", "success");
      }
      setEditing(null);
      await onChanged();
    } catch (err) {
      setFormError(friendlyError(err, "Couldn't save that ticket. Nothing changed."));
    } finally {
      setBusy(false);
    }
  };

  const setActive = async (tier: ApiTier, active: boolean) => {
    setError(null);
    try {
      await updateTier(eventId, tier.id, { is_active: active });
      toast(active ? `${tier.name} is on sale` : `${tier.name} is off sale`, "success");
      await onChanged();
    } catch (err) {
      setError(friendlyError(err, "Couldn't change that ticket."));
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const res = await deleteTier(eventId, removing.id);
      toast(res?.deactivated ? `${removing.name} has bookings, so it was switched off instead` : "Ticket removed");
      setRemoving(null);
      await onChanged();
    } catch (err) {
      setError(friendlyError(err, "Couldn't remove that ticket."));
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  };

  const soldSoFar = editing !== null && editing !== "new" ? editing.sold_quantity : 0;
  const priceLocked = soldSoFar > 0;

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="t-section">Ticket tiers</h2>
        <Button size="sm" onClick={() => open("new")}>
          <Plus className="size-4" aria-hidden="true" />
          Add a ticket
        </Button>
      </div>

      {error && <ErrorNote className="mt-3" message={error} />}

      {tiers.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] glass-soft rounded-xl text-left">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="t-micro px-4 py-3">Tier</th>
                <th scope="col" className="t-micro px-4 py-3 text-right">Price</th>
                <th scope="col" className="t-micro px-4 py-3 text-right">Sold</th>
                <th scope="col" className="t-micro px-4 py-3 text-right">Revenue</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-[15px]">
                    {t.name}
                    {!t.is_active && <Pill tone="muted" className="ml-2">Off sale</Pill>}
                  </td>
                  <td className="t-mono px-4 py-3 text-right text-[14px]">
                    {Number(t.price) === 0 ? "FREE" : money(Number(t.price))}
                  </td>
                  <td className="t-mono px-4 py-3 text-right text-[14px]">
                    {t.sold_quantity}/{t.total_quantity}
                  </td>
                  <td className="t-mono px-4 py-3 text-right text-[14px]">
                    {money(Number(t.price) * t.sold_quantity)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" aria-label={`Edit ${t.name}`} onClick={() => open(t)}>
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void setActive(t, !t.is_active)}
                      >
                        {t.is_active ? "Pause" : "Resume"}
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={`Remove ${t.name}`} onClick={() => setRemoving(t)}>
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="t-small mt-3 border border-dashed border-line px-4 py-6 text-muted">
          Nothing on sale yet. Add at least one ticket — General, Front row, whatever you sell — before you
          publish, so the page has something to buy and the door has something to scan.
        </p>
      )}

      <Modal
        open={editing !== null}
        onClose={() => !busy && setEditing(null)}
        title={editing === "new" ? "Add a ticket" : "Edit ticket"}
      >
        <div className="space-y-4">
          <Field label="Name" htmlFor="tier-name">
            <Input
              id="tier-name"
              value={form.name}
              maxLength={100}
              placeholder="General"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Price (₹)"
              htmlFor="tier-price"
              hint={priceLocked ? "Fixed — people already hold this ticket." : "0 makes it free."}
            >
              <Input
                id="tier-price"
                inputMode="decimal"
                value={form.price}
                disabled={priceLocked}
                placeholder="499"
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </Field>
            <Field label="How many" htmlFor="tier-qty" hint={priceLocked ? `${soldSoFar} sold so far.` : undefined}>
              <Input
                id="tier-qty"
                inputMode="numeric"
                value={form.quantity}
                placeholder="100"
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Most per booking" htmlFor="tier-max" hint="1 to 10 tickets in one go.">
            <Input
              id="tier-max"
              inputMode="numeric"
              value={form.maxPerOrder}
              onChange={(e) => setForm({ ...form, maxPerOrder: e.target.value })}
            />
          </Field>
          {formError && (
            <p role="alert" className="t-small text-fault">
              {formError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : editing === "new" ? "Add ticket" : "Save changes"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={removing !== null} onClose={() => !busy && setRemoving(null)} title={`Remove ${removing?.name ?? "ticket"}?`}>
        <p className="t-body text-paper/90">
          {removing && removing.sold_quantity > 0
            ? "People already hold this ticket, so it will be switched off instead of deleted. Their tickets stay valid."
            : "It disappears from the event page. This can't be undone."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
            {busy ? "Removing…" : "Remove"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setRemoving(null)}>
            Keep it
          </Button>
        </div>
      </Modal>
    </section>
  );
}

// ─── Who has booked ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ApiAttendee["status"], string> = {
  valid: "Booked",
  used: "Checked in",
  cancelled: "Cancelled",
};

export function GuestList({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<ApiAttendee[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows((await getEventAttendees(eventId)).results);
    } catch (err) {
      setError(friendlyError(err, "Couldn't load the guest list."));
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const { booked, inside, shown } = useMemo(() => {
    const all = rows ?? [];
    const q = query.trim().toLowerCase();
    return {
      booked: all.length,
      inside: all.filter((r) => r.status === "used").length,
      shown: (q
        ? all.filter((r) =>
            `${r.holder_name} ${r.ticket_number} ${r.seat_label} ${r.tier_name ?? ""}`.toLowerCase().includes(q))
        : all
      ).slice(0, 100),
    };
  }, [rows, query]);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="t-section">Guest list</h2>
        {rows && (
          <p className="t-mono text-[13px] text-muted">
            {booked} booked · {inside} checked in
          </p>
        )}
      </div>

      {error && <ErrorNote className="mt-3" message={error} onRetry={() => void load()} />}
      {!rows && !error && <LoadingNote label="Loading the guest list…" />}

      {rows && rows.length === 0 && (
        <p className="t-small mt-3 border border-dashed border-line px-4 py-6 text-muted">
          No bookings yet. Each ticket sold appears here with the guest's name, ticket and seat.
        </p>
      )}

      {rows && rows.length > 0 && (
        <>
          <label htmlFor="guest-search" className="sr-only">Search the guest list</label>
          <Input
            id="guest-search"
            className="mt-3"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, ticket number or seat"
            autoComplete="off"
          />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] glass-soft rounded-xl text-left">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="t-micro px-4 py-3">Guest</th>
                  <th scope="col" className="t-micro px-4 py-3">Ticket</th>
                  <th scope="col" className="t-micro px-4 py-3">Seat</th>
                  <th scope="col" className="t-micro px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 text-[15px]">{r.holder_name || "—"}</td>
                    <td className="t-mono px-4 py-3 text-[13px] text-muted">
                      {r.ticket_number}
                      {r.tier_name ? ` · ${r.tier_name}` : ""}
                    </td>
                    <td className="px-4 py-3 text-[14px] text-muted">{r.seat_label || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Pill tone={r.status === "used" ? "live" : r.status === "cancelled" ? "muted" : "paper"}>
                        {STATUS_LABEL[r.status]}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.length === 0 && (
            <p className="t-small mt-2 text-muted">Nobody on the list matches that.</p>
          )}
          {!query && booked > 100 && (
            <p className="t-small mt-2 text-muted">Showing the first 100 of {booked}. Search to find anyone else.</p>
          )}
        </>
      )}
    </section>
  );
}
