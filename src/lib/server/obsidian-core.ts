import fs from 'node:fs';
import path from 'node:path';
import type {
	JsonFileStatus,
	ObsidianCorePluginEntry,
	ObsidianCorePluginSupport,
	ObsidianCorePluginsInfo,
	ObsidianHotkeyCommand,
	ObsidianHotkeysInfo,
	VaultImportCheckLevel
} from '$lib/types';

const MAX_HOTKEY_COMMANDS = 40;
const SAFE_COMMAND_ID = /^[A-Za-z0-9:_./-]{1,120}$/;
const SAFE_HOTKEY_PART = /^[A-Za-z0-9_+\-[\]().,/;'"`\\ ]{1,40}$/;

const CORE_PLUGIN_GUIDANCE: Record<string, Omit<ObsidianCorePluginEntry, 'id' | 'level'>> = {
	'audio-recorder': {
		label: 'Audio recorder',
		support: 'manual',
		detail: 'Diamond stores and embeds audio files, but it does not record audio inside the app.'
	},
	backlink: {
		label: 'Backlinks',
		support: 'supported',
		detail: 'Diamond has backlinks, outgoing links, and unlinked mentions in the right panel.'
	},
	bookmarks: {
		label: 'Bookmarks',
		support: 'supported',
		detail: 'Obsidian note bookmarks can seed Diamond git-backed bookmarks during registration.'
	},
	canvas: {
		label: 'Canvas',
		support: 'partial',
		detail: 'Diamond opens and edits many Obsidian Canvas nodes and edges, but does not claim full Canvas parity.'
	},
	'command-palette': {
		label: 'Command palette',
		support: 'supported',
		detail: 'Diamond has a command palette and registered built-in/plugin commands.'
	},
	'daily-notes': {
		label: 'Daily Notes',
		support: 'supported',
		detail: 'Diamond reuses safe Daily Notes folder, template, and date-format settings.'
	},
	'file-explorer': {
		label: 'File explorer',
		support: 'supported',
		detail: 'Diamond has a git-backed file tree with notes, folders, Canvas files, rename, move, and delete.'
	},
	'file-recovery': {
		label: 'File recovery',
		support: 'partial',
		detail: 'Diamond uses git history, per-note diffs, and restore instead of Obsidian snapshot recovery.'
	},
	'global-search': {
		label: 'Search',
		support: 'supported',
		detail: 'Diamond has indexed full-text search, operators, saved searches, folder grouping, and facets.'
	},
	graph: {
		label: 'Graph view',
		support: 'supported',
		detail: 'Diamond has a force graph with filters, selection, pinning, and scale-oriented helpers.'
	},
	'markdown-importer': {
		label: 'Markdown importer',
		support: 'manual',
		detail: 'Diamond registers markdown folders in place and does not run Obsidian importer conversions.'
	},
	'outgoing-link': {
		label: 'Outgoing links',
		support: 'supported',
		detail: 'Diamond indexes outgoing wikilinks beside backlinks.'
	},
	'page-preview': {
		label: 'Page preview',
		support: 'supported',
		detail: 'Diamond supports hover previews for wikilinks.'
	},
	properties: {
		label: 'Properties',
		support: 'partial',
		detail: 'Diamond reads common frontmatter such as title, aliases, tags, public, created, and updated.'
	},
	publish: {
		label: 'Publish',
		support: 'partial',
		detail: 'Diamond has static public-note export, not Obsidian Publish hosting.'
	},
	'random-note': {
		label: 'Random note',
		support: 'manual',
		detail: 'Diamond does not currently include a random-note command.'
	},
	'slash-command': {
		label: 'Slash commands',
		support: 'manual',
		detail: 'Diamond uses the command palette and editor toolbar, not Obsidian slash commands.'
	},
	slides: {
		label: 'Slides',
		support: 'manual',
		detail: 'Diamond renders markdown but does not implement Obsidian slide presentation mode.'
	},
	'sync': {
		label: 'Obsidian Sync',
		support: 'partial',
		detail: 'Diamond uses explicit GitHub sync, not Obsidian Sync.'
	},
	'switcher': {
		label: 'Quick switcher',
		support: 'supported',
		detail: 'Diamond has a fuzzy quick switcher and search rail.'
	},
	'tag-pane': {
		label: 'Tags',
		support: 'supported',
		detail: 'Diamond indexes inline tags and frontmatter tags.'
	},
	templates: {
		label: 'Templates',
		support: 'supported',
		detail: 'Diamond reuses safe Templates folder and default date/time settings.'
	},
	'word-count': {
		label: 'Word count',
		support: 'supported',
		detail: 'Diamond shows word count and reading-time metadata in note views.'
	},
	workspaces: {
		label: 'Workspaces',
		support: 'partial',
		detail: 'Diamond has tabs and split panes, but does not import Obsidian workspace layout state.'
	}
};

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

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

function safeId(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const id = value.trim();
	if (!SAFE_COMMAND_ID.test(id)) return null;
	if (id.startsWith('.') || id.includes('..') || id.includes('/') || id.includes('\\')) return null;
	return id;
}

function coreLevel(support: ObsidianCorePluginSupport): VaultImportCheckLevel {
	if (support === 'supported') return 'ok';
	if (support === 'partial') return 'info';
	return 'warn';
}

function coreEntry(id: string): ObsidianCorePluginEntry {
	const guidance = CORE_PLUGIN_GUIDANCE[id] ?? {
		label: id,
		support: 'unknown' as const,
		detail: 'Diamond does not recognize this Obsidian core plugin id; review it manually after import.'
	};
	return {
		id,
		...guidance,
		level: coreLevel(guidance.support)
	};
}

function parseEnabledCorePlugins(value: unknown): { ids: string[]; ignored: number } | null {
	if (Array.isArray(value)) {
		let ignored = 0;
		const ids = value
			.map((item) => {
				const id = safeId(item);
				if (!id) ignored += 1;
				return id;
			})
			.filter((id): id is string => Boolean(id));
		return { ids, ignored };
	}

	const body = record(value);
	if (!body) return null;
	let ignored = 0;
	const ids: string[] = [];
	for (const [key, enabled] of Object.entries(body)) {
		const id = safeId(key);
		if (!id) {
			ignored += 1;
			continue;
		}
		if (enabled === true) ids.push(id);
	}
	return { ids, ignored };
}

function uniqueSorted(values: string[]): string[] {
	return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function readObsidianCorePlugins(root: string): ObsidianCorePluginsInfo {
	const relPath = '.obsidian/core-plugins.json';
	const coreFile = readJsonFile(path.join(root, relPath));
	const base: ObsidianCorePluginsInfo = {
		path: coreFile.status === 'missing' ? undefined : relPath,
		status: coreFile.status,
		bytes: coreFile.bytes,
		enabledPlugins: [],
		entries: [],
		supportedCount: 0,
		partialCount: 0,
		manualCount: 0,
		unknownCount: 0,
		warnings: []
	};

	if (coreFile.status === 'missing') return base;
	if (coreFile.status === 'invalid') {
		base.warnings.push('.obsidian/core-plugins.json is present but is not valid JSON.');
		return base;
	}

	const parsed = parseEnabledCorePlugins(coreFile.value);
	if (!parsed) {
		base.status = 'invalid';
		base.warnings.push('.obsidian/core-plugins.json is present but does not contain an enabled-plugin list.');
		return base;
	}

	base.enabledPlugins = uniqueSorted(parsed.ids);
	base.entries = base.enabledPlugins.map(coreEntry);
	for (const entry of base.entries) {
		if (entry.support === 'supported') base.supportedCount += 1;
		else if (entry.support === 'partial') base.partialCount += 1;
		else if (entry.support === 'manual') base.manualCount += 1;
		else base.unknownCount += 1;
	}
	if (parsed.ignored > 0) {
		base.warnings.push(`${parsed.ignored} Obsidian core plugin id${parsed.ignored === 1 ? '' : 's'} ignored because it was unsafe.`);
	}
	return base;
}

function safeHotkeyPart(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const part = value.trim();
	return SAFE_HOTKEY_PART.test(part) ? part : null;
}

function hotkeyBinding(value: unknown): string | null {
	const body = record(value);
	if (!body) return null;
	const key = safeHotkeyPart(body.key);
	if (!key) return null;
	const modifiers = Array.isArray(body.modifiers)
		? body.modifiers.map(safeHotkeyPart).filter((part): part is string => Boolean(part))
		: [];
	return [...modifiers, key].join('+');
}

export function readObsidianHotkeys(root: string): ObsidianHotkeysInfo {
	const relPath = '.obsidian/hotkeys.json';
	const hotkeysFile = readJsonFile(path.join(root, relPath));
	const base: ObsidianHotkeysInfo = {
		path: hotkeysFile.status === 'missing' ? undefined : relPath,
		status: hotkeysFile.status,
		bytes: hotkeysFile.bytes,
		commandCount: 0,
		bindingCount: 0,
		commands: [],
		omittedCommands: 0,
		warnings: []
	};

	if (hotkeysFile.status === 'missing') return base;
	if (hotkeysFile.status === 'invalid') {
		base.warnings.push('.obsidian/hotkeys.json is present but is not valid JSON.');
		return base;
	}

	const body = record(hotkeysFile.value);
	if (!body) {
		base.status = 'invalid';
		base.warnings.push('.obsidian/hotkeys.json is present but does not contain a JSON object.');
		return base;
	}

	let ignoredBindings = 0;
	const commands: ObsidianHotkeyCommand[] = [];
	for (const [rawCommandId, rawBindings] of Object.entries(body)) {
		const commandId = safeId(rawCommandId);
		if (!commandId || !Array.isArray(rawBindings)) continue;
		const bindings = rawBindings
			.map(hotkeyBinding)
			.filter((binding): binding is string => Boolean(binding));
		ignoredBindings += rawBindings.length - bindings.length;
		if (bindings.length > 0) commands.push({ commandId, bindings });
	}

	const sorted = commands.sort((a, b) => a.commandId.localeCompare(b.commandId));
	base.commandCount = sorted.length;
	base.bindingCount = sorted.reduce((sum, command) => sum + command.bindings.length, 0);
	base.commands = sorted.slice(0, MAX_HOTKEY_COMMANDS);
	base.omittedCommands = Math.max(0, sorted.length - base.commands.length);
	if (base.omittedCommands > 0) {
		base.warnings.push(`${base.omittedCommands} Obsidian hotkey command${base.omittedCommands === 1 ? '' : 's'} omitted from preview to keep the import card compact.`);
	}
	if (ignoredBindings > 0) {
		base.warnings.push(`${ignoredBindings} Obsidian hotkey binding${ignoredBindings === 1 ? '' : 's'} ignored because it was invalid or unsafe.`);
	}
	return base;
}
