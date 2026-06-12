import type { OpenMode } from './types';

export interface PointerOpenInput {
	button?: number;
	metaKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
}

export function openModeForPointer(input: PointerOpenInput): OpenMode {
	if (input.button === 1) return 'new-tab';
	if (input.metaKey || input.ctrlKey) return 'new-tab';
	if (input.altKey) return 'new-pane';
	return 'replace';
}
