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

export type JsonFileStatus = 'present' | 'missing' | 'invalid';
export type ObsidianPluginJsonStatus = JsonFileStatus;

export interface ObsidianAppConfigSetting {
	id: string;
	label: string;
	value: string;
	detail: string;
	level: VaultImportCheckLevel;
}

export interface ObsidianAppConfigInfo {
	path?: string;
	status: JsonFileStatus;
	bytes?: number;
	attachmentFolderPath?: string;
	attachmentFolderStatus: 'safe' | 'unsafe' | 'missing';
	newFileLocation?: string;
	newFileFolderPath?: string;
	newFileFolderStatus: 'safe' | 'unsafe' | 'missing' | 'not-configured';
	alwaysUpdateLinks?: boolean;
	settings: ObsidianAppConfigSetting[];
	warnings: string[];
}

export interface ObsidianDailyNotesSetting {
	id: string;
	label: string;
	value: string;
	detail: string;
	level: VaultImportCheckLevel;
}

export interface ObsidianDailyNotesInfo {
	path?: string;
	status: JsonFileStatus;
	bytes?: number;
	folderPath?: string | null;
	folderStatus: 'safe' | 'vault-root' | 'unsafe' | 'missing';
	templatePath?: string;
	templateStatus: 'safe' | 'unsafe' | 'missing';
	format?: string;
	formatStatus: 'safe' | 'unsafe' | 'missing';
	plannedPath: string;
	settings: ObsidianDailyNotesSetting[];
	warnings: string[];
}

export interface ObsidianTemplatesSetting {
	id: string;
	label: string;
	value: string;
	detail: string;
	level: VaultImportCheckLevel;
}

export interface ObsidianTemplatesInfo {
	path?: string;
	status: JsonFileStatus;
	bytes?: number;
	folderPath?: string;
	folderStatus: 'safe' | 'unsafe' | 'missing';
	dateFormat?: string;
	dateFormatStatus: 'safe' | 'unsafe' | 'missing';
	timeFormat?: string;
	timeFormatStatus: 'safe' | 'unsafe' | 'missing';
	settings: ObsidianTemplatesSetting[];
	warnings: string[];
}

export interface NewNoteLocation {
	folder: string | null;
	source: 'obsidian-app-config' | 'vault-root';
}

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
	settingsKeys?: string[];
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
	obsidianAppConfig: ObsidianAppConfigInfo;
	obsidianDailyNotes: ObsidianDailyNotesInfo;
	obsidianTemplates: ObsidianTemplatesInfo;
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
	unlinkedMentions: LinkRef[];
	tags: string[];
}

export interface AttachmentUploadResult {
	ok: true;
	path: string;
	filename: string;
	size: number;
	sha: string | null;
}

export interface AttachmentMoveItem {
	from: string;
	to: string;
}

export interface AttachmentMoveResult {
	ok: true;
	folder: string;
	moved: AttachmentMoveItem[];
	linksUpdated: number;
	touched: string[];
	sha: string | null;
}

export type AttachmentKind = 'image' | 'audio' | 'video' | 'pdf' | 'file';

export interface AttachmentRef {
	path: string;
	filename: string;
	size: number;
	mtime: number;
	kind: AttachmentKind;
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
	fromEnd?: string;
	toSide?: string;
	toEnd?: string;
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

export interface SearchResponse {
	query: string;
	mode: 'title' | 'full';
	limit: number;
	offset: number;
	total: number;
	limited: boolean;
	hasMore: boolean;
	nextOffset: number | null;
	results: SearchHit[];
}

export interface Bookmark {
	path: string;
	title: string;
	createdAt: string;
	updatedAt: string;
}

export interface BookmarkMutationResult {
	bookmark?: Bookmark;
	bookmarks: Bookmark[];
	created?: boolean;
	deleted?: boolean;
	sha: string | null;
}

export type SavedSearchMode = 'title' | 'full';

export interface SavedSearch {
	id: string;
	name: string;
	query: string;
	mode: SavedSearchMode;
	createdAt: string;
	updatedAt: string;
}

export interface SavedSearchMutationResult {
	search?: SavedSearch;
	searches: SavedSearch[];
	created?: boolean;
	deleted?: boolean;
	sha: string | null;
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
