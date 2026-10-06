# Videoteca de Obstetricia

Frontend multipágina para publicar asignaturas, unidades y recursos audiovisuales de obstetricia. La aplicación está construida con HTML, CSS y JavaScript modular; no usa React ni un servidor de API propio. El navegador se comunica directamente con Firebase mediante su SDK web.

## Arquitectura

Vite sirve los archivos durante el desarrollo, resuelve los imports de JavaScript y empaqueta las páginas para producción. No es la base de datos ni el servidor de autenticación. La navegación entre vistas usa URLs y parámetros de consulta; cada HTML carga sus propios módulos.

| Archivo | Responsabilidad |
| --- | --- |
| `login.html` | Formulario, Firebase Authentication y redirección según rol. |
| `index.html` | Vista del alumno en `/index.html`; la raíz `/` redirige al login. |
| `Vista/Alumno/student-home.js` | Carga asignaturas publicadas y dibuja el árbol asignatura → unidad → recurso y las tarjetas de clase. |
| `Vista/Profesor/main.html` + `course-manager.js` | Panel para listar, crear, renombrar y eliminar asignaturas. |
| `Vista/Profesor/asignatura-1.html` + `asignatura-editor.js` | Vista de curso, unidades, recursos, comentarios del curso y edición de portada/descripción. |
| `Vista/Profesor/recurso.html` + `recurso-editor.js` | Ficha de recurso: video, documentos, edición, marcas de tiempo, pop-ups y comentarios. |
| `Vista/Profesor/editor-store.js` | Estado compartido y operaciones de lectura/escritura para los módulos de profesor y alumno. |
| `firebase-config.js` | Inicializa y exporta las instancias compartidas de Firebase. |
| `firestore.rules` / `storage.rules` | Autorización aplicada por Firebase en el servidor. |
| `styles.css` | Estilos comunes, principalmente login y vista del alumno. Las páginas de profesor incluyen estilos propios en su HTML. |

`Pruebas A` y `Pruebas B` son prototipos anteriores; las rutas activas son las de la tabla.

## Herramientas y APIs

- **HTML** define la estructura semántica de formularios, navegación, reproductor y diálogos.
- **CSS** controla presentación, distribución y adaptación a móvil. Los módulos JS actualizan el DOM con los datos recibidos.
- **JavaScript ES modules** separa las vistas y permite compartir `VideotecaStore` y la configuración Firebase mediante `import`/`export`.
- **Vite 5** ofrece el servidor de desarrollo con recarga rápida y genera el directorio `dist/` con `npm run build`. La configuración declara varias páginas HTML como entradas.
- **Firebase Authentication** autentica correo y contraseña y mantiene la sesión del usuario.
- **Cloud Firestore** guarda perfiles de rol, asignaturas, unidades, recursos y comentarios.
- **Firebase Storage** está integrado para poder leer y eliminar videos antiguos. No se necesita para subir los videos nuevos del prototipo.
- **FFmpeg.wasm** ejecuta FFmpeg dentro de un Web Worker/WebAssembly descargado bajo demanda. El worker es código ejecutado por el navegador, no un proceso backend.
- **APIs del navegador** usadas directamente: DOM, `URLSearchParams`, IndexedDB, `File`, `URL.createObjectURL`, `<video>` y Canvas para generar miniaturas.

La configuración de cliente de Firebase en `firebase-config.js` incluye identificadores públicos necesarios para inicializar el SDK web; no contiene una cuenta de servicio ni una clave administrativa. Los permisos reales dependen de las reglas Firebase.

## Modelo de datos

```text
usuarios/{uid}
	role: "profesor" | "alumno"

asignaturas/{assignmentId}
	ownerUid, published
	course: { title, description, coverUrl, units[] }
	comments: { course: [], [resourceId]: [] }

asignaturas/{assignmentId}/recursos/{resourceId}
	title, unitId, isHidden, isDraft, materials[], popups[]
	videoUrl o videoLocalKey
```

