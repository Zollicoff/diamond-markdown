import {
	defaultTreePanelPreferences,
	parseTreeExpansion,
	parseTreePanelPreferences,
	treeExpansionStorageKey,
	treePanelPreferencesSnapshot,
	treePreferencesStorageKey,
	type TreePanelPreferences
} from './view';

export interface TreePanelState {
	prefs: TreePanelPreferences;
	expanded: Set<string>;
	hydrate: () => void;
	persistPreferences: () => void;
	persistExpansion: () => void;
}

export function createTreePanelState(
	vaultId: () => string,
	defaultExpanded: () => Set<string>
): TreePanelState {
	const prefs = $state<TreePanelPreferences>(defaultTreePanelPreferences());
	let expanded = $state<Set<string>>(new Set());
	let hydrated = $state(false);

	function hydrate(): void {
		if (typeof localStorage === 'undefined') {
			expanded = defaultExpanded();
			hydrated = true;
			return;
		}

		try {
			Object.assign(prefs, parseTreePanelPreferences(localStorage.getItem(treePreferencesStorageKey(vaultId()))));
			expanded = parseTreeExpansion(localStorage.getItem(treeExpansionStorageKey(vaultId()))) ?? defaultExpanded();
		} catch {
			expanded = defaultExpanded();
		}
		hydrated = true;
	}

	function persistPreferences(): void {
		if (!hydrated || typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(treePreferencesStorageKey(vaultId()), JSON.stringify(treePanelPreferencesSnapshot(prefs)));
		} catch { /* quota */ }
	}

	function persistExpansion(): void {
		if (!hydrated || typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(treeExpansionStorageKey(vaultId()), JSON.stringify([...expanded]));
		} catch { /* quota */ }
	}

	return {
		prefs,
		get expanded() {
			return expanded;
		},
		set expanded(next: Set<string>) {
			expanded = next;
		},
		hydrate,
		persistPreferences,
		persistExpansion
	};
}
