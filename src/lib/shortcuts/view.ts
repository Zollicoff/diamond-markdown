import type { CommandDef } from '$lib/commands/registry';
import type { KeyBinding } from '$lib/commands/keymap';
import { obsidianCommandIdsForDiamond } from './obsidian';

export interface ShortcutRow {
	title: string;
	shortcut: string;
	category: string;
	source: 'global' | 'command' | 'inline';
	commandId?: string;
	obsidianCommandIds: string[];
}

export const INLINE_SHORTCUT_ROWS: ShortcutRow[] = [
	{ title: 'Save note', shortcut: '⌘S', category: 'file', source: 'inline', obsidianCommandIds: [] },
	{ title: 'Open wikilink in new tab', shortcut: '⌘ + click', category: 'navigation', source: 'inline', obsidianCommandIds: [] },
	{ title: 'Open wikilink in new pane', shortcut: '⌥ + click', category: 'navigation', source: 'inline', obsidianCommandIds: [] },
	{ title: 'Close tab via middle-click', shortcut: 'middle-click', category: 'tabs', source: 'inline', obsidianCommandIds: [] }
];

export const SHORTCUT_CATEGORY_LABELS: Record<string, string> = {
	view: 'View',
	file: 'File',
	tabs: 'Tabs',
	navigation: 'Navigation',
	plugin: 'Plugin',
	other: 'Other'
};

export const SHORTCUT_CATEGORY_ORDER = ['view', 'file', 'tabs', 'navigation', 'plugin', 'other'];

function commandRow(command: CommandDef, shortcut: string, source: ShortcutRow['source']): ShortcutRow {
	return {
		title: command.title,
		shortcut,
		category: command.category ?? 'other',
		source,
		commandId: command.id,
		obsidianCommandIds: obsidianCommandIdsForDiamond(command.id)
	};
}

export function buildShortcutRows(commands: CommandDef[], keyBindings: KeyBinding[], inlineRows = INLINE_SHORTCUT_ROWS): ShortcutRow[] {
	const commandsById = new Map(commands.map((command) => [command.id, command]));
	const boundCommandIds = new Set(keyBindings.map((binding) => binding.commandId));

	const fromKeymap = keyBindings.map((binding) => {
		const command = commandsById.get(binding.commandId);
		if (!command) {
			return {
				title: binding.commandId,
				shortcut: binding.combo,
				category: 'other',
				source: 'global' as const,
				commandId: binding.commandId,
				obsidianCommandIds: obsidianCommandIdsForDiamond(binding.commandId)
			};
		}
		return commandRow(command, binding.combo, 'global');
	});

	const fromCommands = commands
		.filter((command) => command.shortcut && !boundCommandIds.has(command.id))
		.map((command) => commandRow(command, command.shortcut!, 'command'));

	return [...fromKeymap, ...fromCommands, ...inlineRows];
}

export function groupShortcutRows(rows: ShortcutRow[]): Map<string, ShortcutRow[]> {
	const grouped = new Map<string, ShortcutRow[]>();
	for (const row of rows) {
		const key = row.category || 'other';
		const bucket = grouped.get(key) ?? [];
		bucket.push(row);
		grouped.set(key, bucket);
	}
	for (const bucket of grouped.values()) {
		bucket.sort((a, b) => a.title.localeCompare(b.title));
	}
	return grouped;
}
