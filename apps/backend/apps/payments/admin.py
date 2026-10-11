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


from .models import OrganizerPayout  # noqa: E402


@admin.register(OrganizerPayout)
class OrganizerPayoutAdmin(admin.ModelAdmin):
    list_display = ["event", "amount", "reference", "paid_at"]
    search_fields = ["reference", "event__title"]

    def save_model(self, request, obj, form, change):
        if not obj.recorded_by_id:
            obj.recorded_by = request.user
        super().save_model(request, obj, form, change)
