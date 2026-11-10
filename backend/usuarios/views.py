"""Vistas de la API relacionadas con la cuenta autenticada."""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import UserProfileSerializer


class CurrentUserView(APIView):
    """Devuelve el perfil básico de quien inició sesión."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data)
