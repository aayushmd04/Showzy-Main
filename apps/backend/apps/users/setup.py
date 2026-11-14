"""What an account still needs before it works the way its role expects.

Sign-up now asks a host for a venue (name, address, city, capacity) and an artist
for a stage name, city, genres and a bio, but only a *new* sign-up is asked. An
account that existed before that has none of it, and without a venue a host
cannot create an event at all. This lists, in plain words, what each account is
missing, so the app can ask for it in place instead of leaving the person to hit
a wall.

`blocking` marks what stops them doing their job (a host with no venue); the rest
is worth doing but nothing breaks without it.
"""

from apps.artists.completeness import join_gaps, profile_gaps
from .models import UserRole

#: Artist gaps that make a profile unbookable rather than merely thin.
_ARTIST_BLOCKING = {"your city", "your genres"}


def setup_status(user) -> dict:
    from apps.artists.models import Artist
    from apps.venues.models import Venue

    steps = []

    if not (user.full_name or "").strip():
        steps.append({"key": "name", "label": "your name", "blocking": False})

    if user.role == UserRole.VENUE_OWNER:
        venues = list(Venue.objects.filter(owner=user, is_deleted=False)[:1])
        if not venues:
            steps.append({
                "key": "venue",
                "label": "your venue's name, address, city and capacity",
                "blocking": True,
            })
        elif not venues[0].capacity:
            steps.append({"key": "venue_capacity", "label": "how many people your room holds", "blocking": False})

    if user.role == UserRole.ARTIST:
        artist = Artist.objects.filter(user=user, is_deleted=False).first()
        if artist is None:
            steps.append({"key": "artist", "label": "your artist profile", "blocking": True})
        else:
            gaps = profile_gaps(artist)
            # Fees and a photo are asked for on the profile page; the quick form
            # collects what a host needs to find them at all.
            quick = [g for g in gaps if g in ("your city", "your genres", "a short bio")]
            if quick:
                steps.append({
                    "key": "artist",
                    "label": join_gaps(quick),
                    "blocking": bool(_ARTIST_BLOCKING & set(quick)),
                })
            rest = [g for g in gaps if g not in quick]
            if rest:
                steps.append({"key": "artist_profile", "label": join_gaps(rest), "blocking": False})

    return {
        "role": user.role,
        "complete": not steps,
        "needs_attention": any(s["blocking"] for s in steps),
        "steps": steps,
    }
