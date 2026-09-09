import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_id = self.scope["url_route"]["kwargs"]["room_id"]
        self.room_group = f"chat_{self.room_id}"
        self.user = self.scope["user"]

        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return

        # Verify membership
        is_member = await self.check_membership()
        if not is_member:
            await self.close(code=4003)
            return

        await self.channel_layer.group_add(self.room_group, self.channel_name)
        await self.accept()
        await self.send(json.dumps({"type": "connected", "room_id": self.room_id}))

    async def disconnect(self, code):
        await self.channel_layer.group_discard(self.room_group, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, TypeError):
            return

        msg_type = data.get("type", "message")

        if msg_type == "message":
            content = data.get("content", "").strip()
            if not content:
                return
            reply_to_id = data.get("reply_to_id")
            message = await self.save_message(content, reply_to_id)
            payload = {
                "type": "chat_message",
                "message_id": str(message.id),
                "content": message.content,
                "sender_id": str(self.user.id),
                "sender_name": self.user.name,
                "reply_to_id": str(reply_to_id) if reply_to_id else None,
                "created_at": message.created_at.isoformat(),
            }
            await self.channel_layer.group_send(self.room_group, payload)

        elif msg_type == "typing":
            await self.channel_layer.group_send(self.room_group, {
                "type": "user_typing",
                "user_id": str(self.user.id),
                "user_name": self.user.name,
            })

        elif msg_type == "read":
            message_id = data.get("message_id")
            if message_id:
                await self.mark_read(message_id)

    async def chat_message(self, event):
        await self.send(json.dumps(event))

    async def user_typing(self, event):
        if str(self.user.id) != event.get("user_id"):
            await self.send(json.dumps(event))

    @database_sync_to_async
    def check_membership(self):
        from .models import ChatRoom, ChatRoomMembership
        return ChatRoomMembership.objects.filter(
            room_id=self.room_id, user=self.user, is_banned=False
        ).exists()

    @database_sync_to_async
    def save_message(self, content, reply_to_id=None):
        from .models import Message, ChatRoom
        reply_to = None
        if reply_to_id:
            try:
                reply_to = Message.objects.get(id=reply_to_id, room_id=self.room_id)
            except Message.DoesNotExist:
                pass
        return Message.objects.create(
            room_id=self.room_id,
            sender=self.user,
            content=content,
            reply_to=reply_to,
        )

    @database_sync_to_async
    def mark_read(self, message_id):
        from .models import Message, ChatRoomMembership
        try:
            msg = Message.objects.get(id=message_id, room_id=self.room_id)
            ChatRoomMembership.objects.filter(
                room_id=self.room_id, user=self.user
            ).update(last_read_message=msg)
        except Message.DoesNotExist:
            pass
