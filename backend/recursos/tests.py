from tempfile import TemporaryDirectory

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from contenido.models import Asignatura, Unidad
from recursos.models import Comentario, Documento, Recurso
from usuarios.models import User


class RecursoModelTests(TestCase):
    def setUp(self):
        self.professor = User.objects.create_user(
            email="profesora@example.com",
            password="Clave-segura-123",
            role=User.Role.PROFESOR,
        )
        self.assignment = Asignatura.objects.create(
            title="Obstetricia",
            owner=self.professor,
        )
        self.unit = Unidad.objects.create(
            asignatura=self.assignment,
            name="Atención prenatal",
        )

    def test_resource_is_related_to_unit_and_custom_user(self):
        resource = Recurso.objects.create(
            unidad=self.unit,
            title="Control prenatal",
            creador=self.professor,
            video_url="https://example.com/lesson",
        )

        self.assertEqual(resource.unidad, self.unit)
        self.assertEqual(resource.creador, self.professor)
        self.assertEqual(resource.video_url, "https://example.com/lesson")
        self.assertEqual(self.unit.recursos.get(), resource)

    def test_resource_preserves_video_trim_and_visibility_fields(self):
        resource = Recurso.objects.create(
            unidad=self.unit,
            title="Trabajo de parto",
            creador=self.professor,
            trim_start=3.5,
            trim_end=75.0,
            is_hidden=True,
            is_draft=False,
        )

        self.assertEqual(resource.trim_start, 3.5)
        self.assertEqual(resource.trim_end, 75.0)
        self.assertTrue(resource.is_hidden)
        self.assertFalse(resource.is_draft)

    def test_document_can_be_uploaded_to_local_media_storage(self):
        with TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                document = Documento.objects.create(
                    recurso=Recurso.objects.create(
                        unidad=self.unit,
                        title="Clase",
                        creador=self.professor,
                    ),
                    title="Apuntes",
                    archivo=SimpleUploadedFile(
                        "apuntes.txt",
                        b"Contenido de prueba",
                        content_type="text/plain",
                    ),
                )

                self.assertTrue(document.archivo.name.startswith("documentos/"))
                with document.archivo.open("rb") as uploaded_file:
                    self.assertEqual(uploaded_file.read(), b"Contenido de prueba")

    def test_video_can_be_uploaded_to_local_media_storage(self):
        with TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                resource = Recurso.objects.create(
                    unidad=self.unit,
                    title="Video de clase",
                    creador=self.professor,
                    video_file=SimpleUploadedFile(
                        "clase.mp4",
                        b"Video de prueba",
                        content_type="video/mp4",
                    ),
                )

                self.assertTrue(resource.video_file.name.startswith("videos/"))
                with resource.video_file.open("rb") as uploaded_file:
                    self.assertEqual(uploaded_file.read(), b"Video de prueba")

    def test_comment_can_be_a_reply_to_another_comment(self):
        resource = Recurso.objects.create(
            unidad=self.unit,
            title="Clase",
            creador=self.professor,
        )
        original = Comentario.objects.create(
            recurso=resource,
            autor=self.professor,
            text="Comentario original",
        )
        reply = Comentario.objects.create(
            recurso=resource,
            autor=self.professor,
            text="Respuesta",
            respuesta_a=original,
        )

        self.assertEqual(reply.respuesta_a, original)
        self.assertEqual(original.respuestas.get(), reply)
