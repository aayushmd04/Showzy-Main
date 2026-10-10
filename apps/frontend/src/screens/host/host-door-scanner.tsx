import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowLeft, Camera, CameraOff, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/store/app-store";
import { scanTicket, getEventAttendees, type ApiAttendee } from "@/lib/api";
import { cn } from "@/lib/utils";
import { NotFoundScreen } from "../not-found";

/**
 * Full screen, no shell. This runs on a borrowed phone at a dark door with a
 * queue behind it, so results have to be readable at a glance and at arm's
 * length — colour, size and sound all say the same thing, because a stressed
 * volunteer reads none of the words.
 *
 * Scans queue locally when the venue wifi drops. A door that stops working on
 * a network hiccup is worse than a printed list.
 */

type Overlay =
  | { kind: "valid"; name: string; tier: string; code: string }
  | { kind: "duplicate"; code: string; at: string }
  | { kind: "invalid"; code: string; detail?: string }
  | { kind: "queued"; code: string }
  | null;

const QUEUE_KEY = "naada_door_queue";
const RESULT_MS = 1600;

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

function getDetectorCtor(): BarcodeDetectorCtor | null {
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;
}

function readQueue(): string[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(codes: string[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(codes));
  } catch {
    /* private mode — the scan still happened, we just can't remember it */
  }
}

/** Two very different sounds: nobody looks up at a subtle difference. */
function beep(ok: boolean) {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = ok ? 880 : 220;
    osc.type = ok ? "sine" : "square";
    gain.gain.setValueAtTime(0.16, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (ok ? 0.16 : 0.42));
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.18 : 0.45));
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    /* audio is a bonus, never a requirement */
  }
}

function buzz(ok: boolean) {
  try {
    navigator.vibrate?.(ok ? 40 : [90, 60, 90]);
  } catch {
    /* not supported */
  }
}

