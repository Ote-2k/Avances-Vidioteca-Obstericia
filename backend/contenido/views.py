"""Vistas de la API para las asignaturas."""

from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.viewsets import ModelViewSet

from usuarios.models import User

from .models import Asignatura, Unidad
from .pagination import AsignaturaPagination
from .permissions import CanManageOwnedAssignment, CanManageOwnedUnit
from .serializers import AsignaturaSerializer, UnidadSerializer


class AsignaturaViewSet(ModelViewSet):
    """Expone el CRUD de asignaturas respetando propiedad e inscripción."""

    serializer_class = AsignaturaSerializer
    permission_classes = (CanManageOwnedAssignment,)
    filter_backends = (DjangoFilterBackend, SearchFilter, OrderingFilter)
    filterset_fields = ("published",)
    search_fields = ("title", "description")
    ordering_fields = ("title", "created_at", "updated_at")
    ordering = ("title",)
    pagination_class = AsignaturaPagination

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Asignatura.objects.none()
        if user.role == User.Role.ADMIN:
            return Asignatura.objects.all()
        if user.role in (User.Role.PROFESOR, User.Role.PROFESOR_AREA):
            return Asignatura.objects.filter(owner=user)
        if user.role == User.Role.ALUMNO:
            return Asignatura.objects.filter(
                published=True,
                enrolled_students=user,
            )
        return Asignatura.objects.none()

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class AssignmentScopedQuerysetMixin:
    """Limita unidades según el acceso del usuario a su asignatura."""

    def get_asignatura_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Asignatura.objects.none()
        if user.role == User.Role.ADMIN:
            return Asignatura.objects.all()
        if user.role in (User.Role.PROFESOR, User.Role.PROFESOR_AREA):
            return Asignatura.objects.filter(owner=user)
        if user.role == User.Role.ALUMNO:
            return Asignatura.objects.filter(
                published=True,
                enrolled_students=user,
            )
        return Asignatura.objects.none()

    def get_asignatura(self):
        return get_object_or_404(
            self.get_asignatura_queryset(),
            pk=self.kwargs["asignatura_id"],
        )

    def get_queryset(self):
        return Unidad.objects.filter(asignatura=self.get_asignatura()).select_related(
            "asignatura",
        )


class UnidadListCreateView(AssignmentScopedQuerysetMixin, ListCreateAPIView):
    """Lista unidades accesibles o crea una unidad en la asignatura de la ruta."""

    serializer_class = UnidadSerializer
    permission_classes = (CanManageOwnedUnit,)

    def perform_create(self, serializer):
        serializer.save(asignatura=self.get_asignatura())


class UnidadDetailView(AssignmentScopedQuerysetMixin, RetrieveUpdateDestroyAPIView):
    """Consulta, edita o elimina una unidad de una asignatura accesible."""

    serializer_class = UnidadSerializer
    permission_classes = (CanManageOwnedUnit,)
