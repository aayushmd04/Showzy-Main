import { cn } from "@/lib/utils";

/** Section 11. Rectangles with a 1px border — 0px radius despite the name. */
const TONES = {
  muted: "text-muted",
  paper: "text-paper",
  live: "text-live",
  brass: "text-brass",
  signal: "text-signal",
  fault: "text-fault",
} as const;

export type PillTone = keyof typeof TONES;

const STATUS_TONE: Record<string, PillTone> = {
  DRAFT: "muted",
  PUBLISHED: "paper",
  LIVE: "live",
  "SALES CLOSED": "muted",
  "SOLD OUT": "muted",
  VALID: "live",
  "CHECKED IN": "live",
  "NEW OFFER": "signal",
  REQUESTED: "signal",
  NEGOTIATING: "brass",
  ACCEPTED: "paper",
  FUNDED: "brass",
  PERFORMED: "paper",
  HELD: "brass",
  PENDING: "brass",
  RELEASING: "brass",
  PAID: "live",
  RELEASED: "live",
  COMPLETED: "muted",
  CANCELLED: "fault",
  DECLINED: "fault",
  DISPUTED: "fault",
  FREE: "live",
};

export function Pill({
  children,
  tone,
  className,
}: {
  children: string;
  tone?: PillTone;
  className?: string;
}) {
  const label = children.toUpperCase();
  const resolved = tone ?? STATUS_TONE[label] ?? "muted";
  return <span className={cn("pill", TONES[resolved], className)}>{label}</span>;
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, " ").toUpperCase();
}
