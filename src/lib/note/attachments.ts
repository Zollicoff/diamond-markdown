export function attachmentEmbedMarkdown(paths: string[]): string {
	return paths.map((path) => `![[${path}]]`).join('\n');
}
