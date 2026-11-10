"""Permisos de acceso a asignaturas."""

from rest_framework.permissions import BasePermission, SAFE_METHODS

from usuarios.models import User


class CanManageOwnedAssignment(BasePermission):
    """Permite gestionar asignaturas a profesores de área y administradores."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        return request.method in SAFE_METHODS or user.role in (
            User.Role.PROFESOR_AREA,
            User.Role.ADMIN,
        )

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True

        return (
            request.user.role == User.Role.ADMIN
            or (
                request.user.role == User.Role.PROFESOR_AREA
                and obj.owner_id == request.user.pk
            )
        )


class CanManageOwnedUnit(BasePermission):
    """Permite escribir a profesores en sus unidades y a admins en todas."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        return request.method in SAFE_METHODS or user.role in (
            User.Role.PROFESOR,
            User.Role.PROFESOR_AREA,
            User.Role.ADMIN,
        )

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True

        return request.user.role == User.Role.ADMIN or obj.asignatura.owner_id == request.user.pk
