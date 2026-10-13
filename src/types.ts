/**
 * Tipos compartidos del dominio de la videoteca.
 *
 * Aquí se modelan los perfiles de usuario, las asignaturas, los recursos y los
 * comentarios para que la UI y los servicios trabajen con una estructura
 * consistente.
 */
export type UserRole = "alumno" | "profesor" | "admin";

export interface UserProfile {
	uid: string;
	email: string;
	displayName: string;
	role: UserRole;
}

export interface CourseSummary {
	id: string;
	title: string;
	description?: string;
	coverUrl?: string;
	ownerUid?: string;
	published?: boolean;
	estudiantesInscritos?: string[];
}

export interface CourseUnit {
	id: string;
	name: string;
}

export interface ResourceSummary {
	id: string;
	title: string;
	description?: string;
	thumbnailUrl?: string;
	duration?: string;
	unitId: string;
	unit: string;
	isHidden: boolean;
	isDraft: boolean;
	videoUrl?: string;
	videoLocalKey?: string;
	trimStart?: number;
	trimEnd?: number | null;
	materials: ResourceMaterial[];
	popups: ResourcePopup[];
}

export interface ResourceMaterial {
	id: string;
	title: string;
	format: string;
	description?: string;
	url?: string;
	localKey?: string;
}

export interface ResourcePopup {
	id: string;
	title: string;
	message: string;
	timestamp: number;
	materialId: string;
	pauseVideo: boolean;
	dismissAfter: number | null;
	x: number;
	y: number;
	imageDataUrl?: string;
	imageName?: string;
	highlightEnabled?: boolean;
	highlightX?: number;
	highlightY?: number;
}

export interface CourseComment {
	id: string;
	authorUid?: string;
	author?: string;
	authorEmail?: string;
	text: string;
	createdAt: string;
	parentId?: string;
}