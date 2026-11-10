from django.shortcuts import render
from rest_framework import viewsets, permissions
from .models import Recurso, Documento, Comentario
from .serializers import RecursoSerializer, DocumentoSerializer, ComentarioSerializer

class RecursoViewSet(viewsets.ModelViewSet):
    """
    Esto asigna automaticamente el usuario logueado como creador
    """
    queryset = Recurso.objects.all()
    serializer_class = RecursoSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def perform_create(self, serializer):
        serializer.save(creador=self.request.user)


class DocumentoViewSet(viewsets.ModelViewSet):
    """
    CRUD para Documentos/Materiales adjuntos.
    """
    queryset = Documento.objects.all()
    serializer_class = DocumentoSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]


class ComentarioViewSet(viewsets.ModelViewSet):
    """
    CRUD para Comentarios.
    """
    queryset = Comentario.objects.all()
    serializer_class = ComentarioSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)
