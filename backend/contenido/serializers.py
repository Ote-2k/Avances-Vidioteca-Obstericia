"""Serializadores de la API de contenido."""

from rest_framework import serializers

from usuarios.models import User

from .models import Asignatura, Unidad


class AsignaturaSerializer(serializers.ModelSerializer):
    """Representa una asignatura y permite gestionar sus alumnos inscritos."""

    enrolled_students = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=User.objects.filter(role=User.Role.ALUMNO),
        required=False,
    )

    class Meta:
        model = Asignatura
        fields = (
            "id",
            "title",
            "description",
            "cover_url",
            "owner",
            "enrolled_students",
            "published",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "owner", "created_at", "updated_at")


class UnidadSerializer(serializers.ModelSerializer):
    """Representa una unidad; la asignatura se fija desde la ruta anidada."""

    class Meta:
        model = Unidad
        fields = ("id", "asignatura", "name", "created_at", "updated_at")
        read_only_fields = ("id", "asignatura", "created_at", "updated_at")
