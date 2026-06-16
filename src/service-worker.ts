/// <reference lib="webworker" />

import { base, build, files, version } from '$service-worker';

const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE_PREFIX = 'diamondmd';
const STATIC_CACHE = `${CACHE_PREFIX}-static-${version}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${version}`;
const APP_SHELL = `${base}/`;
const API_PREFIX = `${base}/api/`;
const STATIC_ASSETS = [...build, ...files, APP_SHELL];
const STATIC_URLS = new Set(STATIC_ASSETS.map((url) => new URL(url, worker.location.origin).href));

worker.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(STATIC_CACHE)
			.then((cache) => cache.addAll(STATIC_ASSETS))
			.then(() => worker.skipWaiting())
	);
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(
				keys
					.filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
					.map((key) => caches.delete(key))
			))
			.then(() => worker.clients.claim())
	);
});

worker.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== worker.location.origin) return;
	if (url.pathname.startsWith(API_PREFIX)) return;

	if (request.mode === 'navigate') {
		event.respondWith(networkFirst(request));
		return;
	}

	if (STATIC_URLS.has(url.href) || url.pathname.startsWith(`${base}/_app/`)) {
		event.respondWith(cacheFirst(request));
	}
});

async function cacheFirst(request: Request): Promise<Response> {
	const cached = await caches.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) {
		const cache = await caches.open(STATIC_CACHE);
		await cache.put(request, response.clone());
	}
	return response;
}

async function networkFirst(request: Request): Promise<Response> {
	const cache = await caches.open(RUNTIME_CACHE);
	try {
		const response = await fetch(request);
		if (response.ok) await cache.put(request, response.clone());
		return response;
	} catch {
		return (await cache.match(request)) ?? (await caches.match(APP_SHELL)) ?? Response.error();
	}
}
