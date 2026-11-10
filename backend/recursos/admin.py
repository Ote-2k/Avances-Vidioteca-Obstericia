from django.contrib import admin

from .models import Comentario, Documento, Recurso


@admin.register(Recurso)
class RecursoAdmin(admin.ModelAdmin):
    list_display = ("title", "unidad", "creador", "is_draft", "is_hidden", "created_at")
    list_filter = ("is_draft", "is_hidden", "unidad__asignatura")
    search_fields = ("title", "description", "unidad__name", "creador__email")
    readonly_fields = ("created_at",)


@admin.register(Documento)
class DocumentoAdmin(admin.ModelAdmin):
    list_display = ("title", "format", "recurso", "created_at")
    list_filter = ("format", "recurso__unidad__asignatura")
    search_fields = ("title", "description", "recurso__title")
    readonly_fields = ("created_at",)


@admin.register(Comentario)
class ComentarioAdmin(admin.ModelAdmin):
    list_display = ("recurso", "autor", "created_at")
    list_filter = ("created_at", "recurso__unidad__asignatura")
    search_fields = ("text", "autor__email", "recurso__title")
    readonly_fields = ("created_at",)
