from django.shortcuts import render
from rest_framework import viewsets, permissions, filters
from django_filters.rest_framework import DjangoFilterBackend
from .models import Recurso, Documento, Comentario
from .serializers import RecursoSerializer, DocumentoSerializer, ComentarioSerializer

class RecursoViewSet(viewsets.ModelViewSet):
    """
    CRUD de Recursos con filtro de: titulo, estado borrador/oculto y ordenamiento
    """
    queryset = Recurso.objects.all()
    serializer_class = RecursoSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    
    filterset_fields = ['is_hidden', 'is_draft', 'creador']
    search_fields = ['title', 'description']
    ordering_fields = ['created_at', 'title']

    def perform_create(self, serializer):
        serializer.save(creador=self.request.user)


class DocumentoViewSet(viewsets.ModelViewSet):
    """
    CRUD de Documentos con filtro de: titulo y recurso asociado
    """
    queryset = Documento.objects.all()
    serializer_class = DocumentoSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    
    filterset_fields = ['recurso', 'format']
    search_fields = ['title', 'description']


class ComentarioViewSet(viewsets.ModelViewSet):
    """
    CRUD de Comentarios con filtro de: contenido y recurso o autor
    """
    queryset = Comentario.objects.all()
    serializer_class = ComentarioSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    
    filterset_fields = ['recurso', 'author']
    search_fields = ['text']

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)
