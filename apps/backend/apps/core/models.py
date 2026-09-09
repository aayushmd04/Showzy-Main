import uuid
from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class SoftDeleteModel(models.Model):
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    is_deleted = models.BooleanField(default=False, db_index=True)

    class Meta:
        abstract = True

    def soft_delete(self):
        from django.utils import timezone
        self.deleted_at = timezone.now()
        self.is_deleted = True
        self.save(update_fields=["deleted_at", "is_deleted"])


class City(TimeStampedModel):
    name = models.CharField(max_length=80)
    name_kn = models.CharField(max_length=80, blank=True)
    slug = models.SlugField(unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = "cities"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Area(TimeStampedModel):
    city = models.ForeignKey(City, on_delete=models.CASCADE, related_name="areas")
    name = models.CharField(max_length=100)
    name_kn = models.CharField(max_length=100, blank=True)
    slug = models.SlugField()
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = [("city", "slug")]
        ordering = ["name"]

    def __str__(self):
        return f"{self.name}, {self.city.name}"


class Genre(TimeStampedModel):
    name = models.CharField(max_length=60)
    name_kn = models.CharField(max_length=60, blank=True)
    slug = models.SlugField(unique=True)
    icon = models.CharField(max_length=10, blank=True)
    color = models.CharField(max_length=7, blank=True, help_text="Hex color e.g. #C4472E")
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name
