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
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useStore } from "@/store/app-store";
import { requestOtp, verifyOtp, updateMe, logout as apiLogout } from "@/lib/api";
import type { Role } from "@/data/fixtures";

type Outcome = "authed" | "guest";

interface AuthOptions {
  allowGuest?: boolean;
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
  const [title, setTitle] = useState("Sign in to Naada");
  const [step, setStep] = useState<"email" | "code" | "role" | "profile">("email");
  const [email, setEmail] = useState("");
  const [debugOtp, setDebugOtp] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [pendingRole, setPendingRole] = useState<Role>("listener");
  const optionsRef = useRef<AuthOptions>({});

  const openSheet = useCallback((nextTitle: string, options: AuthOptions = {}) => {
    optionsRef.current = options;
    setTitle(nextTitle);
    setStep("email");
    setEmail("");
    setDebugOtp(undefined);
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
    const apiRoleMap: Record<Role, string> = {
      listener: "listener", artist: "artist", host: "venue_owner", admin: "admin", out: "listener",
    };
    try {
      await updateMe({ role: apiRoleMap[chosenRole] });
    } catch {
      // Non-fatal — proceed with local role
    } finally {
      setLoading(false);
    }
    setPendingRole(chosenRole);
    setStep("profile");
  }, []);

  const handleProfileDone = useCallback(async (name: string, bio: string) => {
    setLoading(true);
    try {
      const updated = await updateMe({ full_name: name, bio });
      setCurrentUser({
        id: updated.id,
        email: updated.email,
        full_name: updated.full_name,
        role: updated.role,
      });
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
    finish("authed", pendingRole);
  }, [finish, pendingRole, setCurrentUser]);

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
      if (user.is_new_user) {
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
    : step === "role" ? "How are you using Naada?"
    : "Set up your profile";

  return (
    <AuthContext.Provider value={api}>
      {children}
      <Modal open={open} onClose={() => setOpen(false)} title={modalTitle}>
        {step === "profile" ? (
          <ProfileStep
            role={pendingRole}
            loading={loading}
            onSubmit={handleProfileDone}
            onSkip={() => finish("authed", pendingRole)}
          />
        ) : step === "role" ? (
          <RoleStep loading={loading} onSelect={handleRoleSelect} />
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
  { role: "artist",   label: "I'm an artist",        description: "Get booked for gigs and receive payments via Naada", emoji: "🎸" },
  { role: "host",     label: "I host events",         description: "Create events, hire artists, sell tickets",         emoji: "🎪" },
];

function RoleStep({ loading, onSelect }: { loading: boolean; onSelect: (role: Role) => void }) {
  return (
    <div>
      <p className="t-small text-muted mb-4">
        Tell us how you'd like to use Naada — you can change this later in settings.
      </p>
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

function ProfileStep({
  role,
  loading,
  onSubmit,
  onSkip,
}: {
  role: Role;
  loading: boolean;
  onSubmit: (name: string, bio: string) => void;
  onSkip: () => void;
}) {
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const showBio = role === "artist" || role === "host";

  const placeholder =
    role === "artist"
      ? "Genre, city, instruments you play…"
      : role === "host"
      ? "Venue type, city, typical events you host…"
      : "";

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(name.trim(), bio.trim()); }}>
      <p className="t-small text-muted mb-4">
        {role === "artist"
          ? "Let venue hosts know who you are so they can book you with confidence."
          : role === "host"
          ? "Help artists and fans find and trust your venue."
          : "A display name helps personalise your experience."}
      </p>

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

      {showBio && (
        <div className="mt-4">
          <Label htmlFor="p-bio">Short bio</Label>
          <textarea
            id="p-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder={placeholder}
            maxLength={200}
            className="field mt-1 h-[72px] w-full resize-none text-[14px]"
          />
          <p className="t-micro mt-1 text-muted">{bio.length}/200</p>
        </div>
      )}

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

export function useAuthSheet(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthSheet must be used inside <AuthSheetProvider>");
  return ctx;
}
