from django.contrib import admin

from .models import Asignatura


@admin.register(Asignatura)
class AsignaturaAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "published", "updated_at")
    list_filter = ("published",)
    search_fields = ("title", "description", "owner__email")
    filter_horizontal = ("enrolled_students",)
