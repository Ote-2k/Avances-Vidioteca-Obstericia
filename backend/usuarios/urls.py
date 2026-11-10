"""Rutas de la API relacionadas con usuarios."""

from django.urls import path

from .views import CurrentUserView

app_name = "usuarios"

urlpatterns = [
    path("me/", CurrentUserView.as_view(), name="current-user"),
]
