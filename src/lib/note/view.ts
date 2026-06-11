import type { NoteDoc } from '$lib/types';
import type { LinkResolver } from '$lib/editor/live-preview';
import { READING_SPEED_WPM } from '$lib/util/constants';

export type PointerOpenMode = 'replace' | 'new-tab' | 'new-pane';

export interface PointerOpenInput {
	button: number;
	metaKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
}

export function markdownWordCount(markdown: string): number {
	const stripped = markdown
		.replace(/^---[\s\S]*?\n---\s*\n/, '')
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`[^`]*`/g, ' ');
	const words = stripped.match(/[\p{L}\p{N}'-]+/gu);
	return words ? words.length : 0;
}

export function readingTimeLabel(wordCount: number, wordsPerMinute = READING_SPEED_WPM): string {
	if (wordCount <= 0) return '';
	return `${Math.max(1, Math.round(wordCount / wordsPerMinute))} min`;
}

export function noteTitleFromPath(path: string): string {
	return path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
}

export function ensureMarkdownPath(target: string): string {
	return /\.md$/i.test(target) ? target : `${target}.md`;
}

export function openModeForPointer(input: PointerOpenInput): PointerOpenMode {
	if (input.button === 1) return 'new-tab';
	if (input.metaKey || input.ctrlKey) return 'new-tab';
	if (input.altKey) return 'new-pane';
	return 'replace';
}

export function notePathFromVaultHref(vaultId: string, href: string): string | null {
	const prefix = `/vault/${vaultId}/note/`;
	if (!href.startsWith(prefix)) return null;
	const raw = href.slice(prefix.length).split(/[?#]/, 1)[0];
	return decodeURIComponent(raw);
}

export function resolveNoteLink(doc: NoteDoc | null, vaultId: string, target: string): ReturnType<LinkResolver> {
	if (!doc) return { resolved: false };
	const normalized = target.trim().toLowerCase();
	for (const link of doc.outgoingLinks) {
		if (link.resolved && (link.target.toLowerCase() === normalized || link.resolved.toLowerCase() === normalized)) {
			return { resolved: true, href: `/vault/${vaultId}/note/${encodeURI(link.resolved)}` };
		}
	}
	for (const backlink of doc.backlinks) {
		if (backlink.path.toLowerCase() === normalized || backlink.title.toLowerCase() === normalized) {
			return { resolved: true, href: `/vault/${vaultId}/note/${encodeURI(backlink.path)}` };
		}
	}
	return { resolved: false };
}

export function isStaleRevisionError(error: string | null): boolean {
	return error?.includes('note changed on disk') ?? false;
}

export function formatSavedAt(timestamp: number | null, now = Date.now()): string {
	if (!timestamp) return '';
	const elapsed = now - timestamp;
	if (elapsed < 2000) return 'just saved';
	return `saved ${Math.round(elapsed / 1000)}s ago`;
}
