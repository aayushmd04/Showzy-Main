from django.contrib import admin
from .models import Venue, VenuePhoto, VenueHours, VenueOperatorAccess

class VenuePhotoInline(admin.TabularInline):
    model = VenuePhoto
    extra = 1

class VenueHoursInline(admin.TabularInline):
    model = VenueHours
    extra = 0

@admin.register(Venue)
class VenueAdmin(admin.ModelAdmin):
    list_display = ["name", "city", "stage_type", "capacity", "is_verified", "is_featured", "is_active"]
    list_filter = ["city", "stage_type", "is_verified", "is_active"]
    search_fields = ["name", "address_line1"]
    prepopulated_fields = {"slug": ("name",)}
    inlines = [VenuePhotoInline, VenueHoursInline]
