from django.contrib import admin
from .models import Payment, Refund, PaymentWebhook

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ["id", "order", "gateway", "amount", "status", "initiated_at"]
    list_filter = ["gateway", "status"]
    readonly_fields = ["id"]

@admin.register(Refund)
class RefundAdmin(admin.ModelAdmin):
    list_display = ["id", "order", "amount", "reason", "status", "created_at"]
    list_filter = ["status", "reason"]

@admin.register(PaymentWebhook)
class WebhookAdmin(admin.ModelAdmin):
    list_display = ["gateway", "event_type", "event_id", "is_processed", "received_at"]
    list_filter = ["gateway", "is_processed"]
    search_fields = ["event_id", "event_type"]
