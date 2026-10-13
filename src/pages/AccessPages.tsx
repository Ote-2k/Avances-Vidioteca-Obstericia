import { useState, type FormEvent } from "react";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { useAuth } from "../context/AuthContext";

function AccessLayout({ title, subtitle, children }: React.PropsWithChildren<{ title: string; subtitle: string }>) {
	return (
		<main className="access-layout">
			<section className="access-visual">
				<img src="/LOGO%20INSTITUCIONAL/SVG/UCEN%20LOGO_UCEN_ISO_BLANCO.svg" alt="Universidad Central" />
				<p>Obstetricia y Puericultura<br />Facultad de Medicina y Ciencias de la Salud</p>
			</section>
			<section className="access-panel">
				<div className="access-content">
					<p className="eyebrow">VIDEOTECA UCEN</p>
					<h1>{title}</h1>
					<p className="muted">{subtitle}</p>
					{children}
				</div>
			</section>
		</main>
	);
}

export function LoginPage() {
	const { user, profile, loading, refreshProfile } = useAuth();
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [status, setStatus] = useState("");
	const [busy, setBusy] = useState(false);
	if (!loading && user && profile) return <Navigate to={profile.role === "admin" ? "/admin" : profile.role === "profesor" ? "/profesor" : "/alumno"} replace />;

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy(true);
		setStatus("Verificando acceso...");
		try {
			await signInWithEmailAndPassword(auth, email.trim(), password);
			await refreshProfile();
			navigate("/");
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "No se pudo iniciar sesión.");
			setBusy(false);
		}
	}
	async function resetPassword() {
		if (!email.trim()) {
			setStatus("Escribe tu correo para solicitar el restablecimiento.");
			return;
		}
		try { await sendPasswordResetEmail(auth, email.trim()); setStatus("Si la cuenta existe, recibirás un correo para restablecer la contraseña."); }
		catch { setStatus("No se pudo enviar el correo de restablecimiento."); }
	}

	return (
		<AccessLayout title="Iniciar sesión" subtitle="Ingresa con tu cuenta institucional para continuar.">
			<form className="form-stack" onSubmit={submit}>
				<label>Correo electrónico<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
				<label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
				<button className="text-button" type="button" onClick={() => void resetPassword()}>Olvidé mi contraseña</button>
				<button className="button button-primary" disabled={busy}>{busy ? "Ingresando..." : "Acceder"}</button>
				<p className="status" role="status">{status}</p>
				<p className="form-footnote">¿Eres estudiante? <Link to="/registro">Crea tu cuenta</Link></p>
			</form>
		</AccessLayout>
	);
}

export function RegisterPage() {
	const { refreshProfile } = useAuth();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [status, setStatus] = useState("");
	const [busy, setBusy] = useState(false);
	const navigate = useNavigate();

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (password !== confirmation) {
			setStatus("Las contraseñas no coinciden.");
			return;
		}
		setBusy(true);
		setStatus("Creando cuenta...");
		try {
			const credential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
			await updateProfile(credential.user, { displayName: name.trim() });
			await setDoc(doc(db, "usuarios", credential.user.uid), {
				nombre: name.trim(),
				email: credential.user.email,
				role: "alumno",
				createdAt: new Date().toISOString()
			});
			await refreshProfile();
			navigate("/alumno");
		} catch (error) {
			console.error("No se pudo crear el perfil:", error);
			setStatus("No se pudo terminar el registro. Comprueba las reglas de Firestore.");
			setBusy(false);
		}
	}

	return (
		<AccessLayout title="Crear cuenta de estudiante" subtitle="Usa tu correo institucional para acceder a tus asignaturas.">
			<form className="form-stack" onSubmit={submit}>
				<label>Nombre completo<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
				<label>Correo institucional<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
				<label>Contraseña<input type="password" autoComplete="new-password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
				<label>Confirmar contraseña<input type="password" autoComplete="new-password" minLength={6} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>
				<button className="button button-primary" disabled={busy}>{busy ? "Creando..." : "Crear cuenta"}</button>
				<p className="status" role="status">{status}</p>
				<p className="form-footnote"><Link to="/login">Volver a iniciar sesión</Link></p>
			</form>
		</AccessLayout>
	);
}