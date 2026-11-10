"""Serializadores de lectura para las cuentas de usuario."""

from rest_framework import serializers

from .models import User


class UserProfileSerializer(serializers.ModelSerializer):
    """Expone la información básica del usuario autenticado, sin su contraseña."""

    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name", "role")
        read_only_fields = fields
