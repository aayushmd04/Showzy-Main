from rest_framework import serializers
from .models import ChatRoom, ChatRoomMembership, Message, MessageAttachment


class MessageAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = MessageAttachment
        fields = ["id", "file", "file_type", "file_name", "file_size", "width", "height"]


class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.name", read_only=True, allow_null=True)
    sender_avatar = serializers.ImageField(source="sender.avatar", read_only=True, allow_null=True)
    attachments = MessageAttachmentSerializer(many=True, read_only=True)
    reply_to_content = serializers.CharField(
        source="reply_to.content", read_only=True, allow_null=True
    )

    class Meta:
        model = Message
        fields = [
            "id", "room", "sender", "sender_name", "sender_avatar",
            "content", "message_type", "reply_to", "reply_to_content",
            "reactions", "is_edited", "edited_at",
            "is_deleted", "attachments", "created_at",
        ]
        read_only_fields = ["id", "sender", "is_edited", "edited_at", "is_deleted", "created_at"]


class SendMessageSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=5000, allow_blank=True)
    message_type = serializers.ChoiceField(
        choices=["text", "image", "file", "ticket_share", "event_share"],
        default="text"
    )
    reply_to_id = serializers.UUIDField(required=False, allow_null=True)
    shared_event_id = serializers.UUIDField(required=False, allow_null=True)
    shared_ticket_id = serializers.UUIDField(required=False, allow_null=True)


class ChatRoomSerializer(serializers.ModelSerializer):
    unread_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    participant_count = serializers.SerializerMethodField()

    class Meta:
        model = ChatRoom
        fields = [
            "id", "room_type", "name", "avatar", "is_active",
            "event", "venue", "unread_count", "last_message",
            "participant_count", "created_at",
        ]

    def get_unread_count(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return 0
        membership = obj.memberships.filter(user=request.user).first()
        if not membership or not membership.last_read_message:
            return obj.messages.filter(is_deleted=False).count()
        return obj.messages.filter(
            is_deleted=False,
            created_at__gt=membership.last_read_message.created_at
        ).count()

    def get_last_message(self, obj):
        msg = obj.messages.filter(is_deleted=False).last()
        if msg:
            return {"content": msg.content[:80], "sender": msg.sender.name if msg.sender else None,
                    "created_at": msg.created_at}
        return None

    def get_participant_count(self, obj):
        return obj.memberships.count()
