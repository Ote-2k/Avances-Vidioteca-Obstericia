from django.contrib import admin

from .models import Asignatura, Unidad


@admin.register(Asignatura)
class AsignaturaAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "published", "updated_at")
    list_filter = ("published",)
    search_fields = ("title", "description", "owner__email")
    filter_horizontal = ("enrolled_students",)


@admin.register(Unidad)
class UnidadAdmin(admin.ModelAdmin):
    list_display = ("name", "asignatura", "updated_at")
    list_filter = ("asignatura",)
    search_fields = ("name", "asignatura__title")
