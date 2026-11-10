"""Vistas de la API para recursos, documentos y comentarios."""

from rest_framework.viewsets import ModelViewSet
from rest_framework.serializers import ListSerializer

from usuarios.models import User

from .models import Comentario, Documento, Recurso
from .permissions import (
    CanManageResource,
    CanManageResourceComment,
    CanManageResourceDocument,
)
from .serializers import ComentarioSerializer, DocumentoSerializer, RecursoSerializer


def visible_resources_for(user):
    """Devuelve los recursos visibles para el rol autenticado."""
    resources = Recurso.objects.select_related("unidad__asignatura", "creador")
    if not user.is_authenticated:
        return resources.none()
    if user.role == User.Role.ADMIN:
        return resources
    if user.role in (User.Role.PROFESOR, User.Role.PROFESOR_AREA):
        return resources.filter(unidad__asignatura__owner=user)
    if user.role == User.Role.ALUMNO:
        return resources.filter(
            unidad__asignatura__published=True,
            unidad__asignatura__enrolled_students=user,
            is_hidden=False,
            is_draft=False,
        )
    return resources.none()


class RecursoViewSet(ModelViewSet):
    """Expone el CRUD de recursos dentro de asignaturas accesibles."""

    serializer_class = RecursoSerializer
    permission_classes = (CanManageResource,)

    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return Recurso.objects.none()
        return visible_resources_for(self.request.user)

    def perform_create(self, serializer):
        serializer.save(creador=self.request.user)


class DocumentoViewSet(ModelViewSet):
    """Gestiona documentos y enlaces pertenecientes a recursos accesibles."""

    serializer_class = DocumentoSerializer
    permission_classes = (CanManageResourceDocument,)

    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return Documento.objects.none()
        return Documento.objects.filter(
            recurso__in=visible_resources_for(self.request.user),
        ).select_related("recurso__unidad__asignatura")

    def get_serializer(self, *args, **kwargs):
        serializer = super().get_serializer(*args, **kwargs)
        fields_serializer = (
            serializer.child if isinstance(serializer, ListSerializer) else serializer
        )
        fields_serializer.fields["recurso"].queryset = visible_resources_for(
            self.request.user,
        )
        return serializer


class ComentarioViewSet(ModelViewSet):
    """Lista y crea comentarios en recursos accesibles."""

    serializer_class = ComentarioSerializer
    permission_classes = (CanManageResourceComment,)

    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return Comentario.objects.none()
        return Comentario.objects.filter(
            recurso__in=visible_resources_for(self.request.user),
        ).select_related(
            "recurso__unidad__asignatura",
            "autor",
            "respuesta_a",
        )

    def get_serializer(self, *args, **kwargs):
        serializer = super().get_serializer(*args, **kwargs)
        fields_serializer = (
            serializer.child if isinstance(serializer, ListSerializer) else serializer
        )
        fields_serializer.fields["recurso"].queryset = visible_resources_for(
            self.request.user,
        )
        fields_serializer.fields["respuesta_a"].queryset = Comentario.objects.filter(
            recurso__in=visible_resources_for(self.request.user),
        )
        return serializer

    def perform_create(self, serializer):
        serializer.save(autor=self.request.user)
