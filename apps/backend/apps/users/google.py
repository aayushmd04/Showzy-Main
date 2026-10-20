"""Google sign-in (server side).

The browser's "Continue with Google" button hands us an ID token: a JWT that
Google signed. It proves nothing until we check the signature against Google's
published keys, that it was minted for *our* OAuth client (``aud``), that it
has not expired, and that Google itself vouches for the address
(``email_verified``). That is all this does; the caller turns the verified
claims into a Showzy session.

There is no client secret in this flow and nothing to store: the client ID is
public and is only used to tell "a token for Showzy" from "a token for some
other app that also uses Google".
"""

import logging
from functools import partial

from django.conf import settings
from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

logger = logging.getLogger(__name__)

MAX_TOKEN_LENGTH = 4096  # real ID tokens are ~1-1.5 KB
ISSUERS = ("accounts.google.com", "https://accounts.google.com")


class GoogleSignInError(Exception):
    """The token is not one we will sign anybody in with."""


def enabled() -> bool:
    return bool(getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", ""))


def verify(token: str) -> dict:
    """Return ``{"email", "name"}`` for a genuine Google ID token, else raise."""
    if not enabled():
        raise GoogleSignInError("Google sign-in is not configured")
    if not isinstance(token, str) or not token or len(token) > MAX_TOKEN_LENGTH:
        raise GoogleSignInError("Malformed token")

    try:
        # Checks signature, expiry, and that `aud` is our client ID. The fetch
        # of Google's keys must not hang a worker if Google is unreachable.
        request = partial(
            google_requests.Request(), timeout=getattr(settings, "GOOGLE_OAUTH_TIMEOUT", 5)
        )
        claims = id_token.verify_oauth2_token(
            token, request, settings.GOOGLE_OAUTH_CLIENT_ID, clock_skew_in_seconds=10
        )
    except (ValueError, GoogleAuthError) as exc:
        # Class name only; the token is a bearer credential.
        logger.info("Google ID token rejected (%s)", type(exc).__name__)
        raise GoogleSignInError("Invalid token") from exc

    if claims.get("iss") not in ISSUERS:
        raise GoogleSignInError("Wrong issuer")

    email = claims.get("email")
    # Google only vouches for an address when this is true. Without it anyone
    # could claim somebody else's address on a Workspace domain they control.
    if not isinstance(email, str) or not email or claims.get("email_verified") is not True:
        raise GoogleSignInError("Email not verified by Google")

    name = claims.get("name")
    return {"email": email.strip().lower(), "name": name.strip() if isinstance(name, str) else ""}
