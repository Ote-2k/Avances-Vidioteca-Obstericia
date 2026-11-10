from tempfile import TemporaryDirectory

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

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


class RecursoApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.professor = User.objects.create_user(
            email="profesora-api@example.com",
            password="test-password",
            role=User.Role.PROFESOR,
        )
        self.other_professor = User.objects.create_user(
            email="otro-profesor-api@example.com",
            password="test-password",
            role=User.Role.PROFESOR,
        )
        self.admin = User.objects.create_user(
            email="admin-api@example.com",
            password="test-password",
            role=User.Role.ADMIN,
        )
        self.student = User.objects.create_user(
            email="alumna-api@example.com",
            password="test-password",
            role=User.Role.ALUMNO,
        )
        self.assignment = Asignatura.objects.create(
            title="Obstetricia",
            owner=self.professor,
        )
        self.unit = Unidad.objects.create(
            asignatura=self.assignment,
            name="Atención prenatal",
        )
        self.other_assignment = Asignatura.objects.create(
            title="Asignatura ajena",
            owner=self.other_professor,
        )
        self.other_unit = Unidad.objects.create(
            asignatura=self.other_assignment,
            name="Unidad ajena",
        )
        self.assignment.enrolled_students.add(self.student)
        self.resource = Recurso.objects.create(
            unidad=self.unit,
            title="Clase publicada",
            creador=self.professor,
            is_draft=False,
        )
        self.hidden_resource = Recurso.objects.create(
            unidad=self.unit,
            title="Clase oculta",
            creador=self.professor,
            is_hidden=True,
            is_draft=False,
        )
        self.draft_resource = Recurso.objects.create(
            unidad=self.unit,
            title="Borrador",
            creador=self.professor,
        )
        self.foreign_resource = Recurso.objects.create(
            unidad=self.other_unit,
            title="Clase de otra asignatura",
            creador=self.other_professor,
            is_draft=False,
        )

    def test_api_root_lists_resources_documents_and_comments(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse("api-root"))

        self.assertEqual(response.status_code, 200)
        self.assertIn("recursos", response.data)
        self.assertIn("documentos", response.data)
        self.assertIn("comentarios", response.data)

    def test_student_lists_only_accessible_published_resources(self):
        self.client.force_authenticate(self.student)

        response = self.client.get(reverse("recurso-list"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["id"] for item in response.data],
            [self.resource.pk],
        )

    def test_teacher_cannot_manage_another_teachers_resources(self):
        self.client.force_authenticate(self.professor)

        response = self.client.get(reverse("recurso-list"))
        create_response = self.client.post(
            reverse("recurso-list"),
            {
                "unidad": self.other_unit.pk,
                "title": "No autorizado",
                "is_draft": False,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertNotIn(
            self.foreign_resource.pk,
            [item["id"] for item in response.data],
        )
        self.assertEqual(create_response.status_code, 400)

    def test_student_cannot_create_resource(self):
        self.client.force_authenticate(self.student)

        response = self.client.post(
            reverse("recurso-list"),
            {"unidad": self.unit.pk, "title": "No autorizado"},
        )

        self.assertEqual(response.status_code, 403)

    def test_student_can_comment_but_cannot_edit_another_users_comment(self):
        existing_comment = Comentario.objects.create(
            recurso=self.resource,
            autor=self.professor,
            text="Comentario del profesor",
        )
        self.client.force_authenticate(self.student)

        create_response = self.client.post(
            reverse("comentario-list"),
            {"recurso": self.resource.pk, "text": "Pregunta de la alumna"},
        )
        edit_response = self.client.patch(
            reverse("comentario-detail", args=(existing_comment.pk,)),
            {"text": "Edición no permitida"},
        )

        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(create_response.data["autor"], self.student.pk)
        self.assertEqual(edit_response.status_code, 403)

    def test_comment_reply_must_belong_to_same_resource(self):
        original = Comentario.objects.create(
            recurso=self.resource,
            autor=self.professor,
            text="Comentario",
        )
        self.client.force_authenticate(self.professor)

        response = self.client.post(
            reverse("comentario-list"),
            {
                "recurso": self.foreign_resource.pk,
                "text": "Respuesta de otro recurso",
                "respuesta_a": original.pk,
            },
        )

        self.assertEqual(response.status_code, 400)

    def test_teacher_can_upload_a_document_to_an_owned_resource(self):
        with TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                self.client.force_authenticate(self.professor)

                response = self.client.post(
                    reverse("documento-list"),
                    {
                        "recurso": self.resource.pk,
                        "title": "Apuntes",
                        "archivo": SimpleUploadedFile(
                            "apuntes.txt",
                            b"Contenido de prueba",
                            content_type="text/plain",
                        ),
                    },
                    format="multipart",
                )

                self.assertEqual(response.status_code, 201)
                self.assertIn("documentos/", response.data["archivo"])
