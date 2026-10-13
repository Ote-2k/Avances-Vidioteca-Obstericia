/**
 * Registro de estudiantes en la versión clásica del proyecto.
 *
 * Crea la cuenta Firebase, actualiza el perfil del usuario y escribe el registro
 * del alumno en Firestore para que pueda acceder a la videoteca.
 */
import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

const form = document.querySelector("#register-form");
const statusText = document.querySelector("#register-status");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  
  const submitBtn = form.querySelector("button[type=submit]");
  const nombre = document.querySelector("#nombre").value.trim();
  const emailUser = document.querySelector("#email-user").value.trim().toLowerCase();
  const domain = document.querySelector("#email-domain").value;
  const password = document.querySelector("#password").value;
  const confirmPassword = document.querySelector("#confirm-password").value;

  if (!emailUser) {
    statusText.textContent = "Por favor ingresa tu usuario de correo.";
    return;
  }

  if (password !== confirmPassword) {
    statusText.textContent = "Las contraseñas no coinciden.";
    return;
  }

  const fullEmail = `${emailUser}${domain}`;

  submitBtn.disabled = true;
  statusText.textContent = "Creando cuenta de estudiante...";

  try {
    // 1. Crear usuario en Auth
    const userCredential = await createUserWithEmailAndPassword(auth, fullEmail, password);
    const user = userCredential.user;

    // 2. Actualizar perfil del usuario
    await updateProfile(user, { displayName: nombre });

    // 3. Crear documento de usuario en Firestore
    await setDoc(doc(db, "usuarios", user.uid), {
      nombre: nombre,
      email: fullEmail,
      role: "alumno",
      createdAt: new Date().toISOString()
    });

    statusText.textContent = "¡Cuenta creada con éxito! Entrando a la videoteca...";
    
    // 4. Redirección
    setTimeout(() => {
      window.location.href = "index.html";
    }, 1200);

  } catch (error) {
    console.error("Error detallado al registrar alumno:", error);
    submitBtn.disabled = false;

    if (error.code === "auth/email-already-in-use") {
      statusText.textContent = "Este correo ya existe. Intenta iniciar sesión.";
    } else if (error.code === "permission-denied" || error.message.includes("permission")) {
      statusText.textContent = "Error de permisos en Firestore. Revisa las Reglas de Firebase.";
    } else {
      statusText.textContent = `Error: ${error.message}`;
    }
  }
});