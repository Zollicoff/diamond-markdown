import type { Frontmatter, NoteDoc } from '$lib/types';
import { api as vaultApi } from '$lib/vault-api';

export interface PluginNoteFile {
	path: string;
	content: string;
	revision: string;
	mtime: number;
	frontmatter: Frontmatter;
	body: string;
	tags: string[];
}

export interface PluginNoteWriteResult {
	created: boolean;
	sha: string | null;
	path: string;
	revision: string;
	mtime: number;
}

export interface PluginFilesApi {
	readNote: (path: string) => Promise<PluginNoteFile>;
	writeNote: (
		path: string,
		content: string,
		options?: { expectedRevision?: string }
	) => Promise<PluginNoteWriteResult>;
}

const MAX_PLUGIN_NOTE_BYTES = 1024 * 1024;

export function cleanPluginNotePath(value: unknown): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error('note path required');
	const raw = value.trim().replace(/\\/g, '/');
	if (raw.includes('\0')) throw new Error('note path contains an invalid character');
	if (raw.startsWith('/')) throw new Error('note path must be relative');
	const parts = raw.split('/');
	if (parts.some((part) => !part || part === '.' || part === '..' || part.startsWith('.'))) {
		throw new Error('note path cannot contain hidden or relative segments');
	}
	const notePath = /\.[^/.]+$/i.test(raw) ? raw : `${raw}.md`;
	if (!notePath.toLowerCase().endsWith('.md')) throw new Error('file capability only supports markdown notes');
	return notePath;
}

function cleanPluginNoteContent(value: unknown): string {
	if (typeof value !== 'string') throw new Error('note content must be a string');
	if (new TextEncoder().encode(value).byteLength > MAX_PLUGIN_NOTE_BYTES) {
		throw new Error('note content is too large');
	}
	return value;
}

function cleanExpectedRevision(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value : undefined;
}

function cloneFrontmatter(frontmatter: Frontmatter): Frontmatter {
	return JSON.parse(JSON.stringify(frontmatter ?? {})) as Frontmatter;
}

export function pluginNoteFromDoc(doc: NoteDoc): PluginNoteFile {
	return {
		path: doc.path,
		content: doc.content,
		revision: doc.revision,
		mtime: doc.mtime,
		frontmatter: cloneFrontmatter(doc.frontmatter),
		body: doc.body,
		tags: [...doc.tags]
	};
}

export function createPluginFilesApi(vaultId: string): PluginFilesApi {
	return {
		async readNote(path) {
			return pluginNoteFromDoc(await vaultApi.note(vaultId, cleanPluginNotePath(path)));
		},
		async writeNote(path, content, options = {}) {
			const res = await vaultApi.saveNote(
				vaultId,
				cleanPluginNotePath(path),
				cleanPluginNoteContent(content),
				cleanExpectedRevision(options.expectedRevision)
			);
			return {
				created: res.created,
				sha: res.sha,
				path: res.path,
				revision: res.revision,
				mtime: res.mtime
			};
		}
	};
}
