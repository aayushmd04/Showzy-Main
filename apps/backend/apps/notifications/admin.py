from django.contrib import admin
from .models import Notification, NotificationPreference

@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ["user", "notification_type", "channel", "is_read", "is_sent", "created_at"]
    list_filter = ["notification_type", "channel", "is_read"]