export function HostDoorScannerScreen() {
  const { id = "" } = useParams();
  const { eventById, capacityOf, toast } = useStore();

  const [overlay, setOverlay] = useState<Overlay>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [queued, setQueued] = useState<string[]>(() => readQueue());
  const [admitted, setAdmitted] = useState(0);
  const [search, setSearch] = useState("");
  /* The real door list, not the store's `tickets` — those are the signed-in
     user's own, so searching for a guest never matched anything. Fetched once
     and then kept current locally, because the whole point of this screen is
     that it keeps working when the network doesn't. */
  const [doorList, setDoorList] = useState<ApiAttendee[]>([]);
  const [doorListError, setDoorListError] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const reduce = useReducedMotion();

  const event = eventById(id);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getEventAttendees(id)
      .then((r) => { if (!cancelled) { setDoorList(r.results); setDoorListError(false); } })
      .catch(() => { if (!cancelled) setDoorListError(true); });
    return () => { cancelled = true; };
  }, [id]);

  const show = useCallback((next: Overlay) => {
    setOverlay(next);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setOverlay(null), RESULT_MS);
  }, []);

  /** Send one code. Returns false when the network is the reason it failed. */
  const submit = useCallback(
    async (code: string): Promise<boolean> => {
      try {
        const res = await scanTicket(code);
        if (res.valid && res.ticket) {
          setAdmitted((n) => n + 1);
          // Mark them in locally rather than refetching. The door is the one
          // place where another round trip is the last thing you want, and it
          // is also where the network is worst — so the second scan of the
          // same badge has to read "already in" without asking the server.
          setDoorList((list) =>
            list.map((a) =>
              a.qr_data === code
                ? { ...a, status: "used", checked_in_at: new Date().toISOString() }
                : a,
            ),
          );
          beep(true);
          buzz(true);
          show({
            kind: "valid",
            name: res.ticket.holder_name || "Guest",
            tier: res.ticket.tier_name ?? "General",
            code: res.ticket.ticket_number,
          });
        } else {
          const already = /used|checked/i.test(res.detail ?? "");
          beep(false);
          buzz(false);
          show(
            already
              ? {
                  kind: "duplicate",
                  code: res.ticket?.ticket_number ?? code.slice(0, 8),
                  at: res.ticket?.checked_in_at
                    ? new Date(res.ticket.checked_in_at).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "earlier",
                }
              : {
                  kind: "invalid",
                  code: code.slice(0, 12),
                  detail: res.detail,
                },
          );
        }
        return true;
      } catch {
        return false;
      }
    },
    [show],
  );

  const handleCode = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed || busyRef.current) return;

      // The camera fires many times a second; one badge held up is one scan.
      const last = lastCodeRef.current;
      if (last && last.code === trimmed && Date.now() - last.at < 3000) return;
      lastCodeRef.current = { code: trimmed, at: Date.now() };

      busyRef.current = true;
      const sent = await submit(trimmed);
      if (!sent) {
        const next = [...readQueue(), trimmed];
        writeQueue(next);
        setQueued(next);
        beep(true);
        buzz(true);
        show({ kind: "queued", code: trimmed.slice(0, 12) });
      }
      window.setTimeout(() => {
        busyRef.current = false;
      }, 700);
    },
    [submit, show],
  );

  /** Drain whatever the door captured while the network was down. */
  const flushQueue = useCallback(async () => {
    const pending = readQueue();
    if (pending.length === 0) return;
    const left: string[] = [];
    for (const code of pending) {
      const sent = await submit(code);
      if (!sent) left.push(code);
    }
    writeQueue(left);
    setQueued(left);
    if (left.length < pending.length) {
      toast(`${pending.length - left.length} queued scan(s) synced`, "success");
    }
  }, [submit, toast]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void flushQueue();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [flushQueue]);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    const Detector = getDetectorCtor();
    if (!Detector) {
      setCameraError(
        "This browser can't read QR codes from the camera. Use the search box below — typing a name works just as well.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);

      const detector = new Detector({ formats: ["qr_code"] });
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;

      const tick = async () => {
        const video = videoRef.current;
        if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            try {
              const found = await detector.detect(canvas);
              if (found[0]?.rawValue) await handleCode(found[0].rawValue);
            } catch {
              /* a blurry frame is not an error */
            }
          }
        }
        rafRef.current = requestAnimationFrame(() => void tick());
      };
      rafRef.current = requestAnimationFrame(() => void tick());
    } catch (err) {
      const name = (err as DOMException)?.name;
      setCameraError(
        name === "NotAllowedError"
          ? "Camera access was blocked. Allow it in your browser settings, or use the search box below."
          : "Couldn't open the camera on this device. The search box below still works.",
      );
    }
  }, [handleCode]);

  useEffect(() => () => stopCamera(), [stopCamera]);
  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  if (!event) return <NotFoundScreen />;

  const capacity = capacityOf(event);
  const query = search.trim().toLowerCase();
  const matches = query
    ? doorList
        .filter((a) =>
          `${a.holder_name} ${a.ticket_number} ${a.seat_label}`.toLowerCase().includes(query),
        )
        .slice(0, 8)
    : [];

  const checkedIn = (event.checkedIn ?? 0) + admitted;

  return (
    <div className="relative min-h-dvh bg-ink">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <Link
          to={`/host/events/${event.id}`}
          className="flex min-h-11 items-center gap-2 text-[15px] text-muted transition-colors hover:text-paper"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
          <span className="max-w-[45vw] truncate">{event.name}</span>
        </Link>
        <span
          className={cn(
            "flex min-h-11 items-center gap-2 border px-3 font-mono text-[12px] uppercase tracking-[0.08em]",
            online ? "border-line text-muted" : "border-brass text-brass",
          )}
        >
          <span aria-hidden="true">●</span>
          {online ? "Online" : "Offline"}
        </span>
      </div>

      <div className="mx-auto w-full max-w-[560px] px-4 py-6">
        <p className="text-center font-mono text-[clamp(28px,9vw,44px)] font-medium leading-none">
          {checkedIn} / {capacity}
        </p>
        <p className="t-micro mt-2 text-center">checked in</p>

        {queued.length > 0 && (
          <p className="t-small mt-2 text-center text-brass">
            {queued.length} scan{queued.length === 1 ? "" : "s"} waiting to sync
            {online && " — syncing now"}
          </p>
        )}

        <div className="relative mt-6 aspect-[4/3] overflow-hidden border border-line bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className={cn("size-full object-cover", cameraOn ? "block" : "hidden")}
          />

          {cameraOn && (
            <>
              <div
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-[2px] bg-signal/80"
                style={{ animation: reduce ? undefined : "naada-scan 2.4s ease-in-out infinite" }}
              />
              <div
                aria-hidden="true"
                className="absolute left-1/2 top-1/2 size-[52%] -translate-x-1/2 -translate-y-1/2"
              >
                {[
                  "left-0 top-0 border-l-2 border-t-2",
                  "right-0 top-0 border-r-2 border-t-2",
                  "left-0 bottom-0 border-b-2 border-l-2",
                  "right-0 bottom-0 border-b-2 border-r-2",
                ].map((pos) => (
                  <span key={pos} className={cn("absolute size-8 border-paper/70", pos)} />
                ))}
              </div>
            </>
          )}

          {!cameraOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
              {cameraError ? (
                <>
                  <AlertTriangle className="size-10 text-brass" aria-hidden="true" />
                  <p className="t-small text-paper/80">{cameraError}</p>
                </>
              ) : (
                <>
                  <Camera className="size-10 text-paper/50" aria-hidden="true" />
                  <p className="t-small text-paper/70">
                    Point the camera at the QR on the guest's ticket.
                  </p>
                </>
              )}
              <Button variant="primary" onClick={() => void startCamera()}>
                {cameraError ? "Try the camera again" : "Start scanning"}
              </Button>
            </div>
          )}
        </div>

        {cameraOn && (
          <button
            type="button"
            onClick={stopCamera}
            className="t-small mx-auto mt-3 flex items-center gap-2 text-muted transition-colors hover:text-paper"
          >
            <CameraOff className="size-4" aria-hidden="true" />
            Stop the camera
          </button>
        )}

        <div className="mt-5">
          <label htmlFor="door-search" className="sr-only">
            Search by name or ticket number
          </label>
          <Input
            id="door-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or ticket number"
            className="h-14 text-[16px]"
            autoComplete="off"
          />
          {doorListError && (
            <p className="t-small mt-2 text-brass">
              The door list didn't load, so searching by name won't work — scanning still does.
            </p>
          )}
          {query && !doorListError && matches.length === 0 && (
            <p className="t-small mt-2 text-muted">
              Nobody on the list matches that. Check the spelling, or try their ticket number.
            </p>
          )}
          {matches.length > 0 && (
            <ul className="mt-2 divide-y divide-[var(--glass-border-soft)] glass-soft overflow-hidden rounded-xl">
              {matches.map((a) => {
                const alreadyIn = a.status === "used";
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      disabled={alreadyIn}
                      onClick={() => {
                        void handleCode(a.qr_data);
                        setSearch("");
                      }}
                      className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left hover:bg-paper/5 disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[16px]">
                          {a.holder_name || "No name on the ticket"}
                        </span>
                        <span className="t-mono block truncate text-[12px] text-muted">
                          {[a.ticket_number, a.seat_label].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "t-mono shrink-0 text-[12px] uppercase",
                          alreadyIn ? "text-brass" : "text-muted",
                        )}
                      >
                        {alreadyIn ? "already in" : a.tier_name ?? "General"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <AnimatePresence>
        {overlay && (
          <motion.div
            key="scan-overlay"
            role="alert"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.14 }}
            className={cn(
              "fixed inset-0 z-[120] flex flex-col items-center justify-center px-6 text-center",
              overlay.kind === "valid" || overlay.kind === "queued"
                ? "bg-live text-ink"
                : overlay.kind === "duplicate"
                  ? "bg-brass text-ink"
                  : "bg-fault text-ink",
            )}
          >
            {overlay.kind === "valid" && (
              <>
                <Check className="size-24" strokeWidth={3} aria-hidden="true" />
                <p className="mt-6 font-display text-[clamp(26px,8vw,44px)] font-extrabold uppercase leading-none">
                  {overlay.name}
                </p>
                <p className="mt-3 text-[18px]">{overlay.tier}</p>
                <p className="mt-1 font-mono text-[15px] tracking-[0.1em]">{overlay.code}</p>
                <p className="mt-8 font-mono text-[26px] font-medium">
                  {checkedIn} / {capacity}
                </p>
              </>
            )}

            {overlay.kind === "queued" && (
              <>
                <Check className="size-24" strokeWidth={3} aria-hidden="true" />
                <p className="mt-6 font-display text-[clamp(24px,7vw,40px)] font-extrabold uppercase leading-none">
                  Let them in
                </p>
                <p className="mt-3 text-[17px]">Saved — will sync when the network is back</p>
                <p className="mt-1 font-mono text-[15px] tracking-[0.1em]">{overlay.code}</p>
              </>
            )}

            {overlay.kind === "duplicate" && (
              <>
                <AlertTriangle className="size-24" strokeWidth={2.5} aria-hidden="true" />
                <p className="mt-6 font-display text-[clamp(24px,7vw,40px)] font-extrabold uppercase leading-none">
                  Already checked in
                </p>
                <p className="mt-3 text-[17px]">Scanned at {overlay.at}</p>
                <p className="mt-1 font-mono text-[15px] tracking-[0.1em]">{overlay.code}</p>
              </>
            )}

            {overlay.kind === "invalid" && (
              <>
                <X className="size-24" strokeWidth={3} aria-hidden="true" />
                <p className="mt-6 font-display text-[clamp(24px,7vw,40px)] font-extrabold uppercase leading-none">
                  Not a valid ticket
                </p>
                {overlay.detail && <p className="mt-3 text-[17px]">{overlay.detail}</p>}
                <p className="mt-1 font-mono text-[15px] tracking-[0.1em]">{overlay.code}</p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
