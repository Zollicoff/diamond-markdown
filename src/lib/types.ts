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

export type VaultImportCheckLevel = 'ok' | 'info' | 'warn';

export interface VaultImportCheckItem {
	id: string;
	label: string;
	detail: string;
	level: VaultImportCheckLevel;
}

export type ObsidianPluginJsonStatus = 'present' | 'missing' | 'invalid';

export interface ObsidianPluginInfo {
	folder: string;
	id: string;
	name: string;
	version?: string;
	author?: string;
	enabled: boolean;
	manifestPath?: string;
	manifestStatus: ObsidianPluginJsonStatus;
	settingsPath?: string;
	settingsStatus: ObsidianPluginJsonStatus;
	settingsBytes?: number;
}

export interface VaultImportAnalysis {
	path: string;
	markdownFiles: number;
	assetFiles: number;
	canvasFiles: number;
	totalFiles: number;
	obsidianConfig: boolean;
	diamondConfig: boolean;
	gitRepository: boolean;
	likelyAttachmentFolders: string[];
	obsidianPluginFolders: string[];
	obsidianPlugins: ObsidianPluginInfo[];
	recommendedExcludedFolders: string[];
	ignoredFolders: string[];
	warnings: string[];
	checklist: VaultImportCheckItem[];
	markdownExamples: string[];
	canvasExamples: string[];
}

export interface TreeNode {
	name: string;
	path: string;
	type: 'file' | 'directory';
	fileKind?: 'markdown' | 'canvas';
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

export interface AttachmentUploadResult {
	ok: true;
	path: string;
	filename: string;
	size: number;
	sha: string | null;
}

export interface CanvasNode {
	id: string;
	type: string;
	x: number;
	y: number;
	width: number;
	height: number;
	text?: string;
	file?: string;
	url?: string;
	label?: string;
	color?: string;
}

export interface CanvasEdge {
	id: string;
	fromNode: string;
	toNode: string;
	fromSide?: string;
	toSide?: string;
	label?: string;
	color?: string;
}

export interface CanvasDoc {
	path: string;
	title: string;
	revision: string;
	mtime: number;
	nodes: CanvasNode[];
	edges: CanvasEdge[];
	warnings: string[];
}

export interface CanvasMutationResult {
	ok: true;
	path: string;
	sha: string | null;
	doc: CanvasDoc;
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
	remoteSha: string | null;
	clean: boolean;
	conflicted: string[];
	files: GitFileStatus[];
	ahead: number;
	behind: number;
	diverged: boolean;
	mergeBase: string | null;
	localChanges: string[];
	remoteChanges: string[];
	conflictCandidates: string[];
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
