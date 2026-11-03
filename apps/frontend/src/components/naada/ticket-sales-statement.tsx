import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getHostPayoutStatement, type ApiPayoutAccount, type ApiPayoutStatement } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { dateCompact, money } from "@/lib/format";
import { useAsync } from "@/screens/home/home-kit";

const amount = (s: string) => parseFloat(s) || 0;

/** What stands between this host and their money, in words they can act on. */
export function payoutBlockerMessage(account: ApiPayoutAccount): string {
  switch (account.blocker) {
    case "no_venue":
      return "Add your venue first — payouts go to the bank account on it.";
    case "no_bank_details":
      return "Add your bank account so we can pay you. Without it, your share waits here.";
    case "kyc_pending":
      return "Your details are with our team for verification. Payouts start once that's done.";
    case "kyc_rejected":
      return "Verification was rejected. Fix your details so we can pay you.";
    default:
      return "";
  }
}

/** The statement as rows a spreadsheet can read: nights first, then each payment. */
export function statementRows(data: ApiPayoutStatement) {
  const rows: (string | number)[][] = [
    ["Event", "Date", "Tickets sold", "Collected", "Refunded", "Showzy fee", "Owed to you", "Paid to you", "Still owed"],
  ];
  for (const e of data.events) {
    rows.push([
      e.title, e.start_datetime.slice(0, 10), e.tickets_sold, amount(e.collected), amount(e.refunded),
      amount(e.naada_fee), amount(e.owed_to_organiser), amount(e.paid_out), amount(e.balance),
    ]);
  }
  const t = data.totals;
  rows.push([
    "Total", "", data.events.reduce((n, e) => n + e.tickets_sold, 0), amount(t.collected), amount(t.refunded),
    amount(t.naada_fee), amount(t.owed_to_organiser), amount(t.paid_out), amount(t.balance),
  ]);
  const payments = data.events.flatMap((e) => e.payouts.map((p) => [e.title, p.paid_at.slice(0, 10), amount(p.amount), p.reference, p.note]));
  if (payments.length) {
    rows.push([], ["Payments made to you"], ["Event", "Paid on", "Amount", "Bank reference", "Note"], ...payments);
  }
  return rows;
}

/**
 * Ticket money, night by night: what came in, what Showzy kept, what has been
 * paid to the host (with the bank reference) and what is still owed.
 */
