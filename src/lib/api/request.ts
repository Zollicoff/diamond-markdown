export async function json<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
	const res = await fetch(input, init);
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`HTTP ${res.status}${body ? ': ' + body.slice(0, 200) : ''}`);
	}
	return res.json() as Promise<T>;
}
