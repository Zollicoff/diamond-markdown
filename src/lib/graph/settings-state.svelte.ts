import {
	applyGraphSettings,
	defaultGraphSettings,
	graphSettingsSnapshot,
	graphSettingsStorageKey,
	parseGraphSettings,
	resetGraphFilterSettings,
	resetGraphForceSettings,
	type GraphSettingsSnapshot
} from './settings';

export interface GraphSettingsState {
	settings: GraphSettingsSnapshot;
	hydrate: () => void;
	persist: () => void;
	resetForces: () => void;
	resetFilters: () => void;
}

export function createGraphSettingsState(vaultId: () => string): GraphSettingsState {
	const settings = $state<GraphSettingsSnapshot>(defaultGraphSettings());
	let hydrated = $state(false);

	function storageKey(): string {
		return graphSettingsStorageKey(vaultId());
	}

	function hydrate(): void {
		if (typeof localStorage === 'undefined') {
			hydrated = true;
			return;
		}
		applyGraphSettings(settings, parseGraphSettings(localStorage.getItem(storageKey())));
		hydrated = true;
	}

	function persist(): void {
		if (!hydrated || typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(storageKey(), JSON.stringify(graphSettingsSnapshot(settings)));
		} catch { /* quota / private mode */ }
	}

	return {
		settings,
		hydrate,
		persist,
		resetForces: () => resetGraphForceSettings(settings),
		resetFilters: () => resetGraphFilterSettings(settings)
	};
}
