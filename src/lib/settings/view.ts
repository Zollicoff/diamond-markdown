import type { ThemeMode } from '../theme.svelte';

export interface SettingsSectionItem {
	id: string;
	label: string;
}

export interface ThemeModeOption {
	id: ThemeMode;
	label: string;
	icon: string;
}

export const themeModeOptions: ThemeModeOption[] = [
	{ id: 'auto',  label: 'Auto',  icon: '◐' },
	{ id: 'light', label: 'Light', icon: '○' },
	{ id: 'dark',  label: 'Dark',  icon: '●' }
];

export function buildSettingsSections(pluginSettingsCount: number): SettingsSectionItem[] {
	return [
		{ id: 'appearance', label: 'Appearance' },
		{ id: 'vault', label: 'Vault' },
		{ id: 'sync', label: 'Sync' },
		{ id: 'plugins', label: 'Plugins' },
		...(pluginSettingsCount > 0 ? [{ id: 'plugin-settings', label: 'Plugin settings' }] : []),
		{ id: 'excluded', label: 'Folders' },
		{ id: 'about', label: 'About' }
	];
}
