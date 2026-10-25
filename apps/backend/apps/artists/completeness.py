"""What an artist profile is still missing.

Hosts decide from a photo, a city, a fee range and a few words about the act, so
an artist without them is hard to book. The same list drives three things: the
"complete your profile" nudge on the artist's dashboard, the wording of the
notification an artist gets when a host sends an offer before they are ready,
and the profile page's own progress meter.

Keep it to fields every artist can actually fill in. A website is deliberately
not on the list — plenty of working musicians do not have one.
"""

MIN_BIO_CHARS = 40


def profile_gaps(artist) -> list[str]:
    """Plain-words names of what is missing, in the order worth fixing them."""
    gaps = []
    # `.all()` rather than `.exists()` so a prefetched queryset is reused.
    if not artist.photos.all():
        gaps.append("a photo")
    if not artist.genres.all():
        gaps.append("your genres")
    if artist.city_id is None:
        gaps.append("your city")
    if len((artist.bio or "").strip()) < MIN_BIO_CHARS:
        gaps.append("a short bio")
    low, high = artist.booking_fee_min, artist.booking_fee_max
    if low is None or high is None or high <= 0 or high < low:
        gaps.append("your fee range")
    return gaps


def join_gaps(gaps: list[str]) -> str:
    """['a photo', 'your city', 'a bio'] -> 'a photo, your city and a bio'."""
    if len(gaps) <= 1:
        return "".join(gaps)
    return ", ".join(gaps[:-1]) + " and " + gaps[-1]
