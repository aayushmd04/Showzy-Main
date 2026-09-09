from django.contrib import admin
from .models import City, Area, Genre

@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    list_display = ["name", "name_kn", "slug", "is_active"]
    prepopulated_fields = {"slug": ("name",)}

@admin.register(Area)
class AreaAdmin(admin.ModelAdmin):
    list_display = ["name", "city", "slug", "is_active"]
    list_filter = ["city"]

@admin.register(Genre)
class GenreAdmin(admin.ModelAdmin):
    list_display = ["name", "name_kn", "slug", "sort_order", "is_active"]
    ordering = ["sort_order"]
