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
import { requestOtp, verifyOtp, logout as apiLogout } from "@/lib/api";
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
  const { setRole, role, toast, hydrateFromApi } = useStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Log in to continue");
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const optionsRef = useRef<AuthOptions>({});

  const openSheet = useCallback((nextTitle: string, options: AuthOptions = {}) => {
    optionsRef.current = options;
    setTitle(nextTitle);
    setStep("email");
    setEmail("");
    setOpen(true);
  }, []);

  const finish = useCallback(
    (outcome: Outcome, nextRole: Role) => {
      setOpen(false);
      if (outcome === "authed") {
        setRole(nextRole);
        // Fetch real data from API and hydrate store
        hydrateFromApi().catch(console.error);
      }
      const cb = optionsRef.current.onDone;
      if (cb) setTimeout(() => cb(outcome, nextRole), 0);
    },
    [setRole, hydrateFromApi],
  );

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await requestOtp(email.trim());
      setStep("code");
      toast("OTP sent to " + email.trim());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send OTP";
      toast(msg, "fault");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (otp: string) => {
    setLoading(true);
    try {
      const { user } = await verifyOtp(email.trim(), otp);
      const nextRole: Role = ROLE_MAP[user.role] ?? "listener";
      finish("authed", nextRole);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid OTP";
      toast(msg, "fault");
    } finally {
      setLoading(false);
    }
  };

  const doLogout = useCallback(() => {
    apiLogout();
    setRole("out");
  }, [setRole]);

  const api = useMemo<AuthApi>(
    () => ({ open: openSheet, logout: doLogout }),
    [openSheet, doLogout],
  );

  const allowGuest = optionsRef.current.allowGuest ?? false;

  return (
    <AuthContext.Provider value={api}>
      {children}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={step === "email" ? title : "Enter the 6-digit code"}
      >
        {step === "email" ? (
          <form onSubmit={handleSendOtp}>
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
              {loading ? "Sending…" : "Send code"}
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
            loading={loading}
            onBack={() => setStep("email")}
            onVerified={handleVerifyOtp}
          />
        )}
      </Modal>
    </AuthContext.Provider>
  );
}

function CodeStep({
  email,
  loading,
  onBack,
  onVerified,
}: {
  email: string;
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

      <div className="mt-4 flex gap-2" role="group" aria-label="6-digit verification code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
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
          <>
            Resend in{" "}
            <span className="t-mono">
              0:{String(seconds).padStart(2, "0")}
            </span>
          </>
        ) : (
          "Didn't get it? Go back and resend."
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
          {loading ? "Verifying…" : "Verify"}
        </Button>
      </div>
    </form>
  );
}

export function useAuthSheet(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthSheet must be used inside <AuthSheetProvider>");
  return ctx;
}
