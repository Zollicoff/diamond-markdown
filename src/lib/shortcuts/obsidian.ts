export interface ObsidianCommandAlias {
	obsidianCommandId: string;
	diamondCommandId: string;
	diamondTitle: string;
	detail: string;
}

export const OBSIDIAN_COMMAND_ALIASES: ObsidianCommandAlias[] = [
	{
		obsidianCommandId: 'command-palette:open',
		diamondCommandId: 'palette.open',
		diamondTitle: 'Open command palette',
		detail: 'Diamond has the same command-palette workflow.'
	},
	{
		obsidianCommandId: 'switcher:open',
		diamondCommandId: 'switcher.open',
		diamondTitle: 'Quick switcher',
		detail: 'Diamond uses the quick switcher for note title and alias jumps.'
	},
	{
		obsidianCommandId: 'global-search:open',
		diamondCommandId: 'search.quick-open',
		diamondTitle: 'Full-text search',
		detail: 'Diamond can open the full-text search modal from a shortcut.'
	},
	{
		obsidianCommandId: 'daily-notes',
		diamondCommandId: 'daily.open',
		diamondTitle: "Open today's daily note",
		detail: 'Diamond can open today\'s daily note from the command registry.'
	},
	{
		obsidianCommandId: 'daily-notes:goto-today',
		diamondCommandId: 'daily.open',
		diamondTitle: "Open today's daily note",
		detail: 'Diamond can open today\'s daily note from the command registry.'
	},
	{
		obsidianCommandId: 'graph:open',
		diamondCommandId: 'graph.open',
		diamondTitle: 'Show graph',
		detail: 'Diamond has a graph tab with filters, selection, and pinning.'
	},
	{
		obsidianCommandId: 'tag-pane:open',
		diamondCommandId: 'tags.open',
		diamondTitle: 'Show tags',
		detail: 'Diamond has a tag index tab.'
	},
	{
		obsidianCommandId: 'templates:insert-template',
		diamondCommandId: 'template.insert',
		diamondTitle: 'Insert template',
		detail: 'Diamond can insert from the configured template folder.'
	},
	{
		obsidianCommandId: 'file-explorer:new-file',
		diamondCommandId: 'note.create',
		diamondTitle: 'New note',
		detail: 'Diamond can create a new markdown note.'
	},
	{
		obsidianCommandId: 'file-explorer:new-folder',
		diamondCommandId: 'folder.create',
		diamondTitle: 'New folder',
		detail: 'Diamond can create vault folders.'
	},
	{
		obsidianCommandId: 'file-explorer:rename-file',
		diamondCommandId: 'note.rename',
		diamondTitle: 'Rename note',
		detail: 'Diamond can rename the active note through the file tree.'
	},
	{
		obsidianCommandId: 'workspace:close',
		diamondCommandId: 'tabs.close',
		diamondTitle: 'Close tab',
		detail: 'Diamond closes the active workspace tab.'
	}
];

const aliasesByObsidianId = new Map(OBSIDIAN_COMMAND_ALIASES.map((alias) => [alias.obsidianCommandId, alias]));

export function diamondCommandForObsidian(obsidianCommandId: string): ObsidianCommandAlias | undefined {
	return aliasesByObsidianId.get(obsidianCommandId);
}

export function obsidianCommandIdsForDiamond(diamondCommandId: string): string[] {
	return OBSIDIAN_COMMAND_ALIASES
		.filter((alias) => alias.diamondCommandId === diamondCommandId)
		.map((alias) => alias.obsidianCommandId)
		.sort((a, b) => a.localeCompare(b));
}
