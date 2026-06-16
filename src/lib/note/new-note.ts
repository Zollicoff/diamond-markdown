export interface NewNotePath {
	path: string;
	title: string;
}

export function cleanNewNoteInput(input: string): string {
	return input.trim().replace(/^\/+|\/+$/g, '');
}

export function ensureNewNoteMarkdownPath(input: string): string {
	return /\.(md|markdown)$/i.test(input) ? input : `${input}.md`;
}

export function newNoteTitle(inputPath: string): string {
	return inputPath.split('/').pop()?.replace(/\.(md|markdown)$/i, '') ?? inputPath;
}

export function newNotePromptLabel(parentFolder: string | null | undefined): string {
	return `Name in ${parentFolder || 'vault root'}`;
}

export function buildNewNotePath(input: string, parentFolder: string | null | undefined): NewNotePath | null {
	const cleanInput = cleanNewNoteInput(input);
	if (!cleanInput) return null;
	const relativeInput = ensureNewNoteMarkdownPath(cleanInput);
	const cleanParent = cleanNewNoteInput(parentFolder ?? '');
	return {
		path: cleanParent ? `${cleanParent}/${relativeInput}` : relativeInput,
		title: newNoteTitle(relativeInput)
	};
}
