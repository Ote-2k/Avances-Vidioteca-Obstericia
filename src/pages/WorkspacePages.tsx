/**
 * Paneles principales de trabajo de la videoteca.
 *
 * Aquí se reúnen las pantallas de alumno, profesor, gestión de asignaturas y
 * edición de recursos. La intención es mantener la lógica de negocio de la app
 * separada de la parte visual y de autenticación.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { createUserWithEmailAndPassword, getAuth, signOut } from "firebase/auth";
import { getApps, initializeApp } from "firebase/app";
import { useAuth } from "../context/AuthContext";
import { CommentThread } from "../components/CommentThread";
import { auth, db } from "../firebase";
import { addCourseComment, addResourceComment, createAssignment, createResource, deleteAssignment, deleteResource, getCourse, getResource, getResourceComments, listAssignments, updateAssignmentDetails, updateCourse, updateResource } from "../services/courses";
import { deleteCourseCover, getCourseCoverUrl, saveCourseCover } from "../services/courseCovers";
import type { CourseView } from "../services/courses";
import type { CourseComment, CourseSummary, ResourceMaterial, ResourcePopup, ResourceSummary } from "../types";
import universityLogo from "../../LOGO INSTITUCIONAL/SVG/UCEN LOGO_UCEN2_LOGO.svg";

/**
 * Resuelve una miniatura local y mantiene compatibilidad con URLs antiguas.
 */
