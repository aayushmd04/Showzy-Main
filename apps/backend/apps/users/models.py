import uuid
import hashlib
import hmac
import secrets
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone
from apps.core.models import TimeStampedModel, SoftDeleteModel


class UserRole(models.TextChoices):
    ATTENDEE = "attendee", "Attendee"
    ARTIST = "artist", "Artist"
    VENUE_OWNER = "venue_owner", "Venue Owner"
    ADMIN = "admin", "Admin"


class Language(models.TextChoices):
    EN = "en", "English"
    KN = "kn", "ಕನ್ನಡ"


class UserManager(BaseUserManager):
    def create_user(self, email, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        extra_fields.setdefault("is_active", True)
        user = self.model(email=email, **extra_fields)
        user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("role", UserRole.ADMIN)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_verified", True)
        user = self.create_user(email, **extra_fields)
        if password:
            user.set_password(password)
            user.save(using=self._db)
        return user


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel, SoftDeleteModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)
    phone = models.CharField(max_length=15, blank=True, null=True, unique=True,
                             help_text="E.164 format e.g. +919876543210")
    full_name = models.CharField(max_length=120)
    display_name = models.CharField(max_length=60, blank=True)
    avatar = models.ImageField(upload_to="avatars/%Y/%m/", null=True, blank=True)
    bio = models.TextField(blank=True, max_length=500)
    website = models.URLField(blank=True)
    instagram = models.CharField(max_length=60, blank=True)
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.ATTENDEE)
    preferred_language = models.CharField(max_length=5, choices=Language.choices, default=Language.EN)
    city = models.ForeignKey("core.City", on_delete=models.SET_NULL,
                             null=True, blank=True, related_name="users")
    is_verified = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    last_login_device = models.CharField(max_length=200, blank=True)

    objects = UserManager()
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["email"]), models.Index(fields=["role"])]

    def __str__(self):
        return f"{self.display_name or self.full_name} <{self.email}>"

    @property
    def name(self):
        return self.display_name or self.full_name


