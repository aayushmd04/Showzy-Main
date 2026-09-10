/**
 * The bell. Everything that happens to you while you're not looking — an offer,
 * a reply, a gig that moved — arrives here.
 *
 * Polling is deliberately slow. This runs on phones on Indian mobile data, and
 * nothing in a ticketing product is worth a request every five seconds.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useSWR from "swr";
import { Bell, CheckCheck } from "lucide-react";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  tokens,
  type ApiNotification,
} from "@/lib/api";
import { useStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

const POLL_MS = 60_000;
const NOTIFICATIONS_KEY = "/notifications/";
/** The dropdown is a peek, not an archive. The full list lives at /notifications. */
const PREVIEW_COUNT = 8;

/**
 * Shared by the bell and the full-page view so they read from one SWR cache —
 * marking something read in the dropdown updates the page behind it.
 */
export function useNotifications() {
  const { role, currentUser } = useStore();
  const signedIn = role !== "out" && currentUser !== null && Boolean(tokens.access);

  const swr = useSWR<{ results: ApiNotification[] }>(
    signedIn ? NOTIFICATIONS_KEY : null,
    () => getNotifications(),
    { refreshInterval: POLL_MS, revalidateOnFocus: true, keepPreviousData: true },
  );

  const items = useMemo(() => swr.data?.results ?? [], [swr.data]);
  const unread = useMemo(() => items.filter((n) => !n.is_read).length, [items]);

  const { mutate } = swr;

  const markRead = useCallback(
    async (id: string) => {
      await mutate(
        (current) => ({
          results: (current?.results ?? []).map((n) =>
            n.id === id ? { ...n, is_read: true } : n,
          ),
        }),
        { revalidate: false },
      );
      try {
        await markNotificationRead(id);
      } finally {
        void mutate();
      }
    },
    [mutate],
  );

  const markAllRead = useCallback(async () => {
    await mutate(
      (current) => ({
        results: (current?.results ?? []).map((n) => ({ ...n, is_read: true })),
      }),
      { revalidate: false },
    );
    try {
      await markAllNotificationsRead();
    } finally {
      void mutate();
    }
  }, [mutate]);

  return { signedIn, items, unread, markRead, markAllRead, ...swr };
}

/** "3m ago", "yesterday", "14 Mar" — whichever a person would actually say. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function NotificationBell({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { signedIn, items, unread, markRead, markAllRead, error, isLoading, mutate } =
    useNotifications();

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape — a dropdown you can't dismiss with
  // the keyboard is a trap on a page you were only passing through.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // An unauthenticated visitor must never see the bell, and must never be the
  // reason a 401 is fired at the API.
  if (!signedIn) return null;

  const preview = items.slice(0, PREVIEW_COUNT);

  const follow = (notification: ApiNotification) => {
    setOpen(false);
    if (!notification.is_read) void markRead(notification.id);
    const url = notification.action_url;
    if (!url) return;
    if (/^https?:\/\//i.test(url)) window.location.assign(url);
    else navigate(url);
  };

  return (
    <div ref={wrapRef} className={cn("relative shrink-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          unread > 0
            ? `Notifications, ${unread} unread`
            : "Notifications, nothing new"
        }
        className="relative grid size-9 place-items-center rounded-full border border-line text-paper transition-colors hover:bg-surface-2"
      >
        <Bell className="size-[18px]" aria-hidden="true" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="t-mono absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-signal px-1 text-[10px] font-bold leading-[18px] text-[#F3E9D6]"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+10px)] z-[70] w-[min(360px,calc(100vw-32px))] border border-line bg-surface shadow-[0_18px_44px_-16px_rgba(0,0,0,0.55)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="t-h2 text-[16px] font-bold">Notifications</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="t-small flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-paper"
              >
                <CheckCheck className="size-3.5" aria-hidden="true" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[min(60vh,420px)] overflow-y-auto">
            {isLoading && items.length === 0 ? (
              <PreviewSkeleton />
            ) : error ? (
              <div className="px-4 py-8 text-center">
                <p className="t-body text-[14px]">We couldn't reach your notifications.</p>
                <p className="t-small mt-1 text-[13px] text-muted">
                  Usually the connection, not you.
                </p>
                <button
                  type="button"
                  onClick={() => void mutate()}
                  className="btn btn-secondary btn-sm mt-4"
                >
                  Try again
                </button>
              </div>
            ) : preview.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="t-body text-[14px]">Nothing here yet.</p>
                <p className="t-small mt-1.5 text-[13px] leading-relaxed text-muted">
                  When a host sends you an offer, an artist replies, or a gig you
                  hold a ticket for changes, it lands here first.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {preview.map((n) => (
                  <li key={n.id}>
                    <NotificationRow notification={n} onOpen={follow} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-line px-4 py-2.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate("/notifications");
              }}
              className="t-small text-[13px] text-muted transition-colors hover:text-paper"
            >
              See everything
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function NotificationRow({
  notification,
  onOpen,
}: {
  notification: ApiNotification;
  onOpen: (notification: ApiNotification) => void;
}) {
  const unread = !notification.is_read;
  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={cn(
        "relative flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition-colors hover:bg-surface-2",
        unread && "bg-surface-2/60",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-[2px]",
          unread ? "bg-signal" : "bg-transparent",
        )}
      />
      <span className="flex w-full items-baseline justify-between gap-3">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[14px]",
            unread ? "font-semibold text-paper" : "text-muted",
          )}
        >
          {notification.title}
        </span>
        <span className="t-mono shrink-0 text-[11px] text-muted">
          {relativeTime(notification.created_at)}
        </span>
      </span>
      <span className="t-small line-clamp-2 text-[13px] leading-snug text-muted">
        {notification.body}
      </span>
    </button>
  );
}

function PreviewSkeleton() {
  return (
    <ul className="divide-y divide-line" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="space-y-2 px-4 py-4">
          <div className="h-3 w-[58%] bg-surface-2" />
          <div className="h-3 w-[86%] bg-surface-2" />
        </li>
      ))}
    </ul>
  );
}
