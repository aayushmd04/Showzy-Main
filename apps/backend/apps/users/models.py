import uuid
import hashlib
import random
import string
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
        return "".join(random.choices(string.digits, k=getattr(settings, "OTP_LENGTH", 6)))

    @classmethod
    def hash_otp(cls, raw_otp: str) -> str:
        return hashlib.sha256(raw_otp.encode()).hexdigest()

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

        if self.otp_hash == self.hash_otp(raw_otp):
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
