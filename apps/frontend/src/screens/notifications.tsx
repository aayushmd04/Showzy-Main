/**
 * Everything, in order. The bell shows the last eight; this is the rest —
 * the place you come back to when you half-remember an offer from last week.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCheck } from "lucide-react";
import { PublicShell } from "@/components/naada/public-shell";
import { EmptyState } from "@/components/naada/empty-state";
import {
  NotificationRow,
  useNotifications,
} from "@/components/naada/notification-bell";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import type { ApiNotification } from "@/lib/api";
import { cn } from "@/lib/utils";
import { usePageMeta } from "@/lib/use-meta";

type Tab = "all" | "unread";

export function NotificationsScreen() {
  usePageMeta({ title: "Notifications", description: "Everything that has happened on your Showzy account." });
  const navigate = useNavigate();
  const { open: openAuth } = useAuthSheet();
  const { signedIn, items, unread, markRead, markAllRead, error, isLoading, mutate } =
    useNotifications();
  const [tab, setTab] = useState<Tab>("all");

  const rows = tab === "unread" ? items.filter((n) => !n.is_read) : items;

  const follow = (notification: ApiNotification) => {
    if (!notification.is_read) void markRead(notification.id);
    const url = notification.action_url;
    if (!url) return;
    if (/^https?:\/\//i.test(url)) window.location.assign(url);
    else navigate(url);
  };

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[720px] px-4 py-8 md:px-8 md:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="t-h1 text-[28px] font-bold">Notifications</h1>
            <p className="t-small mt-1 text-[13px] text-muted">
              {unread > 0
                ? `${unread} ${unread === 1 ? "thing needs" : "things need"} your attention`
                : "You're up to date"}
            </p>
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="btn btn-secondary btn-sm"
            >
              <CheckCheck className="size-4" aria-hidden="true" />
              Mark all read
            </button>
          )}
        </div>

        {signedIn && (
          <div className="mt-6 flex" role="tablist" aria-label="Notification filter">
            {(["all", "unread"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "min-h-11 border px-4 text-[14px] capitalize transition-colors",
                  tab === t
                    ? "border-paper bg-surface-2 text-paper"
                    : "border-line text-muted hover:text-paper",
                  t === "unread" && "-ml-px",
                )}
              >
                {t}
                {t === "unread" && unread > 0 ? ` (${unread})` : ""}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6">
          {!signedIn ? (
            <EmptyState
              headline="Sign in to see your notifications"
              body="Offers, replies and changes to gigs you have tickets for all land here, tied to your account."
              actionLabel="Sign in"
              onAction={() => openAuth("Sign in to Showzy")}
            />
          ) : isLoading && items.length === 0 ? (
            <ul className="divide-y divide-line border border-line bg-surface" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="space-y-2.5 px-4 py-5">
                  <div className="h-3.5 w-[52%] bg-surface-2" />
                  <div className="h-3 w-[82%] bg-surface-2" />
                </li>
              ))}
            </ul>
          ) : error ? (
            <div className="border border-dashed border-line px-6 py-14 text-center">
              <h2 className="t-h2 text-[18px] font-bold">
                We couldn't reach your notifications
              </h2>
              <p className="t-body mt-2 text-[14px] text-muted">
                Nothing is lost — the list is still on the server. Give it another go.
              </p>
              <button
                type="button"
                onClick={() => void mutate()}
                className="btn btn-secondary mt-6"
              >
                Try again
              </button>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              headline={
                tab === "unread" ? "Nothing unread" : "Nothing has happened yet"
              }
              body={
                tab === "unread"
                  ? "You've read everything. New offers, replies and gig changes will show up here."
                  : "Book a ticket, send an offer or apply for a gig — the replies and updates all come back to this page."
              }
              actionLabel={tab === "unread" ? "See everything" : "Find a gig"}
              onAction={() => (tab === "unread" ? setTab("all") : navigate("/"))}
            />
          ) : (
            <ul className="divide-y divide-line border border-line bg-surface">
              {rows.map((n) => (
                <li key={n.id}>
                  <NotificationRow notification={n} onOpen={follow} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PublicShell>
  );
}
