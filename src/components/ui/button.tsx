import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "destructive" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "default" | "sm";
  full?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  destructive: "btn-destructive",
  ghost: "btn-ghost",
};

/**
 * Section 3.5. `--signal` is expensive — only one primary button per screen.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "default", full, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "btn",
        VARIANTS[variant],
        size === "sm" && "btn-sm",
        full && "w-full",
        className,
      )}
      {...props}
    />
  );
});
