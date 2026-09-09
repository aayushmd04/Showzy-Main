from django.contrib import admin
from .models import Artist, ArtistPhoto, ArtistFollower

@admin.register(Artist)
class ArtistAdmin(admin.ModelAdmin):
    list_display = ["stage_name", "city", "follower_count", "is_verified", "is_featured"]
    list_filter = ["is_verified", "is_featured", "city"]
    search_fields = ["stage_name"]
    filter_horizontal = ["genres"]
