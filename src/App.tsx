import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import type { UserRole } from "./types";
import { LoginPage, RegisterPage } from "./pages/AccessPages";

const AdminPage = lazy(() => import("./pages/WorkspacePages").then((module) => ({ default: module.AdminPage })));
const CoursePage = lazy(() => import("./pages/WorkspacePages").then((module) => ({ default: module.CoursePage })));
const ProfessorPage = lazy(() => import("./pages/WorkspacePages").then((module) => ({ default: module.ProfessorPage })));
const ResourcePage = lazy(() => import("./pages/WorkspacePages").then((module) => ({ default: module.ResourcePage })));
const StudentPage = lazy(() => import("./pages/WorkspacePages").then((module) => ({ default: module.StudentPage })));

function LoadingScreen() {
	return <main className="center-screen"><p role="status">Verificando sesión...</p></main>;
}

function RoleGate({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
	const { user, profile, loading } = useAuth();
	const location = useLocation();
	if (loading) return <LoadingScreen />;
	if (!user || !profile) return <Navigate to="/login" replace state={{ from: location }} />;
	if (!roles.includes(profile.role)) return <Navigate to={homeForRole(profile.role)} replace />;
	return children;
}

function homeForRole(role: UserRole) {
	return role === "admin" ? "/admin" : role === "profesor" ? "/profesor" : "/alumno";
}

function LandingRedirect() {
	const { user, profile, loading } = useAuth();
	if (loading) return <LoadingScreen />;
	return <Navigate to={user && profile ? homeForRole(profile.role) : "/login"} replace />;
}

function LegacyCourseRedirect() {
	const [params] = useSearchParams();
	return <Navigate to={`/profesor/asignaturas/${encodeURIComponent(params.get("asignatura") || "asignatura-1")}`} replace />;
}

function LegacyResourceRedirect() {
	const [params] = useSearchParams();
	const assignmentId = encodeURIComponent(params.get("asignatura") || "asignatura-1");
	const resourceId = params.get("recurso");
	return <Navigate to={resourceId ? `/profesor/asignaturas/${assignmentId}/recursos/${encodeURIComponent(resourceId)}` : `/profesor/asignaturas/${assignmentId}`} replace />;
}

export default function App() {
	return (
		<Suspense fallback={<LoadingScreen />}>
			<Routes>
				<Route path="/" element={<LandingRedirect />} />
				<Route path="/login" element={<LoginPage />} />
				<Route path="/login.html" element={<LoginPage />} />
				<Route path="/registro" element={<RegisterPage />} />
				<Route path="/registro.html" element={<RegisterPage />} />
				<Route path="/index.html" element={<LandingRedirect />} />
				<Route path="/alumno" element={<RoleGate roles={["alumno"]}><StudentPage /></RoleGate>} />
				<Route path="/profesor" element={<RoleGate roles={["profesor"]}><ProfessorPage /></RoleGate>} />
				<Route path="/Vista/Profesor/main.html" element={<RoleGate roles={["profesor"]}><ProfessorPage /></RoleGate>} />
				<Route path="/Vista/Profesor/asignatura-1.html" element={<RoleGate roles={["profesor", "alumno"]}><LegacyCourseRedirect /></RoleGate>} />
				<Route path="/Vista/Profesor/recurso.html" element={<RoleGate roles={["profesor", "alumno"]}><LegacyResourceRedirect /></RoleGate>} />
				<Route path="/profesor/asignaturas/:assignmentId" element={<RoleGate roles={["profesor", "alumno"]}><CoursePage /></RoleGate>} />
				<Route path="/profesor/asignaturas/:assignmentId/recursos/:resourceId" element={<RoleGate roles={["profesor", "alumno"]}><ResourcePage /></RoleGate>} />
				<Route path="/admin" element={<RoleGate roles={["admin"]}><AdminPage /></RoleGate>} />
				<Route path="/Vista/Admin/admin.html" element={<RoleGate roles={["admin"]}><AdminPage /></RoleGate>} />
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
		</Suspense>
	);
}