export function TicketSalesStatement() {
  const load = useCallback(() => getHostPayoutStatement(), []);
  const statement = useAsync(load, "load your ticket sales");
  const [open, setOpen] = useState<string | null>(null);

  if (statement.loading && !statement.data) {
    return <p className="t-body mt-6 text-muted">Loading your ticket sales…</p>;
  }
  if (statement.error || !statement.data) {
    return (
      <div className="mt-6 border border-fault bg-surface p-4">
        <p className="t-body">{statement.error ?? "We couldn't load your ticket sales."}</p>
        <Button className="mt-3" onClick={statement.reload}>
          Try again
        </Button>
      </div>
    );
  }

  const { totals, events, payout_account: account } = statement.data;
  const blocker = payoutBlockerMessage(account);

  return (
    <section className="mt-6" aria-label="Ticket sales">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="t-section">Ticket sales</h2>
        {events.length > 0 && (
          <Button
            size="sm"
            onClick={() => downloadCsv("showzy-ticket-sales.csv", statementRows(statement.data!))}
          >
            <Download className="mr-2 size-4" aria-hidden="true" />
            Download statement
          </Button>
        )}
      </div>

      {account.ready ? (
        <p className="t-small mt-3 glass-soft rounded-xl px-4 py-3 text-muted">
          We pay your share to the bank account ending{" "}
          <span className="t-mono text-paper">{account.account_last4}</span>
          {account.account_holder ? ` (${account.account_holder})` : ""}.
        </p>
      ) : (
        <div className="mt-3 border border-brass bg-surface px-4 py-3" role="status">
          <p className="t-small">{blocker}</p>
          <Link to="/host/business" className="t-small mt-1 inline-block underline underline-offset-4">
            Go to Business &amp; payouts
          </Link>
        </div>
      )}

      {events.length === 0 ? (
        <p className="t-small mt-4 border border-dashed border-line px-4 py-8 text-center text-muted">
          No ticket sales yet. Once tickets sell, each night appears here with what you're owed.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Collected", totals.collected, ""],
              ["Showzy fee", totals.naada_fee, "text-muted"],
              ["Paid to you", totals.paid_out, ""],
              ["Still owed", totals.balance, "text-live"],
            ].map(([label, value, tone]) => (
              <div key={label} className="glass-soft rounded-xl px-4 py-3">
                <dt className="t-small text-muted">{label}</dt>
                <dd className={`t-mono mt-1 text-[20px] ${tone}`}>{money(amount(value))}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 overflow-x-auto glass-soft rounded-xl">
            <table className="w-full min-w-[680px] text-left">
              <caption className="sr-only">Ticket money collected and owed per event</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="t-micro px-4 py-3">Event</th>
                  <th scope="col" className="t-micro px-4 py-3 text-right">Tickets</th>
                  <th scope="col" className="t-micro px-4 py-3 text-right">Collected</th>
                  <th scope="col" className="t-micro px-4 py-3 text-right">Refunded</th>
                  <th scope="col" className="t-micro px-4 py-3 text-right">Showzy fee</th>
                  <th scope="col" className="t-micro px-4 py-3 text-right">Paid to you</th>
                  <th scope="col" className="t-micro px-4 py-3 text-right">Still owed</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <EventRows key={e.event_id} e={e} open={open === e.event_id} toggle={() => setOpen(open === e.event_id ? null : e.event_id)} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[13px] text-muted">
            Showzy collects ticket payments and transfers your share to your bank account. Every transfer is
            listed under its night with the bank reference. "Still owed" is the part not yet transferred.
          </p>
        </>
      )}
    </section>
  );
}

function EventRows({
  e,
  open,
  toggle,
}: {
  e: ApiPayoutStatement["events"][number];
  open: boolean;
  toggle: () => void;
}) {
  return (
    <>
      <tr className="border-b border-line last:border-0">
        <th scope="row" className="px-4 py-3 text-left font-normal">
          <span className="block text-[15px]">{e.title}</span>
          <span className="t-mono block text-[12px] text-muted">{dateCompact(e.start_datetime.slice(0, 10))}</span>
          {e.payouts.length > 0 && (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              className="t-small mt-1 text-muted underline underline-offset-4 hover:text-paper"
            >
              {open ? "Hide" : "Show"} {e.payouts.length === 1 ? "1 payment" : `${e.payouts.length} payments`}
            </button>
          )}
        </th>
        <td className="t-mono px-4 py-3 text-right text-[14px]">{e.tickets_sold}</td>
        <td className="t-mono px-4 py-3 text-right text-[14px]">{money(amount(e.collected))}</td>
        <td className="t-mono px-4 py-3 text-right text-[14px] text-muted">{money(amount(e.refunded))}</td>
        <td className="t-mono px-4 py-3 text-right text-[14px] text-muted">{money(amount(e.naada_fee))}</td>
        <td className="t-mono px-4 py-3 text-right text-[14px]">{money(amount(e.paid_out))}</td>
        <td className="t-mono px-4 py-3 text-right text-[14px]">{money(amount(e.balance))}</td>
      </tr>
      {open &&
        e.payouts.map((p) => (
          <tr key={p.id} className="border-b border-line bg-paper/5">
            <td colSpan={7} className="t-small px-4 py-2 text-muted">
              <span className="t-mono text-paper">{money(amount(p.amount))}</span> paid on{" "}
              {dateCompact(p.paid_at.slice(0, 10))} · reference <span className="t-mono">{p.reference}</span>
              {p.note ? ` · ${p.note}` : ""}
            </td>
          </tr>
        ))}
    </>
  );
}
