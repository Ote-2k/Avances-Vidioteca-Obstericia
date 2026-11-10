from django.core.exceptions import FieldDoesNotExist
from django.test import TestCase
from django.urls import reverse
from rest_framework import status

from .models import User


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
