import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import type { UserProfile, UserRole } from "../types";

interface AuthContextValue {
	user: User | null;
	profile: UserProfile | null;
	loading: boolean;
	error: string;
	logout: () => Promise<void>;
	refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const roles = new Set<UserRole>(["alumno", "profesor", "admin"]);

export function AuthProvider({ children }: PropsWithChildren) {
	const [user, setUser] = useState<User | null>(null);
	const [profile, setProfile] = useState<UserProfile | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	async function refreshProfile() {
		const currentUser = auth.currentUser;
		if (!currentUser) return;
		setLoading(true);
		try {
			const snapshot = await getDoc(doc(db, "usuarios", currentUser.uid));
			const data = snapshot.data();
			if (snapshot.exists() && data && roles.has(data.role)) {
				setUser(currentUser);
				setProfile({ uid: currentUser.uid, email: currentUser.email || "", displayName: data.displayName || data.nombre || currentUser.displayName || "Usuario", role: data.role });
				setProfile({ uid: currentUser.uid, email: currentUser.email || "", displayName: data.displayName || data.nombre || currentUser.displayName || currentUser.email?.split("@")[0] || "Participante", role: data.role });
				setError("");
			} else {
				setProfile(null);
				setError("La cuenta no tiene un perfil o rol válido.");
			}
		} catch (authError) {
			console.error("No se pudo cargar el perfil:", authError);
			setError("No se pudo verificar el perfil en Firebase.");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		let active = true;
		const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
			if (!active) return;
			setLoading(true);
			setUser(nextUser);
			setProfile(null);
			setError("");
			if (!nextUser) {
				setLoading(false);
				return;
			}

			try {
				const profileSnapshot = await getDoc(doc(db, "usuarios", nextUser.uid));
				const data = profileSnapshot.data();
				if (active && profileSnapshot.exists() && data && roles.has(data.role)) {
					setProfile({
						uid: nextUser.uid,
						email: nextUser.email || "",
						displayName: data.displayName || data.nombre || nextUser.displayName || nextUser.email?.split("@")[0] || "Participante",
						role: data.role
					});
				} else if (active) {
					setError("La cuenta no tiene un perfil o rol válido.");
				}
			} catch (authError) {
				console.error("No se pudo cargar el perfil:", authError);
				if (active) setError("No se pudo verificar el perfil en Firebase.");
			} finally {
				if (active) setLoading(false);
			}
		});

		return () => {
			active = false;
			unsubscribe();
		};
	}, []);

	const value: AuthContextValue = {
		user,
		profile,
		loading,
		error,
		logout: () => signOut(auth),
		refreshProfile
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
	const context = useContext(AuthContext);
	if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider.");
	return context;
}