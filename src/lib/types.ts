/**
 * Wire types shared between server and client.
 *
 * Keep this file free of implementation — just shapes. Anything that
 * touches `node:fs`, `simple-git`, or the DOM goes elsewhere.
 */

export interface VaultRef {
	id: string;
	name: string;
	path: string;
}

export interface VaultStats {
	noteCount: number;
	lastModified: number | null;
}

export interface TreeNode {
	name: string;
	path: string;
	type: 'file' | 'directory';
	/** Modified time (ms since epoch). 0 for directories. */
	mtime?: number;
	/** Created/birth time. Falls back to mtime on filesystems without
	 *  birthtime. 0 for directories. */
	ctime?: number;
	children?: TreeNode[];
}

export interface LinkRef {
	path: string;
	title: string;
}

export interface OutgoingLink {
	target: string;
	resolved: string | null;
}

export interface Frontmatter {
	title?: string;
	tags?: string[];
	aliases?: string[];
	created?: string;
	updated?: string;
	public?: boolean;
	[key: string]: unknown;
}

export interface NoteDoc {
	path: string;
	content: string;
	/** SHA-256 of the exact file content returned by the server. */
	revision: string;
	/** File modified time in ms since epoch. */
	mtime: number;
	frontmatter: Frontmatter;
	body: string;
	html: string;
	outgoingLinks: OutgoingLink[];
	backlinks: LinkRef[];
	tags: string[];
}

export interface SearchHit {
	path: string;
	title: string;
	score?: number;
	snippet?: string;
}

export interface GitFileStatus {
	path: string;
	index: string;
	workingDir: string;
}

export interface GitSyncStatus {
	initialized: boolean;
	branch: string | null;
	sha: string | null;
	remoteUrl: string | null;
	remoteDisplayUrl: string | null;
	upstream: string | null;
	remoteBranch: string | null;
	clean: boolean;
	conflicted: string[];
	files: GitFileStatus[];
	ahead: number;
	behind: number;
	canPull: boolean;
	canPush: boolean;
	needsRemote: boolean;
	message?: string;
}

export interface GitSyncResult {
	ok: boolean;
	status: GitSyncStatus;
	message: string;
}
