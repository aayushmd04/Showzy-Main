from django.contrib import admin
from .models import Event, EventArtist, EventPhoto, EventReview

class EventArtistInline(admin.TabularInline):
    model = EventArtist
    extra = 1

@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ["title", "venue", "status", "start_datetime", "is_featured", "is_free"]
    list_filter = ["status", "event_type", "is_free", "is_featured"]
    search_fields = ["title", "venue__name"]
    filter_horizontal = ["genres"]
    inlines = [EventArtistInline]
