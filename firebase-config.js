// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAW8zEFVvceBMokRDyMMP53uEyyhQrEPAg",
  authDomain: "videoteca-obstetricia.firebaseapp.com",
  projectId: "videoteca-obstetricia",
  storageBucket: "videoteca-obstetricia.firebasestorage.app",
  messagingSenderId: "904184784737",
  appId: "1:904184784737:web:7f458d048a514e357c0720",
  measurementId: "G-4L1RW8RT4H"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

//export services
export const auth = getAuth(app);
export const db = getFirestore(app);