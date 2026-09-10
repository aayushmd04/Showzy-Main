from django.contrib import admin
from .models import TicketTier, Order, OrderItem, Ticket, PromoCode, ZoneAllocation

class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "event", "status", "total_amount", "created_at"]
    list_filter = ["status"]
    search_fields = ["user__email", "event__title"]
    inlines = [OrderItemInline]
    readonly_fields = ["id"]

@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = ["ticket_number", "event", "user", "tier", "status", "checked_in_at"]
    list_filter = ["status", "event"]
    search_fields = ["ticket_number", "user__email"]
    readonly_fields = ["id", "qr_data", "ticket_number"]

@admin.register(TicketTier)
class TicketTierAdmin(admin.ModelAdmin):
    list_display = ["name", "event", "tier_type", "price", "total_quantity", "sold_quantity"]

@admin.register(ZoneAllocation)
class ZoneAllocationAdmin(admin.ModelAdmin):
    list_display = ["zone_label", "event", "quantity", "status", "order", "created_at"]
    list_filter = ["status", "event"]
    search_fields = ["zone_label", "zone_id", "order__id"]
    readonly_fields = ["order", "event", "zone_id", "capacity_at_booking"]

@admin.register(PromoCode)
class PromoCodeAdmin(admin.ModelAdmin):
    list_display = ["code", "event", "discount_type", "discount_value", "used_count", "is_active"]
