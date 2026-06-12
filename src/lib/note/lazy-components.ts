export type NoteViewComponent = any;

let editorPromise: Promise<NoteViewComponent> | null = null;
let previewPromise: Promise<NoteViewComponent> | null = null;
let toolbarPromise: Promise<NoteViewComponent> | null = null;

export function loadNoteEditor(): Promise<NoteViewComponent> {
	editorPromise ??= import('$lib/components/editor/Editor.svelte').then((m) => m.default);
	return editorPromise;
}

export function loadNotePreview(): Promise<NoteViewComponent> {
	previewPromise ??= import('$lib/components/editor/Preview.svelte').then((m) => m.default);
	return previewPromise;
}

export function loadNoteToolbar(): Promise<NoteViewComponent> {
	toolbarPromise ??= import('$lib/components/editor/EditorToolbar.svelte').then((m) => m.default);
	return toolbarPromise;
}
