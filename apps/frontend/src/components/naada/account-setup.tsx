import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { HostRequiredStep, ArtistRequiredStep } from "@/components/naada/setup-forms";
import { useStore } from "@/store/app-store";
import {
  createVenue,
  getAccountSetup,
  getMyArtistProfile,
  post,
  recordConsent,
  updateArtist,
  updateMe,
  type AccountSetup,
  type ApiArtist,
} from "@/lib/api";
import { LEGAL_VERSION } from "@/lib/legal";
import { actionError } from "@/components/naada/api-message";

/**
 * Accounts that joined before sign-up asked for a venue (hosts) or a stage name,
 * city, genres and bio (artists) have none of it, and a host with no venue cannot
 * create an event at all. This asks for it in place:
 *
 * - a short form opens once per visit for anyone whose missing information stops
 *   them working (a host with no venue, an artist hosts can't find);
 * - a banner stays on their console until it is done, and every dead end ("no
 *   venue yet") offers the same form;
 * - what is optional (a name, a photo, a fee range) is mentioned, never forced.
 */

const DISMISSED = "showzy_setup_dismissed";
const DONE_EVENT = "showzy:account-setup";

/** Run `fn` when the person finishes setting up, so a screen that was showing "no venue yet" can reload. */
export function useOnAccountSetup(fn: () => void): void {
  useEffect(() => {
    window.addEventListener(DONE_EVENT, fn);
    return () => window.removeEventListener(DONE_EVENT, fn);
  }, [fn]);
}

interface SetupApi {
  status: AccountSetup | null;
  /** Open the form for whatever this account is missing. */
  open: () => void;
  /** Re-ask the server (after the person fixed something elsewhere). */
  refresh: () => Promise<void>;
}

const Ctx = createContext<SetupApi>({ status: null, open: () => {}, refresh: async () => {} });

export function useAccountSetup(): SetupApi {
  return useContext(Ctx);
}

function dismissedThisVisit(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED) === "1";
  } catch {
    return false;
  }
}

