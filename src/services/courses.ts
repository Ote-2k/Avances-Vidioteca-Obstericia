/**
 * Servicios de dominio para asignaturas, recursos y comentarios.
 *
 * Este módulo actúa como capa de acceso a Firestore y encapsula la lógica de
 * lectura/escritura del contenido educativo: cursos, estudiantes, material y
 * comentarios de cada recurso.
 */
import {
	addDoc,
	arrayUnion,
	collection,
	deleteDoc,
	deleteField,
	doc,
	getDoc,
	getDocs,
	query,
	serverTimestamp,
	updateDoc,
	where,
	writeBatch
} from "firebase/firestore";
import { db } from "../firebase";
import type { CourseComment, CourseSummary, CourseUnit, ResourceSummary, UserRole } from "../types";

export interface CourseView extends CourseSummary {
	units: CourseUnit[];
	comments: CourseComment[];
	resources: ResourceSummary[];
}

const assignments = collection(db, "asignaturas");

/**
 * Normaliza un documento de recurso de Firestore al tipo del dominio de la app.
 */
function normalizeResource(id: string, data: Record<string, unknown>): ResourceSummary {
	return {
		id,
		title: String(data.title || "Recurso sin título"),
		description: String(data.description || ""),
		thumbnailUrl: String(data.thumbnailUrl || ""),
		duration: String(data.duration || ""),
		unitId: String(data.unitId || "unidad-principal"),
		unit: String(data.unit || "Unidad principal"),
		isHidden: data.isHidden === true,
		isDraft: data.isDraft === true,
		videoUrl: typeof data.videoUrl === "string" ? data.videoUrl : undefined,
		videoLocalKey: typeof data.videoLocalKey === "string" ? data.videoLocalKey : undefined,
		trimStart: typeof data.trimStart === "number" ? data.trimStart : 0,
		trimEnd: typeof data.trimEnd === "number" ? data.trimEnd : null,
		materials: Array.isArray(data.materials) ? data.materials as ResourceSummary["materials"] : [],
		popups: Array.isArray(data.popups) ? data.popups as ResourceSummary["popups"] : []
	};
}

/**
 * Devuelve las asignaturas del profesor o todas las asignaturas para alumnos.
 */
export async function listAssignments(role: UserRole, uid: string): Promise<CourseSummary[]> {
	const assignmentsQuery = role === "profesor"
		? query(assignments, where("ownerUid", "==", uid))
		: assignments;
	const snapshot = await getDocs(assignmentsQuery);
	return snapshot.docs.map((item) => {
		const data = item.data();
		return {
			id: item.id,
			title: String(data.course?.title || "Asignatura sin nombre"),
			description: String(data.course?.description || ""),
			coverUrl: String(data.course?.coverUrl || ""),
			coverLocalKey: typeof data.course?.coverLocalKey === "string" ? data.course.coverLocalKey : undefined,
			ownerUid: data.ownerUid,
			published: data.published === true
		};
	});
}

/**
 * Carga una asignatura completa con sus recursos, unidades y comentarios.
 */
export async function getCourse(assignmentId: string, role: UserRole): Promise<CourseView | null> {
	const assignmentRef = doc(db, "asignaturas", assignmentId);
	const snapshot = await getDoc(assignmentRef);
	if (!snapshot.exists()) return null;
	const saved = snapshot.data();
	const resourceCollection = collection(assignmentRef, "recursos");
	const resourceSnapshot = await getDocs(role === "alumno"
		? query(resourceCollection, where("isHidden", "==", false), where("isDraft", "==", false))
		: resourceCollection);
	const units = Array.isArray(saved.course?.units) ? saved.course.units as CourseUnit[] : [{ id: "unidad-principal", name: "Unidad principal" }];
	const resources = resourceSnapshot.docs
		.map((item) => normalizeResource(item.id, item.data()))
		.filter((item) => role !== "alumno" || (!item.isHidden && !item.isDraft && Boolean(item.videoLocalKey || item.videoUrl)));
	return {
		id: snapshot.id,
		title: String(saved.course?.title || "Asignatura sin nombre"),
		description: String(saved.course?.description || ""),
		coverUrl: String(saved.course?.coverUrl || ""),
		coverLocalKey: typeof saved.course?.coverLocalKey === "string" ? saved.course.coverLocalKey : undefined,
		ownerUid: saved.ownerUid,
		published: saved.published === true,
		units,
		comments: Array.isArray(saved.comments?.course) ? saved.comments.course as CourseComment[] : [],
		resources
	};
}

