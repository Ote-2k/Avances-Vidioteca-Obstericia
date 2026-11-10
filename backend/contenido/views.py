"""Vistas de la API para las asignaturas."""

from rest_framework.viewsets import ModelViewSet

from usuarios.models import User

from .models import Asignatura
from .permissions import CanManageOwnedAssignment
from .serializers import AsignaturaSerializer


class AsignaturaViewSet(ModelViewSet):
    """Expone el CRUD de asignaturas respetando propiedad e inscripción."""

    serializer_class = AsignaturaSerializer
    permission_classes = (CanManageOwnedAssignment,)

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
