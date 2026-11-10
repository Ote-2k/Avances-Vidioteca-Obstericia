import django.conf
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("contenido", "0001_initial"),
        migrations.swappable_dependency(django.conf.settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RenameModel(
                    old_name="Assignment",
                    new_name="Asignatura",
                ),
                migrations.AlterField(
                    model_name="asignatura",
                    name="title",
                    field=models.CharField(max_length=200, verbose_name="título"),
                ),
                migrations.AlterField(
                    model_name="asignatura",
                    name="description",
                    field=models.TextField(blank=True, verbose_name="descripción"),
                ),
                migrations.AlterField(
                    model_name="asignatura",
                    name="published",
                    field=models.BooleanField(default=True, verbose_name="publicada"),
                ),
                migrations.AlterField(
                    model_name="asignatura",
                    name="created_at",
                    field=models.DateTimeField(
                        auto_now_add=True,
                        verbose_name="fecha de creación",
                    ),
                ),
                migrations.AlterField(
                    model_name="asignatura",
                    name="updated_at",
                    field=models.DateTimeField(
                        auto_now=True,
                        verbose_name="última actualización",
                    ),
                ),
                migrations.AlterField(
                    model_name="asignatura",
                    name="owner",
                    field=models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="asignaturas_creadas",
                        to=django.conf.settings.AUTH_USER_MODEL,
                        verbose_name="profesor propietario",
                    ),
                ),
                migrations.DeleteModel(name="Unit"),
                migrations.AlterModelOptions(
                    name="asignatura",
                    options={
                        "ordering": ("title",),
                        "verbose_name": "asignatura",
                        "verbose_name_plural": "asignaturas",
                    },
                ),
            ],
        ),
        migrations.AddField(
            model_name="asignatura",
            name="cover_url",
            field=models.URLField(
                blank=True,
                default="",
                verbose_name="URL de portada",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="asignatura",
            name="enrolled_students",
            field=models.ManyToManyField(
                blank=True,
                limit_choices_to={"role": "alumno"},
                related_name="asignaturas_inscritas",
                to=django.conf.settings.AUTH_USER_MODEL,
                verbose_name="alumnos inscritos",
            ),
        ),
    ]
