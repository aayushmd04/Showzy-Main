from django.urls import path
from . import views

urlpatterns = [
    path("notifications/", views.NotificationListView.as_view(), name="notifications-list"),
    path("notifications/read-all/", views.mark_all_read, name="notifications-read-all"),
    path("notifications/<uuid:pk>/read/", views.mark_read, name="notifications-read"),
    path("notifications/preferences/", views.NotificationPreferenceView.as_view(),
         name="notifications-prefs"),
]
