from django.core.exceptions import FieldDoesNotExist
from django.test import TestCase

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
