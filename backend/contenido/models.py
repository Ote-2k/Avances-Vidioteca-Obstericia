"""Modelos de asignaturas de la videoteca."""

from django.conf import settings
from django.db import models


class Asignatura(models.Model):
    """Asignatura educativa con un profesor propietario y alumnos inscritos."""

    title = models.CharField("título", max_length=200)
    description = models.TextField("descripción", blank=True)
    cover_url = models.URLField("URL de portada", blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="asignaturas_creadas",
        verbose_name="profesor propietario",
    )
    enrolled_students = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="asignaturas_inscritas",
        verbose_name="alumnos inscritos",
        limit_choices_to={"role": "alumno"},
    )
    published = models.BooleanField("publicada", default=True)
    created_at = models.DateTimeField("fecha de creación", auto_now_add=True)
    updated_at = models.DateTimeField("última actualización", auto_now=True)

    class Meta:
        db_table = "contenido_assignment"
        ordering = ("title",)
        verbose_name = "asignatura"
        verbose_name_plural = "asignaturas"

    def __str__(self):
        return self.title
