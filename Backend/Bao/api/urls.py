from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RecursoViewSet, DocumentoViewSet, ComentarioViewSet

router = DefaultRouter()
router.register(r'recursos', RecursoViewSet, basename='recurso')
router.register(r'documentos', DocumentoViewSet, basename='documento')
router.register(r'comentarios', ComentarioViewSet, basename='comentario')

urlpatterns = [
    path('', include(router.urls)),
]