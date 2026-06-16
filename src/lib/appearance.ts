import type { VaultAppearancePreference } from '$lib/types';

function hexToRgba(hex: string, alpha: number): string {
	const normalized = hex.toLowerCase();
	const raw = normalized.startsWith('#') ? normalized.slice(1) : normalized;
	if (!/^[0-9a-f]{6}$/.test(raw)) return `rgba(255, 203, 107, ${alpha})`;
	const value = Number.parseInt(raw, 16);
	const red = (value >> 16) & 255;
	const green = (value >> 8) & 255;
	const blue = value & 255;
	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function vaultAppearanceStyle(preference: VaultAppearancePreference | null): string {
	const styles: string[] = [];
	if (preference?.baseFontSize) {
		styles.push(`--vault-base-font-size: ${preference.baseFontSize}px`);
	}
	if (preference?.accentColor) {
		styles.push(`--accent: ${preference.accentColor}`);
		styles.push(`--accent-soft: ${hexToRgba(preference.accentColor, 0.14)}`);
	}
	return styles.join('; ');
}

export function applyVaultAppearance(preference: VaultAppearancePreference | null): () => void {
	if (typeof document === 'undefined') return () => {};
	const root = document.documentElement;
	root.style.removeProperty('--vault-base-font-size');
	root.style.removeProperty('--accent');
	root.style.removeProperty('--accent-soft');
	if (preference?.baseFontSize) {
		root.style.setProperty('--vault-base-font-size', `${preference.baseFontSize}px`);
	}
	if (preference?.accentColor) {
		root.style.setProperty('--accent', preference.accentColor);
		root.style.setProperty('--accent-soft', hexToRgba(preference.accentColor, 0.14));
	}
	return () => {
		root.style.removeProperty('--vault-base-font-size');
		root.style.removeProperty('--accent');
		root.style.removeProperty('--accent-soft');
	};
}
