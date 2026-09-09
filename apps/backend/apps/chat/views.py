from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .models import ChatRoom, ChatRoomMembership, Message
from .serializers import ChatRoomSerializer, MessageSerializer, SendMessageSerializer


class MyRoomsView(generics.ListAPIView):
    serializer_class = ChatRoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ChatRoom.objects.filter(
            memberships__user=self.request.user,
            is_active=True
        ).prefetch_related("memberships").select_related("event", "venue")


class RoomMessagesView(generics.ListAPIView):
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        room_id = self.kwargs["room_id"]
        room = generics.get_object_or_404(ChatRoom, pk=room_id, is_active=True)
        # Verify membership
        if not ChatRoomMembership.objects.filter(room=room, user=self.request.user).exists():
            return Message.objects.none()
        return Message.objects.filter(room=room, is_deleted=False).select_related(
            "sender", "reply_to"
        ).prefetch_related("attachments").order_by("created_at")


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def send_message(request, room_id):
    room = generics.get_object_or_404(ChatRoom, pk=room_id, is_active=True)
    if not ChatRoomMembership.objects.filter(room=room, user=request.user, is_banned=False).exists():
        return Response({"detail": "Not a member of this room."}, status=403)
    serializer = SendMessageSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    d = serializer.validated_data
    reply_to = None
    if d.get("reply_to_id"):
        try:
            reply_to = Message.objects.get(id=d["reply_to_id"], room=room)
        except Message.DoesNotExist:
            pass
    msg = Message.objects.create(
        room=room, sender=request.user,
        content=d.get("content", ""),
        message_type=d.get("message_type", "text"),
        reply_to=reply_to,
    )
    return Response(MessageSerializer(msg).data, status=201)


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def event_chat(request, event_id):
    from apps.events.models import Event
    event = generics.get_object_or_404(Event, pk=event_id, is_deleted=False)
    room, created = ChatRoom.objects.get_or_create(
        room_type="event_public",
        event=event,
        defaults={"name": f"{event.title} Chat", "created_by": request.user}
    )
    ChatRoomMembership.objects.get_or_create(
        room=room, user=request.user,
        defaults={"role": "member"}
    )
    return Response(ChatRoomSerializer(room, context={"request": request}).data)
