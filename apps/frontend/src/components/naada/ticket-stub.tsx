import type { ReactNode } from "react";
import { QrBlock } from "./qr-block";
import { cn } from "@/lib/utils";

/**
 * Section 3.4 — the one signature component. A card with a dashed vertical
 * perforation, semicircular notch cut-outs at both ends of that line, a mono
 * ticket code and the QR on the short stub side.
 *
 * Used for: ticket detail, purchase confirmation, scanner success, and the
 * compact rows in My tickets. Nowhere else, and never decoratively.
 */
export function TicketStub({
  code,
  qrImageUrl,
  children,
  stub,
  className,
  tone = "surface",
}: {
  code: string;
  /**
   * The server-rendered QR. Required for a ticket anyone will actually scan —
   * QrBlock is a decorative pattern, not a readable code, so a door scanner
   * gets nothing from it.
   */
  qrImageUrl?: string;
  children: ReactNode;
  stub?: ReactNode;
  className?: string;
  tone?: "surface" | "live";
}) {
  const notchColour = tone === "live" ? "bg-live" : "bg-ink";

  return (
    <div
      className={cn(
        "relative flex flex-col border sm:flex-row",
        tone === "live" ? "border-ink/25 bg-live text-ink" : "border-line bg-surface",
        className,
      )}
    >
      {/* Main body */}
      <div className="min-w-0 flex-1 p-5 sm:p-6">{children}</div>

      {/* Perforation — horizontal on mobile, vertical from sm up */}
      <div className="relative shrink-0">
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-x-0 top-0 border-t border-dashed sm:inset-y-0 sm:left-0 sm:right-auto sm:border-l sm:border-t-0",
            tone === "live" ? "border-ink/35" : "border-line",
          )}
        />
        {/* Notch cut-outs at both ends of the perforation */}
        <span
          aria-hidden="true"
          className={cn(
            "stub-notch -left-[9px] -top-[9px] sm:-top-[9px] sm:left-[-9px]",
            notchColour,
            tone === "live" && "border-ink/25",
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            "stub-notch -right-[9px] -top-[9px] sm:-bottom-[9px] sm:left-[-9px] sm:right-auto sm:top-auto",
            notchColour,
            tone === "live" && "border-ink/25",
          )}
        />
        <div className="flex items-center gap-4 p-5 sm:w-[168px] sm:flex-col sm:p-6">
          {stub ?? (
            <>
              <div className="size-[104px] shrink-0 border border-line bg-paper p-1.5 sm:size-[116px]">
                {qrImageUrl ? (
                  <img
                    src={qrImageUrl}
                    alt={`QR code for ticket ${code}`}
                    className="size-full object-contain"
                  />
                ) : (
                  <QrBlock code={code} />
                )}
              </div>
              <p
                className={cn(
                  "t-mono break-all text-[12px] leading-[1.5] tracking-[0.06em] sm:text-center",
                  tone === "live" ? "text-ink" : "text-muted",
                )}
              >
                {code}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact stub graphic used as the leading element of a My tickets row. */
export function StubGlyph({ code, dim }: { code: string; dim?: boolean }) {
  return (
    <div
      className={cn(
        "relative flex h-[62px] w-[76px] shrink-0 items-center border border-line bg-surface-2",
        dim && "opacity-50",
      )}
      aria-hidden="true"
    >
      <div className="w-[46px] p-2">
        <QrBlock code={code} size={11} />
      </div>
      <div className="relative h-full flex-1">
        <span className="absolute inset-y-0 left-0 border-l border-dashed border-line" />
        <span className="stub-notch -left-[7px] -top-[7px] size-[12px] bg-ink" />
        <span className="stub-notch -bottom-[7px] -left-[7px] size-[12px] bg-ink" />
      </div>
    </div>
  );
}
