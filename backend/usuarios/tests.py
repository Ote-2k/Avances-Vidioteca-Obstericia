from django.contrib.auth.models import AnonymousUser
from django.core.exceptions import FieldDoesNotExist
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APIRequestFactory

from .models import User
from .permissions import IsApplicationAdmin, IsProfessorOrAreaTeacher


class UserManagerTests(TestCase):
    def test_create_user_uses_email_and_hashes_password(self):
        user = User.objects.create_user(
            email="alumna@EXAMPLE.COM",
            password="Clave-segura-123",
        )

        self.assertEqual(user.email, "alumna@example.com")
        self.assertEqual(user.role, User.Role.ALUMNO)
        self.assertTrue(user.check_password("Clave-segura-123"))
        self.assertNotEqual(user.password, "Clave-segura-123")
        self.assertEqual(User.USERNAME_FIELD, "email")
        with self.assertRaises(FieldDoesNotExist):
            User._meta.get_field("username")

    def test_create_user_accepts_profesor_de_area_role(self):
        user = User.objects.create_user(
            email="profesora@example.com",
            password="Clave-segura-123",
            role=User.Role.PROFESOR_AREA,
        )

        self.assertEqual(user.role, User.Role.PROFESOR_AREA)

    def test_create_user_requires_email(self):
        with self.assertRaisesMessage(ValueError, "El correo electrónico es obligatorio."):
            User.objects.create_user(email="", password="Clave-segura-123")

    def test_create_superuser_enables_admin_access(self):
        user = User.objects.create_superuser(
            email="admin@example.com",
            password="Clave-segura-123",
        )

        self.assertEqual(user.role, User.Role.ADMIN)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)

    def test_create_superuser_rejects_non_staff_account(self):
        with self.assertRaisesMessage(ValueError, "Un superusuario debe tener is_staff=True."):
            User.objects.create_superuser(
                email="admin@example.com",
                password="Clave-segura-123",
                is_staff=False,
            )

    def test_create_superuser_rejects_non_superuser_account(self):
        with self.assertRaisesMessage(ValueError, "Un superusuario debe tener is_superuser=True."):
            User.objects.create_superuser(
                email="admin@example.com",
                password="Clave-segura-123",
                is_superuser=False,
            )