function useCourseCoverUrl(localKey?: string, fallbackUrl?: string) {
	const [localUrl, setLocalUrl] = useState("");
	useEffect(() => {
		let active = true;
		let objectUrl = "";
		setLocalUrl("");
		if (!localKey) return;
		void getCourseCoverUrl(localKey).then((url) => {
			objectUrl = url;
			if (active) setLocalUrl(url);
			else URL.revokeObjectURL(url);
		}).catch(() => {
			if (active) setLocalUrl("");
		});
		return () => {
			active = false;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [localKey]);
	return localUrl || fallbackUrl || "";
}

/**
 * Layout base para todas las vistas internas de la videoteca.
 */
function WorkspaceLayout({ title, children, bannerUrl, bannerLocalKey, backHref, backLabel }: React.PropsWithChildren<{ title: React.ReactNode; bannerUrl?: string; bannerLocalKey?: string; backHref?: string; backLabel?: string }>) {
	const { profile, logout } = useAuth();
	const resolvedBannerUrl = useCourseCoverUrl(bannerLocalKey, bannerUrl);
	const showIdentity = profile?.role !== "profesor" && profile?.role !== "alumno" && profile?.role !== "admin";
	return (
		<div className="workspace">
			<header className="app-header">
				<Link className="brand" to="/" aria-label="Videoteca de Obstetricia y Puericultura">
					<img src={universityLogo} alt="" />
					<span className="brand-divider" aria-hidden="true" />
					<span className="brand-name"><strong>Videoteca</strong><small>Obstetricia y Puericultura</small></span>
				</Link>
				{backHref && backLabel && <Link className="workspace-back button button-quiet" to={backHref}>{backLabel}</Link>}
				<div className="header-actions">
					{showIdentity && <span className="identity">{profile?.displayName} · {profile?.role}</span>}
					<button className="button button-quiet" onClick={() => void logout()}>Cerrar sesión</button>
				</div>
			</header>
			<main className="workspace-main"><p className="eyebrow">{profile?.role}</p>{resolvedBannerUrl && <img className="workspace-banner" src={resolvedBannerUrl} alt={`Banner de ${title}`} />}<h1>{title}</h1>{children}</main>
		</div>
	);
}

/**
 * Enlace de material de apoyo que soporta archivos locales y URLs externas.
 */
function MaterialLink({ material }: { material: ResourceMaterial }) {
	const { href, missing } = useMaterialHref(material);
	const opensPdf = isPdfMaterial(material);
	return <a className="material-link" href={withPdfPage(href, material)} target={opensPdf || !material.localKey ? "_blank" : undefined} rel="noreferrer" download={material.localKey && !opensPdf ? material.title : undefined}>
		<strong><svg className="material-document-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2.75h8l4.25 4.5v14H6z" /><path d="M14 2.75v5h4.25M9 13h6M9 16.5h6" /></svg>{material.title}</strong>
		<span>{missing ? "Archivo no disponible en este navegador" : `${material.format}${material.description ? ` · ${material.description}` : ""}`}</span>
	</a>;
}

function useMaterialHref(material: ResourceMaterial) {
	const [href, setHref] = useState(material.url || "");
	const [missing, setMissing] = useState(false);
	useEffect(() => {
		let active = true;
		let objectUrl = "";
		setHref(material.url || "");
		setMissing(false);
		if (!material.localKey) return undefined;
		void import("../services/materialFiles").then(({ getLocalMaterialUrl }) => getLocalMaterialUrl(material.localKey!)).then((url) => {
			objectUrl = url;
			if (active) setHref(url);
			else URL.revokeObjectURL(url);
		}).catch((error: unknown) => {
			console.warn("No se pudo abrir el documento local:", error);
			if (active) setMissing(true);
		});
		return () => {
			active = false;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [material.localKey, material.url]);
	return { href, missing };
}

function DescriptionMaterialLink({ material }: { material: ResourceMaterial }) {
	const { href, missing } = useMaterialHref(material);
	const opensPdf = isPdfMaterial(material);
	return <a className="description-inline-link" href={withPdfPage(href, material) || undefined} target={opensPdf || !material.localKey ? "_blank" : undefined} rel="noreferrer" download={material.localKey && !opensPdf ? material.title : undefined} aria-disabled={!href}>{missing ? `${material.title} (no disponible)` : material.title}</a>;
}

function isPdfMaterial(material: ResourceMaterial) {
	if (material.format.toLocaleLowerCase() === "pdf") return true;
	if (!material.url) return false;
	try { return new URL(material.url).pathname.toLocaleLowerCase().endsWith(".pdf"); }
	catch { return material.url.toLocaleLowerCase().split(/[?#]/, 1)[0].endsWith(".pdf"); }
}

function withPdfPage(href: string, material: ResourceMaterial) {
	if (!href || !material.pdfPage || !isPdfMaterial(material)) return href;
	const hashIndex = href.indexOf("#");
	const base = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
	const fragment = hashIndex >= 0 ? href.slice(hashIndex + 1) : "";
	const params = new URLSearchParams(fragment);
	params.set("page", String(material.pdfPage));
	return `${base}#${params.toString()}`;
}

function ResourceDescription({ description, materials, onSeek }: { description: string; materials: ResourceMaterial[]; onSeek: (seconds: number) => void }) {
	const tokenPattern = /\[(\d{1,2}:[0-5]\d(?::[0-5]\d)?)\]|\[\[([^\]\n]+)\]\]/g;
	const content: React.ReactNode[] = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = tokenPattern.exec(description))) {
		if (match.index > lastIndex) content.push(description.slice(lastIndex, match.index));
		if (match[1]) {
			const parts = match[1].split(":").map(Number);
			const seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
			content.push(<button className="description-inline-link" type="button" key={`time-${match.index}`} onClick={() => onSeek(seconds)}>{match[1]}</button>);
		} else {
			const title = match[2].trim();
			const material = materials.find((item) => item.title.toLocaleLowerCase() === title.toLocaleLowerCase());
			content.push(material ? <DescriptionMaterialLink key={`material-${match.index}`} material={material} /> : match[0]);
		}
		lastIndex = tokenPattern.lastIndex;
	}
	if (lastIndex < description.length) content.push(description.slice(lastIndex));
	return <p className="course-description">{content}</p>;
}

interface NotificationItem {
	id: string;
	title: string;
	message: string;
	link: string;
	read: boolean;
	date: number;
}

/**
 * Centro de notificaciones del usuario activo.
 * Sirve para mostrar avisos relativos a asignaturas, comentarios o tareas.
 */
function NotificationCenter() {
	const { profile } = useAuth();
	const [items, setItems] = useState<NotificationItem[]>([]);
	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState("");
	useEffect(() => {
		if (!profile) return;
		const notificationsQuery = query(collection(db, "notificaciones"), where("usuarioUid", "==", profile.uid));
		return onSnapshot(notificationsQuery, (snapshot) => {
			setItems(snapshot.docs.map((item) => {
				const data = item.data();
				const date = typeof data.fecha?.toDate === "function" ? data.fecha.toDate().getTime() : new Date(data.fecha || 0).getTime();
				return { id: item.id, title: String(data.titulo || "Notificación"), message: String(data.mensaje || ""), link: String(data.link || "#"), read: data.leido === true, date };
			}).sort((first, second) => second.date - first.date));
		}, (error) => { console.error(error); setStatus("No se pudieron cargar las notificaciones."); });
	}, [profile?.uid]);
	const unread = items.filter((item) => !item.read);
	async function markRead(item: NotificationItem) {
		if (item.read) return;
		try { await updateDoc(doc(db, "notificaciones", item.id), { leido: true }); }
		catch (error) { console.error(error); setStatus("No se pudo marcar como leída."); }
	}
	async function markAllRead() {
		if (!unread.length) return;
		try {
			const batch = writeBatch(db);
			unread.forEach((item) => batch.update(doc(db, "notificaciones", item.id), { leido: true }));
			await batch.commit();
		} catch (error) { console.error(error); setStatus("No se pudieron marcar todas como leídas."); }
	}
	return <section className="notification-center">
		<button className="button button-quiet" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>Notificaciones{unread.length > 0 ? ` (${unread.length})` : ""}</button>
		{open && <div className="notification-panel"><header><strong>Notificaciones</strong><button className="text-button" type="button" onClick={() => void markAllRead()} disabled={!unread.length}>Marcar leídas</button></header>
			{status && <p className="status">{status}</p>}
			{items.length === 0 ? <p className="muted">No tienes notificaciones.</p> : items.map((item) => <a className={`notification-item${item.read ? "" : " is-unread"}`} href={item.link} key={item.id} onClick={() => void markRead(item)}><strong>{item.title}</strong><span>{item.message}</span></a>)}
		</div>}
	</section>;
}

/**
 * Vista principal del estudiante.
 * Muestra todas las asignaturas disponibles para el estudiante.
 */
export function StudentPage() {
	const { profile } = useAuth();
	const [courses, setCourses] = useState<CourseSummary[]>([]);
	const [status, setStatus] = useState("Cargando asignaturas...");
	useEffect(() => {
		if (!profile) return;
		listAssignments("alumno", profile.uid).then((items) => {
			setCourses(items);
			setStatus(items.length ? "" : "No hay asignaturas publicadas.");
		}).catch((error: unknown) => {
			console.error(error);
			setStatus("No se pudieron cargar las asignaturas desde Firebase.");
		});
	}, [profile]);
	return <WorkspaceLayout title="Mis asignaturas">
		<NotificationCenter />
		{status && <p className="status" role="status">{status}</p>}
		<div className="course-grid">{courses.map((course) => <Link className="course-card" key={course.id} to={`/profesor/asignaturas/${course.id}`}>
			<CourseThumbnail course={course} />
			<div><h2>{course.title}</h2><p>{course.description || "Recursos de la asignatura"}</p></div>
		</Link>)}</div>
	</WorkspaceLayout>;
}

function CourseThumbnail({ course, className }: { course: CourseSummary; className?: string }) {
	const coverUrl = useCourseCoverUrl(course.coverLocalKey, course.coverUrl);
	return coverUrl
		? <img className={className} src={coverUrl} alt="" />
		: <div className="course-card-placeholder" role="img" aria-label="Asignatura sin miniatura"><span>Videoteca UCEN</span></div>;
}

/**
 * Vista principal del profesor.
 * Muestra las asignaturas asignadas y permite abrirlas.
 */
export function ProfessorPage() {
	const { profile } = useAuth();
	const [courses, setCourses] = useState<CourseSummary[]>([]);
	const [status, setStatus] = useState("Cargando asignaturas...");
	const refresh = async () => {
		if (!profile) return;
		const items = await listAssignments("profesor", profile.uid);
		setCourses(items);
		setStatus(items.length ? "" : "Todavía no tienes asignaturas.");
	};
	useEffect(() => { void refresh().catch(() => setStatus("No se pudieron cargar las asignaturas.")); }, [profile]);
	return <WorkspaceLayout title="Mis asignaturas">
		{status && <p className="status" role="status">{status}</p>}
		<div className="course-grid">{courses.map((course) =>
			<Link className="course-card course-card-link" key={course.id} to={`/profesor/asignaturas/${course.id}`}>
				<CourseThumbnail course={course} />
				<div><h2>{course.title}</h2><p>{course.description || "Recursos de la asignatura"}</p></div>
			</Link>)}</div>
	</WorkspaceLayout>;
}

/**
 * Página de detalle de una asignatura.
 * Contiene la administración de unidades, alumnos, recursos, comentarios y edición del curso.
 */
export function CoursePage() {
	const { assignmentId } = useParams();
	const { profile } = useAuth();
	const [course, setCourse] = useState<CourseView | null>(null);
	const [status, setStatus] = useState("Cargando asignatura...");
	const [resourceUnitId, setResourceUnitId] = useState("");
	const [newUnit, setNewUnit] = useState("");
	const [commentText, setCommentText] = useState("");
	const [editMode, setEditMode] = useState(false);
	const navigate = useNavigate();
	const isTeacher = profile?.role === "profesor";
	const load = async () => {
		if (!assignmentId || !profile) return;
		const loaded = await getCourse(assignmentId, profile.role);
		setCourse(loaded);
		setStatus(loaded ? "" : "No se encontró la asignatura o no está publicada.");
	};
	useEffect(() => {
		setEditMode(false);
		void load().catch((error: unknown) => { console.error(error); setStatus("No se pudo cargar la asignatura."); });
	}, [assignmentId, profile]);
	async function createNewResource(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!assignmentId || !course) return;
		const unit = course.units.find((item) => item.id === resourceUnitId) || course.units[0];
		if (!unit) return;
		try {
			setStatus("Creando borrador del recurso...");
			const id = await createResource(assignmentId, unit);
			navigate(`/profesor/asignaturas/${assignmentId}/recursos/${id}`, { state: { startInEdit: true } });
		} catch (error) {
			console.error("No se pudo crear el borrador del recurso:", error);
			setStatus(error instanceof Error ? `No se pudo crear el recurso: ${error.message}` : "No se pudo crear el recurso.");
		}
	}
	async function addUnit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!assignmentId || !course || !newUnit.trim()) return;
		const units = [...course.units, { id: `unidad-${crypto.randomUUID()}`, name: newUnit.trim() }];
		try { await updateCourse(assignmentId, { units }); setNewUnit(""); await load(); }
		catch (error) { console.error(error); setStatus("No se pudo agregar la unidad."); }
	}
	async function removeUnit(unitId: string) {
		if (!assignmentId || !course || unitId === "unidad-principal") return;
		if (course.resources.some((resource) => resource.unitId === unitId)) {
			setStatus("Mueve o elimina sus recursos antes de borrar esta unidad.");
			return;
		}
		try {
			await updateCourse(assignmentId, { units: course.units.filter((unit) => unit.id !== unitId) });
			setResourceUnitId((current) => current === unitId ? course.units[0]?.id || "" : current);
			await load();
		}
		catch (error) { console.error(error); setStatus("No se pudo eliminar la unidad."); }
	}
	async function addComment(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!assignmentId || !profile || !commentText.trim()) return;
		const comment: CourseComment = { id: crypto.randomUUID(), authorUid: profile.uid, author: profile.displayName, authorEmail: profile.email, text: commentText.trim(), createdAt: new Date().toISOString() };
		try { await addCourseComment(assignmentId, comment); setCommentText(""); await load(); }
		catch (error) { console.error(error); setStatus("No se pudo guardar el comentario."); }
	}
	async function replyToCourseComment(parentId: string, text: string) {
		if (!assignmentId || !profile) return;
		const reply: CourseComment = { id: crypto.randomUUID(), parentId, authorUid: profile.uid, author: profile.displayName, authorEmail: profile.email, text, createdAt: new Date().toISOString() };
		try { await addCourseComment(assignmentId, reply); await load(); }
		catch (error) { console.error(error); setStatus("No se pudo enviar la respuesta."); throw error; }
	}
	async function removeResource(resourceId: string, title: string) {
		if (!assignmentId || !window.confirm(`¿Eliminar “${title}”?`)) return;
		try {
			await deleteResource(assignmentId, resourceId);
			const localKey = course?.resources.find((resource) => resource.id === resourceId)?.videoLocalKey;
			if (localKey) {
				const { deleteLocalVideo } = await import("../services/videoFiles");
				await deleteLocalVideo(localKey).catch((error: unknown) => console.warn("El recurso se eliminó, pero no se pudo borrar su video local.", error));
			}
			await load();
		}
		catch (error) { console.error(error); setStatus("No se pudo eliminar el recurso."); }
	}
	return <WorkspaceLayout title={course?.title || "Asignatura"} bannerUrl={course?.coverUrl} bannerLocalKey={course?.coverLocalKey} backHref={isTeacher ? "/profesor" : "/alumno"} backLabel={isTeacher ? "← Mis asignaturas" : "← Asignaturas"}>
		{status && <p className="status" role="status">{status}</p>}
		{course && <>
			{course.description && <p className="course-description">{course.description}</p>}
			{isTeacher && <div className="course-mode-actions"><button className="button button-quiet" type="button" aria-pressed={editMode} onClick={() => setEditMode((enabled) => !enabled)}>{editMode ? "Finalizar edición" : "Editar contenido"}</button></div>}
			{isTeacher && editMode && <><form className="resource-create-form" onSubmit={createNewResource}><select aria-label="Unidad del recurso" value={resourceUnitId || course.units[0]?.id || ""} onChange={(event) => setResourceUnitId(event.target.value)} required>{course.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select><button className="button button-primary">Crear recurso</button></form><form className="inline-form" onSubmit={addUnit}><input aria-label="Nombre de la unidad" placeholder="Nueva unidad" value={newUnit} onChange={(event) => setNewUnit(event.target.value)} required /><button className="button button-quiet">Agregar unidad</button></form></>}
			{course.units.map((unit) => {
				const unitResources = course.resources.filter((resource) => resource.unitId === unit.id);
				return <section className="unit-block" key={unit.id}><header><h2>{unit.name}</h2><span>{unitResources.length} recursos</span>{isTeacher && editMode && unit.id !== "unidad-principal" && <button className="button button-quiet" onClick={() => void removeUnit(unit.id)}>Eliminar unidad</button>}</header><div className="resource-grid">{unitResources.map((resource) => <article className="resource-card" key={resource.id}><Link to={`/profesor/asignaturas/${assignmentId}/recursos/${resource.id}`}><div className={`resource-card-thumbnail${resource.thumbnailUrl ? "" : " has-no-thumbnail"}`}>{resource.thumbnailUrl && <img src={resource.thumbnailUrl} alt="" />}</div><div className="resource-card-info"><h3>{resource.title}</h3>{resource.description && <p className="resource-card-description">{resource.description}</p>}{resource.duration && <small>{resource.duration}</small>}</div></Link>{isTeacher && editMode && <button className="button button-danger" onClick={() => void removeResource(resource.id, resource.title)}>Eliminar</button>}</article>)}</div></section>;
			})}
			{!course.resources.length && <p className="empty-state">Todavía no hay recursos disponibles.</p>}
			<section className="comments-section"><h2>Comentarios</h2>{profile && <CommentThread comments={course.comments} profile={profile} onReply={replyToCourseComment} />}<form className="inline-form" onSubmit={addComment}><input aria-label="Escribe un comentario" placeholder="Escribe un comentario" value={commentText} onChange={(event) => setCommentText(event.target.value)} required /><button className="button button-primary">Comentar</button></form></section>
		</>}
	</WorkspaceLayout>;
}

/**
 * Página de detalle de un recurso educativo.
 * Gestiona reproducción, material adjunto, pop-ups y comentarios del recurso activo.
 */
export function ResourcePage() {
	const { resourceId } = useParams();
	const { assignmentId } = useParams();
	const { profile } = useAuth();
	const location = useLocation();
	const navigate = useNavigate();
	const [resource, setResource] = useState<ResourceSummary | null>(null);
	const initialResource = useRef<ResourceSummary | null>(null);
	const [comments, setComments] = useState<CourseComment[]>([]);
	const [status, setStatus] = useState("Cargando recurso...");
	const [editMode, setEditMode] = useState(false);
	const [saveBusy, setSaveBusy] = useState(false);
	const [saveStage, setSaveStage] = useState<"idle" | "saving" | "compressing">("idle");
	const [saveSuccess, setSaveSuccess] = useState(false);
	const [videoSource, setVideoSource] = useState<"file" | "url">("file");
	const [titleInput, setTitleInput] = useState("");
	const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
	const [videoThumbnailPreview, setVideoThumbnailPreview] = useState("");
	const [thumbnailStatus, setThumbnailStatus] = useState("");
	const thumbnailRequestId = useRef(0);
	const [videoUrl, setVideoUrl] = useState("");
	const [videoUrlInput, setVideoUrlInput] = useState("");
	const [selectedVideoPreviewUrl, setSelectedVideoPreviewUrl] = useState("");
	const [videoDuration, setVideoDuration] = useState(0);
	const [trimStartInput, setTrimStartInput] = useState("");
	const [trimEndInput, setTrimEndInput] = useState("");
	const [activeVideoEditor, setActiveVideoEditor] = useState<"duration" | "popups" | "description" | null>(null);
	const [descriptionInput, setDescriptionInput] = useState("");
	const descriptionTextareaRef = useRef<HTMLTextAreaElement | null>(null);
	const [isHiddenInput, setIsHiddenInput] = useState(false);
	const [commentText, setCommentText] = useState("");
	const [materialFormOpen, setMaterialFormOpen] = useState(false);
	const [materialSource, setMaterialSource] = useState<"file" | "url">("file");
	const [materialFileIsPdf, setMaterialFileIsPdf] = useState(false);
	const [materialUrlInput, setMaterialUrlInput] = useState("");
	const [editingMaterialId, setEditingMaterialId] = useState("");
	const [editingMaterialSource, setEditingMaterialSource] = useState<"file" | "url">("file");
	const [editingMaterialFileIsPdf, setEditingMaterialFileIsPdf] = useState(false);
	const [editingMaterialUrl, setEditingMaterialUrl] = useState("");
	const [playbackTime, setPlaybackTime] = useState(0);
	const [dismissedPopups, setDismissedPopups] = useState<Set<string>>(() => new Set());
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const videoFrameRef = useRef<HTMLIFrameElement | null>(null);
	const isTeacher = profile?.role === "profesor";
	const load = async () => {
		if (!assignmentId || !resourceId || !profile) return;
		const [loaded, loadedComments] = await Promise.all([getResource(assignmentId, resourceId, profile.role), getResourceComments(assignmentId, resourceId)]);
		setResource(loaded);
		setTitleInput(loaded?.title || "");
		setDescriptionInput(loaded?.description || "");
		setIsHiddenInput(Boolean(loaded?.isHidden && !loaded?.isDraft));
		setVideoSource(loaded?.videoUrl ? "url" : "file");
		setVideoUrlInput(loaded?.videoUrl || "");
		setTrimStartInput(loaded?.trimStart ? String(loaded.trimStart) : "");
		setTrimEndInput(loaded?.trimEnd == null ? "" : String(loaded.trimEnd));
		setSelectedVideoFile(null);
		setVideoThumbnailPreview("");
		setThumbnailStatus("");
		setActiveVideoEditor(null);
		initialResource.current = loaded ? { ...loaded, materials: [...loaded.materials], popups: [...loaded.popups] } : null;
		setComments(loadedComments);
		setStatus(loaded ? "" : "No se encontró el recurso o no está publicado.");
		setEditMode(Boolean(isTeacher && (location.state as { startInEdit?: boolean } | null)?.startInEdit));
	};
	useEffect(() => {
		setEditMode(false);
		setSaveSuccess(false);
		initialResource.current = null;
		void load().catch((error: unknown) => { console.error(error); setStatus("No se pudo cargar el recurso."); });
	}, [assignmentId, resourceId, profile, location.state]);
	useEffect(() => {
		let objectUrl = "";
		if (resource?.videoLocalKey) import("../services/videoFiles").then(({ getLocalVideoUrl }) => getLocalVideoUrl(resource.videoLocalKey!)).then((url) => { objectUrl = url; setVideoUrl(url); }).catch(() => setStatus("El video local no está disponible en este navegador."));
		else setVideoUrl(resource?.videoUrl || "");
		return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
	}, [resource?.videoLocalKey, resource?.videoUrl]);
	useEffect(() => {
		if (!selectedVideoFile) {
			setSelectedVideoPreviewUrl("");
			return;
		}
		const objectUrl = URL.createObjectURL(selectedVideoFile);
		setSelectedVideoPreviewUrl(objectUrl);
		return () => URL.revokeObjectURL(objectUrl);
	}, [selectedVideoFile]);
	useEffect(() => {
		const textarea = descriptionTextareaRef.current;
		if (!textarea) return;
		textarea.style.height = "auto";
		textarea.style.height = `${textarea.scrollHeight}px`;
	}, [descriptionInput, activeVideoEditor]);
	async function save() {
		if (!resource || !assignmentId || !resourceId || saveBusy) return;
		setSaveBusy(true);
		setSaveStage("saving");
		let newlySavedVideoKey: string | null = null;
		try {
			setStatus("Guardando cambios...");
			const title = titleInput.trim();
			const description = descriptionInput.trim();
			if (!title) throw new Error("El nombre del recurso es obligatorio.");
			const trimStart = Number(trimStartInput || 0);
			const trimEndValue = trimEndInput.trim();
			const trimEnd = trimEndValue ? Number(trimEndValue) : null;
			if (!Number.isFinite(trimStart) || trimStart < 0) throw new Error("El tiempo de inicio debe ser un número válido.");
			if (trimEnd !== null && (!Number.isFinite(trimEnd) || trimEnd <= trimStart)) {
				throw new Error("El tiempo de fin debe ser mayor que el tiempo de inicio.");
			}
			let videoLocalKey = videoSource === "file" ? resource.videoLocalKey || "" : "";
			let videoUrl = videoSource === "url" ? videoUrlInput.trim() : "";
			let thumbnailUrl = resource.thumbnailUrl || "";
			const videoFile = videoSource === "file" ? selectedVideoFile : null;
			if (videoSource === "file" && !videoFile && !videoLocalKey) {
				throw new Error("Selecciona el archivo de video.");
			}
			if (videoSource === "url" && !videoUrl) {
				throw new Error("Ingresa la URL del video.");
			}
			const { generateVideoThumbnail } = await import("../services/videoFiles");
			if (videoSource === "file" && videoFile) {
				setSaveStage("compressing");
				setStatus("Comprimiendo video a WebM...");
				videoLocalKey = `${assignmentId}/${resourceId}/${crypto.randomUUID()}`;
				newlySavedVideoKey = videoLocalKey;
				const { saveTranscodedVideo } = await import("../services/videoFiles");
				const webmVideo = await saveTranscodedVideo(videoLocalKey, videoFile, (progress) => setStatus(`Comprimiendo video a WebM: ${progress}%`));
				setStatus("Generando miniatura del video...");
				thumbnailUrl = await generateVideoThumbnail(webmVideo);
				setSaveStage("saving");
				setStatus("Guardando cambios...");
			} else if (videoSource === "url" && (videoUrl !== resource.videoUrl || (!thumbnailUrl && !resource.videoUrl))) {
				thumbnailUrl = await generateVideoThumbnail(videoUrl);
			} else if (videoSource === "file" && !thumbnailUrl && videoLocalKey) {
				const { getLocalVideoUrl } = await import("../services/videoFiles");
				const localVideoUrl = await getLocalVideoUrl(videoLocalKey);
				try {
					thumbnailUrl = await generateVideoThumbnail(localVideoUrl);
				} finally {
					URL.revokeObjectURL(localVideoUrl);
				}
			}
			if (!thumbnailUrl) throw new Error("No se pudo generar la miniatura del video.");
			await updateResource(assignmentId, resourceId, {
				title,
				description,
				videoUrl,
				thumbnailUrl,
				videoLocalKey,
				trimStart,
				trimEnd,
				isDraft: false,
				isHidden: isHiddenInput
			});
			const updatedResource = {
				...resource,
				title,
				description,
				videoUrl,
				thumbnailUrl,
				videoLocalKey,
				trimStart,
				trimEnd,
				isDraft: false,
				isHidden: isHiddenInput
			};
			setResource(updatedResource);
			initialResource.current = { ...updatedResource, materials: [...updatedResource.materials], popups: [...updatedResource.popups] };
			if (resource.videoLocalKey && resource.videoLocalKey !== videoLocalKey) {
				const { deleteLocalVideo } = await import("../services/videoFiles");
				await deleteLocalVideo(resource.videoLocalKey).catch((error: unknown) => console.warn("El video se reemplazó, pero no se pudo eliminar la versión local anterior.", error));
			}
			const originalMaterialIds = new Set((initialResource.current?.materials || []).map((material) => material.id));
			for (const material of resource.materials) {
				if (!originalMaterialIds.has(material.id) || !material.localKey) continue;
				if (updatedResource.materials.some((savedMaterial) => savedMaterial.id === material.id)) continue;
				const { deleteLocalMaterial } = await import("../services/materialFiles");
				await deleteLocalMaterial(material.localKey).catch((error: unknown) => console.warn("El recurso se guardó, pero no se pudo eliminar un documento local retirado.", error));
			}
			newlySavedVideoKey = null;
			setSaveSuccess(true);
			setEditMode(false);
			setSelectedVideoFile(null);
			setActiveVideoEditor(null);
			setStatus("");
		} catch (error) {
			console.error("No se pudieron guardar los cambios del recurso:", error);
			const message = error && typeof error === "object" && "message" in error && typeof error.message === "string"
				? error.message
				: String(error);
			setStatus(`No se pudieron guardar los cambios: ${message}`);
		} finally {
			if (newlySavedVideoKey) {
				const { deleteLocalVideo } = await import("../services/videoFiles");
				await deleteLocalVideo(newlySavedVideoKey).catch((error: unknown) => console.warn("No se pudo limpiar el nuevo video local.", error));
			}
			setSaveBusy(false);
			setSaveStage("idle");
		}
	}
	async function handleVideoFileChange(file: File | null) {
		const requestId = ++thumbnailRequestId.current;
		setSelectedVideoFile(file);
		setVideoThumbnailPreview("");
		setThumbnailStatus("");
		if (!file) return;
		try {
			setThumbnailStatus("Generando miniatura...");
			const { generateVideoThumbnail } = await import("../services/videoFiles");
			const preview = await generateVideoThumbnail(file);
			if (thumbnailRequestId.current === requestId) {
				setVideoThumbnailPreview(preview);
				setThumbnailStatus("");
			}
		} catch (error) {
			if (thumbnailRequestId.current === requestId) {
				console.error("No se pudo generar la miniatura del video seleccionado:", error);
				setThumbnailStatus(error instanceof Error ? error.message : "No se pudo generar la miniatura.");
			}
		}
	}
	async function cancelEditing() {
		if (!resource || !assignmentId || !resourceId || saveBusy) return;
		if (!window.confirm("¿Estás seguro? Se descartarán los cambios y volverás a la asignatura.")) return;
		try {
			const original = initialResource.current;
			if (resource.isDraft) {
				await deleteResource(assignmentId, resourceId);
				if (resource.videoLocalKey) {
					const { deleteLocalVideo } = await import("../services/videoFiles");
					await deleteLocalVideo(resource.videoLocalKey).catch((error: unknown) => console.warn("No se pudo eliminar el video local del borrador cancelado.", error));
				}
				for (const material of resource.materials) {
					if (!material.localKey) continue;
					const { deleteLocalMaterial } = await import("../services/materialFiles");
					await deleteLocalMaterial(material.localKey).catch((error: unknown) => console.warn("No se pudo eliminar un documento del borrador cancelado.", error));
				}
			} else if (original) {
				const originalMaterialIds = new Set(original.materials.map((material) => material.id));
				const addedMaterials = resource.materials.filter((material) => !originalMaterialIds.has(material.id));
				await updateResource(assignmentId, resourceId, {
					materials: original.materials,
					popups: original.popups
				});
				for (const material of addedMaterials) {
					if (material.localKey) {
						const { deleteLocalMaterial } = await import("../services/materialFiles");
						await deleteLocalMaterial(material.localKey).catch((error: unknown) => console.warn("No se pudo eliminar un adjunto local descartado.", error));
					}
				}
			}
			navigate(`/profesor/asignaturas/${assignmentId}`);
		} catch (error) {
			console.error("No se pudieron descartar los cambios del recurso:", error);
			setStatus(error instanceof Error ? `No se pudieron descartar los cambios: ${error.message}` : "No se pudieron descartar los cambios.");
		}
	}
	async function addComment(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!profile || !assignmentId || !resourceId || !commentText.trim()) return;
		const comment: CourseComment = { id: crypto.randomUUID(), authorUid: profile.uid, author: profile.displayName, authorEmail: profile.email, text: commentText.trim(), createdAt: new Date().toISOString() };
		try { await addResourceComment(assignmentId, resourceId, comment); setComments((previous) => [...previous, comment]); setCommentText(""); }
		catch (error) { console.error(error); setStatus("No se pudo guardar el comentario."); }
	}
	async function replyToResourceComment(parentId: string, text: string) {
		if (!profile || !assignmentId || !resourceId) return;
		const reply: CourseComment = { id: crypto.randomUUID(), parentId, authorUid: profile.uid, author: profile.displayName, authorEmail: profile.email, text, createdAt: new Date().toISOString() };
		try {
			await addResourceComment(assignmentId, resourceId, reply);
			setComments((previous) => [...previous, reply]);
		} catch (error) { console.error(error); setStatus("No se pudo enviar la respuesta."); throw error; }
	}
	async function addMaterial(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!resource || !assignmentId || !resourceId) return;
		const formElement = event.currentTarget;
		const form = new FormData(formElement);
		const file = materialSource === "file" ? form.get("file") : null;
		const url = materialSource === "url" ? String(form.get("url") || "").trim() : "";
		if (!(file instanceof File && file.size) && !url) {
			setStatus("Selecciona un archivo o escribe una URL.");
			return;
		}
		let localKey = "";
		let material: ResourceMaterial = { id: crypto.randomUUID(), title: String(form.get("title") || "").trim(), format: String(form.get("format") || "Enlace"), description: String(form.get("description") || "").trim(), url };
		const pdfPageValue = String(form.get("pdfPage") || "").trim();
		const pdfPage = pdfPageValue ? Number(pdfPageValue) : undefined;
		if (pdfPage !== undefined && (!Number.isInteger(pdfPage) || pdfPage < 1)) {
			setStatus("La página del PDF debe ser un número entero mayor que cero.");
			return;
		}
		if (pdfPage && (file instanceof File ? !file.name.toLocaleLowerCase().endsWith(".pdf") : !isPdfMaterial(material))) {
			setStatus("La página específica solo se puede asignar a documentos PDF.");
			return;
		}
		if (pdfPage) material = { ...material, pdfPage };
		try {
			if (file instanceof File && file.size) {
				setStatus("Guardando documento en este navegador...");
				const { saveLocalMaterial } = await import("../services/materialFiles");
				localKey = `${assignmentId}/${resourceId}/${material.id}`;
				const saved = await saveLocalMaterial(localKey, file);
				material = { ...material, localKey, format: saved.format };
			}
			const nextMaterials = [...resource.materials, material];
			try {
				await updateResource(assignmentId, resourceId, { materials: nextMaterials });
			} catch (error) {
				if (localKey) {
					const { deleteLocalMaterial } = await import("../services/materialFiles");
					await deleteLocalMaterial(localKey).catch(() => {});
				}
				throw error;
			}
			setResource({ ...resource, materials: nextMaterials });
			setStatus("");
			formElement.reset();
			setMaterialFormOpen(false);
			setMaterialSource("file");
			setMaterialFileIsPdf(false);
			setMaterialUrlInput("");
		} catch (error) {
			console.error("No se pudo guardar el material:", error);
			setStatus(error instanceof Error ? `No se pudo guardar el documento: ${error.message}` : "No se pudo guardar el documento.");
		}
	}
	async function removeMaterial(materialId: string) {
		if (!resource || !assignmentId || !resourceId) return;
		const materials = resource.materials.filter((material) => material.id !== materialId);
		const popups = resource.popups.filter((popup) => popup.materialId !== materialId);
		try {
			await updateResource(assignmentId, resourceId, { materials, popups });
			setResource({ ...resource, materials, popups });
			setStatus("Documento eliminado del recurso.");
		}
		catch (error) {
			console.error("No se pudo eliminar el documento del recurso:", error);
			setStatus(error instanceof Error ? `No se pudo eliminar el documento: ${error.message}` : "No se pudo eliminar el documento.");
		}
	}
	function openMaterialEditor(material: ResourceMaterial) {
		setEditingMaterialId(material.id);
		setEditingMaterialSource(material.localKey ? "file" : "url");
		setEditingMaterialFileIsPdf(isPdfMaterial(material));
		setEditingMaterialUrl(material.url || "");
	}
	async function saveMaterial(event: FormEvent<HTMLFormElement>, materialId: string) {
		event.preventDefault();
		if (!resource || !assignmentId || !resourceId) return;
		const original = resource.materials.find((material) => material.id === materialId);
		if (!original) return;
		const formElement = event.currentTarget;
		const form = new FormData(formElement);
		const title = String(form.get("title") || "").trim();
		const description = String(form.get("description") || "").trim();
		const file = editingMaterialSource === "file" ? form.get("file") : null;
		const url = editingMaterialSource === "url" ? String(form.get("url") || "").trim() : "";
		if (!title) {
			setStatus("El nombre del documento es obligatorio.");
			return;
		}
		if (editingMaterialSource === "url" && !url) {
			setStatus("Ingresa la URL del documento.");
			return;
		}
		if (editingMaterialSource === "file" && !(file instanceof File && file.size) && !original.localKey) {
			setStatus("Selecciona el archivo local del documento.");
			return;
		}
		const pdfPageValue = String(form.get("pdfPage") || "").trim();
		const pdfPage = pdfPageValue ? Number(pdfPageValue) : undefined;
		if (pdfPage !== undefined && (!Number.isInteger(pdfPage) || pdfPage < 1)) {
			setStatus("La página del PDF debe ser un número entero mayor que cero.");
			return;
		}
		const isPdf = editingMaterialSource === "url"
			? isPdfMaterial({ ...original, url })
			: file instanceof File && file.size
				? file.name.toLocaleLowerCase().endsWith(".pdf")
				: editingMaterialFileIsPdf;
		if (pdfPage && !isPdf) {
			setStatus("La página específica solo se puede asignar a documentos PDF.");
			return;
		}
		let newLocalKey = "";
		try {
			let nextMaterial: ResourceMaterial = {
				...original,
				title,
				description,
				url: editingMaterialSource === "url" ? url : "",
				pdfPage: isPdf ? pdfPage : undefined
			};
			if (editingMaterialSource === "url") {
				nextMaterial = { ...nextMaterial, localKey: undefined, format: "Enlace" };
			} else if (file instanceof File && file.size) {
				newLocalKey = `${assignmentId}/${resourceId}/${materialId}/${crypto.randomUUID()}`;
				setStatus("Guardando documento en este navegador...");
				const { saveLocalMaterial } = await import("../services/materialFiles");
				const saved = await saveLocalMaterial(newLocalKey, file);
				nextMaterial = { ...nextMaterial, localKey: newLocalKey, format: saved.format };
			}
			const materials = resource.materials.map((material) => material.id === materialId ? nextMaterial : material);
			try {
				await updateResource(assignmentId, resourceId, { materials });
			} catch (error) {
				if (newLocalKey) {
					const { deleteLocalMaterial } = await import("../services/materialFiles");
					await deleteLocalMaterial(newLocalKey).catch((cleanupError: unknown) => console.warn("No se pudo limpiar el nuevo archivo local.", cleanupError));
				}
				throw error;
			}
			setResource({ ...resource, materials });
			setStatus("");
			setEditingMaterialId("");
			if (original.localKey && original.localKey !== nextMaterial.localKey) {
				const { deleteLocalMaterial } = await import("../services/materialFiles");
				await deleteLocalMaterial(original.localKey).catch((error: unknown) => console.warn("El documento se actualizó, pero no se pudo eliminar el archivo local anterior.", error));
			}
		} catch (error) {
			console.error("No se pudo actualizar el documento:", error);
			setStatus(error instanceof Error ? `No se pudo actualizar el documento: ${error.message}` : "No se pudo actualizar el documento.");
		}
	}
	async function addPopup(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!resource || !assignmentId || !resourceId) return;
		const formElement = event.currentTarget;
		const form = new FormData(formElement);
		const pauseVideo = form.get("pauseVideo") === "on";
		const popup: ResourcePopup = {
			id: crypto.randomUUID(),
			title: String(form.get("title") || "").trim(),
			message: String(form.get("message") || "").trim(),
			timestamp: Number(form.get("timestamp")),
			materialId: String(form.get("materialId") || "") || undefined,
			pauseVideo,
			dismissAfter: pauseVideo ? null : Math.max(1, Number(form.get("dismissAfter") || 5)),
			x: 72,
			y: 58
		};
		if (!Number.isFinite(popup.timestamp) || popup.timestamp < 0) return;
		const popups = [...resource.popups, popup];
		try { await updateResource(assignmentId, resourceId, { popups }); setResource({ ...resource, popups }); formElement.reset(); }
		catch (error) { console.error(error); setStatus("No se pudo guardar el pop-up."); }
	}
	async function removePopup(popupId: string) {
		if (!resource || !assignmentId || !resourceId) return;
		const popups = resource.popups.filter((popup) => popup.id !== popupId);
		try { await updateResource(assignmentId, resourceId, { popups }); setResource({ ...resource, popups }); }
		catch (error) { console.error(error); setStatus("No se pudo eliminar el pop-up."); }
	}
	function dismissPopup(popupId: string) {
		setDismissedPopups((current) => new Set(current).add(popupId));
		void videoRef.current?.play();
	}
	function seekToVideo(seconds: number) {
		if (videoRef.current) {
			videoRef.current.currentTime = seconds;
			videoRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
			return;
		}
		const frame = videoFrameRef.current;
		if (frame) {
			const embedUrl = new URL(frame.src);
			embedUrl.searchParams.set("start", String(seconds));
			frame.src = embedUrl.toString();
			frame.scrollIntoView({ behavior: "smooth", block: "center" });
		}
	}
	const activePopup = editMode ? undefined : resource?.popups.find((popup) => !dismissedPopups.has(popup.id) && playbackTime >= popup.timestamp && (popup.pauseVideo || playbackTime <= popup.timestamp + (popup.dismissAfter || 5)));
	const currentVideoSrc = editMode
		? videoSource === "url" ? videoUrlInput : selectedVideoPreviewUrl || (resource?.videoLocalKey ? videoUrl : "")
		: videoUrl || resource?.videoUrl || "";
	const currentVideoIsEmbed = !!currentVideoSrc && toEmbedUrl(currentVideoSrc) !== currentVideoSrc;
	const canEditPopups = isTeacher && editMode && !currentVideoIsEmbed;
	useEffect(() => { if (activePopup?.pauseVideo) videoRef.current?.pause(); }, [activePopup?.id]);
	return <WorkspaceLayout title={isTeacher && editMode
		? <span className="resource-title-row"><input className="resource-title-field" form="resource-edit-form" name="title" value={titleInput} aria-label="Nombre del recurso" required onChange={(event) => setTitleInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); if (event.key === "Escape") setTitleInput(resource?.title || ""); }} /><select className="resource-visibility-select" form="resource-edit-form" name="visibility" aria-label="Visibilidad del recurso" value={isHiddenInput ? "hidden" : "visible"} onChange={(event) => setIsHiddenInput(event.target.value === "hidden")}><option value="visible">Visible para todos</option><option value="hidden">Oculto para alumnos</option></select></span>
		: resource?.title || (resource?.isDraft ? "Nuevo recurso" : "Recurso")} backHref={!editMode ? `/profesor/asignaturas/${assignmentId}` : undefined} backLabel={!editMode ? "← Asignatura" : undefined}>
		{status && <p className="status" role="status">{status}</p>}
		{resource && <>
			{saveSuccess && !editMode && <div className="course-mode-actions"><button className="button button-quiet" type="button" onClick={() => { setSaveSuccess(false); setEditMode(true); }}>Editar recurso</button></div>}
			{isTeacher && !editMode && !saveSuccess && <div className="course-mode-actions"><button className="button button-quiet" type="button" onClick={() => setEditMode(true)}>Editar recurso</button></div>}
			{isTeacher && editMode ? <section className="resource-editor">
				<div className="video-source-controls">
					<label>Fuente del video<select form="resource-edit-form" value={videoSource} onChange={(event) => { setVideoSource(event.target.value === "url" ? "url" : "file"); setSelectedVideoFile(null); setVideoThumbnailPreview(""); setThumbnailStatus(""); setVideoDuration(0); setActiveVideoEditor(null); }}><option value="file">Archivo de video</option><option value="url">URL de video</option></select></label>
					{videoSource === "file" ? <label>Seleccionar video<input form="resource-edit-form" name="video" type="file" accept="video/*" onChange={(event) => void handleVideoFileChange(event.target.files?.[0] || null)} required={!resource.videoLocalKey} /></label>
						: <label>URL del video<input form="resource-edit-form" name="videoUrl" type="url" value={videoUrlInput} onChange={(event) => setVideoUrlInput(event.target.value)} placeholder="https://..." required /></label>}
					{thumbnailStatus && <p className="status" role="status">{thumbnailStatus}</p>}
				</div>
				{currentVideoSrc ? currentVideoIsEmbed
					? <iframe ref={videoFrameRef} className="resource-player" src={toEmbedUrl(currentVideoSrc)} title={resource.title} allowFullScreen />
					: <div className="player-shell"><video ref={videoRef} className="resource-player" src={currentVideoSrc} controls poster={videoThumbnailPreview || resource.thumbnailUrl || undefined} onLoadedMetadata={(event) => { setVideoDuration(event.currentTarget.duration); event.currentTarget.currentTime = editMode ? 0 : resource.trimStart || 0; }} onTimeUpdate={(event) => { setPlaybackTime(event.currentTarget.currentTime); if (!editMode && resource.trimEnd && event.currentTarget.currentTime >= resource.trimEnd) event.currentTarget.pause(); }} />{activePopup && <aside className="video-popup" style={{ left: `${activePopup.x}%`, top: `${activePopup.y}%` }}><strong>{activePopup.title}</strong><p>{activePopup.message}</p>{activePopup.imageDataUrl && <img src={activePopup.imageDataUrl} alt="" />}{resource.materials.find((material) => material.id === activePopup.materialId)?.url && <a href={resource.materials.find((material) => material.id === activePopup.materialId)?.url} target="_blank" rel="noreferrer">Abrir material</a>}{activePopup.pauseVideo && <button className="button button-primary" onClick={() => dismissPopup(activePopup.id)}>Continuar video</button>}</aside>}</div>
					: <p className="status">Selecciona un video para ver la vista previa.</p>}
				{currentVideoSrc && <details className="video-edit-menu">
					<summary>Edición de video</summary>
					<div className="video-edit-content">
						<div className="video-edit-actions">
							<button className={`button button-quiet${activeVideoEditor === "description" ? " is-active" : ""}`} type="button" aria-expanded={activeVideoEditor === "description"} onClick={() => setActiveVideoEditor(activeVideoEditor === "description" ? null : "description")}>Descripción</button>
							<button className={`button button-quiet${activeVideoEditor === "duration" ? " is-active" : ""}`} type="button" aria-expanded={activeVideoEditor === "duration"} onClick={() => setActiveVideoEditor(activeVideoEditor === "duration" ? null : "duration")}>Duración de video</button>
							{canEditPopups && <button className={`button button-quiet${activeVideoEditor === "popups" ? " is-active" : ""}`} type="button" aria-expanded={activeVideoEditor === "popups"} onClick={() => setActiveVideoEditor(activeVideoEditor === "popups" ? null : "popups")}>Pop-ups</button>}
						</div>
						{activeVideoEditor === "duration" && <div className="video-editor-panel"><p>{videoDuration ? `Duración total: ${videoDuration.toFixed(1)} segundos` : "La duración estará disponible cuando se cargue el video."}</p><label>Tiempo de inicio (segundos)<input type="number" min="0" max={videoDuration || undefined} step="0.1" value={trimStartInput} placeholder="Tiempo original del video" onChange={(event) => setTrimStartInput(event.target.value)} /></label><label>Tiempo de fin (segundos)<input type="number" min={(Number(trimStartInput) || 0) + 0.1} max={videoDuration || undefined} step="0.1" value={trimEndInput} placeholder="Tiempo original del video" onChange={(event) => setTrimEndInput(event.target.value)} /></label></div>}
						{activeVideoEditor === "description" && <div className="video-editor-panel"><label>Descripción del recurso<textarea ref={descriptionTextareaRef} className="resource-description-input" form="resource-edit-form" name="description" value={descriptionInput} onChange={(event) => setDescriptionInput(event.target.value)} rows={1} /></label><p className="description-format-hint">Enlaza un tiempo con [01:23] y un documento adjunto con [[Nombre del documento]].</p></div>}
						{activeVideoEditor === "popups" && canEditPopups && <div className="video-editor-panel"><h3>Pop-ups temporizados</h3><form className="popup-form" onSubmit={addPopup}><input name="title" placeholder="Título" required /><input name="timestamp" type="number" min="0" step="0.1" placeholder="Segundo del video" defaultValue={Math.floor(playbackTime)} required /><textarea name="message" placeholder="Mensaje" rows={2} required /><select name="materialId" defaultValue=""><option value="">Sin documento (opcional)</option>{resource.materials.map((material) => <option key={material.id} value={material.id}>{material.title}</option>)}</select><label><input name="pauseVideo" type="checkbox" /> Pausar hasta continuar</label><label>Cierre automático (segundos)<input name="dismissAfter" type="number" min="1" max="60" defaultValue="5" /></label><button className="button button-quiet">Agregar pop-up</button></form>{resource.popups.map((popup) => <article className="management-row" key={popup.id}><span>{popup.timestamp}s · {popup.title}</span><button className="button button-danger" type="button" onClick={() => void removePopup(popup.id)}>Eliminar</button></article>)}</div>}
					</div>
				</details>}
				<form id="resource-edit-form" className="resource-edit-form" onSubmit={(event) => { event.preventDefault(); void save(); }} />
			</section> : <>
				{currentVideoSrc && (currentVideoIsEmbed
					? <iframe ref={videoFrameRef} className="resource-player" src={toEmbedUrl(currentVideoSrc)} title={resource.title} allowFullScreen />
					: <div className="player-shell"><video ref={videoRef} className="resource-player" src={currentVideoSrc} controls poster={resource.thumbnailUrl || undefined} onLoadedMetadata={(event) => { setVideoDuration(event.currentTarget.duration); event.currentTarget.currentTime = resource.trimStart || 0; }} onTimeUpdate={(event) => { setPlaybackTime(event.currentTarget.currentTime); if (resource.trimEnd && event.currentTarget.currentTime >= resource.trimEnd) event.currentTarget.pause(); }} />{activePopup && <aside className="video-popup" style={{ left: `${activePopup.x}%`, top: `${activePopup.y}%` }}><strong>{activePopup.title}</strong><p>{activePopup.message}</p>{activePopup.imageDataUrl && <img src={activePopup.imageDataUrl} alt="" />}{resource.materials.find((material) => material.id === activePopup.materialId)?.url && <a href={resource.materials.find((material) => material.id === activePopup.materialId)?.url} target="_blank" rel="noreferrer">Abrir material</a>}{activePopup.pauseVideo && <button className="button button-primary" onClick={() => dismissPopup(activePopup.id)}>Continuar video</button>}</aside>}</div>)}
				{resource.description && <ResourceDescription description={resource.description} materials={resource.materials} onSeek={seekToVideo} />}
			</>}
			{(resource.materials.length > 0 || (isTeacher && editMode)) && <section className="unit-block"><h2>Documentos adjuntos</h2>{resource.materials.map((material) => <div className="material-item" key={material.id}><div className="material-row"><MaterialLink material={material} />{isTeacher && editMode && <><button className="button button-quiet" type="button" onClick={() => openMaterialEditor(material)}>Editar documento</button><button className="button button-danger" type="button" onClick={() => void removeMaterial(material.id)}>Eliminar</button></>}</div>{editingMaterialId === material.id && <form className="material-edit-form" onSubmit={(event) => void saveMaterial(event, material.id)}>
				<label>Nombre del material<input name="title" defaultValue={material.title} required /></label>
				<label>Fuente del documento<select value={editingMaterialSource} onChange={(event) => { const source = event.target.value === "url" ? "url" : "file"; setEditingMaterialSource(source); setEditingMaterialFileIsPdf(source === "file" && isPdfMaterial(material)); }}><option value="file">Archivo local</option><option value="url">URL</option></select></label>
				{editingMaterialSource === "file" ? <label>Reemplazar archivo (opcional)<input name="file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg" onChange={(event) => { const selectedFile = event.target.files?.[0]; setEditingMaterialFileIsPdf(selectedFile ? selectedFile.name.toLocaleLowerCase().endsWith(".pdf") : isPdfMaterial(material)); }} /></label> : <label>URL del documento<input name="url" type="url" placeholder="https://..." value={editingMaterialUrl} onChange={(event) => setEditingMaterialUrl(event.target.value)} required /></label>}
				{(editingMaterialSource === "file" ? editingMaterialFileIsPdf : isPdfMaterial({ ...material, url: editingMaterialUrl })) && <label>Página inicial del PDF (opcional)<input name="pdfPage" type="number" min="1" step="1" defaultValue={isPdfMaterial(material) ? material.pdfPage || "" : ""} placeholder="Por ejemplo, 4" /></label>}
				<label>Descripción<input name="description" defaultValue={material.description || ""} placeholder="Opcional" /></label>
				<div><button className="button button-primary">Guardar cambios</button><button className="button button-quiet" type="button" onClick={() => setEditingMaterialId("")}>Cancelar</button></div>
			</form>}</div>)}{isTeacher && editMode && !materialFormOpen && <button className="button button-quiet material-add-button" type="button" onClick={() => setMaterialFormOpen(true)}><span aria-hidden="true">+</span> Adjuntar documento</button>}{isTeacher && editMode && materialFormOpen && <form className="material-upload-form" onSubmit={addMaterial}>
				<label>Nombre del material<input name="title" placeholder="Requerido" required /></label>
				<label>Fuente del documento<select value={materialSource} onChange={(event) => { setMaterialSource(event.target.value === "url" ? "url" : "file"); setMaterialFileIsPdf(false); }}><option value="file">Archivo local</option><option value="url">URL</option></select></label>
				{materialSource === "file" ? <label>Seleccionar archivo<input name="file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg" onChange={(event) => setMaterialFileIsPdf(Boolean(event.target.files?.[0]?.name.toLocaleLowerCase().endsWith(".pdf")))} required /></label> : <label>URL del documento<input name="url" type="url" placeholder="https://..." value={materialUrlInput} onChange={(event) => setMaterialUrlInput(event.target.value)} required /></label>}
				{(materialSource === "file" ? materialFileIsPdf : isPdfMaterial({ id: "", title: "", format: "Enlace", url: materialUrlInput })) && <label>Página inicial del PDF (opcional)<input name="pdfPage" type="number" min="1" step="1" placeholder="Por ejemplo, 4" /></label>}
				<label>Descripción<input name="description" placeholder="Opcional" /></label>
				<button className="button button-primary">Guardar documento</button><button className="button button-quiet" type="button" onClick={() => { setMaterialFormOpen(false); setMaterialSource("file"); setMaterialFileIsPdf(false); setMaterialUrlInput(""); }}>Cancelar</button>
			</form>}</section>}
			{isTeacher && !editMode && resource.materials.length > 0 && !currentVideoIsEmbed && <section className="popup-manager"><h2>Pop-ups temporizados</h2>{resource.popups.map((popup) => <article className="management-row" key={popup.id}><span>{popup.timestamp}s · {popup.title}</span></article>)}</section>}
			{!(isTeacher && editMode) && <section className="comments-section"><h2>Comentarios</h2>{profile && <CommentThread comments={comments} profile={profile} onReply={replyToResourceComment} />}<form className="inline-form" onSubmit={addComment}><input aria-label="Escribe un comentario" placeholder="Escribe un comentario" value={commentText} onChange={(event) => setCommentText(event.target.value)} required /><button className="button button-primary">Comentar</button></form></section>}
			{isTeacher && editMode && <div className="resource-save-actions"><button className="button button-primary" type="button" onClick={() => void save()} disabled={saveBusy}>{saveStage === "compressing" ? "Comprimiendo video..." : saveBusy ? "Guardando..." : "Guardar"}</button><button className="button button-quiet" type="button" onClick={() => void cancelEditing()} disabled={saveBusy}>Cancelar cambios</button></div>}
			{isTeacher && editMode && <section className="comments-section"><h2>Comentarios</h2>{profile && <CommentThread comments={comments} profile={profile} onReply={replyToResourceComment} />}<form className="inline-form" onSubmit={addComment}><input aria-label="Escribe un comentario" placeholder="Escribe un comentario" value={commentText} onChange={(event) => setCommentText(event.target.value)} required /><button className="button button-primary">Comentar</button></form></section>}
		</>}
	</WorkspaceLayout>;
}

