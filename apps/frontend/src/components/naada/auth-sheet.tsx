import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useStore } from "@/store/app-store";
import {
  requestOtp, verifyOtp, updateMe, setUserRole, logout as apiLogout,
  getMyArtistProfile, updateArtist, createVenue, getCities, getGenres, post,
} from "@/lib/api";
import type { ApiArtist, ApiCity, ApiGenre } from "@/lib/api";
import type { Role } from "@/data/fixtures";

type Outcome = "authed" | "guest";

interface AuthOptions {
  allowGuest?: boolean;
  /** For a brand-new account, skip "How are you using Showzy?" and use this role. */
  preferRole?: "listener" | "artist" | "host";
  onDone?: (outcome: Outcome, role: Role) => void;
}

interface AuthApi {
  open: (title: string, options?: AuthOptions) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthApi | null>(null);

const ROLE_MAP: Record<string, Role> = {
  listener: "listener",
  artist: "artist",
  venue_owner: "host",
  admin: "admin",
};

export function AuthSheetProvider({ children }: { children: ReactNode }) {
  const { setRole, role, toast, hydrateFromApi, setCurrentUser } = useStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Sign in to Showzy");
  const [step, setStep] = useState<
    "email" | "code" | "role" | "profile" | "artistRequired" | "hostRequired"
  >("email");
  const [email, setEmail] = useState("");
  const [debugOtp, setDebugOtp] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [stepError, setStepError] = useState("");
  const [pendingRole, setPendingRole] = useState<Role>("listener");
  const optionsRef = useRef<AuthOptions>({});

  const openSheet = useCallback((nextTitle: string, options: AuthOptions = {}) => {
    optionsRef.current = options;
    setTitle(nextTitle);
    setStep("email");
    setEmail("");
    setDebugOtp(undefined);
    setStepError("");
    setOpen(true);
  }, []);

  const finish = useCallback(
    (outcome: Outcome, nextRole: Role) => {
      setOpen(false);
      if (outcome === "authed") {
        setRole(nextRole);
        hydrateFromApi().catch(console.error);
      }
      const cb = optionsRef.current.onDone;
      if (cb) setTimeout(() => cb(outcome, nextRole), 0);
    },
    [setRole, hydrateFromApi],
  );

  const handleRoleSelect = useCallback(async (chosenRole: Role) => {
    setLoading(true);
    setStepError("");
    // RoleStep only ever offers these three — "listener" here means
    // attendee, the backend's actual name for that role.
    const apiRoleMap: Record<"listener" | "artist" | "host", "attendee" | "artist" | "venue_owner"> = {
      listener: "attendee", artist: "artist", host: "venue_owner",
    };
    try {
      await setUserRole(apiRoleMap[chosenRole as "listener" | "artist" | "host"]);
    } catch {
      setLoading(false);
      setStepError("Couldn't save your role — check your connection and try again.");
      return;
    }
    setLoading(false);
    setPendingRole(chosenRole);
    setStep(
      chosenRole === "artist" ? "artistRequired"
      : chosenRole === "host" ? "hostRequired"
      : "profile",
    );
  }, []);

  // Listener only — artist/host have their own required-fields steps below,
  // since a display name is the only thing a buyer's account actually needs.
  const handleProfileDone = useCallback(async (name: string) => {
    setLoading(true);
    try {
      const updated = await updateMe({ full_name: name });
      setCurrentUser({
        id: updated.id,
        email: updated.email,
        full_name: updated.full_name,
        role: updated.role,
      });
    } catch {
      // Non-fatal — a display name is a nicety here, not a gate.
    } finally {
      setLoading(false);
    }
    finish("authed", pendingRole);
  }, [finish, pendingRole, setCurrentUser]);

  /**
   * Selecting "artist" during signup already created a bare `Artist` row
   * server-side (see `MeView.perform_update`) with a throwaway stage name —
   * that's what made "finish setup later" so easy to skip before: the row
   * existed, so the dashboard never had a genuinely-missing profile to nag
   * about. This step collects the fields a booking actually needs — stage
   * name, city, genres, bio — and writes them for real before the artist
   * ever sees their dashboard, no separate "complete your profile" step
   * involved.
   */
  const handleArtistRequiredSubmit = useCallback(
    async (data: { name: string; stageName: string; city: string; genres: number[]; bio: string }) => {
      setLoading(true);
      setStepError("");
      try {
        const updatedUser = await updateMe({ full_name: data.name });
        setCurrentUser({
          id: updatedUser.id, email: updatedUser.email,
          full_name: updatedUser.full_name, role: updatedUser.role,
        });

        let artistId: string;
        try {
          artistId = (await getMyArtistProfile()).id;
        } catch {
          artistId = (await post<ApiArtist>("/artists/", { stage_name: data.stageName })).id;
        }
        await updateArtist(artistId, {
          stage_name: data.stageName, bio: data.bio, city: data.city, genres: data.genres,
        });
      } catch {
        setStepError("Couldn't save your profile — check your connection and try again.");
        setLoading(false);
        return;
      }
      setLoading(false);
      finish("authed", pendingRole);
    },
    [finish, pendingRole, setCurrentUser],
  );

  /**
   * Nothing was ever created when a new user picked "host" — no Venue, no
   * way to reach one from the dashboard afterwards. This is the only place
   * in the app a host's venue gets created; without it they'd land on their
   * console with no venue and no path to make one.
   */
  const handleHostRequiredSubmit = useCallback(
    async (data: { name: string; venueName: string; address: string; city: string; capacity: number }) => {
      setLoading(true);
      setStepError("");
      try {
        const updatedUser = await updateMe({ full_name: data.name });
        setCurrentUser({
          id: updatedUser.id, email: updatedUser.email,
          full_name: updatedUser.full_name, role: updatedUser.role,
        });
        await createVenue({
          name: data.venueName, address_line1: data.address, city: data.city, capacity: data.capacity,
        });
      } catch {
        setStepError("Couldn't save your venue — check your connection and try again.");
        setLoading(false);
        return;
      }
      setLoading(false);
      finish("authed", pendingRole);
    },
    [finish, pendingRole, setCurrentUser],
  );

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await requestOtp(email.trim());
      setDebugOtp(res?.debug_otp);
      setStep("code");
      if (res?.debug_otp) {
        toast(`Dev mode — OTP: ${res.debug_otp}`, "default");
      } else {
        toast("Code sent — check your email");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send code";
      toast(msg, "fault");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (otp: string) => {
    setLoading(true);
    try {
      const { user } = await verifyOtp(email.trim(), otp);
      setCurrentUser({ id: user.id, email: user.email, full_name: user.full_name, role: user.role });
      const nextRole: Role = ROLE_MAP[user.role] ?? "listener";
      const preferred = optionsRef.current.preferRole;
      if (user.is_new_user && preferred) {
        setPendingRole(nextRole);
        await handleRoleSelect(preferred);
      } else if (user.is_new_user) {
        setPendingRole(nextRole);
        setStep("role");
      } else {
        finish("authed", nextRole);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid code — try again";
      toast(msg, "fault");
    } finally {
      setLoading(false);
    }
  };

  const doLogout = useCallback(() => {
    apiLogout();
    setRole("out");
    setCurrentUser(null);
  }, [setRole, setCurrentUser]);

  const api = useMemo<AuthApi>(
    () => ({ open: openSheet, logout: doLogout }),
    [openSheet, doLogout],
  );

  const allowGuest = optionsRef.current.allowGuest ?? false;

  const modalTitle =
    step === "email" ? title
    : step === "code" ? "Enter your code"
    : step === "role" ? "How are you using Showzy?"
    : step === "artistRequired" ? "Set up your artist profile"
    : step === "hostRequired" ? "Add your venue"
    : "Set up your profile";

  return (
    <AuthContext.Provider value={api}>
      {children}
      <Modal open={open} onClose={() => setOpen(false)} title={modalTitle}>
        {step === "artistRequired" ? (
          <ArtistRequiredStep loading={loading} error={stepError} onSubmit={handleArtistRequiredSubmit} />
        ) : step === "hostRequired" ? (
          <HostRequiredStep loading={loading} error={stepError} onSubmit={handleHostRequiredSubmit} />
        ) : step === "profile" ? (
          <ProfileStep
            loading={loading}
            onSubmit={handleProfileDone}
            onSkip={() => finish("authed", pendingRole)}
          />
        ) : step === "role" ? (
          <RoleStep loading={loading} error={stepError} onSelect={handleRoleSelect} />
        ) : step === "email" ? (
          <form onSubmit={handleSendOtp}>
            <p className="t-small text-muted mb-4">
              Enter your email to sign in. No account yet? One will be created for you.
            </p>
            <Label htmlFor="auth-email">Email address</Label>
            <Input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            <Button
              type="submit"
              variant="primary"
              full
              className="mt-5"
              disabled={loading}
            >
              {loading ? "Sending…" : "Continue with email"}
            </Button>

            {allowGuest && (
              <>
                <div className="my-5 flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-line" />
                  <span className="t-micro">or</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
                <Button full onClick={() => finish("guest", role === "out" ? "listener" : role)}>
                  Continue as guest
                </Button>
              </>
            )}
          </form>
        ) : (
          <CodeStep
            email={email}
            debugOtp={debugOtp}
            loading={loading}
            onBack={() => setStep("email")}
            onVerified={handleVerifyOtp}
          />
        )}
      </Modal>
    </AuthContext.Provider>
  );
}

const ROLE_OPTIONS: { role: Role; label: string; description: string; emoji: string }[] = [
  { role: "listener", label: "I'm here to watch",   description: "Browse events and book tickets near you",             emoji: "🎵" },
  { role: "artist",   label: "I'm an artist",        description: "Get booked for gigs and receive payments via Showzy", emoji: "🎸" },
  { role: "host",     label: "I host events",         description: "Create events, hire artists, sell tickets",         emoji: "🎪" },
];

function RoleStep({
  loading, error, onSelect,
}: {
  loading: boolean; error: string; onSelect: (role: Role) => void;
}) {
  return (
    <div>
      <p className="t-small text-muted mb-4">
        Tell us how you'd like to use Showzy — you can change this later in settings.
      </p>
      {error && (
        <p className="t-small mb-4 text-fault" role="alert">{error}</p>
      )}
      <div className="flex flex-col gap-3">
        {ROLE_OPTIONS.map(({ role, label, description, emoji }) => (
          <button
            key={role}
            type="button"
            disabled={loading}
            onClick={() => onSelect(role)}
            className="flex items-start gap-4 border border-line p-4 text-left transition-colors hover:border-signal hover:bg-surface-2 disabled:opacity-50"
            style={{ borderRadius: 6, background: "transparent", fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer" }}
          >
            <span style={{ fontSize: 28, lineHeight: 1 }}>{emoji}</span>
            <span>
              <span className="block text-[15px] font-semibold text-paper">{label}</span>
              <span className="t-small block text-muted mt-0.5">{description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CodeStep({
  email,
  debugOtp,
  loading,
  onBack,
  onVerified,
}: {
  email: string;
  debugOtp?: string;
  loading: boolean;
  onBack: () => void;
  onVerified: (otp: string) => void;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [seconds, setSeconds] = useState(59);
  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(6).fill(null));

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Auto-fill if debugOtp is available
  useEffect(() => {
    if (debugOtp && debugOtp.length === 6) {
      const filled = debugOtp.split("");
      setDigits(filled);
    }
  }, [debugOtp]);

  const code = digits.join("");

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
    if (next.every((d) => d) && next.join("").length === 6) {
      setTimeout(() => onVerified(next.join("")), 80);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[index]) {
        const next = [...digits];
        next[index] = "";
        setDigits(next);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
        const next = [...digits];
        next[index - 1] = "";
        setDigits(next);
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const next = Array(6).fill("");
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();
    if (pasted.length === 6) setTimeout(() => onVerified(pasted), 80);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === 6) onVerified(code);
      }}
    >
      <p className="t-small text-muted">
        Sent to <span className="t-mono text-paper">{email}</span>
      </p>

      {debugOtp && (
        <div className="mt-3 rounded border border-dashed border-signal/40 bg-signal/5 px-3 py-2">
          <p className="t-mono text-[12px] text-signal">
            Dev mode — your code is <strong>{debugOtp}</strong>
          </p>
        </div>
      )}

      <div className="mt-4 flex gap-2" role="group" aria-label="6-digit verification code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={2}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            aria-label={`Digit ${i + 1}`}
            className="t-mono field h-14 flex-1 min-w-0 text-center text-[22px] p-0"
            style={{ caretColor: "var(--color-signal)" }}
          />
        ))}
      </div>

      <p className="t-small mt-4 text-muted">
        {seconds > 0 ? (
          <>Resend in <span className="t-mono">0:{String(seconds).padStart(2, "0")}</span></>
        ) : (
          <button type="button" className="underline hover:text-paper transition-colors" onClick={onBack}>
            Didn't get it? Go back and try again.
          </button>
        )}
      </p>

      <div className="mt-5 flex gap-2">
        <Button type="button" onClick={onBack} disabled={loading}>
          Back
        </Button>
        <Button
          type="submit"
          variant="primary"
          full
          disabled={code.length !== 6 || loading}
        >
          {loading ? "Verifying…" : "Verify code"}
        </Button>
      </div>
    </form>
  );
}

/** Listeners only — a display name is the only thing a buyer's account
 * needs, so this stays a one-field, skippable nicety. Artists and hosts
 * have their own required-fields steps below instead. */
function ProfileStep({
  loading,
  onSubmit,
  onSkip,
}: {
  loading: boolean;
  onSubmit: (name: string) => void;
  onSkip: () => void;
}) {
  const [name, setName] = useState("");

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(name.trim()); }}>
      <p className="t-small text-muted mb-4">A display name helps personalise your experience.</p>

      <Label htmlFor="p-name">Your name</Label>
      <Input
        id="p-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Full name"
        autoFocus
        required
        className="mt-1"
      />

      <Button
        type="submit"
        variant="primary"
        full
        className="mt-5"
        disabled={loading || !name.trim()}
      >
        {loading ? "Saving…" : "Complete setup"}
      </Button>
      <button
        type="button"
        onClick={onSkip}
        className="mt-3 w-full text-center t-small text-muted transition-colors hover:text-paper"
      >
        Skip for now
      </button>
    </form>
  );
}

/** A single-choice chip list backed by reference data, shared by the genre
 * multi-select below — fetches once on mount, shows nothing if it fails
 * (the picker just becomes empty rather than blocking signup on it). */
function useReferenceList<T>(loader: () => Promise<T[]>): T[] {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    let alive = true;
    loader().then((data) => { if (alive) setItems(data); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return items;
}

/**
 * Required fields for a working artist profile — stage name, city, at least
 * one genre, and a real bio. Selecting "artist" already created a bare
 * `Artist` row server-side with a throwaway stage name; this is what
 * actually fills it in, before the artist ever reaches their dashboard.
 */
function ArtistRequiredStep({
  loading,
  error,
  onSubmit,
}: {
  loading: boolean;
  error: string;
  onSubmit: (data: { name: string; stageName: string; city: string; genres: number[]; bio: string }) => void;
}) {
  const [name, setName] = useState("");
  const [stageName, setStageName] = useState("");
  const [city, setCity] = useState("");
  const [genres, setGenres] = useState<number[]>([]);
  const [genreToAdd, setGenreToAdd] = useState("");
  const [bio, setBio] = useState("");

  const cities = useReferenceList<ApiCity>(getCities);
  const allGenres = useReferenceList<ApiGenre>(getGenres);
  const unusedGenres = allGenres.filter((g) => !genres.includes(g.id));
  const genreName = (id: number) => allGenres.find((g) => g.id === id)?.name;

  const bioOk = bio.trim().length >= 10;
  const canSubmit = name.trim() && stageName.trim() && city && genres.length > 0 && bioOk && !loading;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit({ name: name.trim(), stageName: stageName.trim(), city, genres, bio: bio.trim() });
      }}
    >
      <p className="t-small text-muted mb-4">
        Venue hosts book off this — the more real it is, the better the fit.
      </p>

      <Field label="Your name" htmlFor="ar-name">
        <Input id="ar-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </Field>

      <Field label="Stage / performing name" htmlFor="ar-stage" className="mt-4">
        <Input id="ar-stage" value={stageName} onChange={(e) => setStageName(e.target.value)} required />
      </Field>

      <Field label="City" htmlFor="ar-city" className="mt-4">
        <Select
          id="ar-city"
          value={city}
          onChange={setCity}
          options={[
            { value: "", label: cities.length === 0 ? "Loading cities…" : "Pick your city…" },
            ...cities.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </Field>

      <div className="mt-4">
        <Label>Genres — pick at least one</Label>
        {genres.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {genres.map((id) => (
              <span key={id} className="flex items-center gap-2 border border-line bg-surface px-3 py-1.5 text-[14px]">
                {genreName(id) ?? `Genre ${id}`}
                <button
                  type="button"
                  onClick={() => setGenres(genres.filter((x) => x !== id))}
                  aria-label={`Remove ${genreName(id)}`}
                  className="text-muted transition-colors hover:text-fault"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <select
            aria-label="Add a genre"
            value={genreToAdd}
            disabled={allGenres.length === 0}
            onChange={(e) => setGenreToAdd(e.target.value)}
            className="field flex-1"
          >
            <option value="">{allGenres.length === 0 ? "Loading genres…" : "Add a genre…"}</option>
            {unusedGenres.map((g) => (
              <option key={g.id} value={String(g.id)} className="bg-surface">{g.name}</option>
            ))}
          </select>
          <Button
            type="button"
            disabled={!genreToAdd}
            onClick={() => { setGenres([...genres, Number(genreToAdd)]); setGenreToAdd(""); }}
          >
            Add
          </Button>
        </div>
      </div>

      <Field label="Bio" htmlFor="ar-bio" className="mt-4" hint={`${bio.length}/500 · a sentence or two is enough`}>
        <Textarea
          id="ar-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="What you play, your influences, how long you've been performing…"
          maxLength={500}
          className="h-[80px] resize-none"
        />
      </Field>

      {error && <p className="t-small mt-3 text-fault" role="alert">{error}</p>}

      <Button type="submit" variant="primary" full className="mt-5" disabled={!canSubmit}>
        {loading ? "Saving…" : "Finish setting up"}
      </Button>
    </form>
  );
}

/**
 * Required fields for a working venue — name, address, city, capacity.
 * Nothing was ever created for a host before this; this is where their
 * `Venue` row actually gets made, before they reach their console.
 */
function HostRequiredStep({
  loading,
  error,
  onSubmit,
}: {
  loading: boolean;
  error: string;
  onSubmit: (data: { name: string; venueName: string; address: string; city: string; capacity: number }) => void;
}) {
  const [name, setName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [capacity, setCapacity] = useState("");

  const cities = useReferenceList<ApiCity>(getCities);

  const capacityNum = Number(capacity);
  const canSubmit =
    name.trim() && venueName.trim() && address.trim() && city &&
    capacity.trim() && capacityNum > 0 && !loading;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) {
          onSubmit({ name: name.trim(), venueName: venueName.trim(), address: address.trim(), city, capacity: capacityNum });
        }
      }}
    >
      <p className="t-small text-muted mb-4">
        Artists and fans need to know where you are and how big the room is before your
        first event can go live.
      </p>

      <Field label="Your name" htmlFor="hr-name">
        <Input id="hr-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </Field>

      <Field label="Venue name" htmlFor="hr-venue" className="mt-4">
        <Input id="hr-venue" value={venueName} onChange={(e) => setVenueName(e.target.value)} required />
      </Field>

      <Field label="Address" htmlFor="hr-address" className="mt-4">
        <Input id="hr-address" value={address} onChange={(e) => setAddress(e.target.value)} required />
      </Field>

      <Field label="City" htmlFor="hr-city" className="mt-4">
        <Select
          id="hr-city"
          value={city}
          onChange={setCity}
          options={[
            { value: "", label: cities.length === 0 ? "Loading cities…" : "Pick your city…" },
            ...cities.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </Field>

      <Field label="Capacity" htmlFor="hr-capacity" className="mt-4" hint="How many people fit, roughly">
        <Input
          id="hr-capacity"
          type="number"
          inputMode="numeric"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          required
        />
      </Field>

      {error && <p className="t-small mt-3 text-fault" role="alert">{error}</p>}

      <Button type="submit" variant="primary" full className="mt-5" disabled={!canSubmit}>
        {loading ? "Saving…" : "Finish setting up"}
      </Button>
    </form>
  );
}

export function useAuthSheet(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthSheet must be used inside <AuthSheetProvider>");
  return ctx;
}