El `uid` lo entrega Authentication. `ownerUid` relaciona la asignatura con el profesor propietario. `unitId` relaciona cada recurso con una unidad. `isDraft` evita mostrar recursos que el profesor aún no terminó y `isHidden` permite ocultar recursos ya creados.

## Login y separación de roles

1. `login.html` llama `signInWithEmailAndPassword(auth, correo, contraseña)`. Authentication valida las credenciales; el frontend no compara contraseñas ni las guarda.
2. `auth.authStateReady()` espera a que Firebase restaure una sesión previa.
3. La app lee `usuarios/{uid}` desde Firestore y obtiene `role`.
4. El rol `profesor` dirige a `Vista/Profesor/main.html`; `alumno` dirige a `index.html`. Un perfil sin rol válido se desconecta.
5. `editor-store.js` vuelve a leer el perfil al inicializar cada vista. Las reglas de Firestore vuelven a comprobar rol, publicación y propiedad antes de aceptar cada operación; ocultar un botón no es una medida de seguridad.

Para dar de alta un usuario, se crea en **Authentication > Users** y luego se crea en Firestore `usuarios/{UID}` con un campo string `role` cuyo valor sea exactamente `profesor` o `alumno`. El frontend no tiene una pantalla de registro ni permite que los usuarios se asignen su propio rol.

## Lectura y persistencia

`editor-store.js` inicializa el estado desde Firestore. En una asignatura, combina el documento padre con la subcolección `recursos`. Sus métodos (`createAssignment`, `createUnit`, `createResource`, `saveResource`, `addComment`, etc.) centralizan las mutaciones.

Después de un cambio, `write()` crea una copia del estado y agrega su persistencia a `persistQueue`. La cola serializa las escrituras. Para un profesor se actualiza el documento padre y se sincroniza la subcolección de recursos con un batch; para un alumno la escritura prevista es una actualización del campo de comentarios. `flush()` espera la cola y propaga un error pendiente para que la interfaz no confirme un guardado fallido.

Las consultas se filtran por `ownerUid` para profesores o por `published == true` para alumnos. Los alumnos reciben solo recursos `isHidden == false`; los borradores tampoco se muestran.

## Comentarios

Los comentarios del curso se almacenan en `comments.course`; los de un recurso en `comments[resourceId]`. Cada entrada incluye texto, autor, fecha e identificador. El store añade `authorUid` con el usuario autenticado. Las respuestas conservan un `parentId`, y las menciones guardan rangos de texto y el ID de recurso para poder resaltar la tarjeta correspondiente.

Los tiempos escritos en comentarios se convierten en enlaces que cambian `currentTime` del reproductor, siempre que sea un video HTML directo y que el tiempo esté dentro del tramo reproducible.

**Límite actual de reglas:** `firestore.rules` permite al alumno agregar una entrada al hilo del curso (`comments.course`) con su `authorUid`. También admite respuestas que se agreguen a ese mismo arreglo. Los comentarios asociados a un recurso (`comments[resourceId]`) no cumplen la regla y Firestore los rechaza para alumnos, aunque la interfaz los presente. Los profesores pueden editar los comentarios de sus propias asignaturas.

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

Abre `http://localhost:5173/` o `http://localhost:5173/login.html`. La raíz redirige al login; `/index.html` es la ruta explícita del alumno y requiere una sesión con rol de alumno. Mantén el servidor abierto mientras pruebas. Si `npm ci` reporta que `esbuild.exe` está en uso, detén primero Vite y vuelve a ejecutar la instalación.

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

“Vite sirve y empaqueta un frontend multipágina escrito en HTML, CSS y JavaScript ES modules. Firebase Authentication valida la identidad; un perfil Firestore aporta el rol y las reglas Firestore autorizan cada lectura o escritura. El store central carga las asignaturas y sincroniza cambios. Los recursos se organizan en unidades; los comentarios se guardan en el documento de la asignatura. Los archivos de video nuevos se convierten en el cliente con FFmpeg WebAssembly y se guardan en IndexedDB, por lo que este prototipo no los distribuye entre alumnos.”
