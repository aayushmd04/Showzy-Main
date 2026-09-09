from django.contrib import admin
from .models import ChatRoom, ChatRoomMembership, Message

@admin.register(ChatRoom)
class ChatRoomAdmin(admin.ModelAdmin):
    list_display = ["name", "room_type", "is_active", "created_at"]

@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ["room", "sender", "message_type", "is_deleted", "created_at"]
    list_filter = ["message_type", "is_deleted"]
