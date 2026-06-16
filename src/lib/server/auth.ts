import crypto from 'node:crypto';

export interface BasicAuthConfig {
	username: string;
	password: string;
	realm: string;
}

export function basicAuthConfig(): BasicAuthConfig | null {
	const raw = process.env.DIAMOND_BASIC_AUTH;
	if (!raw) return null;

	const separator = raw.indexOf(':');
	if (separator <= 0) {
		throw new Error('DIAMOND_BASIC_AUTH must be formatted as username:password');
	}

	const username = raw.slice(0, separator);
	const password = raw.slice(separator + 1);
	if (!username || !password) {
		throw new Error('DIAMOND_BASIC_AUTH must include both username and password');
	}

	return {
		username,
		password,
		realm: process.env.DIAMOND_BASIC_AUTH_REALM?.trim() || 'Diamond Markdown'
	};
}

function safeEqual(actual: string, expected: string): boolean {
	const actualBytes = Buffer.from(actual);
	const expectedBytes = Buffer.from(expected);
	if (actualBytes.length !== expectedBytes.length) return false;
	return crypto.timingSafeEqual(actualBytes, expectedBytes);
}

export function basicAuthAccepted(header: string | null, config: BasicAuthConfig): boolean {
	if (!header?.startsWith('Basic ')) return false;

	try {
		const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
		const separator = decoded.indexOf(':');
		if (separator < 0) return false;
		const username = decoded.slice(0, separator);
		const password = decoded.slice(separator + 1);
		return safeEqual(username, config.username) && safeEqual(password, config.password);
	} catch {
		return false;
	}
}

export function authChallenge(config: BasicAuthConfig): Response {
	return new Response('Authentication required', {
		status: 401,
		headers: {
			'www-authenticate': `Basic realm="${config.realm.replace(/"/g, '\\"')}", charset="UTF-8"`,
			'content-type': 'text/plain; charset=utf-8'
		}
	});
}
