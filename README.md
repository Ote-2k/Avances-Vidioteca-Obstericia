# Videoteca de Obstetricia

Aplicación frontend para publicar asignaturas, unidades y recursos audiovisuales de obstetricia. La interfaz está construida con React y TypeScript, usa React Router y hooks, y se comunica directamente con Firebase mediante su SDK web. No requiere un servidor de API propio.

## Arquitectura

Vite sirve la SPA durante el desarrollo y compila TypeScript/JSX para producción. React Router controla las vistas dentro de una sola entrada HTML; Firebase continúa siendo el servicio de autenticación y datos.

| Archivo | Responsabilidad |
| --- | --- |
| `src/main.tsx` + `src/App.tsx` | Entrada SPA, React Router y rutas protegidas por rol. |
| `src/context/AuthContext.tsx` | Contexto de sesión/perfil y hook personalizado `useAuth`. |
| `src/pages/AccessPages.tsx` | Inicio de sesión, recuperación de contraseña y registro. |
| `src/pages/WorkspacePages.tsx` | Vistas de alumno, profesor, curso, recurso y administración. |
| `src/services/courses.ts` | Consultas y mutaciones tipadas de Firestore. |
| `src/services/videoFiles.ts` | Conversión FFmpeg y persistencia de videos en IndexedDB. |
| `src/firebase.ts` | Inicializa y exporta Authentication y Firestore. |
| `firestore.rules` / `storage.rules` | Autorización aplicada por Firebase en el servidor. |
| `src/styles.css` | Estilos responsive compartidos por las rutas React. |

`Pruebas A` y `Pruebas B` son prototipos anteriores; las rutas activas son las de la tabla.

## Herramientas y APIs

- **React + TypeScript** construyen vistas y componentes con props y modelos tipados.
- **React Router** controla las rutas y los accesos por rol; `useState`, `useEffect` y `useContext` gestionan estado y sesión.
- **Vite 5** ofrece el servidor de desarrollo y genera `dist/` con `npm run build`; TypeScript se valida antes de empaquetar.
- **Firebase Authentication** autentica correo y contraseña y mantiene la sesión del usuario.
- **Cloud Firestore** guarda perfiles de rol, asignaturas, unidades, recursos y comentarios.
- **IndexedDB** conserva documentos adjuntos y videos en el navegador; no requiere Firebase Storage ni facturación.
- **FFmpeg.wasm** ejecuta FFmpeg dentro de un Web Worker/WebAssembly descargado bajo demanda. El worker es código ejecutado por el navegador, no un proceso backend.
- **APIs del navegador** usadas directamente: DOM, `URLSearchParams`, IndexedDB, `File`, `URL.createObjectURL`, `<video>` y Canvas para generar miniaturas.

La configuración de cliente de Firebase en `src/firebase.ts` incluye identificadores públicos necesarios para inicializar el SDK web; no contiene una cuenta de servicio ni una clave administrativa. Los permisos reales dependen de las reglas Firebase.

## Modelo de datos

```text
usuarios/{uid}
	role: "profesor" | "alumno"

asignaturas/{assignmentId}
	ownerUid, published
	course: { title, description, coverUrl, units[] }
	comments: { course: [], [resourceId]: [] }

asignaturas/{assignmentId}/recursos/{resourceId}
	title, unitId, isHidden, isDraft, materials[], popups[], comments[]
	videoUrl o videoLocalKey
	trimStart, trimEnd
```

El `uid` lo entrega Authentication. `ownerUid` relaciona la asignatura con el profesor propietario. `unitId` relaciona cada recurso con una unidad. `isDraft` evita mostrar recursos que el profesor aún no terminó y `isHidden` permite ocultar recursos ya creados.

## Login y separación de roles

1. `AccessPages.tsx` llama `signInWithEmailAndPassword(auth, correo, contraseña)`. Authentication valida las credenciales; el frontend no compara contraseñas ni las guarda.
2. `auth.authStateReady()` espera a que Firebase restaure una sesión previa.
3. La app lee `usuarios/{uid}` desde Firestore y obtiene `role`.
4. El rol `profesor` dirige a `/profesor`; `alumno` dirige a `/alumno`; `admin` dirige a `/admin`. Un perfil sin rol válido no pasa las rutas protegidas.
5. `AuthContext` conserva sesión y perfil para las vistas. Las reglas de Firestore vuelven a comprobar rol, publicación y propiedad antes de aceptar cada operación; ocultar un botón no es una medida de seguridad.

Los alumnos pueden crear su cuenta desde `/registro`; las reglas solo permiten que ese usuario cree su propio perfil con `role: alumno`. Profesores y administradores se crean desde Authentication y reciben su perfil/rol mediante Admin o configuración autorizada.

## Lectura y persistencia

`src/services/courses.ts` carga perfiles, asignaturas y recursos tipados. Las operaciones de creación, edición, comentarios y borrado se mantienen en la capa de servicios para no mezclarlas con el renderizado React.

Las vistas React actualizan su estado con hooks y persisten operaciones mediante `src/services/courses.ts`. Los comentarios y respuestas se agregan con `arrayUnion` para evitar que dos envíos simultáneos sobrescriban el hilo.

