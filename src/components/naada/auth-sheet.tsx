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
import type { Role } from "@/data/fixtures";

/**
 * Section 7.4. Fake auth: any six digits are accepted, 123456 is shown as the
 * placeholder. No role selection here, ever — role is a capability unlocked
 * later, not a signup choice. Only fires when the user tries to do something.
 */

type Outcome = "authed" | "guest";

interface AuthOptions {
  allowGuest?: boolean;
  onDone?: (outcome: Outcome, role: Role) => void;
}

interface AuthApi {
  open: (title: string, options?: AuthOptions) => void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthSheetProvider({ children }: { children: ReactNode }) {
  const { setRole, role, toast, users } = useStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Log in to book");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState(users.listener.phone.replace("+91 ", ""));
  const optionsRef = useRef<AuthOptions>({});

  const openSheet = useCallback((nextTitle: string, options: AuthOptions = {}) => {
    optionsRef.current = options;
    setTitle(nextTitle);
    setStep("phone");
    setOpen(true);
  }, []);

  const finish = (outcome: Outcome, phone: string) => {
    setOpen(false);
    let nextRole: Role = role === "out" ? "listener" : role;
    if (outcome === "authed") {
      const last10 = (s: string) => s.replace(/\D/g, "").slice(-10);
      const typed = last10(phone);
      if (typed === last10(users.host.phone)) nextRole = "host";
      else if (typed === last10(users.artist.phone)) nextRole = "artist";
      else nextRole = "listener";
      setRole(nextRole);
    }
    const cb = optionsRef.current.onDone;
    if (cb) setTimeout(() => cb(outcome, nextRole), 0);
  };

  const api = useMemo<AuthApi>(() => ({ open: openSheet }), [openSheet]);
  const allowGuest = optionsRef.current.allowGuest ?? false;

  return (
    <AuthContext.Provider value={api}>
      {children}
      <Modal open={open} onClose={() => setOpen(false)} title={step === "phone" ? title : "Enter the 6-digit code"}>
        {step === "phone" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStep("code");
              toast("Code sent. Any six digits work in this prototype.");
            }}
          >
            <Label htmlFor="auth-phone">Phone number</Label>
            <div className="flex items-stretch gap-2">
              <span className="t-mono grid min-w-[52px] place-items-center border border-line bg-ink px-3 text-[14px] text-muted">
                +91
              </span>
              <Input
                id="auth-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="t-mono flex-1"
                required
              />
            </div>

            <Button type="submit" variant="primary" full className="mt-5">
              Send code
            </Button>

            {allowGuest && (
              <>
                <div className="my-5 flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-line" />
                  <span className="t-micro">or</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
                <Button full onClick={() => finish("guest")}>
                  Continue as guest
                </Button>
              </>
            )}
          </form>
        ) : (
          <CodeStep
            phone={phone}
            onBack={() => setStep("phone")}
            onVerified={() => finish("authed", phone)}
          />
        )}
      </Modal>
    </AuthContext.Provider>
  );
}

function CodeStep({
  phone,
  onBack,
  onVerified,
}: {
  phone: string;
  onBack: () => void;
  onVerified: () => void;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [seconds, setSeconds] = useState(24);
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
      setTimeout(onVerified, 80);
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
    if (pasted.length === 6) setTimeout(onVerified, 80);
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (code.length === 6) onVerified(); }}>
      <p className="t-small text-muted">
        Sent to <span className="t-mono text-paper">+91 {phone}</span>
      </p>

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
          <>
            Resend in <span className="t-mono">0:{String(seconds).padStart(2, "0")}</span>
          </>
        ) : (
          "Didn't get it? Resend the code."
        )}
      </p>

      <div className="mt-5 flex gap-2">
        <Button type="button" onClick={onBack}>Back</Button>
        <Button type="submit" variant="primary" full disabled={code.length !== 6}>
          Verify
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
