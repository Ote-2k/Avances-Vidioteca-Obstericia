"""Modelo de cuenta de usuario y roles para la API de la videoteca."""

from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractUser
from django.db import models


class UserManager(BaseUserManager):
    """Crea usuarios usando el correo como identificador de acceso."""

    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        """Normaliza el correo y guarda la contraseña con el hash de Django."""
        if not email:
            raise ValueError("El correo electrónico es obligatorio.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        """Crea una cuenta administradora con acceso al panel de Django."""
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", User.Role.ADMIN)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Un superusuario debe tener is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Un superusuario debe tener is_superuser=True.")

        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    """Cuenta de la videoteca basada en el usuario estándar de Django.

    Se conservan las funciones de autenticación y permisos de Django, pero el
    correo electrónico reemplaza al nombre de usuario como identificador.
    ``role`` describe la función de la persona en la videoteca; es distinto de
    ``is_staff`` e ``is_superuser``, que controlan el acceso administrativo
    de Django.
    """

    class Role(models.TextChoices):
        """Roles de la aplicación: valor guardado en la base y etiqueta visible."""

        ALUMNO = "alumno", "Alumno"
        PROFESOR = "profesor", "Profesor"
        PROFESOR_AREA = "profesor_area", "Profesor de área"
        ADMIN = "admin", "Administrador"

    username = None
    email = models.EmailField("correo electrónico", unique=True)
    role = models.CharField(
        "rol",
        max_length=20,
        choices=Role.choices,
        default=Role.ALUMNO,
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return self.email
