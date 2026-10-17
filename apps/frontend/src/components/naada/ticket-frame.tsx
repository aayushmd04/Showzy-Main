import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Content set inside the logo's ticket outline: rounded corners and a half-circle
 * bitten out of each side. The bites are a mask on the inner box; the two spans
 * redraw their edges so the cut is part of the outline.
 */
export function TicketFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="relative">
      <div className={cn("banner-ticket glass-soft", className)}>{children}</div>
      <span aria-hidden className="banner-notch banner-notch-l" />
      <span aria-hidden className="banner-notch banner-notch-r" />
    </div>
  );
}
