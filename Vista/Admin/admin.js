import { auth, db } from "../../firebase-config.js";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDocs, updateDoc, setDoc, deleteDoc } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { useState, useEffect } from "../hooks.js";

// Obtener las opciones de la app ya inicializada sin necesidad de exportar firebaseConfig
let secondaryAuth = null;
try {
	const primaryApp = auth.app;
	const secondaryApp = initializeApp(primaryApp.options, "SecondaryAdminApp");
	secondaryAuth = getAuth(secondaryApp);
} catch (e) {
	secondaryAuth = getAuth();
}

(() => {
	const userTableBody = document.querySelector("#user-table-body");
	const userSearchInput = document.querySelector("#user-search-input");
	const userCountBadge = document.querySelector("#user-count-badge");
	const adminSaveStatus = document.querySelector("#admin-save-status");
	const createTeacherForm = document.querySelector("#create-teacher-form");

	// --------------------------------------------------------------------------
	// HOOK 1: useState para la Lista de Usuarios
	// --------------------------------------------------------------------------
	const [getUsers, setUsers] = useState([], (usersList) => {
		renderUserTable(usersList);
	});

	// --------------------------------------------------------------------------
	// HOOK 2: useEffect con espera de Autenticación Firebase
	// --------------------------------------------------------------------------
	useEffect(() => {
		adminSaveStatus.textContent = "Verificando sesión de administrador...";

		// Esperar a que Firebase confirme la autenticación del usuario actual
		const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
			if (!currentUser) {
				window.location.href = "../../login.html";
				return;
			}

			try {
				adminSaveStatus.textContent = "Cargando lista de usuarios...";
				const querySnapshot = await getDocs(collection(db, "usuarios"));
				const users = [];
				querySnapshot.forEach((docSnap) => {
					users.push({ uid: docSnap.id, ...docSnap.data() });
				});

				setUsers(users);
				adminSaveStatus.textContent = "Usuarios cargados correctamente.";
			} catch (error) {
				console.error("Error al obtener usuarios:", error);
				adminSaveStatus.textContent = "Error al cargar usuarios. Verifica que las Reglas de Firestore permitan 'list' en /usuarios a tu cuenta admin.";
			}
		});

		// Cleanup: Cancelar el listener de auth al salir
		return () => unsubscribe();
	});

	// --------------------------------------------------------------------------
	// RENDERIZADO DE LA TABLA
	// --------------------------------------------------------------------------
	function renderUserTable(usersList) {
		const searchTerm = (userSearchInput?.value || "").toLowerCase().trim();
		const filtered = usersList.filter((u) =>
			(u.email || "").toLowerCase().includes(searchTerm) ||
			(u.displayName || u.name || "").toLowerCase().includes(searchTerm)
		);

		if (userCountBadge) userCountBadge.textContent = `${filtered.length} usuario(s)`;
		userTableBody.replaceChildren();

		if (!filtered.length) {
			const tr = document.createElement("tr");
			tr.innerHTML = `<td colspan="3" style="text-align:center; padding: 16px; color: #888;">No se encontraron usuarios registrados.</td>`;
			userTableBody.append(tr);
			return;
		}

		filtered.forEach((user) => {
			const tr = document.createElement("tr");

			// Columna 1: Nombre y Correo
			const tdUser = document.createElement("td");
			tdUser.innerHTML = `<strong>${user.displayName || user.name || "Sin nombre"}</strong><br><small style="color:#666;">${user.email || "Sin correo"}</small>`;

			// Columna 2: Selector de Rol
			const tdRole = document.createElement("td");
			const roleSelect = document.createElement("select");
			roleSelect.className = "role-select";

			["alumno", "profesor", "admin"].forEach((role) => {
				const opt = document.createElement("option");
				opt.value = role;
				opt.textContent = role.charAt(0).toUpperCase() + role.slice(1);
				opt.selected = user.role === role;
				roleSelect.append(opt);
			});

			tdRole.append(roleSelect);

			// Columna 3: Botones Guardar Rol y Eliminar
			const tdActions = document.createElement("td");
			tdActions.style.display = "flex";
			tdActions.style.gap = "8px";

			const saveBtn = document.createElement("button");
			saveBtn.type = "button";
			saveBtn.className = "btn-save-role";
			saveBtn.textContent = "Guardar Rol";

			saveBtn.addEventListener("click", async () => {
				const newRole = roleSelect.value;
				if (newRole === user.role) {
					adminSaveStatus.textContent = "El rol seleccionado ya es el actual.";
					return;
				}

				try {
					saveBtn.disabled = true;
					adminSaveStatus.textContent = `Actualizando rol de ${user.email}...`;

					await updateDoc(doc(db, "usuarios", user.uid), { role: newRole });

					const updatedList = getUsers().map((u) => u.uid === user.uid ? { ...u, role: newRole } : u);
					setUsers(updatedList);

					adminSaveStatus.textContent = `Rol de ${user.email} actualizado a "${newRole}".`;
				} catch (err) {
					console.error("Error al actualizar rol:", err);
					adminSaveStatus.textContent = "Error al actualizar el rol en Firestore.";
					saveBtn.disabled = false;
				}
			});

			const deleteBtn = document.createElement("button");
			deleteBtn.type = "button";
			deleteBtn.className = "btn-delete-user";
			deleteBtn.textContent = "Eliminar";
			deleteBtn.style.backgroundColor = "#dc2626";
			deleteBtn.style.color = "#fff";
			deleteBtn.style.border = "none";
			deleteBtn.style.borderRadius = "4px";
			deleteBtn.style.padding = "4px 8px";
			deleteBtn.style.cursor = "pointer";

			deleteBtn.addEventListener("click", async () => {
				if (user.uid === auth.currentUser?.uid) {
					adminSaveStatus.textContent = "No puedes eliminar tu propia cuenta de Administrador activa.";
					return;
				}

				if (window.confirm(`¿Eliminar definitivamente la cuenta de ${user.email}?`)) {
					try {
						deleteBtn.disabled = true;
						adminSaveStatus.textContent = `Eliminando usuario ${user.email}...`;

						await deleteDoc(doc(db, "usuarios", user.uid));

						const updatedList = getUsers().filter((u) => u.uid !== user.uid);
						setUsers(updatedList);

						adminSaveStatus.textContent = `Cuenta ${user.email} eliminada correctamente.`;
					} catch (err) {
						console.error("Error al eliminar:", err);
						adminSaveStatus.textContent = "Error al eliminar usuario en Firestore.";
						deleteBtn.disabled = false;
					}
				}
			});

			tdActions.append(saveBtn, deleteBtn);
			tr.append(tdUser, tdRole, tdActions);
			userTableBody.append(tr);
		});
	}

	// --------------------------------------------------------------------------
	// REGISTRO DE NUEVO PROFESOR
	// --------------------------------------------------------------------------
	if (createTeacherForm) {
		createTeacherForm.addEventListener("submit", async (e) => {
			e.preventDefault();
			const email = document.querySelector("#teacher-email").value.trim();
			const name = document.querySelector("#teacher-name").value.trim();
			const password = document.querySelector("#teacher-password").value;

			try {
				adminSaveStatus.textContent = `Creando cuenta para ${email}...`;

				const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
				const newTeacherUid = userCredential.user.uid;

				const newTeacherData = {
					displayName: name,
					email: email,
					role: "profesor",
					createdAt: new Date().toISOString()
				};

				await setDoc(doc(db, "usuarios", newTeacherUid), newTeacherData);

				setUsers([...getUsers(), { uid: newTeacherUid, ...newTeacherData }]);

				adminSaveStatus.textContent = `¡Profesor ${email} creado exitosamente!`;
				createTeacherForm.reset();

			} catch (error) {
				console.error("Error al crear profesor:", error);
				if (error.code === "auth/email-already-in-use") {
					adminSaveStatus.textContent = "Error: Este correo ya está registrado.";
				} else {
					adminSaveStatus.textContent = `Error: ${error.message}`;
				}
			}
		});
	}

	// Buscador
	if (userSearchInput) {
		userSearchInput.addEventListener("input", () => {
			renderUserTable(getUsers());
		});
	}

	// --------------------------------------------------------------------------
	// CERRAR SESIÓN (LOGOUT)
	// --------------------------------------------------------------------------
	const logoutBtn = document.querySelector("#logout-button");
	if (logoutBtn) {
		logoutBtn.addEventListener("click", async () => {
			try {
				adminSaveStatus.textContent = "Cerrando sesión...";
				logoutBtn.disabled = true;

				// 1. Cerrar sesión en el Auth principal
				await signOut(auth);

				// 2. Cerrar sesión en el Auth secundario si existía
				if (secondaryAuth) {
					await signOut(secondaryAuth).catch(() => {});
				}

				// 3. Redirección dinámica según la ubicación actual
				const isDeepFolder = window.location.pathname.includes("/Vista/");
				window.location.href = isDeepFolder ? "../../login.html" : "login.html";

			} catch (error) {
				console.error("Error al cerrar sesión:", error);
				adminSaveStatus.textContent = "Error al cerrar sesión. Intenta nuevamente.";
				logoutBtn.disabled = false;
			}
		});
	}
})();