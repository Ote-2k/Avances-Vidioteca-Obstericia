"""Rutas de la API para el contenido educativo."""

from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import AsignaturaViewSet, UnidadDetailView, UnidadListCreateView

router = DefaultRouter()
router.register("asignaturas", AsignaturaViewSet, basename="asignatura")

urlpatterns = [
    path(
        "asignaturas/<int:asignatura_id>/unidades/",
        UnidadListCreateView.as_view(),
        name="unidad-list",
    ),
    path(
        "asignaturas/<int:asignatura_id>/unidades/<int:pk>/",
        UnidadDetailView.as_view(),
        name="unidad-detail",
    ),
    *router.urls,
]
