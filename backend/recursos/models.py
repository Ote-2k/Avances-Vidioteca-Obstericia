"""Modelos para recursos audiovisuales, documentos y comentarios."""

from django.conf import settings
from django.db import models

from contenido.models import Unidad


class Recurso(models.Model):
    """Recurso educativo dentro de una unidad de una asignatura."""

    unidad = models.ForeignKey(
        Unidad,
        on_delete=models.CASCADE,
        related_name="recursos",
        verbose_name="unidad",
    )
    title = models.CharField("título", max_length=200)
    description = models.TextField("descripción", blank=True)
    video_file = models.FileField(
        "archivo de video",
        upload_to="videos/%Y/%m/",
        blank=True,
    )
    video_url = models.URLField("URL externa del video", blank=True)
    trim_start = models.FloatField("inicio de reproducción", default=0.0)
    trim_end = models.FloatField("fin de reproducción", blank=True, null=True)
    is_hidden = models.BooleanField("oculto a estudiantes", default=False)
    is_draft = models.BooleanField("borrador", default=True)
    created_at = models.DateTimeField("fecha de creación", auto_now_add=True)
    creador = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="recursos_creados",
        verbose_name="creador",
    )

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "recurso"
        verbose_name_plural = "recursos"

    def __str__(self):
        return self.title


class Documento(models.Model):
    """Documento de apoyo cargado o enlazado desde un recurso."""

    recurso = models.ForeignKey(
        Recurso,
        on_delete=models.CASCADE,
        related_name="materials",
        verbose_name="recurso",
    )
    title = models.CharField("título", max_length=200)
    format = models.CharField("formato", max_length=50, default="Documento")
    description = models.TextField("descripción", blank=True)
    archivo = models.FileField(
        "archivo adjunto",
        upload_to="documentos/%Y/%m/",
        blank=True,
    )
    url = models.URLField("enlace externo", blank=True)
    created_at = models.DateTimeField("fecha de creación", auto_now_add=True)

    class Meta:
        ordering = ("title",)
        verbose_name = "documento o material"
        verbose_name_plural = "documentos y materiales"

    def __str__(self):
        return f"{self.title} ({self.format})"


class Comentario(models.Model):
    """Comentario de un usuario sobre un recurso, con respuestas opcionales."""

    recurso = models.ForeignKey(
        Recurso,
        on_delete=models.CASCADE,
        related_name="comments",
        verbose_name="recurso",
    )
    autor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="comentarios",
        verbose_name="autor",
    )
    text = models.TextField("contenido del comentario")
    respuesta_a = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="respuestas",
        verbose_name="comentario respondido",
    )
    created_at = models.DateTimeField("fecha de creación", auto_now_add=True)

    class Meta:
        ordering = ("created_at",)
        verbose_name = "comentario"
        verbose_name_plural = "comentarios"

    def __str__(self):
        return f"Comentario de {self.autor} en {self.recurso}"
