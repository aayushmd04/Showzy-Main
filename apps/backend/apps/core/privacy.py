"""Who may see what on a public profile.

Artist and venue pages are public, but several things on them are business
information, not marketing: what an artist charges, which dates they are free,
how many gigs they have played, how to reach them directly. Those are for the
people doing business on the platform. A listener, a signed-out visitor, or
another artist browsing the directory has no need for them, and an artist in
particular should not be able to read a competitor's rates or calendar.

    owner / staff   everything
    host            fees and availability (they are hiring)
    host or artist  gig counts and history
    everyone else   the public profile only

Contact details (email, phone) are shown to the owner and staff only: the
product keeps negotiation inside the booking thread, where it is protected.
"""

from apps.users.models import UserRole


def _authed(user) -> bool:
    return bool(user and getattr(user, "is_authenticated", False))


def is_staff(user) -> bool:
    return _authed(user) and (user.is_staff or user.role == UserRole.ADMIN)


def is_host(user) -> bool:
    """Someone who books artists: a venue owner (the "host" role) or staff."""
    return _authed(user) and (is_staff(user) or user.role == UserRole.VENUE_OWNER)


def is_industry(user) -> bool:
    """A host or an artist — people who work in the scene, as opposed to its audience."""
    return is_host(user) or (_authed(user) and user.role == UserRole.ARTIST)
