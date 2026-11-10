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
