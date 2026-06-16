import fs from 'node:fs';
import path from 'node:path';
import type {
	JsonFileStatus,
	ObsidianGraphInfo,
	ObsidianGraphSetting,
	VaultImportCheckLevel
} from '$lib/types';

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

function readJsonFile(abs: string): { status: JsonFileStatus; value?: unknown; bytes?: number } {
	if (!fs.existsSync(abs)) return { status: 'missing' };
	let content = '';
	try {
		content = fs.readFileSync(abs, 'utf-8');
		return { status: 'present', value: JSON.parse(content) as unknown, bytes: Buffer.byteLength(content, 'utf-8') };
	} catch {
		return { status: 'invalid', bytes: content ? Buffer.byteLength(content, 'utf-8') : undefined };
	}
}

function setting(
	id: string,
	label: string,
	value: string,
	detail: string,
	level: VaultImportCheckLevel = 'info'
): ObsidianGraphSetting {
	return { id, label, value, detail, level };
}

function safeDisplayString(value: unknown, maxLength = 160): string | null {
	if (typeof value !== 'string') return null;
	const text = value.trim();
	if (!text || text.includes('\0') || text.length > maxLength) return null;
	return text;
}

function booleanValue(value: unknown): boolean | null {
	return typeof value === 'boolean' ? value : null;
}

function finiteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function compactNumber(value: number): string {
	return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function colorGroupCount(value: unknown): number {
	return Array.isArray(value) ? value.length : 0;
}

export function readObsidianGraphConfig(root: string): ObsidianGraphInfo {
	const relPath = '.obsidian/graph.json';
	const graphFile = readJsonFile(path.join(root, relPath));
	const base: ObsidianGraphInfo = {
		path: graphFile.status === 'missing' ? undefined : relPath,
		status: graphFile.status,
		bytes: graphFile.bytes,
		colorGroupCount: 0,
		settings: [],
		warnings: []
	};

	if (graphFile.status === 'missing') return base;
	if (graphFile.status === 'invalid') {
		base.warnings.push('.obsidian/graph.json is present but is not valid JSON.');
		return base;
	}

	const body = record(graphFile.value);
	if (!body) {
		base.status = 'invalid';
		base.warnings.push('.obsidian/graph.json is present but does not contain a JSON object.');
		return base;
	}

	const searchQuery = safeDisplayString(body.search);
	if (searchQuery) {
		base.searchQuery = searchQuery;
		base.settings.push(setting(
			'search',
			'Graph search filter',
			searchQuery,
			'Reported for migration planning. Recreate this in Diamond with the Graph settings search filter.'
		));
	} else if (typeof body.search === 'string' && body.search.trim()) {
		base.warnings.push('Obsidian graph search filter was ignored because it was empty, too long, or unsafe.');
	}

	const showOrphans = booleanValue(body.showOrphans);
	if (showOrphans !== null) {
		base.showOrphans = showOrphans;
		base.settings.push(setting(
			'showOrphans',
			'Orphan notes',
			showOrphans ? 'Shown' : 'Hidden',
			showOrphans
				? 'Diamond shows orphan notes by default; use the Graph filter panel to hide them.'
				: 'Diamond can match this with the Graph filter panel Hide orphans toggle.'
		));
	}

	const showAttachments = booleanValue(body.showAttachments);
	if (showAttachments !== null) {
		base.showAttachments = showAttachments;
		base.settings.push(setting(
			'showAttachments',
			'Attachment graph nodes',
			showAttachments ? 'Shown in Obsidian' : 'Hidden',
			showAttachments
				? 'Diamond preserves and previews attachments, but the graph currently focuses on notes and note links.'
				: 'Diamond graph currently focuses on notes and note links.',
			showAttachments ? 'warn' : 'info'
		));
	}

	const showTags = booleanValue(body.showTags);
	if (showTags !== null) {
		base.showTags = showTags;
		base.settings.push(setting(
			'showTags',
			'Tag graph nodes',
			showTags ? 'Shown in Obsidian' : 'Hidden',
			showTags
				? 'Diamond indexes tags and has a Tags tab, but the graph currently does not render tag nodes.'
				: 'Diamond tags remain available through tag indexing and the Tags tab.',
			showTags ? 'warn' : 'info'
		));
	}

	const hideUnresolved = booleanValue(body.hideUnresolved);
	if (hideUnresolved !== null) {
		base.hideUnresolved = hideUnresolved;
		base.settings.push(setting(
			'hideUnresolved',
			'Unresolved links',
			hideUnresolved ? 'Hidden' : 'Shown in Obsidian',
			hideUnresolved
				? 'Diamond graph only draws links between resolved notes today.'
				: 'Diamond graph currently does not add separate unresolved-link nodes.',
			hideUnresolved ? 'info' : 'warn'
		));
	}

	base.colorGroupCount = colorGroupCount(body.colorGroups);
	if (base.colorGroupCount > 0) {
		base.settings.push(setting(
			'colorGroups',
			'Graph color groups',
			`${base.colorGroupCount} group${base.colorGroupCount === 1 ? '' : 's'}`,
			'Preserved in Obsidian config. Diamond reports the count but does not import custom graph color rules.',
			'warn'
		));
	}

	for (const [key, label, detail] of [
		['nodeSizeMultiplier', 'Node size multiplier', 'Reported for comparison with Diamond graph node-size controls.'],
		['lineSizeMultiplier', 'Line size multiplier', 'Reported for comparison; Diamond graph line styling is separate.'],
		['textFadeMultiplier', 'Text fade multiplier', 'Reported for migration planning; Diamond graph labels use its own display rules.'],
		['centerStrength', 'Center force', 'Reported for comparison with Diamond graph force controls.'],
		['repelStrength', 'Repel force', 'Reported for comparison with Diamond graph force controls.'],
		['linkStrength', 'Link force', 'Reported for comparison with Diamond graph force controls.'],
		['linkDistance', 'Link distance', 'Reported for comparison with Diamond graph force controls.'],
		['scale', 'Graph zoom scale', 'Reported for migration planning; Diamond graph viewport state remains separate.']
	] as const) {
		const value = finiteNumber(body[key]);
		if (value === null) continue;
		base[key] = value;
		base.settings.push(setting(key, label, compactNumber(value), detail));
	}

	return base;
}
