from django.urls import path
from . import views

urlpatterns = [
    path("events/", views.EventListView.as_view(), name="events-list"),
    path("events/create/", views.EventCreateView.as_view(), name="events-create"),
    path("events/<uuid:pk>/", views.EventDetailView.as_view(), name="events-detail"),
    path("events/<uuid:pk>/save/", views.save_event, name="events-save"),
    path("events/<uuid:pk>/publish/", views.publish_event, name="events-publish"),
    path("events/<uuid:pk>/review/", views.create_review, name="events-review"),
    path("events/saved/", views.saved_events, name="events-saved"),
]
