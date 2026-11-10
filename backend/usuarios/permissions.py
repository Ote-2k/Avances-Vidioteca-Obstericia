"""Permisos reutilizables según los roles de la videoteca."""

from rest_framework.permissions import BasePermission

from .models import User


class HasApplicationRole(BasePermission):
    """Permite el acceso a los roles indicados y siempre al rol admin de la API."""

    allowed_roles = ()

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        return user.role == User.Role.ADMIN or user.role in self.allowed_roles


class IsProfessorOrAreaTeacher(HasApplicationRole):
    """Permite operaciones de edición a profesores y profesores de área."""

    allowed_roles = (User.Role.PROFESOR, User.Role.PROFESOR_AREA)


class IsApplicationAdmin(HasApplicationRole):
    """Permite operaciones administrativas a la persona con rol admin de la API."""

    allowed_roles = (User.Role.ADMIN,)
