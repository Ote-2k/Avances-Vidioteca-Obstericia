// ==========================================================================
// HOOKS BÁSICOS REUTILIZABLES (JAVASCRIPT VANILLA)
// ==========================================================================

/**
 * Hook para gestionar el estado de variables y reaccionar automáticamente a los cambios.
 * @param {*} initialValue Estado inicial
 * @param {Function} onStateChange Callback que se ejecuta cuando el estado cambia
 * @returns {Array} [getState, setState]
 */
export function useState(initialValue, onStateChange = null) {
	let state = initialValue;

	const getState = () => state;

	const setState = (newValue) => {
		const nextState = typeof newValue === "function" ? newValue(state) : newValue;
		if (state !== nextState) {
			state = nextState;
			if (typeof onStateChange === "function") {
				onStateChange(state);
			}
		}
	};

	return [getState, setState];
}

/**
 * Hook para manejar efectos secundarios (sincronización con Firestore, eventos globales, etc.)
 * @param {Function} effectFn Función que ejecuta el efecto
 * @param {Array} deps Lista de dependencias (simulada)
 */
export function useEffect(effectFn, deps = []) {
	// Ejecutamos el efecto y capturamos una posible función de limpieza (cleanup)
	const cleanup = effectFn();

	// Si el efecto devuelve una función de limpieza, la vinculamos al desmontar o cerrar página
	if (typeof cleanup === "function") {
		window.addEventListener("beforeunload", cleanup, { once: true });
	}
}