Las consultas se filtran por `ownerUid` para profesores o por `published == true` para alumnos. Los alumnos reciben solo recursos `isHidden == false`; los borradores tampoco se muestran. `RoleGate` restringe rutas en el cliente y Firestore Rules aplica la autorización definitiva en el servidor.

## Comentarios

Los comentarios del curso se almacenan en `comments.course`; los de un recurso en `recursos/{resourceId}.comments`. Cada entrada incluye texto, nombre de autor, correo, UID y fecha. Las respuestas apuntan al comentario original con `parentId` y se muestran en el mismo hilo.

Los tiempos escritos en comentarios se convierten en enlaces que cambian `currentTime` del reproductor, siempre que sea un video HTML directo y que el tiempo esté dentro del tramo reproducible.

Las reglas Firestore permiten agregar comentarios y respuestas para alumnos en los hilos de curso y recurso, siempre que el `authorUid` coincida con la sesión autenticada. Los profesores pueden editar contenido de sus propias asignaturas.

## Documentos adjuntos

El formulario del recurso acepta archivos PDF, Office, texto, PNG y JPEG de hasta 25 MB, o una URL externa. Los archivos seleccionados se guardan como Blob en la base IndexedDB `videoteca-local-attachments`; Firestore solo conserva una clave. No requiere desplegar reglas de Firebase Storage, pero el archivo solo puede abrirse en el mismo navegador y perfil donde se adjuntó. Para compartirlo con alumnos en otros dispositivos se necesita un almacenamiento remoto o una URL externa accesible.

## Videos

### Archivos cargados

1. El input HTML entrega un `File`. Se intenta capturar una miniatura con un elemento `<video>` y Canvas.
2. FFmpeg.wasm se carga al seleccionar un archivo y convierte a WebM usando VP8/Opus, en un hilo para reducir memoria. Se rechazan originales mayores a 250 MB y salidas mayores a 300 MB (este último límite se conservó del flujo anterior de Storage). IndexedDB puede rechazar el guardado si el navegador no tiene cuota suficiente.
3. El WebM se guarda como `Blob` en IndexedDB, base `videoteca-local-videos`, almacén `videos`. La clave se forma como `{assignmentId}/{resourceId}`.
4. Firestore guarda `videoLocalKey` y el nombre, no los bytes del video. Al abrir el recurso, el navegador lee el `Blob`, genera una URL temporal con `URL.createObjectURL` y la asigna al reproductor.

**Consecuencia:** un video nuevo solo está disponible en el mismo origen, navegador y perfil donde se cargó. No se sincroniza con los alumnos ni con otros equipos, y borrar los datos del sitio puede eliminarlo. Para compartir videos entre usuarios se requiere almacenamiento remoto (por ejemplo Firebase Storage con su facturación correspondiente) o una URL accesible con permisos adecuados.

### URLs y compatibilidad

`resolveVideoUrl()` reconoce YouTube, Google Drive y Vimeo como reproductores embebidos; las URLs directas con extensiones de video se asignan a `<video>`. `loadVideo()` da prioridad a `videoLocalKey`, después admite `videoStoragePath` antiguo y finalmente usa `videoUrl`. Para leer videos antiguos desde Storage se necesita el bucket, sus reglas y CORS configurado para el origen web.

## Ejecutar el frontend

Requiere Node.js y npm. Desde la raíz del repositorio:

```powershell
npm ci
npm run dev
```

Abre `http://localhost:5173/login` para iniciar sesión o `/registro` para crear una cuenta estudiantil. Las rutas de trabajo son `/alumno`, `/profesor`, `/admin`, `/profesor/asignaturas/:id` y `/profesor/asignaturas/:id/recursos/:resourceId`; requieren el rol correspondiente. Mantén el servidor abierto mientras pruebas. Si `npm ci` reporta que `esbuild.exe` está en uso, detén primero Vite y vuelve a ejecutar la instalación.

Para generar y revisar una compilación de producción local:

```powershell
npm run build
npm run preview
```

`npm run build` crea `dist/`; `npm run preview` sirve esa compilación para revisión local. `package-lock.json` fija las versiones que instala `npm ci`. `node_modules/` es una carpeta generada y está excluida por `.gitignore`.

## Firebase

El proyecto seleccionado por Firebase CLI está en `.firebaserc`. Instala Firebase CLI si hace falta (`npm install --global firebase-tools`) e inicia sesión con `firebase login`. Para preparar Firebase:

1. Habilita **Authentication > Sign-in method > Email/Password** y crea las cuentas de usuarios.
2. Crea Firestore y los documentos `usuarios/{uid}` con su `role`.
3. Publica las reglas desde la raíz del repositorio:

```powershell
firebase deploy --only firestore:rules
```

Firebase Storage es opcional para los videos nuevos. Solo si se habilita el bucket para videos antiguos se despliegan sus reglas con `firebase deploy --only storage` y se aplica [cors.json](cors.json) al bucket.

## Resumen para la evaluación

“Vite sirve una SPA React + TypeScript y React Router gestiona rutas protegidas por rol. Firebase Authentication valida la identidad; AuthContext carga el perfil desde Firestore y las reglas autorizan las lecturas/escrituras. Las vistas tipadas gestionan asignaturas, unidades, recursos y comentarios. Los videos se convierten en el cliente con FFmpeg WebAssembly y se guardan en IndexedDB local; por ello no se distribuyen automáticamente entre alumnos.”
