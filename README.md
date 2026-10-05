# Avances-Vidioteca-Obstericia
Pagina de Git hecha para documentar y mostrar nuestros avances en el desarrollo de la videoteca de obstetricia

## Configuración Firebase

El login usa Firebase Authentication. Firestore guarda asignaturas, unidades, recursos y comentarios; Firebase Storage guarda los videos convertidos a WebM. No hay credenciales en el código.

### Preparar el proyecto

1. En Firebase Console abre el proyecto `videoteca-obstetricia`.
2. En **Authentication > Sign-in method**, habilita **Correo electrónico/contraseña**.
3. En **Authentication > Users**, crea una cuenta para cada profesor y alumno. Guarda el UID que Firebase muestra para cada cuenta.
4. En **Firestore Database**, crea la base de datos en modo producción.
5. En **Firestore > Data**, crea la colección `usuarios`. Para cada persona crea un documento cuyo ID sea su UID y añade el campo `role` (tipo string), con valor exactamente `profesor` o `alumno`.
6. En **Storage**, crea/habilita el bucket del proyecto.

Los documentos de rol tienen esta forma:

```text
usuarios/{UID_DEL_PROFESOR}  { role: "profesor" }
usuarios/{UID_DEL_ALUMNO}    { role: "alumno" }
```

### Desplegar reglas y CORS

Instala Firebase CLI si aún no está instalado (`npm install --global firebase-tools`), inicia sesión (`firebase login`) y selecciona este proyecto (`firebase use --add`, elige `videoteca-obstetricia`). Después, desde la raíz del repo:

```powershell
firebase deploy --only firestore:rules,storage
```

El reproductor obtiene los WebM con el SDK autenticado. Para permitir esa lectura desde el navegador, instala Google Cloud CLI, inicia sesión con una cuenta con permisos sobre el bucket y aplica [cors.json](cors.json):

```powershell
gcloud storage buckets update gs://videoteca-obstetricia.firebasestorage.app --cors-file=cors.json
```

Añade el origen de producción propio a `cors.json` si la aplicación se publica en otro dominio.

### Ejecutar

```powershell
npm install
npm run dev
```

Abre `/login.html`. Inicia primero con el profesor; al entrar por primera vez se crea una asignatura inicial vacía, con su Unidad principal. Los profesores crean asignaturas y recursos; los alumnos solo consultan asignaturas publicadas y recursos visibles.

Al cargar un archivo, FFmpeg se descarga bajo demanda (core WebAssembly de unos 32 MB), convierte a WebM con VP9/Opus y sube solo el resultado. El límite de entrada es 250 MB y Storage rechaza archivos de más de 300 MB. La conversión consume CPU y memoria; probar con videos cortos primero.
