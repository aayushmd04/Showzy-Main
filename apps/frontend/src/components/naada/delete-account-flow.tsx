import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, Download, Loader2, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";

/**
 * Deleting an account, as a short guided process rather than a button and a
 * text box:
 *
 *   1. Review  — what will be erased, what we must keep, and anything that
 *                stops it (a live event, money in escrow). Warns about tickets
 *                you'd lose, and offers a copy of your data first.
 *   2. Confirm — a fresh one-time code emailed to you, plus typing DELETE, so a
 *                stolen or left-open session can't wipe an account.
 *   3. Done    — says plainly that it happened and what remains.
 *
 * The server enforces every rule here; this screen only explains them.
 */

type Step = "review" | "confirm" | "done";

export function DeleteAccountFlow({
  open,
  onClose,
  email,
  onExport,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  email: string;
  onExport: () => void;
  onDeleted: () => void;
}) {
  const [step, setStep] = useState<Step>("review");
  const [report, setReport] = useState<api.DeletionReport | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [ack, setAck] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [code, setCode] = useState("");
  const [word, setWord] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start fresh and re-read what would be affected every time it opens.
  useEffect(() => {
    if (!open) return;
    setStep("review");
    setReport(null);
    setLoadError(false);
    setAck(false);
    setCodeSent(false);
    setCode("");
    setWord("");
    setError(null);
    let alive = true;
    api.getDeletionCheck()
      .then((r) => alive && setReport(r))
      .catch(() => alive && setLoadError(true));
    return () => { alive = false; };
  }, [open]);

  const sendCode = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await api.requestDeletionCode();
      setCodeSent(true);
      if (res.debug_otp) setCode(res.debug_otp); // dev builds only
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't send the code. Try again in a moment.");
    } finally {
      setSending(false);
    }
  };

  const confirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteMyAccount({ code: code.trim(), acknowledge_losses: ack });
      setStep("done");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Something changed since the review (e.g. a new booking) — show it.
        const fresh = await api.getDeletionCheck().catch(() => null);
        if (fresh) setReport(fresh);
        setStep("review");
        setError("Something changed while you were deciding. Please review again.");
      } else {
        setError(err instanceof ApiError ? err.detail : "Couldn't delete the account. Nothing was changed.");
      }
    } finally {
      setDeleting(false);
    }
  };

  const blocked = !!report && !report.can_delete;
  const needsAck = !!report && report.warnings.length > 0;
  const canContinue = !!report && !blocked && (!needsAck || ack);

  return (
    <Modal
      open={open}
      onClose={step === "done" ? onDeleted : onClose}
      title={step === "done" ? "Your account has been deleted" : "Delete your account"}
      hideClose={deleting}
      className="max-w-[640px]"
    >
      {step === "review" && (
        <div>
          {error && <p className="t-small mb-3 text-fault" role="alert">{error}</p>}
          {!report && !loadError && (
            <p className="t-small flex items-center gap-2 text-muted" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Checking what this affects…
            </p>
          )}
          {loadError && (
            <p className="t-small text-fault" role="alert">
              We couldn't check your account just now. Close this and try again.
            </p>
          )}

          {report && (
            <>
              {report.blockers.map((b) => (
                <div key={b.code} className="mb-3 border border-fault/50 bg-fault/5 p-3">
                  <p className="flex items-center gap-2 text-[14px] font-semibold text-fault">
                    <AlertTriangle className="size-4" aria-hidden="true" /> {b.title}
                  </p>
                  <p className="t-small mt-1 text-paper/85">{b.detail}</p>
                  {b.items && b.items.length > 0 && (
                    <ul className="t-small mt-1.5 list-disc pl-5 text-muted">
                      {b.items.map((i) => <li key={i}>{i}</li>)}
                    </ul>
                  )}
                  {b.action_url && (
                    <Link to={b.action_url} onClick={onClose} className="t-small link-underline mt-2 inline-block text-paper">
                      Go and sort this out →
                    </Link>
                  )}
                </div>
              ))}

              {report.warnings.map((w) => (
                <div key={w.code} className="mb-3 border border-brass/50 bg-brass/5 p-3">
                  <p className="flex items-center gap-2 text-[14px] font-semibold text-brass">
                    <AlertTriangle className="size-4" aria-hidden="true" /> {w.title}
                  </p>
                  <p className="t-small mt-1 text-paper/85">{w.detail}</p>
                  {w.items && w.items.length > 0 && (
                    <ul className="t-small mt-1.5 list-disc pl-5 text-muted">
                      {w.items.map((i) => <li key={i}>{i}</li>)}
                    </ul>
                  )}
                  {w.action_url && (
                    <Link to={w.action_url} onClick={onClose} className="t-small link-underline mt-2 inline-block text-paper">
                      Review these tickets →
                    </Link>
                  )}
                  <label className="mt-3 flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={ack}
                      onChange={(e) => setAck(e.target.checked)}
                      className="mt-0.5 size-4 shrink-0 accent-[#FF3D6E]"
                    />
                    <span className="t-small text-paper">
                      I understand I'll lose access to these tickets and they won't be refunded.
                    </span>
                  </label>
                </div>
              ))}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="border border-line p-3">
                  <p className="t-micro text-paper">We'll erase</p>
                  <ul className="mt-2 space-y-1.5">
                    {report.erase.map((e) => (
                      <li key={e} className="t-small flex gap-2 text-paper/85">
                        <X className="mt-0.5 size-3.5 shrink-0 text-fault" aria-hidden="true" /> {e}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border border-line p-3">
                  <p className="t-micro text-paper">We must keep</p>
                  <ul className="mt-2 space-y-1.5">
                    {report.keep.map((k) => (
                      <li key={k} className="t-small flex gap-2 text-paper/85">
                        <Minus className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden="true" /> {k}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <p className="t-small mt-3 text-muted">
                This can't be undone. Want a copy first?{" "}
                <button type="button" onClick={onExport} className="link-underline inline-flex items-center gap-1 text-paper">
                  <Download className="size-3.5" aria-hidden="true" /> Download my data
                </button>
              </p>
            </>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={onClose}>Keep my account</Button>
            <Button variant="primary" disabled={!canContinue} onClick={() => setStep("confirm")}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div>
          <p className="t-body text-paper/90">
            Last step. To make sure it's really you, we'll email a code to <strong>{email}</strong>.
          </p>

          {!codeSent ? (
            <Button className="mt-4" variant="primary" disabled={sending} onClick={sendCode}>
              {sending ? "Sending…" : "Email me a code"}
            </Button>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="del-code" className="t-micro mb-2 block">Code from your email</label>
                <Input
                  id="del-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="t-mono"
                  placeholder="6-digit code"
                />
                <button type="button" onClick={sendCode} disabled={sending} className="t-small link-underline mt-1.5 text-muted">
                  Send a new code
                </button>
              </div>
              <div>
                <label htmlFor="del-word" className="t-micro mb-2 block">
                  Type <strong className="t-mono">DELETE</strong> to confirm
                </label>
                <Input id="del-word" value={word} onChange={(e) => setWord(e.target.value)} placeholder="DELETE" className="t-mono" />
              </div>
            </div>
          )}

          {error && <p className="t-small mt-3 text-fault" role="alert">{error}</p>}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => setStep("review")} disabled={deleting}>Back</Button>
            <Button
              variant="primary"
              disabled={!codeSent || code.length < 4 || word !== "DELETE" || deleting}
              onClick={confirm}
            >
              {deleting ? "Deleting…" : "Permanently delete my account"}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div>
          <p className="flex items-start gap-2 text-paper/90">
            <Check className="mt-0.5 size-5 shrink-0 text-live" aria-hidden="true" />
            <span className="t-body">
              Your profile, contact details, saved events and notifications have been erased and you've been
              signed out everywhere. Ticket and payment records remain without your name or contact details,
              as tax law requires.
            </span>
          </p>
          <p className="t-small mt-3 text-muted">
            Questions about your data? Write to us from the{" "}
            <Link to="/contact" onClick={onDeleted} className="link-underline text-paper">Contact page</Link>.
          </p>
          <Button className="mt-5" variant="primary" onClick={onDeleted}>Done</Button>
        </div>
      )}
    </Modal>
  );
}