/**
 * Crea una nueva asignatura con estructura base para unidades y comentarios.
 */
export async function createAssignment(title: string, uid: string, coverLocalKey: string): Promise<string> {
	const created = await addDoc(assignments, {
		course: { title, description: "", coverLocalKey, units: [{ id: "unidad-principal", name: "Unidad principal" }] },
		comments: { course: [] },
		ownerUid: uid,
		published: true,
		createdAt: serverTimestamp()
	});
	return created.id;
}

/**
 * Actualiza el nombre de una asignatura y, opcionalmente, su miniatura local.
 */
export async function updateAssignmentDetails(assignmentId: string, title: string, coverLocalKey?: string): Promise<void> {
	const changes: Record<string, unknown> = {
		"course.title": title,
		updatedAt: serverTimestamp()
	};
	if (coverLocalKey) {
		changes["course.coverLocalKey"] = coverLocalKey;
		changes["course.coverUrl"] = deleteField();
	}
	await updateDoc(doc(db, "asignaturas", assignmentId), changes);
}

/**
 * Elimina primero los recursos y luego la asignatura para no dejar documentos huérfanos.
 */
export async function deleteAssignment(assignmentId: string): Promise<void> {
	const resourceSnapshot = await getDocs(collection(db, "asignaturas", assignmentId, "recursos"));
	for (let start = 0; start < resourceSnapshot.docs.length; start += 500) {
		const batch = writeBatch(db);
		resourceSnapshot.docs.slice(start, start + 500).forEach((resource) => batch.delete(resource.ref));
		await batch.commit();
	}
	await deleteDoc(doc(db, "asignaturas", assignmentId));
}

/**
 * Crea un borrador vacío para que el profesor complete sus datos en el editor.
 */
export async function createResource(assignmentId: string, unit: CourseUnit): Promise<string> {
	const created = await addDoc(collection(db, "asignaturas", assignmentId, "recursos"), {
		title: "",
		description: "",
		unitId: unit.id,
		unit: unit.name,
		isHidden: true,
		isDraft: true,
		materials: [],
		popups: [],
		comments: []
	});
	return created.id;
}

/**
 * Retorna un recurso concreto según el permiso del usuario actual.
 */
export async function getResource(assignmentId: string, resourceId: string, role: UserRole): Promise<ResourceSummary | null> {
	const resourceRef = doc(db, "asignaturas", assignmentId, "recursos", resourceId);
	const snapshot = await getDoc(resourceRef);
	if (!snapshot.exists()) return null;
	const resource = normalizeResource(snapshot.id, snapshot.data());
	if (role === "alumno" && (resource.isHidden || resource.isDraft || (!resource.videoLocalKey && !resource.videoUrl))) return null;
	return resource;
}

/**
 * Actualiza campos de un recurso sin reemplazar el documento completo.
 */
export async function updateResource(assignmentId: string, resourceId: string, changes: Partial<ResourceSummary>): Promise<void> {
	await updateDoc(doc(db, "asignaturas", assignmentId, "recursos", resourceId), changes);
}

/**
 * Elimina un recurso concreto de una asignatura.
 */
export async function deleteResource(assignmentId: string, resourceId: string): Promise<void> {
	await deleteDoc(doc(db, "asignaturas", assignmentId, "recursos", resourceId));
}

export async function addCourseComment(assignmentId: string, comment: CourseComment): Promise<void> {
	const assignmentRef = doc(db, "asignaturas", assignmentId);
	await updateDoc(assignmentRef, { "comments.course": arrayUnion(comment), updatedAt: serverTimestamp() });
}

export async function addResourceComment(assignmentId: string, resourceId: string, comment: CourseComment): Promise<void> {
	const resourceRef = doc(db, "asignaturas", assignmentId, "recursos", resourceId);
	await updateDoc(resourceRef, { comments: arrayUnion(comment), updatedAt: serverTimestamp() });
}

export async function getResourceComments(assignmentId: string, resourceId: string): Promise<CourseComment[]> {
	const snapshot = await getDoc(doc(db, "asignaturas", assignmentId, "recursos", resourceId));
	const comments = snapshot.data()?.comments;
	return Array.isArray(comments) ? comments as CourseComment[] : [];
}

export async function updateCourse(assignmentId: string, changes: { units: CourseUnit[] }): Promise<void> {
	const updates = Object.fromEntries(Object.entries(changes).map(([key, value]) => [`course.${key}`, value]));
	await updateDoc(doc(db, "asignaturas", assignmentId), { ...updates, updatedAt: serverTimestamp() });
}
