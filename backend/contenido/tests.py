from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from usuarios.models import User

from .models import Asignatura, Unidad


class AsignaturaApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.teacher = User.objects.create_user(
            email="profesora@example.com",
            password="Clave-segura-123",
            role=User.Role.PROFESOR,
        )
        self.other_teacher = User.objects.create_user(
            email="otro.profesor@example.com",
            password="Clave-segura-123",
            role=User.Role.PROFESOR_AREA,
        )
        self.student = User.objects.create_user(
            email="alumna@example.com",
            password="Clave-segura-123",
        )
        self.assignment = Asignatura.objects.create(
            title="Obstetricia",
            owner=self.teacher,
        )
        self.list_url = reverse("asignatura-list")
        self.detail_url = reverse("asignatura-detail", args=(self.assignment.pk,))

    def test_anonymous_user_cannot_list_assignments(self):
        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_professor_can_create_assignment_owned_by_self(self):
        self.client.force_authenticate(self.teacher)

        response = self.client.post(
            self.list_url,
            {
                "title": "Salud materna",
                "published": False,
                "owner": self.other_teacher.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        assignment = Asignatura.objects.get(title="Salud materna")
        self.assertEqual(assignment.owner, self.teacher)
        self.assertEqual(response.data["owner"], self.teacher.pk)

    def test_professor_cannot_enroll_another_professor(self):
        self.client.force_authenticate(self.teacher)

        response = self.client.patch(
            self.detail_url,
            {"enrolled_students": [self.other_teacher.pk]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(self.assignment.enrolled_students.exists())

    def test_professor_can_edit_own_assignment(self):
        self.client.force_authenticate(self.teacher)

        response = self.client.patch(
            self.detail_url,
            {"title": "Obstetricia clínica"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.title, "Obstetricia clínica")

    def test_professor_cannot_read_or_edit_another_professors_assignment(self):
        self.client.force_authenticate(self.other_teacher)

        read_response = self.client.get(self.detail_url)
        update_response = self.client.patch(
            self.detail_url,
            {"title": "Cambio no autorizado"},
            format="json",
        )

        self.assertEqual(read_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(update_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.title, "Obstetricia")

    def test_student_only_sees_published_assignments_they_are_enrolled_in(self):
        enrolled = Asignatura.objects.create(
            title="Asignatura inscrita",
            owner=self.teacher,
            published=True,
        )
        enrolled.enrolled_students.add(self.student)
        unpublished = Asignatura.objects.create(
            title="Asignatura no publicada",
            owner=self.teacher,
            published=False,
        )
        unpublished.enrolled_students.add(self.student)
        Asignatura.objects.create(
            title="Asignatura sin inscripción",
            owner=self.teacher,
            published=True,
        )
        self.client.force_authenticate(self.student)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["id"] for item in response.data], [enrolled.pk])

    def test_student_cannot_create_or_edit_assignments(self):
        self.client.force_authenticate(self.student)

        create_response = self.client.post(
            self.list_url,
            {"title": "No autorizada"},
            format="json",
        )
        update_response = self.client.patch(
            self.detail_url,
            {"title": "Cambio no autorizado"},
            format="json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(update_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_professor_area_can_manage_owned_assignment(self):
        self.client.force_authenticate(self.other_teacher)
        assignment = Asignatura.objects.create(
            title="Área de salud",
            owner=self.other_teacher,
        )

        response = self.client.patch(
            reverse("asignatura-detail", args=(assignment.pk,)),
            {"title": "Área de salud actualizada"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        assignment.refresh_from_db()
        self.assertEqual(assignment.title, "Área de salud actualizada")

    def test_admin_role_can_access_and_manage_all_assignments(self):
        admin = User.objects.create_user(
            email="admin@example.com",
            password="Clave-segura-123",
            role=User.Role.ADMIN,
        )
        self.client.force_authenticate(admin)

        list_response = self.client.get(self.list_url)
        update_response = self.client.patch(
            self.detail_url,
            {"title": "Actualizada por admin"},
            format="json",
        )

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_response.data), 1)
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)

    def test_professor_can_delete_own_assignment(self):
        self.client.force_authenticate(self.teacher)

        response = self.client.delete(self.detail_url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Asignatura.objects.filter(pk=self.assignment.pk).exists())


class UnidadApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.teacher = User.objects.create_user(
            email="profesora@example.com",
            password="Clave-segura-123",
            role=User.Role.PROFESOR,
        )
        self.other_teacher = User.objects.create_user(
            email="otra.profesor@example.com",
            password="Clave-segura-123",
            role=User.Role.PROFESOR_AREA,
        )
        self.student = User.objects.create_user(
            email="alumna@example.com",
            password="Clave-segura-123",
        )
        self.assignment = Asignatura.objects.create(
            title="Obstetricia",
            owner=self.teacher,
        )
        self.unit = Unidad.objects.create(
            asignatura=self.assignment,
            name="Unidad inicial",
        )
        self.list_url = reverse("unidad-list", args=(self.assignment.pk,))
        self.detail_url = reverse(
            "unidad-detail",
            args=(self.assignment.pk, self.unit.pk),
        )

    def test_anonymous_user_cannot_list_units(self):
        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_professor_can_create_unit_in_owned_assignment(self):
        self.client.force_authenticate(self.teacher)

        response = self.client.post(
            self.list_url,
            {"name": "Atención prenatal", "asignatura": 9999},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        unit = Unidad.objects.get(name="Atención prenatal")
        self.assertEqual(unit.asignatura, self.assignment)
        self.assertEqual(response.data["asignatura"], self.assignment.pk)

    def test_professor_can_update_and_delete_owned_unit(self):
        self.client.force_authenticate(self.teacher)

        update_response = self.client.patch(
            self.detail_url,
            {"name": "Unidad actualizada"},
            format="json",
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.name, "Unidad actualizada")

        delete_response = self.client.delete(self.detail_url)
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Unidad.objects.filter(pk=self.unit.pk).exists())

    def test_professor_cannot_manage_units_in_another_professors_assignment(self):
        other_assignment = Asignatura.objects.create(
            title="Otra asignatura",
            owner=self.other_teacher,
        )
        other_unit = Unidad.objects.create(
            asignatura=other_assignment,
            name="Otra unidad",
        )
        self.client.force_authenticate(self.teacher)

        list_response = self.client.get(
            reverse("unidad-list", args=(other_assignment.pk,)),
        )
        create_response = self.client.post(
            reverse("unidad-list", args=(other_assignment.pk,)),
            {"name": "No autorizada"},
            format="json",
        )
        update_response = self.client.patch(
            reverse("unidad-detail", args=(other_assignment.pk, other_unit.pk)),
            {"name": "Cambio no autorizado"},
            format="json",
        )

        self.assertEqual(list_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(create_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(update_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_student_can_read_units_in_published_enrolled_assignment(self):
        self.assignment.enrolled_students.add(self.student)
        self.client.force_authenticate(self.student)

        list_response = self.client.get(self.list_url)
        detail_response = self.client.get(self.detail_url)

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["id"] for item in list_response.data], [self.unit.pk])
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)

    def test_student_cannot_read_units_in_unpublished_or_unenrolled_assignments(self):
        unpublished = Asignatura.objects.create(
            title="No publicada",
            owner=self.teacher,
            published=False,
        )
        unpublished.enrolled_students.add(self.student)
        self.client.force_authenticate(self.student)

        unenrolled_response = self.client.get(self.list_url)
        unpublished_response = self.client.get(
            reverse("unidad-list", args=(unpublished.pk,)),
        )

        self.assertEqual(unenrolled_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(unpublished_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_student_cannot_create_or_edit_units(self):
        self.client.force_authenticate(self.student)

        create_response = self.client.post(
            self.list_url,
            {"name": "No autorizada"},
            format="json",
        )
        update_response = self.client.patch(
            self.detail_url,
            {"name": "Cambio no autorizado"},
            format="json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(update_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_application_admin_can_manage_units_in_any_assignment(self):
        admin = User.objects.create_user(
            email="admin@example.com",
            password="Clave-segura-123",
            role=User.Role.ADMIN,
        )
        self.client.force_authenticate(admin)

        list_response = self.client.get(self.list_url)
        update_response = self.client.patch(
            self.detail_url,
            {"name": "Unidad editada por administración"},
            format="json",
        )

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)

    def test_professor_cannot_move_unit_to_another_assignment(self):
        other_assignment = Asignatura.objects.create(
            title="Otra asignatura",
            owner=self.other_teacher,
        )
        self.client.force_authenticate(self.teacher)

        response = self.client.patch(
            self.detail_url,
            {"asignatura": other_assignment.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.asignatura, self.assignment)
