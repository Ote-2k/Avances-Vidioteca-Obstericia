/**
 * Panel administrativo legacy para gestionar usuarios y roles.
 *
 * Esta vista reemplaza la administración clásica de la aplicación y permite
 * crear profesores, cambiar roles y eliminar perfiles desde la UI administrativa.
 */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { auth, db } from "../../firebase-config.js";
import { signOut, onAuthStateChanged, getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { collection, doc, getDocs, updateDoc, setDoc, deleteDoc } from "firebase/firestore";
import { initializeApp } from "firebase/app";

let secondaryAuth = null;
try {
	const secondaryApp = initializeApp(auth.app.options, "SecondaryAdminApp");
	secondaryAuth = getAuth(secondaryApp);
} catch {
	secondaryAuth = getAuth();
}

function AdminUsers() {
	const [users, setUsers] = useState([]);
	const [searchTerm, setSearchTerm] = useState("");
	const [status, setStatus] = useState("");
	const [roles, setRoles] = useState({});
	const [busyUserId, setBusyUserId] = useState(null);

	useEffect(() => {
		let active = true;
		setStatus("Verificando sesión de administrador...");

		const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
			if (!currentUser) {
				window.location.href = "../../login.html";
				return;
			}

			try {
				setStatus("Cargando lista de usuarios...");
				const querySnapshot = await getDocs(collection(db, "usuarios"));
				const loadedUsers = querySnapshot.docs.map((userDoc) => ({
					uid: userDoc.id,
					...userDoc.data()
				}));
				if (active) {
					setUsers(loadedUsers);
					setStatus("Usuarios cargados correctamente.");
				}
			} catch (error) {
				console.error("Error al obtener usuarios:", error);
				if (active) {
					setStatus("Error al cargar usuarios. Verifica que las Reglas de Firestore permitan 'list' en /usuarios a tu cuenta admin.");
				}
			}
		});

		const createTeacherForm = document.querySelector("#create-teacher-form");
		const handleCreateTeacher = async (event) => {
			event.preventDefault();
			const email = document.querySelector("#teacher-email").value.trim();
			const name = document.querySelector("#teacher-name").value.trim();
			const password = document.querySelector("#teacher-password").value;

			try {
				setStatus(`Creando cuenta para ${email}...`);
				const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
				const newTeacher = {
					uid: userCredential.user.uid,
					displayName: name,
					email,
					role: "profesor",
					createdAt: new Date().toISOString()
				};

				await setDoc(doc(db, "usuarios", newTeacher.uid), {
					displayName: newTeacher.displayName,
					email: newTeacher.email,
					role: newTeacher.role,
					createdAt: newTeacher.createdAt
				});
				if (active) {
					setUsers((previousUsers) => [...previousUsers, newTeacher]);
					setStatus(`¡Profesor ${email} creado exitosamente!`);
					createTeacherForm.reset();
				}
			} catch (error) {
				console.error("Error al crear profesor:", error);
				if (active) {
					setStatus(error.code === "auth/email-already-in-use"
						? "Error: Este correo ya está registrado."
						: `Error: ${error.message}`);
				}
			}
		};
		createTeacherForm?.addEventListener("submit", handleCreateTeacher);

		const logoutButton = document.querySelector("#logout-button");
		const handleLogout = async () => {
			try {
				setStatus("Cerrando sesión...");
				logoutButton.disabled = true;
				await signOut(auth);
				if (secondaryAuth) await signOut(secondaryAuth).catch(() => {});
				const isDeepFolder = window.location.pathname.includes("/Vista/");
				window.location.href = isDeepFolder ? "../../login.html" : "login.html";
			} catch (error) {
				console.error("Error al cerrar sesión:", error);
				setStatus("Error al cerrar sesión. Intenta nuevamente.");
				logoutButton.disabled = false;
			}
		};
		logoutButton?.addEventListener("click", handleLogout);

		return () => {
			active = false;
			unsubscribeAuth();
			createTeacherForm?.removeEventListener("submit", handleCreateTeacher);
			logoutButton?.removeEventListener("click", handleLogout);
		};
	}, []);

	const filteredUsers = users.filter((user) =>
		(user.email || "").toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
		(user.displayName || user.name || "").toLowerCase().includes(searchTerm.toLowerCase().trim())
	);

	async function saveRole(user) {
		const newRole = roles[user.uid] ?? user.role;
		if (newRole === user.role) {
			setStatus("El rol seleccionado ya es el actual.");
			return;
		}

		try {
			setBusyUserId(user.uid);
			setStatus(`Actualizando rol de ${user.email}...`);
			await updateDoc(doc(db, "usuarios", user.uid), { role: newRole });
			setUsers((previousUsers) => previousUsers.map((item) =>
				item.uid === user.uid ? { ...item, role: newRole } : item
			));
			setStatus(`Rol de ${user.email} actualizado a "${newRole}".`);
		} catch (error) {
			console.error("Error al actualizar rol:", error);
			setStatus("Error al actualizar el rol en Firestore.");
		} finally {
			setBusyUserId(null);
		}
	}

	async function deleteUser(user) {
		if (user.uid === auth.currentUser?.uid) {
			setStatus("No puedes eliminar tu propia cuenta de Administrador activa.");
			return;
		}
		if (!window.confirm(`¿Eliminar definitivamente la cuenta de ${user.email}?`)) return;

		try {
			setBusyUserId(user.uid);
			setStatus(`Eliminando usuario ${user.email}...`);
			await deleteDoc(doc(db, "usuarios", user.uid));
			setUsers((previousUsers) => previousUsers.filter((item) => item.uid !== user.uid));
			setStatus(`Cuenta ${user.email} eliminada correctamente.`);
		} catch (error) {
			console.error("Error al eliminar:", error);
			setStatus("Error al eliminar usuario en Firestore.");
		} finally {
			setBusyUserId(null);
		}
	}

	return (
		<>
			<div className="admin-controls">
				<input
					type="search"
					placeholder="Buscar usuario por correo o nombre..."
					value={searchTerm}
					onChange={(event) => setSearchTerm(event.target.value)}
				/>
				<span>{filteredUsers.length} usuario(s)</span>
			</div>
			<p className="status-message" aria-live="polite">{status}</p>
			<section className="table-card">
				<table className="admin-table">
					<thead>
						<tr>
						<th>Usuario / Correo</th>
						<th>Rol Actual</th>
						<th>Acciones</th>
						</tr>
					</thead>
					<tbody>
						{filteredUsers.length === 0 ? (
							<tr><td colSpan="3" style={{ textAlign: "center", padding: 16, color: "#888" }}>No se encontraron usuarios registrados.</td></tr>
						) : filteredUsers.map((user) => (
							<tr key={user.uid}>
								<td>
									<strong>{user.displayName || user.name || "Sin nombre"}</strong>
									<br /><small style={{ color: "#666" }}>{user.email || "Sin correo"}</small>
								</td>
								<td>
									<select
										className="role-select"
										value={roles[user.uid] ?? user.role ?? "alumno"}
										onChange={(event) => setRoles((previousRoles) => ({ ...previousRoles, [user.uid]: event.target.value }))}
									>
										{["alumno", "profesor", "admin"].map((role) => (
											<option key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
										))}
									</select>
								</td>
								<td style={{ display: "flex", gap: 8 }}>
									<button type="button" className="btn-save-role" disabled={busyUserId === user.uid} onClick={() => saveRole(user)}>Guardar Rol</button>
									<button
										type="button"
										className="btn-delete-user"
										style={{ backgroundColor: "#dc2626", color: "#fff", border: "none", borderRadius: 4, padding: "4px 8px", cursor: "pointer" }}
										disabled={busyUserId === user.uid}
										onClick={() => deleteUser(user)}
									>Eliminar</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>
		</>
	);
}

createRoot(document.querySelector("#admin-users-root")).render(<AdminUsers />);