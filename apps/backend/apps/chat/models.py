import uuid
from django.db import models
from django.conf import settings
from apps.core.models import TimeStampedModel


class RoomType(models.TextChoices):
    EVENT_PUBLIC = "event_public", "Event Public Chat"
    ARTIST_FAN = "artist_fan", "Artist Fan Chat"
    VENUE_SUPPORT = "venue_support", "Venue Support"
    DIRECT = "direct", "Direct Message"
    GROUP = "group", "Group Chat"


class ChatRoom(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room_type = models.CharField(max_length=20, choices=RoomType.choices, db_index=True)
    event = models.ForeignKey("events.Event", on_delete=models.CASCADE,
                              null=True, blank=True, related_name="chat_rooms")
    venue = models.ForeignKey("venues.Venue", on_delete=models.CASCADE,
                              null=True, blank=True, related_name="chat_rooms")
    name = models.CharField(max_length=100, blank=True)
    description = models.CharField(max_length=300, blank=True)
    avatar = models.ImageField(upload_to="chat/avatars/", null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    max_participants = models.PositiveIntegerField(null=True, blank=True)
    is_read_only = models.BooleanField(default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, related_name="created_rooms")

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.name or f"{self.room_type} — {self.id}"


class ChatRoomMembership(TimeStampedModel):
    class MemberRole(models.TextChoices):
        ADMIN = "admin", "Admin"
        MODERATOR = "moderator", "Moderator"
        MEMBER = "member", "Member"

    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="chat_memberships")
    role = models.CharField(max_length=12, choices=MemberRole.choices, default=MemberRole.MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)
    last_read_message = models.ForeignKey("Message", on_delete=models.SET_NULL,
                                          null=True, blank=True, related_name="+")
    is_muted = models.BooleanField(default=False)
    muted_until = models.DateTimeField(null=True, blank=True)
    is_banned = models.BooleanField(default=False)
    banned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                  null=True, blank=True, related_name="+")
    ban_reason = models.CharField(max_length=200, blank=True)

    class Meta:
        unique_together = [("room", "user")]
        ordering = ["-joined_at"]


class MessageType(models.TextChoices):
    TEXT = "text", "Text"
    IMAGE = "image", "Image"
    FILE = "file", "File"
    AUDIO = "audio", "Audio"
    SYSTEM = "system", "System Message"
    TICKET_SHARE = "ticket_share", "Shared Ticket"
    EVENT_SHARE = "event_share", "Shared Event"


class Message(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                               null=True, related_name="sent_messages")
    content = models.TextField(blank=True)
    message_type = models.CharField(max_length=15, choices=MessageType.choices,
                                    default=MessageType.TEXT)
    reply_to = models.ForeignKey("self", on_delete=models.SET_NULL,
                                 null=True, blank=True, related_name="replies")
    reactions = models.JSONField(default=dict, blank=True,
                                  help_text='{"👍": ["user_uuid1", "user_uuid2"]}')

    is_edited = models.BooleanField(default=False)
    edited_at = models.DateTimeField(null=True, blank=True)
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name="+")

    # For shared objects
    shared_event = models.ForeignKey("events.Event", on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name="+")
    shared_ticket = models.ForeignKey("tickets.Ticket", on_delete=models.SET_NULL,
                                      null=True, blank=True, related_name="+")

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["room", "created_at"]),
                   models.Index(fields=["room", "is_deleted"])]

    def __str__(self):
        return f"[{self.room}] {self.sender}: {self.content[:40]}"


class MessageAttachment(TimeStampedModel):
    class FileType(models.TextChoices):
        IMAGE = "image", "Image"
        PDF = "pdf", "PDF"
        AUDIO = "audio", "Audio"
        OTHER = "other", "Other"

    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to="chat/attachments/%Y/%m/")
    file_type = models.CharField(max_length=10, choices=FileType.choices)
    file_name = models.CharField(max_length=200)
    file_size = models.PositiveIntegerField(help_text="Bytes")
    width = models.PositiveSmallIntegerField(null=True, blank=True)
    height = models.PositiveSmallIntegerField(null=True, blank=True)
    duration_seconds = models.PositiveSmallIntegerField(null=True, blank=True)


class MessageReadReceipt(models.Model):
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name="read_receipts")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="read_receipts")
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("message", "user")]
