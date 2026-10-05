import { auth, db } from "../../firebase-config.js";
import {
	addDoc,
	collection,
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

window.VideotecaStoreReady = (async () => {
	const assignmentId = new URLSearchParams(window.location.search).get("asignatura") || "asignatura-1";
	const storageKey = `videoteca-profesor-edits-v1-${assignmentId}`;
	const legacyStorageKey = "videoteca-profesor-edits-v1";
	const assignmentsKey = "videoteca-profesor-assignments-v1";
	const demoMode = localStorage.getItem("videotecaDemoRole") === "profesor";
	const defaults = {
		course: {
			title: "Asignatura 1",
			description: "Recursos y contenidos disponibles para esta asignatura.",
			coverUrl: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1600&q=80",
			units: [{ id: "unidad-principal", name: "Unidad principal" }]
		},
		resources: {
			introduccion: {
				title: "Introducción a la asignatura",
				unit: "Unidad 1",
				duration: "12 min",
				description: "Presentación de los objetivos, contenidos y organización de la asignatura.",
				thumbnailUrl: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=900&q=80",
				videoUrl: "../../video%20de%20prueba.mp4",
				popups: [],
				materials: [
					{ title: "Guía de estudio", format: "PDF", description: "Orientaciones y contenidos principales de la asignatura.", url: "../../prueba.pdf" },
					{ title: "Material complementario", format: "PDF", description: "Lecturas sugeridas para profundizar los temas de la unidad.", url: "../../prueba.pdf" }
				]
			},
			"controles-prenatales": {
				title: "Controles prenatales",
				unit: "Unidad 1",
				duration: "18 min",
				description: "Revisión de los controles prenatales y su importancia en el seguimiento del embarazo.",
				thumbnailUrl: "https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=900&q=80",
				videoUrl: "../../video%20de%20prueba.mp4",
				popups: [],
				materials: [
					{ title: "Material complementario", format: "PDF", description: "Apuntes y contenidos de apoyo para revisar junto con el video.", url: "../../prueba.pdf" }
				]
			},
			"trabajo-de-parto": {
				title: "Signos y etapas del trabajo de parto",
				unit: "Unidad 2",
				duration: "24 min",
				description: "Descripción de las señales de inicio y las etapas del trabajo de parto.",
				thumbnailUrl: "https://images.unsplash.com/photo-1538108149393-fbbd81895907?auto=format&fit=crop&w=900&q=80",
				videoUrl: "../../video%20de%20prueba.mp4",
				popups: [],
				materials: [
					{ title: "Información de apoyo", format: "Lectura", description: "Señales de inicio y etapas del trabajo de parto.", url: "../../prueba.pdf" }
				]
			}
		},
		comments: {
			course: [
				{ id: "course-comment-maria", author: "María P.", initials: "MP", date: "Hace 2 horas", text: "¿La guía de estudio incluye los puntos clave del primer video?" },
				{ id: "course-comment-javier", author: "Javier R.", initials: "JR", date: "Ayer", text: "El material complementario me ayudó a repasar la unidad." }
			],
			introduccion: [
				{ id: "intro-comment-maria", author: "María P.", initials: "MP", date: "Hace 2 horas", text: "¿Podrías explicar un poco más este punto en la próxima clase?" },
				{ id: "intro-comment-javier", author: "Javier R.", initials: "JR", date: "Ayer", text: "Gracias, el material de apoyo me ayudó a entender mejor el tema." }
			],
			"controles-prenatales": [
				{ id: "prenatal-comment-maria", author: "María P.", initials: "MP", date: "Hace 2 horas", text: "¿Podrías explicar un poco más este punto en la próxima clase?" },
				{ id: "prenatal-comment-javier", author: "Javier R.", initials: "JR", date: "Ayer", text: "Gracias, el material de apoyo me ayudó a entender mejor el tema." }
			],
			"trabajo-de-parto": [
				{ id: "labor-comment-maria", author: "MP", initials: "MP", date: "Hace 2 horas", text: "¿Podrías explicar un poco más este punto en la próxima clase?" },
				{ id: "labor-comment-javier", author: "Javier R.", initials: "JR", date: "Ayer", text: "Gracias, el material de apoyo me ayudó a entender mejor el tema." }
			]
		}
	};
	const initialResources = assignmentId === "asignatura-1" ? defaults.resources : {};
	const initialComments = assignmentId === "asignatura-1" ? defaults.comments : { course: [] };

	function normalizeData(nextData) {
		const savedUnits = Array.isArray(nextData.course.units) ? nextData.course.units : [];
		const primary = savedUnits.find((unit) => unit.id === "unidad-principal") || { id: "unidad-principal", name: "Unidad principal" };
		const units = [primary, ...savedUnits.filter((unit) => unit.id !== primary.id && unit.id && unit.name)];
		const unitsByName = new Map(units.map((unit) => [unit.name.trim().toLocaleLowerCase(), unit]));
		const resources = Object.fromEntries(Object.entries(nextData.resources).map(([id, resource]) => {
			const assignedUnit = units.find((unit) => unit.id === resource.unitId)
				|| unitsByName.get(String(resource.unit || "").trim().toLocaleLowerCase())
				|| primary;
			return [id, { ...resource, unitId: assignedUnit.id, unit: assignedUnit.name }];
		}));
		return { ...nextData, course: { ...nextData.course, units }, resources };
	}

	function readLocal() {
		let saved = {};
		try {
			saved = JSON.parse(localStorage.getItem(storageKey) || (assignmentId === "asignatura-1" ? localStorage.getItem(legacyStorageKey) : null) || "{}");
		} catch {
			saved = {};
		}

		const deletedResources = new Set(saved.deletedResources || []);
		const resources = {};
		const previousSampleVideo = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
		Object.entries(initialResources).forEach(([id, resource]) => {
			if (deletedResources.has(id)) return;
			const savedResource = saved.resources?.[id] || {};
			const mergedResource = { ...resource, ...savedResource };
			mergedResource.materials = (mergedResource.materials || []).map((material, index) => ({
				...material,
				id: material.id || `${id}-document-${index + 1}`
			}));
			mergedResource.popups = Array.isArray(mergedResource.popups) ? mergedResource.popups : [];
			resources[id] = mergedResource;
			if (savedResource.videoUrl === previousSampleVideo && !savedResource.videoBlobId) {
				resources[id].videoUrl = resource.videoUrl;
			}
		});
		Object.entries(saved.resources || {}).forEach(([id, resource]) => {
			if (initialResources[id] || deletedResources.has(id)) return;
			resources[id] = {
				...resource,
				materials: (resource.materials || []).map((material, index) => ({
					...material,
					id: material.id || `${id}-document-${index + 1}`
				})),
				popups: Array.isArray(resource.popups) ? resource.popups : []
			};
		});

		return normalizeData({
			course: { ...defaults.course, ...(saved.course || {}) },
			resources,
			comments: { ...initialComments, ...(saved.comments || {}) },
			deletedResources: [...deletedResources]
		});
	}

	const assignmentRef = doc(db, "asignaturas", assignmentId);
	let data = readLocal();
	let cloudReady = false;
	let persistQueue = Promise.resolve();

	function readLocalAssignments() {
		try {
			return JSON.parse(localStorage.getItem(assignmentsKey) || "[]")
				.filter((item) => item.id !== "asignatura-1" || item.title !== "Asignatura 1");
		} catch {
			return [];
		}
	}

	function writeLocalAssignments(assignments) {
		localStorage.setItem(assignmentsKey, JSON.stringify(assignments));
	}

	async function deleteLocalAssignmentVideos(id, resources) {
		if (!window.indexedDB) return;
		const database = await new Promise((resolve, reject) => {
			const request = indexedDB.open("videoteca-profesor-media-v1", 1);
			request.onupgradeneeded = () => request.result.createObjectStore("videos");
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		if (!database.objectStoreNames.contains("videos")) {
			database.close();
			return;
		}
		await new Promise((resolve, reject) => {
			const transaction = database.transaction("videos", "readwrite");
			const videos = transaction.objectStore("videos");
			const keysRequest = videos.getAllKeys();
			const legacyVideoIds = new Set(Object.entries(resources).flatMap(([resourceId, resource]) => [resourceId, resource.videoBlobId].filter(Boolean)));
			keysRequest.onsuccess = () => keysRequest.result.forEach((key) => {
				if (String(key).startsWith(`${id}-`) || legacyVideoIds.has(String(key))) videos.delete(key);
			});
			keysRequest.onerror = () => reject(keysRequest.error);
			transaction.oncomplete = resolve;
			transaction.onerror = () => reject(transaction.error);
		});
		database.close();
	}

	function notifySync(type, error = null) {
		if (type === "error") {
			document.querySelectorAll("#course-save-status, #resource-save-status, #assignment-status").forEach((status) => {
				status.textContent = "Firebase no está disponible o no autorizó el cambio; revisa la conexión, el acceso y las reglas.";
			});
		}
		window.dispatchEvent(new CustomEvent(`videoteca:${type}`, { detail: error }));
	}

	async function persist(snapshot) {
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
		localStorage.setItem(storageKey, JSON.stringify(data));
		if (!cloudReady) return;
		const snapshot = JSON.parse(JSON.stringify(data));
		persistQueue = persistQueue.then(() => persist(snapshot)).then(() => notifySync("saved"))
			.catch((error) => notifySync("error", error));
	}

	async function initialize() {
		try {
			if (demoMode) {
				if (window.location.pathname.endsWith("/main.html")) {
					data = { course: defaults.course, resources: {}, comments: { course: [] }, deletedResources: [] };
					return;
				}
				const assignment = readLocalAssignments().find((item) => item.id === assignmentId);
				if (!assignment) {
					window.location.href = "main.html";
					return;
				}
				if (assignmentId !== "asignatura-1" && !localStorage.getItem(storageKey)) {
					data = { course: { ...defaults.course, title: assignment.title }, resources: {}, comments: { course: [] }, deletedResources: [] };
				} else {
					data.course = { ...data.course, title: assignment.title };
				}
				localStorage.setItem(storageKey, JSON.stringify(data));
				return;
			}
			await auth.authStateReady();
			if (!auth.currentUser) {
				window.location.href = "../../login.html";
				return;
			}
			const assignmentSnapshot = await getDoc(assignmentRef);
			if (assignmentSnapshot.exists()) {
				const saved = assignmentSnapshot.data();
				const resourcesSnapshot = await getDocs(collection(assignmentRef, "recursos"));
				data = {
					course: { ...defaults.course, ...(saved.course || {}) },
					resources: Object.fromEntries(resourcesSnapshot.docs.map((item) => [item.id, item.data()])),
					comments: { ...initialComments, ...(saved.comments || {}) },
					deletedResources: []
				};
				data = normalizeData(data);
			} else if (assignmentId !== "asignatura-1") {
				data = {
					course: { ...defaults.course, title: "Nueva asignatura" },
					resources: {}, comments: { course: [] }, deletedResources: []
				};
				await setDoc(assignmentRef, { course: data.course, comments: data.comments, ownerUid: auth.currentUser.uid, createdAt: serverTimestamp() });
			} else {
				await setDoc(assignmentRef, { course: data.course, comments: data.comments, ownerUid: auth.currentUser.uid, createdAt: serverTimestamp() });
				const batch = writeBatch(db);
				const resourcesRef = collection(assignmentRef, "recursos");
				Object.entries(data.resources).forEach(([id, resource]) => batch.set(doc(resourcesRef, id), resource));
				await batch.commit();
			}
			cloudReady = true;
			localStorage.setItem(storageKey, JSON.stringify(data));
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
		refreshAssignmentNavigation: () => renderAssignmentNavigation(),
		getCloudStatus: () => cloudReady,
		isDemoMode: () => demoMode,
		flush: () => persistQueue,
		async getAssignments() {
			if (demoMode) return readLocalAssignments();
			if (!cloudReady) return [{ id: assignmentId, ...data.course }];
			try {
				const assignments = await getDocs(query(collection(db, "asignaturas"), where("ownerUid", "==", auth.currentUser.uid)));
				return assignments.docs.map((item) => ({ id: item.id, ...(item.data().course || {}) }));
			} catch (error) {
				notifySync("error", error);
				return [{ id: assignmentId, ...data.course }];
			}
		},
		getAssignmentResourceCount(id) {
			if (!demoMode) return 0;
			try {
				const saved = JSON.parse(localStorage.getItem(`videoteca-profesor-edits-v1-${id}`) || "{}");
				return Object.keys(saved.resources || {}).length;
			} catch {
				return 0;
			}
		},
		async deleteAssignment(id) {
			if (!demoMode) throw new Error("La eliminación de asignaturas solo está disponible en el modo demo local.");
			const assignments = readLocalAssignments();
			const assignment = assignments.find((item) => item.id === id);
			if (!assignment) return false;
			let saved = {};
			try {
				saved = JSON.parse(localStorage.getItem(`videoteca-profesor-edits-v1-${id}`) || "{}");
			} catch {
				saved = {};
			}
			await deleteLocalAssignmentVideos(id, saved.resources || {});
			writeLocalAssignments(assignments.filter((item) => item.id !== id));
			localStorage.removeItem(`videoteca-profesor-edits-v1-${id}`);
			return true;
		},
		async createAssignment(title) {
			if (demoMode) {
				const id = `asignatura-${Date.now().toString(36)}`;
				writeLocalAssignments([...readLocalAssignments(), { id, title }]);
				return id;
			}
			if (!cloudReady) throw new Error("Firebase no está disponible. Revisa la conexión y las reglas de Firestore.");
			const course = { ...defaults.course, title, units: [{ id: "unidad-principal", name: "Unidad principal" }] };
			const created = await addDoc(collection(db, "asignaturas"), { course, comments: { course: [] }, ownerUid: auth.currentUser.uid, createdAt: serverTimestamp() });
			return created.id;
		},
		async renameAssignment(id, title) {
			if (demoMode) {
				writeLocalAssignments(readLocalAssignments().map((item) => item.id === id ? { ...item, title } : item));
				if (id === assignmentId) {
					data.course = { ...data.course, title };
					localStorage.setItem(storageKey, JSON.stringify(data));
				}
				return;
			}
			if (!cloudReady) throw new Error("Firebase no está disponible. Revisa la conexión y las reglas de Firestore.");
			const target = doc(db, "asignaturas", id);
			const saved = await getDoc(target);
			if (!saved.exists()) throw new Error("La asignatura ya no existe.");
			await updateDoc(target, { "course.title": title, updatedAt: serverTimestamp() });
			if (id === assignmentId) {
				data.course = { ...data.course, title };
				localStorage.setItem(storageKey, JSON.stringify(data));
			}
		},
		saveCourse(updates) {
			data.course = { ...data.course, ...updates };
			write(data);
			return data;
		},
		createUnit(name) {
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
			const resource = data.resources[resourceId];
			const unit = data.course.units.find((item) => item.id === unitId);
			if (!resource || !unit) return false;
			resource.unitId = unit.id;
			resource.unit = unit.name;
			write(data);
			return true;
		},
		saveResource(id, updates) {
			if (!data.resources[id]) return null;
			data.resources[id] = { ...data.resources[id], ...updates };
			write(data);
			return data;
		},
		createResource(resource) {
			const id = `recurso-${Date.now().toString(36)}`;
			const assignedUnit = data.course.units.find((unit) => unit.id === resource.unitId) || data.course.units[0];
			data.resources[id] = { ...resource, unitId: assignedUnit.id, unit: assignedUnit.name, isHidden: false };
			write(data);
			return id;
		},
		setResourceHidden(id, isHidden) {
			if (!data.resources[id]) return false;
			data.resources[id].isHidden = isHidden;
			write(data);
			return true;
		},
		deleteResource(id) {
			if (!data.resources[id]) return false;
			delete data.resources[id];
			data.deletedResources = [...new Set([...data.deletedResources, id])];
			write(data);
			return true;
		},
		addComment(scope, comment) {
			const newComment = { ...comment, id: `comentario-${Date.now().toString(36)}` };
			data.comments[scope] = [...(data.comments[scope] || []), newComment];
			write(data);
			return newComment;
		},
		deleteComment(scope, id) {
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
	document.querySelectorAll("#demo-logout").forEach((button) => {
		button.addEventListener("click", () => {
			localStorage.removeItem("videotecaDemoRole");
			localStorage.removeItem("videotecaDemoEmail");
			localStorage.removeItem("sesionIniciada");
			window.location.href = "../../login.html";
		});
	});
})();