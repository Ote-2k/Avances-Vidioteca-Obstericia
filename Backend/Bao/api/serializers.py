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
    
    #funcion hecha para validar el tiempo de reproduccion del video, hecha en caso de q no funcione correctamente la version actual del frontend al momento de conectarla al backend, espero, nose realmente si funcionara hasta q los conecte
    def validate(self, data):
        trim_start = data.get('trim_start', getattr(self.instance, 'trim_start', 0.0))
        trim_end = data.get('trim_end', getattr(self.instance, 'trim_end', None))

        if trim_end is not None and trim_end <= trim_start:
            raise serializers.ValidationError({
                "trim_end": "El punto final del video no puede estar antes que el punto inicial del video"
            })
        return data