from django.urls import path
from . import views

urlpatterns = [
    path("chat/rooms/", views.MyRoomsView.as_view(), name="chat-rooms"),
    path("chat/rooms/<uuid:room_id>/messages/", views.RoomMessagesView.as_view(), name="chat-messages"),
    path("chat/rooms/<uuid:room_id>/send/", views.send_message, name="chat-send"),
    path("chat/event/<uuid:event_id>/", views.event_chat, name="chat-event"),
]
