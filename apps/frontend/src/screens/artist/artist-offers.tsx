import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConsoleShell, ARTIST_NAV } from "@/components/naada/console-shell";
import { EmptyState } from "@/components/naada/empty-state";
import { OfferInbox } from "@/components/naada/offer-inbox";
import { ProfileNudge } from "@/components/naada/profile-nudge";
import { ApiError, getMyArtistProfile, type ApiArtist } from "@/lib/api";
import { useAsync } from "@/screens/home/home-kit";

/** Section 7.17 — Offer inbox, read from the server so an offer a host sent is here. */
export function ArtistOffersScreen() {
  const navigate = useNavigate();
  const [awaitingMe, setAwaitingMe] = useState(0);

  const fetchProfile = useCallback(async (): Promise<ApiArtist | null> => {
    try {
      return await getMyArtistProfile();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }, []);
  const profile = useAsync(fetchProfile, "check your profile");

  return (
    <ConsoleShell nav={ARTIST_NAV} breadcrumb={["Offers"]}>
      <h1 className="t-h1">Offers</h1>

      <ProfileNudge gaps={profile.data?.profile_gaps ?? []} hasOffer={awaitingMe > 0} className="mt-6" />

      <OfferInbox
        viewer="artist"
        className="mt-6"
        onLoaded={setAwaitingMe}
        empty={
          <EmptyState
            headline="No offers yet"
            body="Venues find artists through search. A complete profile with clips gets found more."
            actionLabel="Finish your profile"
            onAction={() => navigate("/artist/profile")}
          />
        }
      />
    </ConsoleShell>
  );
}
