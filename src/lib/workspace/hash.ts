export function currentLocationHashId(): string | null {
	if (typeof window === 'undefined') return null;
	if (!window.location.hash || window.location.hash.length <= 1) return null;
	return decodeURIComponent(window.location.hash.slice(1));
}

export function replaceLocationHash(hash: string | null): void {
	if (typeof window === 'undefined') return;
	const url = new URL(window.location.href);
	url.hash = hash ?? '';
	window.history.replaceState(window.history.state, '', url.toString());
}
