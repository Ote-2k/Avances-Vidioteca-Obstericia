import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Configuración pública del SDK web; las reglas de Firestore y Storage protegen los datos.
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

// Instancias compartidas para que todas las páginas usen el mismo proyecto Firebase.
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);