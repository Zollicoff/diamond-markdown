import type { AttachmentRef } from '$lib/types';

export function attachmentEmbedMarkdown(paths: string[]): string {
	return paths.map((path) => `![[${path}]]`).join('\n');
}

export function formatAttachmentSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB'];
	let size = bytes / 1024;
	for (const unit of units) {
		if (size < 1024 || unit === 'GB') return `${size.toFixed(size < 10 ? 1 : 0)} ${unit}`;
		size /= 1024;
	}
	return `${bytes} B`;
}

export function filterAttachments(attachments: AttachmentRef[], query: string): AttachmentRef[] {
	const q = query.trim().toLowerCase();
	if (!q) return attachments;
	return attachments.filter((attachment) => (
		attachment.path.toLowerCase().includes(q) ||
		attachment.filename.toLowerCase().includes(q) ||
		attachment.kind.toLowerCase().includes(q)
	));
}
