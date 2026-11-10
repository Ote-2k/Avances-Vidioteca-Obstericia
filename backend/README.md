# Backend de Videoteca

## Requisitos

- Python 3.10 o posterior.
- MySQL Community Server para ejecutar el proyecto con MySQL.

## Instalar dependencias

Desde esta carpeta, activa el entorno virtual y sincroniza las dependencias:

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Base de datos local

Por defecto, Django utiliza SQLite en `db.sqlite3`. No se necesita un servidor
de base de datos para ejecutar las pruebas:

```powershell
python manage.py check
python manage.py test
```

Para usar MySQL, primero crea una base de datos vacía en MySQL Community Server.
En la misma terminal de PowerShell donde ejecutarás Django, define las variables
de conexión:

```powershell
$env:DB_ENGINE = "mysql"
$env:DB_NAME = "videoteca"
$env:DB_USER = "tu_usuario"
$env:DB_PASSWORD = "tu_contraseña"
$env:DB_HOST = "127.0.0.1"
$env:DB_PORT = "3306"
```

Si omites `DB_HOST` y `DB_PORT`, se usan `127.0.0.1` y `3306`. El nombre, el
usuario y la contraseña deben estar definidos al seleccionar MySQL. No guardes
contraseñas reales en este archivo ni en Git.

Comprueba la conexión y aplica las migraciones a la base seleccionada:

```powershell
python manage.py check
python manage.py migrate
```

Para volver a SQLite en esa terminal:

```powershell
$env:DB_ENGINE = "sqlite"
```

## Inicio de sesión y perfil de usuario

La API usa sesiones de Django para autenticar solicitudes desde la interfaz
navegable de Django REST Framework. Primero crea una cuenta administradora:

```powershell
python manage.py createsuperuser
```

Inicia el servidor y abre `http://127.0.0.1:8000/api-auth/login/` para iniciar
sesión; el acceso directo redirige a la raíz navegable `/api/`. Luego visita
`http://127.0.0.1:8000/api/usuarios/me/` para ver el perfil de la cuenta
autenticada. Las solicitudes anónimas no pueden consultar ese endpoint. La
respuesta incluye el correo, nombre, apellido y rol; no expone la contraseña ni
los permisos internos de Django.

El API Root también ofrece `/api/usuarios/`, un listado paginado y de solo
lectura accesible únicamente para cuentas con el rol de aplicación `admin`.
Devuelve solo ID, correo, nombre, apellido y rol; no permite consultar cuentas
individuales por esta ruta ni expone contraseñas o permisos internos.

## Permisos por rol

Las clases `IsProfessorOrAreaTeacher` e `IsApplicationAdmin` de
`usuarios.permissions` permiten reutilizar los roles al proteger futuras vistas
de la API. El rol `admin` tiene acceso a endpoints de la API que acepten estas
clases; el acceso al panel Django Admin sigue dependiendo de `is_staff`.
Profesores y profesores de área comparten el permiso para operaciones de
contenido. Cuando se implementen esos endpoints, también deberán comprobar que
cada profesor modifique únicamente contenido propio. El rol alumno no recibe
permiso de edición.

## Asignaturas

Las asignaturas tienen un profesor propietario, título, descripción, URL
opcional de portada, estado de publicación y una lista de alumnos inscritos.
Profesores y profesores de área pueden gestionar sus propias asignaturas; el
rol `admin` puede gestionar todas. Los alumnos solo ven asignaturas publicadas
en las que están inscritos. La API ofrece el CRUD en
`/api/asignaturas/` y la interfaz navegable de DRF permite probarlo tras iniciar
sesión. El listado permite buscar por título o descripción con `?search=texto`,
filtrar el estado con `?published=true` o `?published=false`, ordenar por título
o fecha con `?ordering=title` o `?ordering=-created_at`, y paginar con
`?page=2&page_size=10`. La página predeterminada contiene 10 resultados y el
tamaño solicitado se limita a 100.

## Unidades

Las unidades pertenecen a una asignatura y se administran desde rutas anidadas:
`/api/asignaturas/{id}/unidades/` lista o crea unidades y
`/api/asignaturas/{id}/unidades/{unidad_id}/` consulta, edita o elimina una.
Profesores y profesores de área solo pueden gestionar unidades de sus
asignaturas. Los alumnos inscritos pueden consultarlas cuando la asignatura
está publicada. La asignatura asociada se toma de la ruta para impedir mover una
unidad a otra asignatura modificando la solicitud.