export function AccountSetupProvider({ children }: { children: ReactNode }) {
  const { role, currentUser, setCurrentUser, toast, hydrateFromApi } = useStore();
  const [status, setStatus] = useState<AccountSetup | null>(null);
  const [isOpen, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [artist, setArtist] = useState<ApiArtist | null>(null);

  const signedIn = currentUser !== null && role !== "out";

  const refresh = useCallback(async () => {
    if (!signedIn) {
      setStatus(null);
      return;
    }
    try {
      setStatus(await getAccountSetup());
    } catch {
      // Never nag because a request failed.
      setStatus(null);
    }
  }, [signedIn]);

  useEffect(() => {
    void refresh();
  }, [refresh, currentUser?.id]);

  // Open once per visit for what actually blocks the person.
  useEffect(() => {
    if (status?.needs_attention && !dismissedThisVisit() && (role === "host" || role === "artist")) setOpen(true);
  }, [status, role]);

  // An artist already has a (thin) profile: prefill the form with it.
  useEffect(() => {
    if (!isOpen || role !== "artist") return;
    let alive = true;
    getMyArtistProfile()
      .then((a) => alive && setArtist(a))
      .catch(() => alive && setArtist(null));
    return () => {
      alive = false;
    };
  }, [isOpen, role]);

  const close = useCallback(() => {
    setOpen(false);
    setError("");
    try {
      sessionStorage.setItem(DISMISSED, "1");
    } catch {
      /* it will simply ask again next time */
    }
  }, []);

  const finish = useCallback(async () => {
    setOpen(false);
    toast("You're set up", "success");
    await refresh();
    void hydrateFromApi();
    window.dispatchEvent(new Event(DONE_EVENT));
  }, [refresh, toast, hydrateFromApi]);

  const rememberName = useCallback(
    async (name: string) => {
      const user = await updateMe({ full_name: name });
      setCurrentUser({ id: user.id, email: user.email, full_name: user.full_name, role: user.role });
    },
    [setCurrentUser],
  );

  const saveHost = async (data: { name: string; venueName: string; address: string; city: string; capacity: number }) => {
    setSaving(true);
    setError("");
    try {
      await rememberName(data.name);
      await createVenue({ name: data.venueName, address_line1: data.address, city: data.city, capacity: data.capacity });
      void recordConsent("organiser_terms", LEGAL_VERSION, "setup");
      await finish();
    } catch (err) {
      setError(actionError(err, "save your venue"));
    } finally {
      setSaving(false);
    }
  };

  const saveArtist = async (data: { name: string; stageName: string; city: string; genres: number[]; bio: string }) => {
    setSaving(true);
    setError("");
    try {
      await rememberName(data.name);
      let id: string;
      try {
        id = (await getMyArtistProfile()).id;
      } catch {
        id = (await post<ApiArtist>("/artists/", { stage_name: data.stageName })).id;
      }
      await updateArtist(id, { stage_name: data.stageName, bio: data.bio, city: data.city, genres: data.genres });
      void recordConsent("organiser_terms", LEGAL_VERSION, "setup");
      await finish();
    } catch (err) {
      setError(actionError(err, "save your profile"));
    } finally {
      setSaving(false);
    }
  };

  const api = useMemo<SetupApi>(() => ({ status, open: () => setOpen(true), refresh }), [status, refresh]);
  const name = currentUser?.full_name ?? "";

  return (
    <Ctx.Provider value={api}>
      {children}
      <Modal
        open={isOpen && (role === "host" || role === "artist")}
        onClose={close}
        title={role === "host" ? "Add your venue" : "Finish your artist profile"}
      >
        {role === "host" ? (
          <HostRequiredStep
            loading={saving}
            error={error}
            onSubmit={saveHost}
            initial={{ name }}
            intro="Your account was made before we asked where your venue is. Add it once and you can create events: artists and fans need to know where you are and how big the room is."
          />
        ) : (
          <ArtistRequiredStep
            // Remount once the existing profile has loaded so the form starts from it.
            key={artist?.id ?? "loading"}
            loading={saving}
            error={error}
            onSubmit={saveArtist}
            initial={{
              name,
              stageName: artist?.stage_name && artist.stage_name !== "New Artist" ? artist.stage_name : "",
              city: artist && "city" in artist && artist.city ? String((artist as { city?: number }).city) : "",
              genres: (artist as unknown as { genres?: Array<{ id?: number }> } | null)?.genres?.map((g) => g.id ?? 0).filter(Boolean) ?? [],
              bio: artist?.bio ?? "",
            }}
            intro="Hosts search for artists by city and genre and book on what they read here. It takes a minute."
          />
        )}
        <div className="mt-3 text-center">
          <Button variant="ghost" size="sm" onClick={close} disabled={saving}>
            Not now
          </Button>
        </div>
      </Modal>
    </Ctx.Provider>
  );
}

/** A strip at the top of a console while something is still missing. Renders nothing when complete. */
export function SetupBanner({ className = "" }: { className?: string }) {
  const { status, open } = useAccountSetup();
  const { role } = useStore();
  if (!status || status.complete || (role !== "host" && role !== "artist")) return null;
  const mine = status.steps.filter((s) => s.key !== "name");
  if (mine.length === 0) return null;
  const blocking = mine.some((s) => s.blocking);
  const quick = mine.find((s) => s.key === "venue" || s.key === "artist");

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-3 border bg-surface px-4 py-3 ${
        blocking ? "border-brass" : "border-line"
      } ${className}`}
    >
      <p className="t-small min-w-0 flex-1 basis-[260px]">
        <span className="font-semibold">{blocking ? "Finish setting up your account." : "A little more would help."}</span>{" "}
        <span className="text-muted">
          {role === "host" ? "Still needed: " : "Hosts book on what they see: "}
          {mine.map((s) => s.label).join("; ")}.
        </span>
      </p>
      {quick ? (
        <Button size="sm" variant="primary" onClick={open}>
          Finish setup
        </Button>
      ) : role === "artist" ? (
        <a href="/artist/profile" className="btn btn-secondary btn-sm shrink-0">
          Open profile
        </a>
      ) : (
        <a href="/host/business" className="btn btn-secondary btn-sm shrink-0">
          Open venue details
        </a>
      )}
    </div>
  );
}
