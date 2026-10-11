import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { PublicShell } from "@/components/naada/public-shell";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/input";
import { DeleteAccountFlow } from "@/components/naada/delete-account-flow";
import { openCookieSettings, useConsent } from "@/lib/consent";
import { LEGAL_VERSION } from "@/lib/legal";
import { useStore } from "@/store/app-store";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import { usePageMeta } from "@/lib/use-meta";

const PREF_ROWS: { key: keyof api.NotificationPreferences; label: string; hint: string }[] = [
  { key: "ticket_confirmed_email", label: "Ticket confirmations", hint: "Your QR and receipt, by email" },
  { key: "event_reminder_email", label: "Event reminders", hint: "A nudge the day before a gig you're going to" },
  { key: "artist_new_event_email", label: "Artists you follow", hint: "When an act you follow announces a date" },
  { key: "marketing_email", label: "What's on in your city", hint: "An occasional round-up. Never more than monthly." },
];

export function SettingsScreen() {
  usePageMeta({ title: "Settings", description: "Manage your Naada account, notifications and data." });
  const navigate = useNavigate();
  const { currentUser, setCurrentUser, role, setRole, lang, setLang, toast } = useStore();
  const { open: openAuth } = useAuthSheet();

  const [fullName, setFullName] = useState(currentUser?.full_name ?? "");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [prefs, setPrefs] = useState<api.NotificationPreferences | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [consents, setConsents] = useState<Partial<Record<api.ConsentKind, api.ConsentPosition>>>({});
  const cookieChoice = useConsent();

  const signedIn = role !== "out" && Boolean(currentUser);

  useEffect(() => {
    if (!signedIn) return;
    api.getMe()
      .then((me) => {
        setFullName(me.full_name ?? "");
        const extra = me as unknown as { phone?: string; bio?: string };
        setPhone(extra.phone ?? "");
        setBio(extra.bio ?? "");
      })
      .catch(() => {});
    api.getNotificationPreferences().then(setPrefs).catch(() => {});
    api.getConsents().then(setConsents).catch(() => {});
  }, [signedIn]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await api.updateMe({
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        bio: bio.trim(),
      });
      setCurrentUser({
        id: updated.id,
        email: updated.email,
        full_name: updated.full_name,
        role: updated.role,
      });
      toast("Saved", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.detail : "Could not save", "fault");
    } finally {
      setSavingProfile(false);
    }
  };

  const togglePref = async (key: keyof api.NotificationPreferences) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); // optimistic — a toggle that lags feels broken
    try {
      await api.updateNotificationPreferences({ [key]: next[key] });
      // Marketing email is the one that rests on consent, so log each choice.
      if (key === "marketing_email") {
        void api.recordConsent("marketing_email", LEGAL_VERSION, "settings", Boolean(next[key])).then(() =>
          api.getConsents().then(setConsents).catch(() => {}),
        );
      }
    } catch {
      setPrefs(prefs);
      toast("Could not change that setting", "fault");
    }
  };

  const exportData = async () => {
    try {
      const data = await api.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "naada-my-data.json";
      a.click();
      URL.revokeObjectURL(url);
      toast("Your data is downloading", "success");
    } catch {
      toast("Could not prepare your data", "fault");
    }
  };

  const afterDeleted = () => {
    setDeleteOpen(false);
    setCurrentUser(null);
    setRole("out");
    navigate("/", { replace: true });
  };

  const signOut = async () => {
    await api.logout();
    setCurrentUser(null);
    setRole("out");
    toast("Signed out");
    navigate("/", { replace: true });
  };

  if (!signedIn) {
    return (
      <PublicShell>
        <div className="mx-auto w-full max-w-[560px] px-4 py-16 text-center">
          <h1 className="t-h1">Settings</h1>
          <p className="t-body mt-3 text-muted">Sign in to manage your account.</p>
          <Button variant="primary" className="mt-6" onClick={() => openAuth("Sign in to Naada")}>
            Sign in
          </Button>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[620px] px-4 py-10 md:py-14">
        <h1 className="t-h1">Settings</h1>
        <p className="t-small mt-2 text-muted">{currentUser?.email}</p>

        {/* ── Profile ────────────────────────────────────────────── */}
        <form onSubmit={saveProfile} className="mt-8 border border-line bg-surface p-5">
          <h2 className="t-h3">Your details</h2>
          <div className="mt-4 space-y-4">
            <Field label="Full name" htmlFor="s-name">
              <Input id="s-name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
            </Field>
            <Field label="Phone" htmlFor="s-phone" hint="Used only if an organiser needs to reach you about your booking.">
              <Input id="s-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" className="t-mono" />
            </Field>
            <Field label="Short bio" htmlFor="s-bio">
              <textarea
                id="s-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={200}
                className="field h-[72px] w-full resize-none text-[14px]"
              />
            </Field>
          </div>
          <Button type="submit" variant="primary" className="mt-5" disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save changes"}
          </Button>
          <p className="t-small mt-3 text-muted">
            Your email address is how you sign in and can't be changed here — write to
            support if you need to move accounts.
          </p>
        </form>

        {/* ── Language ───────────────────────────────────────────── */}
        <section className="mt-6 border border-line bg-surface p-5">
          <h2 className="t-h3">Language</h2>
          <div className="mt-3 flex gap-2">
            {(["en", "kn"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={
                  lang === l
                    ? "border border-paper bg-surface-2 px-4 py-2 text-[14px] text-paper"
                    : "border border-line px-4 py-2 text-[14px] text-muted transition-colors hover:text-paper"
                }
              >
                {l === "en" ? "English" : "ಕನ್ನಡ"}
              </button>
            ))}
          </div>
        </section>

        {/* ── Notifications ──────────────────────────────────────── */}
        <section className="mt-6 border border-line bg-surface p-5">
          <h2 className="t-h3">Email notifications</h2>
          {prefs ? (
            <ul className="mt-3 divide-y divide-line">
              {PREF_ROWS.map(({ key, label, hint }) => (
                <li key={key} className="flex items-start justify-between gap-4 py-3">
                  <span className="min-w-0">
                    <Label htmlFor={`pref-${key}`} className="block">{label}</Label>
                    <span className="t-small block text-muted">{hint}</span>
                  </span>
                  <input
                    id={`pref-${key}`}
                    type="checkbox"
                    checked={Boolean(prefs[key])}
                    onChange={() => togglePref(key)}
                    className="mt-1 size-4 shrink-0 accent-[#D4380D]"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-small mt-3 text-muted">Loading your preferences…</p>
          )}
        </section>

        {/* ── Privacy & consent ──────────────────────────────────── */}
        <section className="mt-6 border border-line bg-surface p-5">
          <h2 className="t-h3 flex items-center gap-2">
            <ShieldCheck className="size-5 text-signal" aria-hidden="true" /> Privacy &amp; consent
          </h2>
          <ul className="t-small mt-3 space-y-2 text-paper/85">
            <li>
              <strong>Terms &amp; Privacy Policy:</strong>{" "}
              {consents.terms_privacy?.granted
                ? `agreed ${new Date(consents.terms_privacy.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} (version ${consents.terms_privacy.version})`
                : "agreed when you signed in"}
              {" · "}
              <Link to="/terms" className="link-underline text-paper">Terms</Link>{" · "}
              <Link to="/privacy" className="link-underline text-paper">Privacy</Link>
            </li>
            <li>
              <strong>Marketing email:</strong>{" "}
              {prefs?.marketing_email ? "on — change it under Email notifications above" : "off (the default)"}
            </li>
            <li>
              <strong>Cookies:</strong>{" "}
              {cookieChoice
                ? cookieChoice.preferences ? "necessary + remember language & theme" : "necessary only"
                : "not chosen yet"}
              {" · "}
              <button type="button" onClick={openCookieSettings} className="link-underline text-paper">Change</button>
              {" · "}
              <Link to="/cookies" className="link-underline text-paper">Cookie policy</Link>
            </li>
          </ul>
        </section>

        {/* ── Your data ──────────────────────────────────────────── */}
        <section className="mt-6 border border-line bg-surface p-5">
          <h2 className="t-h3">Your data</h2>
          <p className="t-small mt-2 text-muted">
            Under India's Digital Personal Data Protection Act you can take a copy of
            everything we hold about you, or have your account erased.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={exportData}>
              <Download className="size-4" aria-hidden="true" />
              Download my data
            </Button>
            <Button onClick={signOut}>
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </section>

        {/* ── Danger ─────────────────────────────────────────────── */}
        <section className="mt-6 border border-fault/40 bg-surface p-5">
          <h2 className="t-h3 text-fault">Delete your account</h2>
          <p className="t-small mt-2 text-muted">
            We'll show you exactly what is erased and what we must keep, check nothing is pending, and
            confirm with a code sent to your email. Past ticket and payment records stay, without your
            name or contact details, because tax law requires them. This can't be undone.
          </p>
          <Button className="mt-4" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" aria-hidden="true" />
            Delete account
          </Button>
        </section>
      </div>

      <DeleteAccountFlow
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        email={currentUser?.email ?? ""}
        onExport={exportData}
        onDeleted={afterDeleted}
      />
    </PublicShell>
  );
}