/**
 * Panel administrativo para gestionar usuarios y roles del sistema.
 */
export function AdminPage() {
	const [users, setUsers] = useState<{ uid: string; email: string; displayName: string; role: string }[]>([]);
	const [assignments, setAssignments] = useState<CourseSummary[]>([]);
	const [status, setStatus] = useState("");
	const [usersLoading, setUsersLoading] = useState(true);
	const [assignmentsLoading, setAssignmentsLoading] = useState(true);
	const [usersError, setUsersError] = useState("");
	const [assignmentsError, setAssignmentsError] = useState("");
	const [search, setSearch] = useState("");
	const [assignmentTitle, setAssignmentTitle] = useState("");
	const [assignmentTeacher, setAssignmentTeacher] = useState("");
	const [assignmentCover, setAssignmentCover] = useState<File | null>(null);
	const [assignmentCoverPreview, setAssignmentCoverPreview] = useState("");
	const [assignmentBusy, setAssignmentBusy] = useState(false);
	const [editingAssignmentId, setEditingAssignmentId] = useState("");
	const [editingAssignmentTitle, setEditingAssignmentTitle] = useState("");
	const [editingAssignmentCover, setEditingAssignmentCover] = useState<File | null>(null);
	const [editingAssignmentCoverPreview, setEditingAssignmentCoverPreview] = useState("");
	const [assignmentActionBusyId, setAssignmentActionBusyId] = useState("");
	const [teacherEmail, setTeacherEmail] = useState("");
	const [teacherName, setTeacherName] = useState("");
	const [teacherPassword, setTeacherPassword] = useState("");
	const teachers = users.filter((user) => user.role === "profesor");
	const filteredUsers = users.filter((user) => `${user.displayName} ${user.email}`.toLowerCase().includes(search.toLowerCase()));
	const loadUsers = async () => {
		const snapshot = await getDocs(collection(db, "usuarios"));
		setUsers(snapshot.docs.map((item) => ({ uid: item.id, email: String(item.data().email || ""), displayName: String(item.data().displayName || item.data().nombre || "Sin nombre"), role: String(item.data().role || "alumno") })));
		setUsersError("");
		setUsersLoading(false);
	};
	const loadAssignments = async () => {
		const snapshot = await getDocs(collection(db, "asignaturas"));
		setAssignments(snapshot.docs.map((item) => {
			const data = item.data();
			return {
				id: item.id,
				title: String(data.course?.title || "Asignatura sin nombre"),
				description: String(data.course?.description || ""),
				coverUrl: String(data.course?.coverUrl || ""),
				coverLocalKey: typeof data.course?.coverLocalKey === "string" ? data.course.coverLocalKey : undefined,
				ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : undefined,
				published: data.published === true
			};
		}));
		setAssignmentsError("");
		setAssignmentsLoading(false);
	};
	useEffect(() => {
		void loadUsers().catch((error: unknown) => {
			console.error("No se pudieron cargar usuarios:", error);
			setUsersError(`No se pudieron cargar usuarios${error instanceof Error ? `: ${error.message}` : ". Revisa las reglas de Firebase."}`);
			setUsersLoading(false);
		});
		void loadAssignments().catch((error: unknown) => {
			console.error("No se pudieron cargar asignaturas:", error);
			setAssignmentsError(`No se pudieron cargar asignaturas${error instanceof Error ? `: ${error.message}` : ". Revisa las reglas de Firebase."}`);
			setAssignmentsLoading(false);
		});
	}, []);
	useEffect(() => {
		if (!assignmentCover) {
			setAssignmentCoverPreview("");
			return;
		}
		const previewUrl = URL.createObjectURL(assignmentCover);
		setAssignmentCoverPreview(previewUrl);
		return () => URL.revokeObjectURL(previewUrl);
	}, [assignmentCover]);
	useEffect(() => {
		if (!editingAssignmentCover) {
			setEditingAssignmentCoverPreview("");
			return;
		}
		const previewUrl = URL.createObjectURL(editingAssignmentCover);
		setEditingAssignmentCoverPreview(previewUrl);
		return () => URL.revokeObjectURL(previewUrl);
	}, [editingAssignmentCover]);
	async function createNewAssignment(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!assignmentTitle.trim() || !assignmentTeacher || !assignmentCover) return;
		const formElement = event.currentTarget;
		if (!["image/jpeg", "image/png", "image/webp"].includes(assignmentCover.type)) {
			setStatus("La miniatura debe estar en formato JPG, PNG o WebP.");
			return;
		}
		if (assignmentCover.size >= 5 * 1024 * 1024) {
			setStatus("La miniatura debe pesar menos de 5 MB.");
			return;
		}

		setAssignmentBusy(true);
		const coverLocalKey = crypto.randomUUID();
		let coverSaved = false;
		let createdAssignment = false;
		try {
			setStatus("Guardando miniatura en este navegador...");
			await saveCourseCover(coverLocalKey, assignmentCover);
			coverSaved = true;
			setStatus("Creando asignatura...");
			const title = assignmentTitle.trim();
			const assignmentId = await createAssignment(title, assignmentTeacher, coverLocalKey);
			createdAssignment = true;
			setAssignments((current) => [...current, {
				id: assignmentId,
				title,
				coverLocalKey,
				ownerUid: assignmentTeacher,
				published: true
			}]);
			setAssignmentTitle("");
			setAssignmentTeacher("");
			setAssignmentCover(null);
			formElement.reset();
			setStatus("Asignatura creada y asignada al profesor.");
		} catch (error) {
			console.error(error);
			if (coverSaved && !createdAssignment) {
				await deleteCourseCover(coverLocalKey).catch((cleanupError: unknown) => console.warn("No se pudo limpiar la miniatura guardada.", cleanupError));
			}
			setStatus(error instanceof Error ? `No se pudo crear la asignatura: ${error.message}` : "No se pudo crear la asignatura.");
		} finally {
			setAssignmentBusy(false);
		}
	}
	function startEditingAssignment(assignment: CourseSummary) {
		setEditingAssignmentId(assignment.id);
		setEditingAssignmentTitle(assignment.title);
		setEditingAssignmentCover(null);
	}
	function cancelEditingAssignment() {
		setEditingAssignmentId("");
		setEditingAssignmentTitle("");
		setEditingAssignmentCover(null);
	}
	async function saveAssignmentDetails(event: FormEvent<HTMLFormElement>, assignment: CourseSummary) {
		event.preventDefault();
		const title = editingAssignmentTitle.trim();
		if (!title) return;
		setAssignmentActionBusyId(assignment.id);
		const newCoverKey = editingAssignmentCover ? crypto.randomUUID() : undefined;
		let newCoverSaved = false;
		try {
			if (editingAssignmentCover && newCoverKey) {
				await saveCourseCover(newCoverKey, editingAssignmentCover);
				newCoverSaved = true;
			}
			await updateAssignmentDetails(assignment.id, title, newCoverKey);
			setAssignments((current) => current.map((item) => item.id === assignment.id
				? { ...item, title, ...(newCoverKey ? { coverLocalKey: newCoverKey, coverUrl: "" } : {}) }
				: item));
			if (newCoverKey && assignment.coverLocalKey) {
				await deleteCourseCover(assignment.coverLocalKey).catch((error: unknown) => console.warn("No se pudo eliminar la miniatura anterior.", error));
			}
			setStatus("Asignatura actualizada.");
			cancelEditingAssignment();
		} catch (error) {
			console.error("No se pudo actualizar la asignatura:", error);
			if (newCoverSaved && newCoverKey) {
				await deleteCourseCover(newCoverKey).catch((cleanupError: unknown) => console.warn("No se pudo limpiar la nueva miniatura.", cleanupError));
			}
			setStatus(error instanceof Error ? `No se pudo actualizar la asignatura: ${error.message}` : "No se pudo actualizar la asignatura.");
		} finally {
			setAssignmentActionBusyId("");
		}
	}
	async function removeAssignment(assignment: CourseSummary) {
		if (!window.confirm(`¿Eliminar la asignatura “${assignment.title}” y todos sus recursos?`)) return;
		setAssignmentActionBusyId(assignment.id);
		try {
			await deleteAssignment(assignment.id);
			setAssignments((current) => current.filter((item) => item.id !== assignment.id));
			if (assignment.coverLocalKey) {
				await deleteCourseCover(assignment.coverLocalKey).catch((error: unknown) => console.warn("No se pudo eliminar la miniatura local.", error));
			}
			setStatus("Asignatura y recursos eliminados.");
			if (editingAssignmentId === assignment.id) cancelEditingAssignment();
		} catch (error) {
			console.error("No se pudo eliminar la asignatura:", error);
			setStatus(error instanceof Error ? `No se pudo eliminar la asignatura: ${error.message}` : "No se pudo eliminar la asignatura.");
		} finally {
			setAssignmentActionBusyId("");
		}
	}
	async function changeRole(uid: string, role: string) {
		try { await updateDoc(doc(db, "usuarios", uid), { role }); await loadUsers(); setStatus("Rol actualizado."); }
		catch (error) { console.error(error); setStatus("No se pudo actualizar el rol."); }
	}
	async function removeUser(uid: string) {
		if (!window.confirm("¿Eliminar el perfil de este usuario?")) return;
		if (uid === auth.currentUser?.uid) { setStatus("No puedes eliminar tu propio perfil activo."); return; }
		try { await deleteDoc(doc(db, "usuarios", uid)); await loadUsers(); setStatus("Perfil eliminado."); }
		catch (error) { console.error(error); setStatus("No se pudo eliminar el perfil."); }
	}
	async function createTeacher(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const secondaryName = "VideotecaAdminSecondary";
		const secondaryApp = getApps().find((app) => app.name === secondaryName) || initializeApp(auth.app.options, secondaryName);
		const secondaryAuth = getAuth(secondaryApp);
		try {
			const credential = await createUserWithEmailAndPassword(secondaryAuth, teacherEmail.trim(), teacherPassword);
			await setDoc(doc(db, "usuarios", credential.user.uid), { displayName: teacherName.trim(), email: teacherEmail.trim(), role: "profesor", createdAt: new Date().toISOString() });
			await signOut(secondaryAuth);
			await loadUsers();
			setTeacherEmail(""); setTeacherName(""); setTeacherPassword(""); setStatus("Cuenta de profesor creada.");
		} catch (error) { console.error(error); setStatus(error instanceof Error ? error.message : "No se pudo crear el profesor."); }
	}
	return <WorkspaceLayout title="Gestión de usuarios">
		{status && <p className="status" role="status">{status}</p>}
		{usersError && <p className="status" role="alert">{usersError}</p>}
		{assignmentsError && <p className="status" role="alert">{assignmentsError}</p>}
		<section className="assignment-management">
			<h2>Asignaturas existentes</h2>
			{assignmentsLoading
				? <p className="muted" role="status">Cargando asignaturas...</p>
				: assignments.length === 0 && !assignmentsError
				? <p className="muted">No hay asignaturas creadas.</p>
				: <div className="management-list">{assignments.map((assignment) => {
					const teacher = users.find((user) => user.uid === assignment.ownerUid);
					return <article className="management-row" key={assignment.id}>
						{editingAssignmentId === assignment.id
							? <form className="assignment-edit-form" onSubmit={(event) => void saveAssignmentDetails(event, assignment)}>
								<CourseThumbnail course={assignment} className="assignment-cover-preview" />
								<label>Nombre de la asignatura<input maxLength={80} value={editingAssignmentTitle} onChange={(event) => setEditingAssignmentTitle(event.target.value)} required /></label>
								<label>Nueva miniatura (opcional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setEditingAssignmentCover(event.target.files?.[0] || null)} /></label>
								{editingAssignmentCoverPreview && <img className="assignment-cover-preview" src={editingAssignmentCoverPreview} alt="Vista previa de la nueva miniatura" />}
								<div><button className="button button-primary" disabled={assignmentActionBusyId === assignment.id}>{assignmentActionBusyId === assignment.id ? "Guardando..." : "Guardar cambios"}</button><button className="button button-quiet" type="button" onClick={cancelEditingAssignment} disabled={assignmentActionBusyId === assignment.id}>Cancelar</button></div>
							</form>
							: <><span><CourseThumbnail course={assignment} className="assignment-cover-preview" /><strong>{assignment.title}</strong><small>{teacher ? `Profesor: ${teacher.displayName} · ${teacher.email}` : "Profesor no disponible"}</small></span><div><button className="button button-quiet" onClick={() => startEditingAssignment(assignment)} disabled={Boolean(assignmentActionBusyId)}>Modificar</button><button className="button button-danger" onClick={() => void removeAssignment(assignment)} disabled={Boolean(assignmentActionBusyId)}>{assignmentActionBusyId === assignment.id ? "Eliminando..." : "Eliminar"}</button></div></>}
					</article>;
				})}</div>}
		</section>
		<section className="assignment-management">
			<h2>Nueva asignatura</h2>
			<form className="assignment-create-form" onSubmit={createNewAssignment}>
				<label>Nombre de la asignatura<input maxLength={80} value={assignmentTitle} onChange={(event) => setAssignmentTitle(event.target.value)} required /></label>
				<label>Profesor responsable<select value={assignmentTeacher} onChange={(event) => setAssignmentTeacher(event.target.value)} required><option value="" disabled>Selecciona un profesor</option>{teachers.map((teacher) => <option key={teacher.uid} value={teacher.uid}>{teacher.displayName} · {teacher.email}</option>)}</select></label>
				<label>Miniatura (JPG, PNG o WebP, máximo 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setAssignmentCover(event.target.files?.[0] || null)} required /></label>
				{assignmentCoverPreview && <img className="assignment-cover-preview" src={assignmentCoverPreview} alt="Vista previa de la miniatura" />}
				<button className="button button-primary" disabled={assignmentBusy || teachers.length === 0}>{assignmentBusy ? "Creando..." : "Crear asignatura"}</button>
				{teachers.length === 0 && <p className="muted">Primero crea una cuenta de profesor para poder asignarle la asignatura.</p>}
			</form>
		</section>
		<form className="teacher-form" onSubmit={createTeacher}><input type="email" placeholder="Correo docente" value={teacherEmail} onChange={(event) => setTeacherEmail(event.target.value)} required /><input placeholder="Nombre" value={teacherName} onChange={(event) => setTeacherName(event.target.value)} required /><input type="password" minLength={6} placeholder="Contraseña inicial" value={teacherPassword} onChange={(event) => setTeacherPassword(event.target.value)} required /><button className="button button-primary">Crear profesor</button></form>
		<label className="search-label">Buscar usuario<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
		<h2>Usuarios registrados</h2>
		{usersLoading
			? <p className="muted" role="status">Cargando usuarios...</p>
			: <div className="management-list">{filteredUsers.map((user) => <article className="management-row" key={user.uid}><span><strong>{user.displayName}</strong><small>{user.email}</small></span><div><select aria-label={`Rol de ${user.email}`} value={user.role} onChange={(event) => void changeRole(user.uid, event.target.value)}><option value="alumno">Alumno</option><option value="profesor">Profesor</option><option value="admin">Admin</option></select><button className="button button-danger" onClick={() => void removeUser(user.uid)}>Eliminar perfil</button></div></article>)}</div>}
	</WorkspaceLayout>;
}

function toEmbedUrl(url: string): string {
	try {
		const parsed = new URL(url);
		if (parsed.hostname.includes("youtube.com")) return `https://www.youtube.com/embed/${parsed.searchParams.get("v") || ""}`;
		if (parsed.hostname === "youtu.be") return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`;
	} catch { return url; }
	return url;
}