from django.contrib import admin
from django.utils import timezone
from .models import (
    Organizer, Membership, GigApplication,
    BookingConversation, BookingMessage, Offer, BookingOrder,
    Transfer, LedgerEntry, Dispute, BookingAuditLog,
)


@admin.register(Organizer)
class OrganizerAdmin(admin.ModelAdmin):
    list_display = ["name", "organizer_type", "kyc_status", "is_verified", "city", "created_at"]
    list_filter = ["organizer_type", "kyc_status", "is_verified"]
    search_fields = ["name", "contact_email", "razorpay_account_id"]
    readonly_fields = ["id", "created_at", "updated_at"]

    actions = ["mark_kyc_verified"]

    def mark_kyc_verified(self, request, queryset):
        queryset.update(kyc_status=Organizer.KYCStatus.VERIFIED, is_verified=True, kyc_verified_at=timezone.now())
    mark_kyc_verified.short_description = "Mark KYC as Verified"


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ["user", "organizer", "role", "is_active", "created_at"]
    list_filter = ["role", "is_active"]
    raw_id_fields = ["user", "organizer", "invited_by"]


@admin.register(GigApplication)
class GigApplicationAdmin(admin.ModelAdmin):
    list_display = ["artist", "event", "status", "proposed_fee", "created_at"]
    list_filter = ["status"]
    raw_id_fields = ["event", "artist", "reviewed_by"]


class LedgerEntryInline(admin.TabularInline):
    model = LedgerEntry
    extra = 0
    readonly_fields = ["entry_type", "amount", "currency", "description", "reference_id", "created_at"]
    can_delete = False


class BookingAuditLogInline(admin.TabularInline):
    model = BookingAuditLog
    extra = 0
    readonly_fields = ["actor", "previous_status", "new_status", "note", "ip_address", "created_at"]
    can_delete = False


@admin.register(BookingOrder)
class BookingOrderAdmin(admin.ModelAdmin):
    list_display = [
        "id", "organizer", "artist", "status", "gross_amount",
        "artist_payout", "performance_date", "funded_at", "auto_release_at",
    ]
    list_filter = ["status", "currency"]
    search_fields = ["razorpay_order_id", "razorpay_payment_id"]
    readonly_fields = [
        "id", "offer", "gross_amount", "platform_fee", "tds_amount", "artist_payout",
        "razorpay_order_id", "razorpay_payment_id", "funded_at", "auto_release_at",
        "completed_at", "released_at", "settled_at", "auto_release_task_id", "created_at",
    ]
    inlines = [LedgerEntryInline, BookingAuditLogInline]

    actions = ["admin_force_release", "admin_force_refund"]

    def admin_force_release(self, request, queryset):
        for order in queryset.filter(status=BookingOrder.Status.DISPUTED):
            order.transition(BookingOrder.Status.COMPLETED, actor=request.user, reason="Admin force-release")
            order.transition(BookingOrder.Status.RELEASED, actor=request.user)
    admin_force_release.short_description = "Force-release escrow to artist (admin)"

    def admin_force_refund(self, request, queryset):
        for order in queryset.filter(status=BookingOrder.Status.DISPUTED):
            order.transition(BookingOrder.Status.REFUNDED, actor=request.user, reason="Admin force-refund")
    admin_force_refund.short_description = "Force-refund to host (admin)"


@admin.register(Dispute)
class DisputeAdmin(admin.ModelAdmin):
    list_display = ["booking_order", "raised_by", "resolution", "resolved_at", "created_at"]
    list_filter = ["resolution"]
    readonly_fields = ["id", "booking_order", "raised_by", "created_at"]
    search_fields = ["reason", "admin_notes"]


@admin.register(BookingMessage)
class BookingMessageAdmin(admin.ModelAdmin):
    list_display = ["sender", "conversation", "is_flagged", "flag_reason", "created_at"]
    list_filter = ["is_flagged", "message_type"]
    search_fields = ["content", "flag_reason"]


@admin.register(Transfer)
class TransferAdmin(admin.ModelAdmin):
    list_display = ["razorpay_transfer_id", "booking_order", "amount", "on_hold", "hold_released_at"]
    list_filter = ["on_hold", "status"]
    readonly_fields = ["id", "created_at"]
