/**
 * Configuración central de Firebase para la aplicación React.
 *
 * Este archivo expone la instancia de autenticación y base de datos para que el
 * resto del proyecto pueda consumir servicios sin repetir la inicialización.
 */
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
	apiKey: "AIzaSyAW8zEFVvceBMokRDyMMP53uEyyhQrEPAg",
	authDomain: "videoteca-obstetricia.firebaseapp.com",
	projectId: "videoteca-obstetricia",
	storageBucket: "videoteca-obstetricia.firebasestorage.app",
	messagingSenderId: "904184784737",
	appId: "1:904184784737:web:7f458d048a514e357c0720",
	measurementId: "G-4L1RW8RT4H"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
