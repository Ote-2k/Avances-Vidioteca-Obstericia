from django.db import models
from django.contrib.auth.models import User

class Recurso(models.Model):
    """
    Modelo principal (datos sacados de ResourceSummary en types.ts)
    """
    title = models.CharField(max_length=200, verbose_name="Titulo")
    description = models.TextField(blank=True, null=True, verbose_name="Descripcion")
    video_url = models.URLField(blank=True, null=True, verbose_name="URL del Video")
    trim_start = models.FloatField(default=0.0, verbose_name="Inicio de reproduccion")
    trim_end = models.FloatField(blank=True, null=True, verbose_name="Fin de reproducción (seg)")
    is_hidden = models.BooleanField(default=False, verbose_name="Oculto a estudiantes")
    is_draft = models.BooleanField(default=True, verbose_name="Es borrador")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Fecha de creacion")
    creador = models.ForeignKey(User, on_delete=models.CASCADE, related_name='recursos')

    class Meta:
        verbose_name = "Recurso"
        verbose_name_plural = "Recursos"
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class Documento(models.Model):
    """
    Materiales/Documentos adjuntos (datos sacados de ResourceSummary en types.ts)
    """
    recurso = models.ForeignKey(Recurso, on_delete=models.CASCADE, related_name='materials')
    title = models.CharField(max_length=200, verbose_name="Titulo del material")
    format = models.CharField(max_length=50, default='Enlace', verbose_name="Formato")
    description = models.TextField(blank=True, null=True, verbose_name="Descripcion")
    url = models.URLField(blank=True, null=True, verbose_name="URL o Enlace externo")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Fecha de creacion")

    class Meta:
        verbose_name = "Documento/Material"
        verbose_name_plural = "Documentos y Materiales"

    def __str__(self):
        return f"{self.title} ({self.format})"


class Comentario(models.Model):
    """
    Comentarios 
    """
    recurso = models.ForeignKey(Recurso, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='comentarios')
    text = models.TextField(verbose_name="Contenido del comentario")
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='replies')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Fecha de creacion")

    class Meta:
        verbose_name = "Comentario"
        verbose_name_plural = "Comentarios"
        ordering = ['created_at']

    def __str__(self):
        return f"Comentario de {self.author.username} en {self.recurso.title}"