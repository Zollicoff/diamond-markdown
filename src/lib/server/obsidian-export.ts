/**
 * Obsidian export package builder.
 *
 * Diamond stores vaults as ordinary Markdown folders already. This exporter
 * packages the Obsidian-compatible vault files into a ZIP without shelling out
 * to platform-specific tools, while excluding Diamond/git/generated metadata.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Vault } from './vault';
import { slugify } from '$lib/util/strings';

const ZIP_STORE_METHOD = 0;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_VERSION = 20;
const UINT32_MAX = 0xffffffff;
const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;
const EXCLUDED_DIRS = new Set(['.git', '.diamondmd', '.diamond-publish', 'node_modules']);
const EXCLUDED_FILES = new Set(['.DS_Store']);

export class ObsidianExportError extends Error {
	constructor(message: string, readonly status = 400) {
		super(message);
		this.name = 'ObsidianExportError';
	}
}

export interface ObsidianExportPackage {
	filename: string;
	bytes: Buffer;
	fileCount: number;
	totalBytes: number;
}

interface ExportFile {
	relPath: string;
	absPath: string;
	size: number;
	mtime: Date;
}

interface CentralDirectoryEntry {
	name: Buffer;
	crc: number;
	size: number;
	offset: number;
	dosTime: number;
	dosDate: number;
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
	let c = n;
	for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	CRC_TABLE[n] = c >>> 0;
}

function crc32(data: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function parseMaxBytes(): number {
	const raw = process.env.DIAMOND_OBSIDIAN_EXPORT_MAX_BYTES;
	if (!raw) return DEFAULT_MAX_BYTES;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_BYTES;
}

function dosDateTime(date: Date): { dosTime: number; dosDate: number } {
	const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
	const month = date.getMonth() + 1;
	const day = date.getDate();
	const hours = date.getHours();
	const minutes = date.getMinutes();
	const seconds = Math.floor(date.getSeconds() / 2);
	return {
		dosTime: (hours << 11) | (minutes << 5) | seconds,
		dosDate: ((year - 1980) << 9) | (month << 5) | day
	};
}

function safeArchiveFilename(vault: Vault): string {
	return `${slugify(vault.name, { fallback: 'vault', maxLength: 64 })}-obsidian-export.zip`;
}

function shouldSkipDir(name: string): boolean {
	return EXCLUDED_DIRS.has(name);
}

function shouldSkipFile(name: string): boolean {
	return EXCLUDED_FILES.has(name);
}

function assertInsideRoot(realRoot: string, absPath: string): void {
	if (absPath !== realRoot && !absPath.startsWith(realRoot + path.sep)) {
		throw new ObsidianExportError('path escapes vault', 400);
	}
}

function collectExportFiles(vault: Vault, maxBytes: number): ExportFile[] {
	const root = path.resolve(vault.path);
	const realRoot = fs.realpathSync.native(root);
	const files: ExportFile[] = [];
	let totalBytes = 0;

	function walk(absDir: string): void {
		const entries = fs.readdirSync(absDir, { withFileTypes: true })
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

		for (const entry of entries) {
			if (entry.isDirectory()) {
				if (shouldSkipDir(entry.name)) continue;
				const childDir = path.join(absDir, entry.name);
				if (entry.isSymbolicLink()) continue;
				assertInsideRoot(realRoot, fs.realpathSync.native(childDir));
				walk(childDir);
				continue;
			}

			if (!entry.isFile() || shouldSkipFile(entry.name)) continue;

			const absPath = path.join(absDir, entry.name);
			assertInsideRoot(realRoot, fs.realpathSync.native(absPath));
			const stat = fs.statSync(absPath);
			if (stat.size > UINT32_MAX) {
				throw new ObsidianExportError(`${path.relative(root, absPath)} is too large for ZIP export`, 413);
			}
			totalBytes += stat.size;
			if (totalBytes > maxBytes) {
				throw new ObsidianExportError(`vault export is larger than the configured ${maxBytes} byte limit`, 413);
			}
			files.push({
				relPath: path.relative(root, absPath).split(path.sep).join('/'),
				absPath,
				size: stat.size,
				mtime: stat.mtime
			});
		}
	}

	walk(root);
	return files;
}

function localFileHeader(file: ExportFile, name: Buffer, data: Buffer, crc: number, dosTime: number, dosDate: number): Buffer {
	const header = Buffer.alloc(30);
	header.writeUInt32LE(0x04034b50, 0);
	header.writeUInt16LE(ZIP_VERSION, 4);
	header.writeUInt16LE(ZIP_UTF8_FLAG, 6);
	header.writeUInt16LE(ZIP_STORE_METHOD, 8);
	header.writeUInt16LE(dosTime, 10);
	header.writeUInt16LE(dosDate, 12);
	header.writeUInt32LE(crc, 14);
	header.writeUInt32LE(data.length, 18);
	header.writeUInt32LE(file.size, 22);
	header.writeUInt16LE(name.length, 26);
	header.writeUInt16LE(0, 28);
	return Buffer.concat([header, name, data]);
}

function centralDirectoryHeader(entry: CentralDirectoryEntry): Buffer {
	const header = Buffer.alloc(46);
	header.writeUInt32LE(0x02014b50, 0);
	header.writeUInt16LE(ZIP_VERSION, 4);
	header.writeUInt16LE(ZIP_VERSION, 6);
	header.writeUInt16LE(ZIP_UTF8_FLAG, 8);
	header.writeUInt16LE(ZIP_STORE_METHOD, 10);
	header.writeUInt16LE(entry.dosTime, 12);
	header.writeUInt16LE(entry.dosDate, 14);
	header.writeUInt32LE(entry.crc, 16);
	header.writeUInt32LE(entry.size, 20);
	header.writeUInt32LE(entry.size, 24);
	header.writeUInt16LE(entry.name.length, 28);
	header.writeUInt16LE(0, 30);
	header.writeUInt16LE(0, 32);
	header.writeUInt16LE(0, 34);
	header.writeUInt16LE(0, 36);
	header.writeUInt32LE(0, 38);
	header.writeUInt32LE(entry.offset, 42);
	return Buffer.concat([header, entry.name]);
}

function endOfCentralDirectory(fileCount: number, centralSize: number, centralOffset: number): Buffer {
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(0, 4);
	end.writeUInt16LE(0, 6);
	end.writeUInt16LE(fileCount, 8);
	end.writeUInt16LE(fileCount, 10);
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(centralOffset, 16);
	end.writeUInt16LE(0, 20);
	return end;
}

export function buildObsidianExportPackage(vault: Vault): ObsidianExportPackage {
	const files = collectExportFiles(vault, parseMaxBytes());
	if (files.length > 0xffff) throw new ObsidianExportError('vault has too many files for ZIP export', 413);

	const chunks: Buffer[] = [];
	const centralEntries: CentralDirectoryEntry[] = [];
	let offset = 0;
	let totalBytes = 0;

	for (const file of files) {
		const name = Buffer.from(file.relPath, 'utf-8');
		const data = fs.readFileSync(file.absPath);
		const crc = crc32(data);
		const { dosTime, dosDate } = dosDateTime(file.mtime);
		const local = localFileHeader(file, name, data, crc, dosTime, dosDate);
		chunks.push(local);
		centralEntries.push({ name, crc, size: data.length, offset, dosTime, dosDate });
		offset += local.length;
		totalBytes += data.length;
		if (offset > UINT32_MAX) throw new ObsidianExportError('vault export is too large for ZIP export', 413);
	}

	const centralOffset = offset;
	const centralChunks = centralEntries.map(centralDirectoryHeader);
	const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
	if (centralOffset + centralSize > UINT32_MAX) {
		throw new ObsidianExportError('vault export is too large for ZIP export', 413);
	}

	return {
		filename: safeArchiveFilename(vault),
		bytes: Buffer.concat([...chunks, ...centralChunks, endOfCentralDirectory(files.length, centralSize, centralOffset)]),
		fileCount: files.length,
		totalBytes
	};
}
