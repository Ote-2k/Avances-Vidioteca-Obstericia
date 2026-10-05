# Avances-Vidioteca-Obstericia
Pagina de Git hecha para documentar y mostrar nuestros avances en el desarrollo de la videoteca de obstetricia

## Cuentas de demo local

El formulario de acceso acepta estas cuentas fijas:

- Profesor: `profesor@videoteca.demo` / `Profesor123!`
- Alumno: `alumno@videoteca.demo` / `Alumno123!`

El profesor entra al panel y puede crear asignaturas, renombrarlas y añadir recursos. Los cambios se guardan en `localStorage`; los videos seleccionados se guardan en IndexedDB del mismo navegador. El alumno entra a la vista de clases de ejemplo. Estas cuentas y claves están en el código y no protegen datos: úsalas solo para demostración, nunca para información real ni producción.

## Configuración Firebase

El proyecto conserva la integración para usar Firestore y Firebase Storage, con reglas que separan los datos por propietario. El login local de demo no autentica usuarios de Firebase, por lo que para activar persistencia en la nube hay que volver a conectar el formulario a Firebase Authentication y crear las cuentas reales en Firebase Console.

Antes de usarla en Firebase Console:

1. Habilita Authentication con el proveedor Correo electrónico/contraseña y crea la cuenta del profesor.
2. Crea la base de datos de Firestore y habilita el bucket de Storage del proyecto configurado en `firebase-config.js`.
3. Instala e inicia sesión en Firebase CLI, selecciona el proyecto `videoteca-obstetricia` y despliega las reglas con `firebase deploy --only firestore:rules,storage`.
4. Ejecuta `npm run dev` y abre `/Vista/Profesor/main.html`.

La primera carga crea en Firestore la asignatura de ejemplo y migra los datos locales existentes de ese navegador. Si Firebase no está disponible, la vista avisa que los cambios quedan solo en el navegador. Los videos se limitan a 500 MB por las reglas de Storage.
