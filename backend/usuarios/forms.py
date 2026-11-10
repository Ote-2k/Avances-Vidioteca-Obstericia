"""Formularios del panel administrativo para el usuario personalizado."""

from django.contrib.auth.forms import UserChangeForm, UserCreationForm

from .models import User


class AdminUserCreationForm(UserCreationForm):
    """Permite crear usuarios indicando correo, rol y una contraseña."""

    class Meta(UserCreationForm.Meta):
        model = User
        fields = ("email", "role")


class AdminUserChangeForm(UserChangeForm):
    """Permite editar los campos del usuario en el panel administrativo."""

    class Meta(UserChangeForm.Meta):
        model = User
        fields = "__all__"
