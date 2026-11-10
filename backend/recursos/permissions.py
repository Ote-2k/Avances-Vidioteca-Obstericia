"""Permisos de acceso a recursos, documentos y comentarios."""

from rest_framework.permissions import BasePermission, SAFE_METHODS

from usuarios.models import User


def can_access_resource(user, resource):
    """Indica si el usuario puede acceder al recurso según rol y matrícula."""
    assignment = resource.unidad.asignatura
    if user.role == User.Role.ADMIN:
        return True
    if user.role in (User.Role.PROFESOR, User.Role.PROFESOR_AREA):
        return assignment.owner_id == user.pk
    if user.role == User.Role.ALUMNO:
        return (
            assignment.published
            and resource.unidad.asignatura.enrolled_students.filter(pk=user.pk).exists()
            and not resource.is_hidden
            and not resource.is_draft
        )
    return False


class CanManageResource(BasePermission):
    """Permite lectura según acceso al curso y edición a propietario o admin."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return user.role in (
            User.Role.PROFESOR,
            User.Role.PROFESOR_AREA,
            User.Role.ADMIN,
        )

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return can_access_resource(request.user, obj)
        return (
            request.user.role == User.Role.ADMIN
            or obj.unidad.asignatura.owner_id == request.user.pk
        )


class CanManageResourceDocument(BasePermission):
    """Protege documentos con el mismo alcance de acceso que su recurso."""

    def has_permission(self, request, view):
        return CanManageResource().has_permission(request, view)

    def has_object_permission(self, request, view, obj):
        return CanManageResource().has_object_permission(request, view, obj.recurso)


class CanManageResourceComment(BasePermission):
    """Permite comentar en recursos accesibles y moderar contenido autorizado."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return can_access_resource(request.user, obj.recurso)
        return (
            request.user.role == User.Role.ADMIN
            or obj.autor_id == request.user.pk
            or obj.recurso.unidad.asignatura.owner_id == request.user.pk
        )
