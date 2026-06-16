import type { CommandContext } from '$lib/commands';
import type { EditorApi } from '$lib/editor/commands';
import type { NoteDoc } from '$lib/types';

export interface ActivePluginEditor {
	vaultId: string;
	paneId: string;
	tabId: string;
	notePath: string;
	doc: NoteDoc;
	editor: EditorApi;
}

export interface PluginEditorCommandContext extends CommandContext {
	vaultId: string;
	pluginId: string;
	paneId: string;
	tabId: string;
	notePath: string;
	doc: NoteDoc;
	editor: EditorApi;
}

const editorsByTab = $state<Record<string, ActivePluginEditor>>({});

function tabKey(vaultId: string, tabId: string): string {
	return `${vaultId}:${tabId}`;
}

export function registerActivePluginEditor(editor: ActivePluginEditor): () => void {
	const key = tabKey(editor.vaultId, editor.tabId);
	editorsByTab[key] = editor;
	return () => {
		if (editorsByTab[key] === editor) delete editorsByTab[key];
	};
}

export function getActivePluginEditor(ctx: CommandContext): ActivePluginEditor | null {
	if (typeof ctx.vaultId !== 'string') return null;
	if (typeof ctx.tabId === 'string') {
		const editor = editorsByTab[tabKey(ctx.vaultId, ctx.tabId)];
		if (editor) return editor;
	}
	const notePath = typeof ctx.notePath === 'string' ? ctx.notePath : undefined;
	if (!notePath) return null;
	return Object.values(editorsByTab).find((editor) =>
		editor.vaultId === ctx.vaultId && editor.notePath === notePath
	) ?? null;
}
