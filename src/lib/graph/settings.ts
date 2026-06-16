import { SIM_DEFAULTS, type SimParams } from './sim';

export interface GraphSettingsSnapshot extends SimParams {
	nodeScale: number;
	hideOrphans: boolean;
	searchQuery: string;
}

export function defaultGraphSettings(): GraphSettingsSnapshot {
	return {
		nodeScale: SIM_DEFAULTS.nodeScale,
		repulse: SIM_DEFAULTS.repulse,
		linkForce: SIM_DEFAULTS.linkForce,
		linkDist: SIM_DEFAULTS.linkDist,
		centerForce: SIM_DEFAULTS.centerForce,
		hideOrphans: false,
		searchQuery: ''
	};
}

export function graphSettingsSnapshot(settings: GraphSettingsSnapshot): GraphSettingsSnapshot {
	return {
		nodeScale: settings.nodeScale,
		repulse: settings.repulse,
		linkForce: settings.linkForce,
		linkDist: settings.linkDist,
		centerForce: settings.centerForce,
		hideOrphans: settings.hideOrphans,
		searchQuery: settings.searchQuery
	};
}

export function applyGraphSettings(
	target: GraphSettingsSnapshot,
	settings: Partial<GraphSettingsSnapshot>
): void {
	if (settings.nodeScale !== undefined) target.nodeScale = settings.nodeScale;
	if (settings.repulse !== undefined) target.repulse = settings.repulse;
	if (settings.linkForce !== undefined) target.linkForce = settings.linkForce;
	if (settings.linkDist !== undefined) target.linkDist = settings.linkDist;
	if (settings.centerForce !== undefined) target.centerForce = settings.centerForce;
	if (settings.hideOrphans !== undefined) target.hideOrphans = settings.hideOrphans;
	if (settings.searchQuery !== undefined) target.searchQuery = settings.searchQuery;
}

export function resetGraphForceSettings(settings: GraphSettingsSnapshot): void {
	const defaults = defaultGraphSettings();
	settings.nodeScale = defaults.nodeScale;
	settings.repulse = defaults.repulse;
	settings.linkForce = defaults.linkForce;
	settings.linkDist = defaults.linkDist;
	settings.centerForce = defaults.centerForce;
}

export function resetGraphFilterSettings(settings: GraphSettingsSnapshot): void {
	const defaults = defaultGraphSettings();
	settings.hideOrphans = defaults.hideOrphans;
	settings.searchQuery = defaults.searchQuery;
}

export function graphSettingsStorageKey(vaultId: string): string {
	return `diamondmd:graph-settings:${vaultId}`;
}

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

function readNumber(source: Record<string, unknown>, key: keyof SimParams | 'nodeScale'): number | undefined {
	const value = source[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function parseGraphSettings(raw: string | null): Partial<GraphSettingsSnapshot> {
	if (!raw) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}

	const source = record(parsed);
	if (!source) return {};

	const settings: Partial<GraphSettingsSnapshot> = {};
	for (const key of ['nodeScale', 'repulse', 'linkForce', 'linkDist', 'centerForce'] as const) {
		const value = readNumber(source, key);
		if (value !== undefined) settings[key] = value;
	}
	if (typeof source.hideOrphans === 'boolean') settings.hideOrphans = source.hideOrphans;
	if (typeof source.searchQuery === 'string') settings.searchQuery = source.searchQuery;
	return settings;
}
