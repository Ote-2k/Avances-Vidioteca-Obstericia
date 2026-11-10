"""Rutas de la API para el contenido educativo."""

from rest_framework.routers import DefaultRouter

from .views import AsignaturaViewSet

router = DefaultRouter()
router.register("asignaturas", AsignaturaViewSet, basename="asignatura")

urlpatterns = router.urls
