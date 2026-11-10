import django.conf
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("contenido", "0002_asignatura"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name="Unidad",
                    fields=[
                        (
                            "id",
                            models.BigAutoField(
                                auto_created=True,
                                primary_key=True,
                                serialize=False,
                                verbose_name="ID",
                            ),
                        ),
                        (
                            "name",
                            models.CharField(max_length=200, verbose_name="nombre"),
                        ),
                        (
                            "created_at",
                            models.DateTimeField(
                                auto_now_add=True,
                                verbose_name="fecha de creación",
                            ),
                        ),
                        (
                            "updated_at",
                            models.DateTimeField(
                                auto_now=True,
                                verbose_name="última actualización",
                            ),
                        ),
                        (
                            "asignatura",
                            models.ForeignKey(
                                db_column="assignment_id",
                                on_delete=django.db.models.deletion.CASCADE,
                                related_name="unidades",
                                to="contenido.asignatura",
                                verbose_name="asignatura",
                            ),
                        ),
                    ],
                    options={
                        "db_table": "contenido_unit",
                        "ordering": ("name",),
                        "verbose_name": "unidad",
                        "verbose_name_plural": "unidades",
                    },
                ),
            ],
        ),
    ]
