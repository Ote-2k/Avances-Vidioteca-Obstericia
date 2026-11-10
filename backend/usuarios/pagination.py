"""Paginación para el listado de usuarios de la API."""

from rest_framework.pagination import PageNumberPagination


class UserPagination(PageNumberPagination):
    """Limita el tamaño solicitado para mantener manejables los listados."""

    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100
