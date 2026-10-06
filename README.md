# Avances-Vidioteca-Obstericia
Pagina de Git hecha para documentar y mostrar nuestros avances en el desarrollo de la videoteca de obstetricia

## Configuración Firebase

El login usa Firebase Authentication. Firestore guarda asignaturas, unidades, recursos y comentarios. Los videos nuevos se convierten a WebM y se guardan en IndexedDB en el navegador del profesor; no se sincronizan con otros equipos o perfiles del navegador. No hay credenciales en el código.

### Preparar el proyecto

1. En Firebase Console abre el proyecto `videoteca-obstetricia`.
2. En **Authentication > Sign-in method**, habilita **Correo electrónico/contraseña**.
3. En **Authentication > Users**, crea una cuenta para cada profesor y alumno. Guarda el UID que Firebase muestra para cada cuenta.
4. En **Firestore Database**, crea la base de datos en modo producción.
5. En **Firestore > Data**, crea la colección `usuarios`. Para cada persona crea un documento cuyo ID sea su UID y añade el campo `role` (tipo string), con valor exactamente `profesor` o `alumno`.
6. Firebase Storage no es necesario para subir videos en este prototipo. Los videos nuevos quedan guardados en IndexedDB local.

Los documentos de rol tienen esta forma:

```text
usuarios/{UID_DEL_PROFESOR}  { role: "profesor" }
usuarios/{UID_DEL_ALUMNO}    { role: "alumno" }
```

### Desplegar reglas de Firestore

Instala Firebase CLI si aún no está instalado (`npm install --global firebase-tools`), inicia sesión (`firebase login`) y selecciona este proyecto (`firebase use --add`, elige `videoteca-obstetricia`). Después, desde la raíz del repo:

```powershell
firebase deploy --only firestore:rules
```

Storage es opcional y solo se necesita para acceder a videos antiguos almacenados en Firebase. Firebase requiere el plan Blaze para crear y usar buckets de Storage. Si lo habilitas, despliega las reglas con `firebase deploy --only storage`.

Para reproducir videos antiguos desde Storage en el navegador, instala Google Cloud CLI, inicia sesión con una cuenta con permisos sobre el bucket y aplica [cors.json](cors.json):

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

Al cargar un archivo, FFmpeg se descarga bajo demanda (core WebAssembly de unos 32 MB) y convierte a WebM con VP8/Opus para reducir el uso de memoria durante la conversión local. El archivo se guarda en IndexedDB del navegador y no se sube a Firebase; solo el navegador y perfil donde se cargó puede reproducirlo. Borrar los datos del sitio puede eliminar esos videos. El archivo original debe ser menor a 250 MB y el espacio disponible depende del navegador y del dispositivo. La conversión consume CPU y memoria; probar con videos cortos primero.