class OTPToken(models.Model):
    class Purpose(models.TextChoices):
        SIGNUP = "signup", "Sign Up"
        LOGIN = "login", "Login"
        VERIFY_EMAIL = "verify_email", "Verify Email"
        RESET = "reset", "Reset"
        # Re-authentication for the one irreversible thing a signed-in user can
        # do. Never accepted by the public sign-in endpoints.
        DELETE_ACCOUNT = "delete_account", "Delete account"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(db_index=True)
    otp_hash = models.CharField(max_length=64, help_text="SHA-256 of OTP")
    purpose = models.CharField(max_length=20, choices=Purpose.choices, default=Purpose.LOGIN)
    is_used = models.BooleanField(default=False)
    attempt_count = models.PositiveSmallIntegerField(default=0)
    expires_at = models.DateTimeField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["email", "is_used"]), models.Index(fields=["expires_at"])]

    def __str__(self):
        return f"OTP({self.purpose}) for {self.email}"

    @classmethod
    def generate_otp(cls):
        from django.conf import settings
        length = getattr(settings, "OTP_LENGTH", 6)
        # secrets, not random: random is a Mersenne Twister, whose output can
        # be predicted from enough observed values.
        return "".join(secrets.choice("0123456789") for _ in range(length))

    @classmethod
    def _pepper(cls) -> bytes:
        from django.conf import settings
        pepper = getattr(settings, "OTP_PEPPER", "") or settings.SECRET_KEY
        return pepper.encode()

    @classmethod
    def hash_otp(cls, raw_otp: str, binding: str = "") -> str:
        """Keyed hash of a code, bound to who it was issued to.

        A bare SHA-256 of a 6-digit code falls to a lookup table of a million
        entries, so a leaked table of tokens would hand over every live code.
        The HMAC key (``OTP_PEPPER``) lives in the environment, not the
        database, and ``binding`` ("email|purpose") stops one user's hash being
        replayed against another's token.
        """
        return hmac.new(
            cls._pepper(), f"{binding}|{raw_otp}".encode(), hashlib.sha256
        ).hexdigest()

    @classmethod
    def binding_for(cls, email: str, purpose: str) -> str:
        return f"{email.strip().lower()}|{purpose}"

    @classmethod
    def issue(cls, email: str, purpose: str, ip_address=None):
        """Invalidate any open code, mint a new one. Returns ``(token, raw_otp)``."""
        from datetime import timedelta
        from django.conf import settings

        email = email.strip().lower()
        cls.objects.filter(email=email, purpose=purpose, is_used=False).update(is_used=True)
        raw_otp = cls.generate_otp()
        token = cls.objects.create(
            email=email,
            otp_hash=cls.hash_otp(raw_otp, cls.binding_for(email, purpose)),
            purpose=purpose,
            expires_at=timezone.now()
            + timedelta(minutes=getattr(settings, "OTP_EXPIRY_MINUTES", 3)),
            ip_address=ip_address,
        )
        return token, raw_otp

    @classmethod
    def seconds_until_resend(cls, email: str, purpose: str) -> int:
        """0 if a new code may be sent now, else how long the caller must wait.

        Looks at the newest token regardless of ``is_used``: asking for a code
        marks the previous one used, so "unused" would never find it.
        """
        from django.conf import settings

        cooldown = getattr(settings, "OTP_RESEND_COOLDOWN_SECONDS", 45)
        latest = (
            cls.objects.filter(email=email.strip().lower(), purpose=purpose)
            .order_by("-created_at")
            .first()
        )
        if not latest or cooldown <= 0:
            return 0
        elapsed = (timezone.now() - latest.created_at).total_seconds()
        return max(0, int(cooldown - elapsed + 0.999))

    def verify(self, raw_otp: str) -> bool:
        from django.conf import settings
        if self.is_used or self.expires_at < timezone.now():
            return False

        max_attempts = getattr(settings, "OTP_MAX_ATTEMPTS", 5)
        # A single conditional UPDATE, not a read-then-write: several
        # concurrent guesses against the same token each raced to read the
        # same stale attempt_count before any of their writes committed, so
        # the "N attempts then dead" lockout could be bypassed by firing
        # requests in parallel. The WHERE clause is evaluated by the database
        # atomically per row, so only requests that land while genuinely
        # under the limit ever get counted as an attempt.
        rows = (
            OTPToken.objects
            .filter(pk=self.pk, attempt_count__lt=max_attempts)
            .update(attempt_count=models.F("attempt_count") + 1)
        )
        if rows == 0:
            return False
        self.refresh_from_db(fields=["attempt_count"])

        expected = self.hash_otp(raw_otp, self.binding_for(self.email, self.purpose))
        if hmac.compare_digest(self.otp_hash, expected):
            self.is_used = True
            self.save(update_fields=["is_used"])
            return True
        return False

    @property
    def is_expired(self):
        return self.expires_at < timezone.now()


class UserDevice(TimeStampedModel):
    class Platform(models.TextChoices):
        IOS = "ios", "iOS"
        ANDROID = "android", "Android"
        WEB = "web", "Web"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="devices")
    device_token = models.TextField()
    platform = models.CharField(max_length=10, choices=Platform.choices)
    device_model = models.CharField(max_length=80, blank=True)
    os_version = models.CharField(max_length=20, blank=True)
    app_version = models.CharField(max_length=20, blank=True)
    last_seen = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = [("user", "device_token")]
        ordering = ["-last_seen"]


class ConsentRecord(models.Model):
    """An append-only log of what a person agreed to, and when.

    The Digital Personal Data Protection Act, 2023 requires us to be able to
    show that consent was asked for and given (and to honour its withdrawal).
    Rows are never edited: a change of mind is a new row, and the latest row
    per `kind` is the person's current position. The user row is kept (soft
    deleted) after an erasure so this proof survives; it carries no contact
    details by then.
    """

    class Kind(models.TextChoices):
        TERMS_PRIVACY = "terms_privacy", "Terms of Service and Privacy Policy"
        ORGANISER_TERMS = "organiser_terms", "Terms for hosts and artists"
        MARKETING_EMAIL = "marketing_email", "Marketing email"
        TICKET_CONTACT = "ticket_contact", "Share ticket details with the organiser"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("users.User", on_delete=models.SET_NULL, null=True, blank=True,
                             related_name="consents")
    kind = models.CharField(max_length=30, choices=Kind.choices, db_index=True)
    version = models.CharField(max_length=20, help_text="Date of the document version, e.g. 2026-10-11")
    granted = models.BooleanField(default=True)
    source = models.CharField(max_length=30, blank=True, help_text="signin, checkout, onboarding, settings…")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "kind", "-created_at"])]

    def __str__(self):
        return f"{self.kind}@{self.version} {'granted' if self.granted else 'withdrawn'}"
