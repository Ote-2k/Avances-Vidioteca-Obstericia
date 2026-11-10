"""Vistas de la API relacionadas con la cuenta autenticada."""

from rest_framework.mixins import ListModelMixin
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet

from .models import User
from .pagination import UserPagination
from .permissions import IsApplicationAdmin
from .serializers import UserListSerializer, UserProfileSerializer


class CurrentUserView(APIView):
    """Devuelve el perfil básico de quien inició sesión."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data)


class UserListViewSet(ListModelMixin, GenericViewSet):
    """Lista cuentas en modo de solo lectura para el rol admin de la API."""

    queryset = User.objects.all().order_by("id")
    serializer_class = UserListSerializer
    permission_classes = (IsApplicationAdmin,)
    pagination_class = UserPagination
