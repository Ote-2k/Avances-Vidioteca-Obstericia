from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Recurso, Documento, Comentario

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email']


class DocumentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Documento
        fields = ['id', 'recurso', 'title', 'format', 'description', 'url', 'created_at']


class ComentarioSerializer(serializers.ModelSerializer):
    # se muestra el nombre del autor en la lectura
    author_username = serializers.ReadOnlyField(source='author.username')

    class Meta:
        model = Comentario
        fields = ['id', 'recurso', 'author', 'author_username', 'text', 'parent', 'created_at']
        read_only_fields = ['author', 'created_at']


class RecursoSerializer(serializers.ModelSerializer):
    # Relaciones anidadas para ver los materiales y comentarios vinculados
    materials = DocumentoSerializer(many=True, read_only=True)
    comments = ComentarioSerializer(many=True, read_only=True)
    creador_username = serializers.ReadOnlyField(source='creador.username')

    class Meta:
        model = Recurso
        fields = [
            'id', 
            'title', 
            'description', 
            'video_url',
            'video_file',
            'trim_start', 
            'trim_end', 
            'is_hidden', 
            'is_draft', 
            'created_at', 
            'creador', 
            'creador_username', 
            'materials', 
            'comments'
        ]
        read_only_fields = ['creador', 'created_at']
    
    # 1. Validacion especifica del campo video_url
    def validate_video_url(self, value):
        if not value:
            return value
            
        dominios_permitidos = ['youtube.com', 'youtu.be', 'drive.google.com', 'vimeo.com']
        extensiones_directas = ('.mp4', '.webm', '.ogg')
        
        url_lower = value.lower()
        es_dominio_valido = any(dominio in url_lower for dominio in dominios_permitidos)
        es_archivo_directo = url_lower.endswith(extensiones_directas)

        if not (es_dominio_valido or es_archivo_directo):
            raise serializers.ValidationError(
                "La URL debe ser de YouTube, Google Drive, Vimeo o un enlace directo (.mp4, .webm)."
            )
        return value
    
    #funcion hecha para validar el tiempo de reproduccion del video, hecha en caso de q no funcione correctamente la version actual del frontend al momento de conectarla al backend, espero, nose realmente si funcionara hasta q los conecte
    def validate(self, data):
        trim_start = data.get('trim_start', getattr(self.instance, 'trim_start', 0.0))
        trim_end = data.get('trim_end', getattr(self.instance, 'trim_end', None))

        if trim_end is not None and trim_end <= trim_start:
            raise serializers.ValidationError({
                "trim_end": "El punto final del video no puede estar antes que el punto inicial del video"
            })
        
        # esto es para verificar que exista al menos una fuente de video si no es borrador
        is_draft = data.get('is_draft', getattr(self.instance, 'is_draft', True))
        video_url = data.get('video_url', getattr(self.instance, 'video_url', None))
        video_file = data.get('video_file', getattr(self.instance, 'video_file', None))

        if not is_draft and not video_url and not video_file:
            raise serializers.ValidationError(
                "Para publicar un recurso se debe dar una URL de video o subir un archivo."
            )
        
        return data
        