class UserAdminTests(TestCase):
    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            email="admin@example.com",
            password="Clave-segura-123",
        )
        self.client.force_login(self.admin_user)

    def test_user_admin_lists_accounts(self):
        response = self.client.get(reverse("admin:usuarios_user_changelist"))

        self.assertEqual(response.status_code, 200)

    def test_user_admin_add_form_uses_email_and_role(self):
        response = self.client.get(reverse("admin:usuarios_user_add"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'name="email"')
        self.assertContains(response, 'name="role"')
        self.assertContains(response, 'name="password1"')
        self.assertContains(response, 'name="password2"')

    def test_user_admin_can_create_account_with_selected_role(self):
        response = self.client.post(
            reverse("admin:usuarios_user_add"),
            {
                "email": "profesora@example.com",
                "role": User.Role.PROFESOR_AREA,
                "password1": "Clave-segura-123",
                "password2": "Clave-segura-123",
            },
        )

        self.assertEqual(response.status_code, 302)
        user = User.objects.get(email="profesora@example.com")
        self.assertEqual(user.role, User.Role.PROFESOR_AREA)
        self.assertTrue(user.check_password("Clave-segura-123"))
        self.assertFalse(user.is_staff)


class UserProfileApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="alumna@example.com",
            password="Clave-segura-123",
            first_name="Ana",
            last_name="Ejemplo",
        )
        self.profile_url = reverse("usuarios:current-user")

    def test_anonymous_user_cannot_access_profile(self):
        response = self.client.get(self.profile_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticated_user_can_read_own_profile(self):
        self.client.force_login(self.user)

        response = self.client.get(self.profile_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json(),
            {
                "id": self.user.pk,
                "email": "alumna@example.com",
                "first_name": "Ana",
                "last_name": "Ejemplo",
                "role": User.Role.ALUMNO,
            },
        )
        self.assertNotIn("password", response.json())
        self.assertNotIn("is_staff", response.json())
        self.assertNotIn("is_superuser", response.json())

    def test_profile_is_read_only(self):
        self.client.force_login(self.user)

        response = self.client.post(self.profile_url, {"role": User.Role.ADMIN})

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, User.Role.ALUMNO)

    def test_browsable_api_login_route_is_available(self):
        response = self.client.get(reverse("rest_framework:login"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_api_login_redirects_to_api_root_instead_of_missing_profile_page(self):
        response = self.client.post(
            reverse("rest_framework:login"),
            {
                "username": self.user.email,
                "password": "Clave-segura-123",
            },
            follow=True,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.redirect_chain, [("/api/", 302)])
        self.assertContains(response, "asignaturas")


class UserListApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="admin@example.com",
            password="Clave-segura-123",
            role=User.Role.ADMIN,
        )
        self.user = User.objects.create_user(
            email="alumna@example.com",
            password="Clave-segura-123",
            first_name="Ana",
            last_name="Ejemplo",
        )
        self.list_url = reverse("user-list")

    def test_api_root_links_to_user_list(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(reverse("api-root"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("usuarios", response.data)
        self.assertEqual(response.data["usuarios"], "http://testserver/api/usuarios/")

    def test_admin_can_list_basic_user_data(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(
            response.data["results"][0],
            {
                "id": self.admin.pk,
                "email": "admin@example.com",
                "first_name": "",
                "last_name": "",
                "role": User.Role.ADMIN,
            },
        )
        self.assertEqual(
            set(response.data["results"][1]),
            {"id", "email", "first_name", "last_name", "role"},
        )

    def test_only_application_admin_can_list_users(self):
        for role in (
            User.Role.ALUMNO,
            User.Role.PROFESOR,
            User.Role.PROFESOR_AREA,
        ):
            with self.subTest(role=role):
                user = User.objects.create_user(
                    email=f"{role}@example.com",
                    password="Clave-segura-123",
                    role=role,
                )
                self.client.force_authenticate(user)

                response = self.client.get(self.list_url)

                self.assertEqual(
                    response.status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_anonymous_user_cannot_list_users(self):
        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_list_is_read_only(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            self.list_url,
            {"email": "nuevo@example.com", "role": User.Role.ALUMNO},
            format="json",
        )
        detail_response = self.client.get(
            reverse("user-list") + f"{self.user.pk}/",
        )

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(User.objects.filter(email="nuevo@example.com").exists())

    def test_user_list_is_paginated(self):
        User.objects.bulk_create(
            [
                User(
                    email=f"alumno{index}@example.com",
                    role=User.Role.ALUMNO,
                )
                for index in range(10)
            ],
        )
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 12)
        self.assertEqual(len(response.data["results"]), 10)


class RolePermissionTests(TestCase):
    def setUp(self):
        self.request_factory = APIRequestFactory()
        self.view = object()

    def check_permission(self, permission_class, role=None):
        request = self.request_factory.get("/")
        if role is not None:
            request.user = User(role=role, is_active=True)
        else:
            request.user = AnonymousUser()

        return permission_class().has_permission(request, self.view)

    def test_professors_and_area_teachers_can_edit_content(self):
        for role in (User.Role.PROFESOR, User.Role.PROFESOR_AREA, User.Role.ADMIN):
            with self.subTest(role=role):
                self.assertTrue(self.check_permission(IsProfessorOrAreaTeacher, role))

    def test_students_cannot_edit_content(self):
        self.assertFalse(self.check_permission(IsProfessorOrAreaTeacher, User.Role.ALUMNO))

    def test_only_application_admin_has_admin_role_permission(self):
        self.assertTrue(self.check_permission(IsApplicationAdmin, User.Role.ADMIN))
        for role in (User.Role.ALUMNO, User.Role.PROFESOR, User.Role.PROFESOR_AREA):
            with self.subTest(role=role):
                self.assertFalse(self.check_permission(IsApplicationAdmin, role))

    def test_anonymous_user_has_no_role_permissions(self):
        self.assertFalse(self.check_permission(IsProfessorOrAreaTeacher))
        self.assertFalse(self.check_permission(IsApplicationAdmin))
