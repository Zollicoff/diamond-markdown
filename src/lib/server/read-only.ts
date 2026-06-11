const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function isReadOnlyMode(): boolean {
	const raw = process.env.DIAMOND_READ_ONLY;
	return raw ? TRUE_VALUES.has(raw.trim().toLowerCase()) : false;
}

export function readOnlyMessage(): string {
	return 'Diamond Markdown is running in read-only mode; write APIs are disabled.';
}
