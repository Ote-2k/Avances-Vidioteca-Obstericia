import { auth, db, storage } from "../../firebase-config.js";
import { signOut } from "firebase/auth";
import { deleteObject, ref } from "firebase/storage";
import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	serverTimestamp,
	setDoc,
	query,
	updateDoc,
	where,
	writeBatch
} from "firebase/firestore";

// Capa compartida de datos: inicializa rol/asignatura y expone operaciones para las vistas.
window.VideotecaStoreReady = (async () => {
	const assignmentId = new URLSearchParams(window.location.search).get("asignatura") || "asignatura-1";
	const defaults = {
		course: {
			title: "Asignatura 1",
			description: "Recursos y contenidos disponibles para esta asignatura.",
			coverUrl: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1600&q=80",
			units: [{ id: "unidad-principal", name: "Unidad principal" }]
		}
	};
	const initialResources = {};
	const initialComments = { course: [] };

	function normalizeData(nextData) {
		const savedUnits = Array.isArray(nextData.course.units) ? nextData.course.units : [];
		const primary = savedUnits.find((unit) => unit.id === "unidad-principal") || { id: "unidad-principal", name: "Unidad principal" };
		const units = [primary, ...savedUnits.filter((unit) => unit.id !== primary.id && unit.id && unit.name)];
		const unitsByName = new Map(units.map((unit) => [unit.name.trim().toLocaleLowerCase(), unit]));
		const resources = Object.fromEntries(Object.entries(nextData.resources).map(([id, resource]) => {
			const assignedUnit = units.find((unit) => unit.id === resource.unitId)
				|| unitsByName.get(String(resource.unit || "").trim().toLocaleLowerCase())
				|| primary;
			return [id, { ...resource, isHidden: resource.isHidden === true, unitId: assignedUnit.id, unit: assignedUnit.name }];
		}));
		return { ...nextData, course: { ...nextData.course, units }, resources };
	}

	function initialData() {
		const deletedResources = new Set();
		const resources = {};
		Object.entries(initialResources).forEach(([id, resource]) => {
			const mergedResource = { ...resource };
			mergedResource.materials = (mergedResource.materials || []).map((material, index) => ({
				...material,
				id: material.id || `${id}-document-${index + 1}`
			}));
			mergedResource.popups = Array.isArray(mergedResource.popups) ? mergedResource.popups : [];
			resources[id] = mergedResource;
		});

		return normalizeData({
			course: defaults.course,
			resources,
			comments: initialComments,
			deletedResources: [...deletedResources]
		});
	}

	const assignmentRef = doc(db, "asignaturas", assignmentId);
	let data = initialData();
	let cloudReady = false;
	let currentRole = "";
	let lastPersistError = null;
	let persistQueue = Promise.resolve();

	function notifySync(type, error = null) {
		if (type === "error") {
			document.querySelectorAll("#course-save-status, #resource-save-status, #assignment-status").forEach((status) => {
				status.textContent = "Firebase no está disponible o no autorizó el cambio; revisa la conexión, el acceso y las reglas.";
			});
		}
		window.dispatchEvent(new CustomEvent(`videoteca:${type}`, { detail: error }));
	}

	async function persist(snapshot) {
		// Curso/comentarios viven en el documento padre; cada recurso es un documento hijo.
		if (currentRole === "alumno") {
			await updateDoc(assignmentRef, { comments: snapshot.comments, updatedAt: serverTimestamp() });
			return;
		}
		await setDoc(assignmentRef, { course: snapshot.course, comments: snapshot.comments, ownerUid: auth.currentUser.uid, updatedAt: serverTimestamp() }, { merge: true });
		const resourcesRef = collection(assignmentRef, "recursos");
		const storedResources = await getDocs(resourcesRef);
		const batch = writeBatch(db);
		const resourceIds = new Set(Object.keys(snapshot.resources));
		storedResources.forEach((stored) => {
			if (!resourceIds.has(stored.id)) batch.delete(stored.ref);
		});
		Object.entries(snapshot.resources).forEach(([id, resource]) => {
			batch.set(doc(resourcesRef, id), resource);
		});
		await batch.commit();
	}

	function write(nextData) {
		data = nextData;
		if (!cloudReady) return;
		const snapshot = JSON.parse(JSON.stringify(data));
		// Serializar snapshots evita que dos cambios compitan al escribir lotes Firestore.
		persistQueue = persistQueue.then(() => persist(snapshot)).then(() => {
			lastPersistError = null;
			notifySync("saved");
		}).catch((error) => {
			lastPersistError = error;
			notifySync("error", error);
		});
	}

	async function deleteAssignmentLocalVideos(id) {
		const database = await new Promise((resolve, reject) => {
			const request = indexedDB.open("videoteca-local-videos", 1);
			request.onupgradeneeded = () => {
				if (!request.result.objectStoreNames.contains("videos")) request.result.createObjectStore("videos");
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error || new Error("No se pudo abrir IndexedDB."));
		});
		await new Promise((resolve, reject) => {
			const transaction = database.transaction("videos", "readwrite");
			const videos = transaction.objectStore("videos");
			const request = videos.getAllKeys();
			request.onsuccess = () => request.result.forEach((key) => {
				if (typeof key === "string" && key.startsWith(`${id}/`)) videos.delete(key);
			});
			transaction.oncomplete = resolve;
			transaction.onerror = () => reject(transaction.error || new Error("No se pudieron eliminar los videos locales."));
			transaction.onabort = () => reject(transaction.error || new Error("Se canceló la limpieza de videos locales."));
		});
		database.close();
	}

	function requireTeacher() {
		if (currentRole !== "profesor") throw new Error("Solo un profesor puede editar el contenido.");
	}

	async function initialize() {
		try {
			// El rol se lee del perfil Firestore; las reglas lo validan de nuevo en el servidor.
			await auth.authStateReady();
			if (!auth.currentUser) {
				window.location.href = "../../login.html";
				return;
			}
			const profile = await getDoc(doc(db, "usuarios", auth.currentUser.uid));
			currentRole = profile.exists() ? profile.data().role : "";
			if (! ["profesor", "alumno"].includes(currentRole)) {
				await signOut(auth);
				window.location.href = "../../login.html";
				return;
			}
			const isDashboard = window.location.pathname.endsWith("/main.html");
			const isStudentHome = window.location.pathname.endsWith("/index.html");
			if (isDashboard) {
				if (currentRole !== "profesor") {
					window.location.replace("../../index.html");
					return;
				}
				data = { course: defaults.course, resources: {}, comments: { course: [] }, deletedResources: [] };
				cloudReady = currentRole === "profesor";
				return;
			}
			if (isStudentHome) {
				if (currentRole !== "alumno") window.location.href = "Vista/Profesor/main.html";
				data = { course: defaults.course, resources: {}, comments: { course: [] }, deletedResources: [] };
				cloudReady = currentRole === "alumno";
				return;
			}
			const assignmentSnapshot = await getDoc(assignmentRef);
			if (assignmentSnapshot.exists()) {
				const saved = assignmentSnapshot.data();
				if (currentRole === "alumno" && !saved.published) {
					window.location.href = "../../index.html";
					return;
				}
				const resourcesRef = collection(assignmentRef, "recursos");
				const resourcesQuery = currentRole === "alumno"
					? query(resourcesRef, where("isHidden", "==", false))
					: resourcesRef;
				const resourcesSnapshot = await getDocs(resourcesQuery);
				data = {
					course: { ...defaults.course, ...(saved.course || {}) },
					resources: Object.fromEntries(resourcesSnapshot.docs.map((item) => [item.id, item.data()])),
					comments: { ...initialComments, ...(saved.comments || {}) },
					deletedResources: []
				};
				data = normalizeData(data);
				if (currentRole === "profesor") {
					const migration = writeBatch(db);
					let hasMigration = false;
					if (saved.published === undefined) {
						migration.update(assignmentRef, { published: true });
						hasMigration = true;
					}
					if (!Array.isArray(saved.course?.units)) {
						migration.update(assignmentRef, { "course.units": data.course.units });
						hasMigration = true;
					}
					resourcesSnapshot.docs.forEach((item) => {
						const resource = item.data();
						if (resource.isHidden === undefined || resource.unitId === undefined) {
						migration.set(item.ref, data.resources[item.id], { merge: true });
							hasMigration = true;
						}
					});
					if (hasMigration) await migration.commit();
				}
			} else if (currentRole === "profesor" && assignmentId === "asignatura-1") {
				data = initialData();
				await setDoc(assignmentRef, {
					course: data.course,
					comments: data.comments,
					ownerUid: auth.currentUser.uid,
					published: true,
					createdAt: serverTimestamp()
				});
				const batch = writeBatch(db);
				const resourcesRef = collection(assignmentRef, "recursos");
				Object.entries(data.resources).forEach(([id, resource]) => batch.set(doc(resourcesRef, id), resource));
				await batch.commit();
			} else {
				if (currentRole === "alumno") window.location.href = "../../index.html";
				else {
					data = { course: { ...defaults.course, title: "Nueva asignatura" }, resources: {}, comments: { course: [] }, deletedResources: [] };
					await setDoc(assignmentRef, {
						course: data.course,
						comments: data.comments,
						ownerUid: auth.currentUser.uid,
						published: true,
						createdAt: serverTimestamp()
					});
				}
				return;
			}
			cloudReady = true;
		} catch (error) {
			console.error("No se pudo cargar la asignatura desde Firebase.", error);
			notifySync("error", error);
		}
	}

	await initialize();

	window.VideotecaStore = {
		get: () => data,
		getAssignmentId: () => assignmentId,
		getUnits: () => data.course.units,
		getRole: () => currentRole,
		isTeacher: () => currentRole === "profesor",
		refreshAssignmentNavigation: () => renderAssignmentNavigation(),
		getCloudStatus: () => cloudReady,
		async flush() {
			await persistQueue;
			if (lastPersistError) throw lastPersistError;
		},
		async getAssignments() {
			if (!cloudReady) return [];
			try {
				// Los filtros coinciden con los permisos de consulta de firestore.rules.
				const assignmentsQuery = currentRole === "alumno"
					? query(collection(db, "asignaturas"), where("published", "==", true))
					: query(collection(db, "asignaturas"), where("ownerUid", "==", auth.currentUser.uid));
				const assignments = await getDocs(assignmentsQuery);
				return assignments.docs.map((item) => ({ id: item.id, ...(item.data().course || {}) }));
			} catch (error) {
				notifySync("error", error);
				return [];
			}
		},
		async getStudentAssignment(id) {
			if (currentRole !== "alumno") throw new Error("Solo los alumnos pueden consultar esta vista.");
			const target = doc(db, "asignaturas", id);
			const snapshot = await getDoc(target);
			if (!snapshot.exists() || snapshot.data().published !== true) return null;
			const resourcesSnapshot = await getDocs(query(collection(target, "recursos"), where("isHidden", "==", false)));
			const saved = snapshot.data();
			return normalizeData({
				course: { ...defaults.course, ...(saved.course || {}) },
				resources: Object.fromEntries(resourcesSnapshot.docs.map((item) => [item.id, item.data()])),
				comments: { ...initialComments, ...(saved.comments || {}) },
				deletedResources: []
			});
		},
		async createAssignment(title) {
			if (currentRole !== "profesor") throw new Error("Solo un profesor puede crear asignaturas.");
			if (!cloudReady) throw new Error("Firebase no está disponible. Revisa la conexión y las reglas.");
			const course = { ...defaults.course, title, units: [{ id: "unidad-principal", name: "Unidad principal" }] };
			const created = await addDoc(collection(db, "asignaturas"), {
				course,
				comments: { course: [] },
				ownerUid: auth.currentUser.uid,
				published: true,
				createdAt: serverTimestamp()
			});
			return created.id;
		},
		async renameAssignment(id, title) {
			if (currentRole !== "profesor") throw new Error("Solo un profesor puede renombrar asignaturas.");
			if (!cloudReady) throw new Error("Firebase no está disponible. Revisa la conexión y las reglas.");
			const target = doc(db, "asignaturas", id);
			const saved = await getDoc(target);
			if (!saved.exists()) throw new Error("La asignatura ya no existe.");
			await updateDoc(target, { "course.title": title, updatedAt: serverTimestamp() });
			if (id === assignmentId) data.course = { ...data.course, title };
		},
		async deleteAssignment(id) {
			if (currentRole !== "profesor") throw new Error("Solo un profesor puede eliminar asignaturas.");
			if (!cloudReady) throw new Error("Firebase no está disponible. Revisa la conexión y las reglas.");
			const target = doc(db, "asignaturas", id);
			const saved = await getDoc(target);
			if (!saved.exists()) return false;
			const resources = await getDocs(collection(target, "recursos"));
			const resourceDocs = resources.docs;
			const storagePaths = resourceDocs.map((resource) => resource.data().videoStoragePath).filter(Boolean);
			await Promise.all(storagePaths.map((path) => deleteObject(ref(storage, path)).catch((error) => {
				console.warn("No se pudo eliminar un video antiguo de Storage.", error);
			})));
			for (let offset = 0; offset < resourceDocs.length; offset += 450) {
				const batch = writeBatch(db);
				resourceDocs.slice(offset, offset + 450).forEach((resource) => batch.delete(resource.ref));
				await batch.commit();
			}
			await deleteDoc(target);
			await deleteAssignmentLocalVideos(id).catch((error) => {
				console.warn("No se pudieron limpiar los videos locales de la asignatura.", error);
			});
			return true;
		},
		saveCourse(updates) {
			requireTeacher();
			data.course = { ...data.course, ...updates };
			write(data);
			return data;
		},
		createUnit(name) {
			requireTeacher();
			const normalizedName = name.trim().toLocaleLowerCase();
			if (data.course.units.some((unit) => unit.name.trim().toLocaleLowerCase() === normalizedName)) {
				throw new Error("Ya existe una unidad con ese nombre.");
			}
			const unit = { id: `unidad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: name.trim() };
			data.course.units = [...data.course.units, unit];
			write(data);
			return unit;
		},
		renameUnit(id, name) {
			requireTeacher();
			if (id === "unidad-principal") throw new Error("La Unidad principal no se puede renombrar.");
			const normalizedName = name.trim().toLocaleLowerCase();
			if (data.course.units.some((unit) => unit.id !== id && unit.name.trim().toLocaleLowerCase() === normalizedName)) {
				throw new Error("Ya existe una unidad con ese nombre.");
			}
			const unit = data.course.units.find((item) => item.id === id);
			if (!unit) return false;
			unit.name = name.trim();
			Object.values(data.resources).forEach((resource) => {
				if (resource.unitId === id) resource.unit = unit.name;
			});
			write(data);
			return true;
		},
		deleteUnit(id) {
			requireTeacher();
			if (id === "unidad-principal") return false;
			const unit = data.course.units.find((item) => item.id === id);
			if (!unit) return false;
			const primary = data.course.units.find((item) => item.id === "unidad-principal");
			Object.values(data.resources).forEach((resource) => {
				if (resource.unitId === id) {
					resource.unitId = primary.id;
					resource.unit = primary.name;
				}
			});
			data.course.units = data.course.units.filter((item) => item.id !== id);
			write(data);
			return true;
		},
		moveResourceToUnit(resourceId, unitId) {
			requireTeacher();
			const resource = data.resources[resourceId];
			const unit = data.course.units.find((item) => item.id === unitId);
			if (!resource || !unit) return false;
			resource.unitId = unit.id;
			resource.unit = unit.name;
			write(data);
			return true;
		},
		saveResource(id, updates) {
			requireTeacher();
			if (!data.resources[id]) return null;
			data.resources[id] = { ...data.resources[id], ...updates };
			write(data);
			return data;
		},
		createResource(resource) {
			requireTeacher();
			const id = `recurso-${Date.now().toString(36)}`;
			const assignedUnit = data.course.units.find((unit) => unit.id === resource.unitId) || data.course.units[0];
			data.resources[id] = { ...resource, unitId: assignedUnit.id, unit: assignedUnit.name, isHidden: false };
			write(data);
			return id;
		},
		setResourceHidden(id, isHidden) {
			requireTeacher();
			if (!data.resources[id]) return false;
			data.resources[id].isHidden = isHidden;
			write(data);
			return true;
		},
		deleteResource(id) {
			requireTeacher();
			if (!data.resources[id]) return false;
			delete data.resources[id];
			data.deletedResources = [...new Set([...data.deletedResources, id])];
			write(data);
			return true;
		},
		addComment(scope, comment) {
			const newComment = { ...comment, authorUid: auth.currentUser.uid, id: `comentario-${Date.now().toString(36)}` };
			data.comments[scope] = [...(data.comments[scope] || []), newComment];
			write(data);
			return newComment;
		},
		deleteComment(scope, id) {
			requireTeacher();
			if (!data.comments[scope]) return false;
			const removedIds = new Set([id]);
			let foundReply;
			do {
				foundReply = false;
				data.comments[scope].forEach((comment) => {
					if (removedIds.has(comment.parentId) && !removedIds.has(comment.id)) {
						removedIds.add(comment.id);
						foundReply = true;
					}
				});
			} while (foundReply);
			data.comments[scope] = data.comments[scope].filter((comment) => !removedIds.has(comment.id));
			write(data);
			return true;
		}
	};

	async function renderAssignmentNavigation() {
		const assignments = await window.VideotecaStore.getAssignments();
		document.querySelectorAll(".course-list").forEach((list) => {
			list.replaceChildren();
			assignments.forEach((assignment) => {
				const item = document.createElement("li");
				const link = document.createElement("a");
				link.href = `asignatura-1.html?asignatura=${encodeURIComponent(assignment.id)}`;
				link.textContent = assignment.title || "Asignatura sin nombre";
				if (assignment.id === assignmentId && !window.location.pathname.endsWith("main.html")) {
					item.setAttribute("aria-current", "page");
				}
				item.append(link);
				list.append(item);
			});
		});
	}

	await renderAssignmentNavigation();
	document.querySelectorAll("#logout-button").forEach((button) => {
		button.addEventListener("click", async () => {
			await signOut(auth);
			window.location.href = "../../login.html";
		});
	});
})();