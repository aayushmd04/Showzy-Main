import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bookmark, LogOut, ScanLine, Settings as SettingsIcon, Ticket, UserRound } from "lucide-react";
import { useStore } from "@/store/app-store";
import { logout as apiLogout } from "@/lib/api";
import { useGateAccess } from "@/lib/gate-access";

/**
 * The signed-in avatar, and the only place a person can sign out.
 *
 * Sign-out previously existed solely on the settings screen, which meant that
 * on a shared or borrowed phone the way to end your session was to know a URL.
 */
export function AccountMenu({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const navigate = useNavigate();
  const { role, currentUser, setRole, setCurrentUser, toast } = useStore();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Gate duty is shown only to people who hold an invitation or a door, and a
  // venue account (whose doors live in the host console).
  const { hasGateWork } = useGateAccess();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (role === "out" || !currentUser) return null;

  const name = currentUser.full_name?.trim() || currentUser.email;
  const initial = name.charAt(0).toUpperCase();

  const consoleLink =
    role === "host"
      ? { to: "/host", label: "Host console" }
      : role === "artist"
        ? { to: "/artist", label: "Artist console" }
        : role === "admin"
          ? { to: "/admin", label: "Admin console" }
          : null;

  const signOut = async () => {
    setOpen(false);
    await apiLogout();
    setCurrentUser(null);
    setRole("out");
    toast("Signed out");
    navigate("/", { replace: true });
  };

  const itemClass =
    "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[14px] text-paper transition-colors hover:bg-surface-2";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name}`}
        className="grid size-9 place-items-center rounded-full text-[13px] font-bold transition-opacity hover:opacity-85"
        style={{
          background: "var(--color-signal)",
          color: "#ECECEC",
          border: tone === "light" ? "1px solid rgba(0,0,0,.1)" : "none",
        }}
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-[300] mt-2 w-[248px] border border-line bg-surface shadow-lg"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-[14px] font-semibold text-paper">{name}</p>
            <p className="t-small truncate text-muted">{currentUser.email}</p>
          </div>

          <div className="py-1">
            <Link to="/tickets" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
              <Ticket className="size-4 shrink-0" aria-hidden="true" />
              My tickets
            </Link>
            {role === "host" && (
              <Link to="/host/events" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
                <ScanLine className="size-4 shrink-0" aria-hidden="true" />
                Doors &amp; gate team
              </Link>
            )}
            {hasGateWork && (
              <Link to="/gate" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
                <ScanLine className="size-4 shrink-0" aria-hidden="true" />
                Gate duty
              </Link>
            )}
            <Link to="/saved" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
              <Bookmark className="size-4 shrink-0" aria-hidden="true" />
              Saved
            </Link>
            {consoleLink && (
              <Link
                to={consoleLink.to}
                role="menuitem"
                className={itemClass}
                onClick={() => setOpen(false)}
              >
                <UserRound className="size-4 shrink-0" aria-hidden="true" />
                {consoleLink.label}
              </Link>
            )}
            <Link to="/settings" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
              <SettingsIcon className="size-4 shrink-0" aria-hidden="true" />
              Settings
            </Link>
          </div>

          <div className="border-t border-line py-1">
            <button type="button" role="menuitem" onClick={signOut} className={itemClass}>
              <LogOut className="size-4 shrink-0" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
