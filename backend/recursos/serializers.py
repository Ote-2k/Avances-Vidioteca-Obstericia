"""Serializadores de recursos audiovisuales, documentos y comentarios."""

from rest_framework import serializers

from contenido.models import Unidad
from usuarios.models import User

from .models import Comentario, Documento, Recurso


class DocumentoSerializer(serializers.ModelSerializer):
    """Representa un documento cargado o un enlace asociado a un recurso."""

    recurso = serializers.PrimaryKeyRelatedField(
        queryset=Recurso.objects.all(),
    )

    class Meta:
        model = Documento
        fields = (
            "id",
            "recurso",
            "title",
            "format",
            "description",
            "archivo",
            "url",
            "created_at",
        )
        read_only_fields = ("id", "created_at")

    def validate(self, attrs):
        archivo = attrs.get("archivo", getattr(self.instance, "archivo", None))
        url = attrs.get("url", getattr(self.instance, "url", ""))
        if archivo and url:
            raise serializers.ValidationError(
                {"url": "Usa un archivo adjunto o un enlace externo, no ambos."}
            )
        return attrs


class ComentarioSerializer(serializers.ModelSerializer):
    """Expone el autor y conserva las respuestas dentro del recurso original."""

    autor_email = serializers.EmailField(source="autor.email", read_only=True)
    recurso = serializers.PrimaryKeyRelatedField(
        queryset=Recurso.objects.all(),
    )
    respuesta_a = serializers.PrimaryKeyRelatedField(
        queryset=Comentario.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Comentario
        fields = (
            "id",
            "recurso",
            "autor",
            "autor_email",
            "text",
            "respuesta_a",
            "created_at",
        )
        read_only_fields = ("id", "autor", "autor_email", "created_at")

    def validate(self, attrs):
        recurso = attrs.get("recurso", getattr(self.instance, "recurso", None))
        respuesta_a = attrs.get(
            "respuesta_a",
            getattr(self.instance, "respuesta_a", None),
        )
        if respuesta_a and respuesta_a.recurso_id != recurso.pk:
            raise serializers.ValidationError(
                {"respuesta_a": "La respuesta debe pertenecer al mismo recurso."}
            )
        return attrs


class RecursoSerializer(serializers.ModelSerializer):
    """Representa un recurso y sus documentos y comentarios relacionados."""

    unidad = serializers.PrimaryKeyRelatedField(
        queryset=Unidad.objects.all(),
    )
    creador_email = serializers.EmailField(source="creador.email", read_only=True)
    materials = DocumentoSerializer(many=True, read_only=True)
    comments = ComentarioSerializer(many=True, read_only=True)

    class Meta:
        model = Recurso
        fields = (
            "id",
            "unidad",
            "title",
            "description",
            "video_file",
            "video_url",
            "trim_start",
            "trim_end",
            "is_hidden",
            "is_draft",
            "created_at",
            "creador",
            "creador_email",
            "materials",
            "comments",
        )
        read_only_fields = ("id", "creador", "creador_email", "created_at")

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user and user.is_authenticated:
            if user.role == User.Role.ADMIN:
                units = Unidad.objects.all()
            elif user.role in (User.Role.PROFESOR, User.Role.PROFESOR_AREA):
                units = Unidad.objects.filter(asignatura__owner=user)
            else:
                units = Unidad.objects.none()
            fields["unidad"].queryset = units
        else:
            fields["unidad"].queryset = Unidad.objects.none()
        return fields

    def validate(self, attrs):
        trim_start = attrs.get(
            "trim_start",
            getattr(self.instance, "trim_start", 0.0),
        )
        trim_end = attrs.get(
            "trim_end",
            getattr(self.instance, "trim_end", None),
        )
        if trim_end is not None and trim_end <= trim_start:
            raise serializers.ValidationError(
                {"trim_end": "El final del video debe ser posterior al inicio."}
            )

        video_file = attrs.get(
            "video_file",
            getattr(self.instance, "video_file", None),
        )
        video_url = attrs.get(
            "video_url",
            getattr(self.instance, "video_url", ""),
        )
        if video_file and video_url:
            raise serializers.ValidationError(
                {"video_url": "Usa un archivo de video o una URL externa, no ambos."}
            )
        return attrs
