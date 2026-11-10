"""Paginación para los listados de contenido."""

from rest_framework.pagination import PageNumberPagination


class AsignaturaPagination(PageNumberPagination):
    """Permite ajustar el tamaño de página con un máximo seguro."""

    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100
