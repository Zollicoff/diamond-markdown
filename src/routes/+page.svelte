<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import Wordmark from '$lib/components/Wordmark.svelte';

	let { data }: { data: PageData } = $props();

	let addOpen = $state(false);
	let newName = $state('');
	let newPath = $state('');
	let adding = $state(false);
	let err = $state<string | null>(null);

	async function addVault(): Promise<void> {
		if (!newName.trim() || !newPath.trim()) return;
		adding = true; err = null;
		try {
			const res = await fetch('/api/vaults', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: newName.trim(), path: newPath.trim() })
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				err = data?.message ?? `HTTP ${res.status}`;
				return;
			}
			const { vault } = await res.json();
			goto(`/vault/${vault.id}`);
		} catch (e) {
			err = (e as Error).message;
		} finally {
			adding = false;
		}
	}

	const primaryVaultId = $derived(data.activeVaultId ?? data.vaults[0]?.id ?? null);

	interface Feature {
		icon: string;
		title: string;
		body: string;
	}
	const features: Feature[] = [
		{
			icon: '◇',
			title: 'Wikilinks that feel weightless',
			body: "`[[Note]]` resolves by title, path, or alias. Click the pill, jump. Missing link? Click once to create it."
		},
		{
			icon: '↺',
			title: 'Backlinks, always visible',
			body: 'Every note shows what points back at it. Your graph of thoughts, made of live references, never stale.'
		},
		{
			icon: '⌥',
			title: 'Git is the versioning layer',
			body: 'Every save is a commit. Real history, real diffs, real branches. Sync is `git push` — no proprietary protocol.'
		},
		{
			icon: '◐',
			title: 'Browser-native, everywhere',
			body: 'Zero install per device. Open on desktop, tablet, or phone — same app, same vault, same URL.'
		}
	];

	interface LinkSample { from: string; to: string; }
	const sample: LinkSample[] = [
		{ from: 'Wikilinks',       to: 'Backlinks'   },
		{ from: 'Philosophy',      to: 'Git Versioning' },
		{ from: 'Features',        to: 'Wikilinks'   },
		{ from: 'Frontmatter',     to: 'Tags'        },
		{ from: 'Daily Notes',     to: 'Templates'   }
	];
</script>

<svelte:head>
	<title>Diamond — a knowledge base of your own</title>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</svelte:head>

<div class="landing">
	<!-- Backdrop -->
	<div class="aurora" aria-hidden="true"></div>
	<div class="grid-bg" aria-hidden="true"></div>

	<!-- Hero -->
	<section class="hero">
		<Wordmark size="xl" />
		<p class="tagline">A knowledge base of your own.</p>
		<p class="sub">Markdown files on disk · Obsidian-compatible wikilinks · git versioning · no Electron, no lock-in.</p>

		<div class="cta-row">
			{#if primaryVaultId}
				<a class="cta primary" href="/vault/{primaryVaultId}">
					<span>Enter {data.vaults.find((v) => v.id === primaryVaultId)?.name ?? 'vault'}</span>
					<span class="arrow">→</span>
				</a>
			{/if}
			<a class="cta ghost" href="https://github.com/Zollicoff/diamondmd" target="_blank" rel="noopener">
				<span>View on GitHub</span>
			</a>
		</div>
	</section>

	<!-- Graph flourish -->
	<section class="graph-row" aria-hidden="true">
		<svg class="graph-svg" viewBox="0 0 1200 140" preserveAspectRatio="xMidYMid meet">
			{#each sample as s, i}
				{@const x1 = 80 + i * 220}
				{@const x2 = x1 + 160}
				<line x1={x1} y1="70" x2={x2} y2="70" class="edge" stroke-dasharray="4 6" />
				<circle cx={x1} cy="70" r="6" class="node" />
				<text x={x1} y="100" text-anchor="middle" class="nlabel">[[{s.from}]]</text>
				<text x={x2} y="100" text-anchor="middle" class="nlabel">[[{s.to}]]</text>
				{#if i === sample.length - 1}
					<circle cx={x2} cy="70" r="6" class="node" />
				{/if}
			{/each}
		</svg>
	</section>

	<!-- Feature grid -->
	<section class="features">
		<h2 class="section-title">What it is</h2>
		<div class="feat-grid">
			{#each features as f}
				<article class="feat">
					<span class="feat-icon">{f.icon}</span>
					<h3>{f.title}</h3>
					<p>{f.body}</p>
				</article>
			{/each}
		</div>
	</section>

	<!-- Vault list -->
	<section class="vaults">
		<h2 class="section-title">Your vaults</h2>
		<div class="vault-list">
			{#each data.vaults as v}
				<a href="/vault/{v.id}" class="vault-card">
					<div class="vault-card-head">
						<span class="vault-crystal">◆</span>
						<span class="vault-name">{v.name}</span>
					</div>
					<div class="vault-path mono">{v.path.replace(/^\/Users\/[^/]+/, '~')}</div>
					<div class="vault-open">Open →</div>
				</a>
			{/each}
			<button class="vault-card vault-add" onclick={() => (addOpen = !addOpen)}>
				<div class="vault-card-head">
					<span class="vault-crystal plus">＋</span>
					<span class="vault-name">Add vault</span>
				</div>
				<div class="vault-path">register an existing folder of .md files</div>
			</button>
		</div>

		{#if addOpen}
			<div class="add-form">
				<label>
					<span>Display name</span>
					<input type="text" bind:value={newName} placeholder="Personal" />
				</label>
				<label>
					<span>Absolute path</span>
					<input type="text" bind:value={newPath} placeholder="/Users/me/Documents/vault" />
				</label>
				<div class="actions">
					<button class="btn primary" disabled={adding} onclick={addVault}>
						{adding ? 'Adding…' : 'Add vault'}
					</button>
					<button class="btn" onclick={() => (addOpen = false)}>Cancel</button>
				</div>
				{#if err}<p class="err">{err}</p>{/if}
			</div>
		{/if}
	</section>

	<footer class="foot">
		<div class="foot-row">
			<Wordmark size="xs" animated={false} />
			<span class="dot">·</span>
			<span>MIT licensed</span>
			<span class="dot">·</span>
			<a href="https://github.com/Zollicoff/diamondmd" target="_blank" rel="noopener">github</a>
			<span class="dot">·</span>
			<span class="mono foot-ver">v0.1</span>
		</div>
		<div class="foot-credit">Built in public by <a href="https://github.com/Zollicoff" target="_blank" rel="noopener">Zollicoff</a>.</div>
	</footer>
</div>

<style>
	.landing {
		position: relative;
		min-height: 100vh;
		overflow-y: auto;
		overflow-x: hidden;
		color: var(--fg);
	}

	/* ── Backdrop ───────────────────────────────────────────────────── */
	.aurora {
		position: fixed;
		inset: -10%;
		pointer-events: none;
		z-index: 0;
		background:
			radial-gradient(circle at 20% 18%, rgba(125, 211, 252, 0.14), transparent 55%),
			radial-gradient(circle at 80% 22%, rgba(192, 132, 252, 0.12), transparent 60%),
			radial-gradient(circle at 55% 75%, rgba(251, 191, 36, 0.08), transparent 55%);
		filter: blur(20px);
	}
	.grid-bg {
		position: fixed;
		inset: 0;
		pointer-events: none;
		z-index: 0;
		background-image:
			linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
			linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
		background-size: 64px 64px;
		mask-image: radial-gradient(circle at center, black 30%, transparent 80%);
		-webkit-mask-image: radial-gradient(circle at center, black 30%, transparent 80%);
	}

	/* ── Hero ───────────────────────────────────────────────────────── */
	.hero {
		position: relative;
		z-index: 1;
		max-width: 960px;
		margin: 0 auto;
		padding: 10rem 2rem 4rem;
		text-align: center;
	}
	:global(.hero .wordmark) { justify-content: center; }

	.tagline {
		margin: 2.25rem 0 0.5rem;
		font-family: 'Bricolage Grotesque', var(--sans);
		font-size: clamp(1.5rem, 3.2vw, 2rem);
		font-weight: 500;
		color: var(--fg);
		letter-spacing: -0.01em;
	}
	.sub {
		margin: 0 auto;
		max-width: 620px;
		color: var(--fg-muted);
		font-size: 1.02rem;
		line-height: 1.55;
	}

	.cta-row {
		margin-top: 2.5rem;
		display: flex;
		gap: 10px;
		justify-content: center;
		flex-wrap: wrap;
	}
	.cta {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 11px 22px;
		border-radius: 999px;
		border: 1px solid transparent;
		text-decoration: none;
		font-size: 0.95rem;
		font-weight: 600;
		transition: transform 0.1s, background 0.15s, border-color 0.15s;
	}
	.cta.primary {
		background: linear-gradient(135deg, #7dd3fc 0%, #818cf8 50%, #c084fc 100%);
		color: #0a0e1a;
		box-shadow: 0 8px 28px rgba(125, 211, 252, 0.35);
	}
	.cta.primary:hover { transform: translateY(-1px); filter: brightness(1.06); }
	.cta.ghost {
		background: var(--bg-elev);
		color: var(--fg);
		border-color: var(--border);
	}
	.cta.ghost:hover { border-color: var(--accent); color: var(--accent); }
	.arrow { font-family: var(--mono); font-size: 1.05em; }

	/* ── Graph flourish ─────────────────────────────────────────────── */
	.graph-row {
		position: relative;
		z-index: 1;
		margin: 2rem auto 0;
		max-width: 1200px;
		padding: 0 1rem;
	}
	.graph-svg {
		width: 100%;
		height: 140px;
		opacity: 0.65;
	}
	.graph-svg .edge  { stroke: rgba(125, 211, 252, 0.45); stroke-width: 1.2; }
	.graph-svg .node  { fill: #7dd3fc; }
	.graph-svg .nlabel {
		fill: rgba(230, 237, 243, 0.72);
		font-family: var(--mono);
		font-size: 12px;
	}

	/* ── Features ───────────────────────────────────────────────────── */
	.features {
		position: relative;
		z-index: 1;
		max-width: 1100px;
		margin: 4rem auto 0;
		padding: 0 2rem;
	}
	.section-title {
		font-family: 'Bricolage Grotesque', var(--sans);
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--fg-dim);
		font-weight: 600;
		margin: 0 0 1.5rem;
		text-align: center;
	}
	.feat-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 16px;
	}
	.feat {
		padding: 22px 22px 24px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 14px;
		transition: border-color 0.2s, transform 0.15s;
	}
	.feat:hover { border-color: var(--accent); transform: translateY(-2px); }
	.feat-icon {
		display: inline-block;
		font-size: 1.5rem;
		color: #7dd3fc;
		margin-bottom: 8px;
	}
	.feat h3 {
		margin: 0 0 6px;
		font-family: 'Bricolage Grotesque', var(--sans);
		font-size: 1.05rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}
	.feat p {
		margin: 0;
		color: var(--fg-muted);
		font-size: 0.92rem;
		line-height: 1.5;
	}
	.feat p :global(code) {
		font-family: var(--mono);
		background: var(--bg);
		padding: 1px 6px;
		border-radius: 4px;
		color: var(--accent);
		font-size: 0.88em;
	}

	/* ── Vaults ────────────────────────────────────────────────────── */
	.vaults {
		position: relative;
		z-index: 1;
		max-width: 1100px;
		margin: 4rem auto 0;
		padding: 0 2rem;
	}
	.vault-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 14px;
	}
	.vault-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 18px 20px 20px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 12px;
		text-decoration: none;
		color: var(--fg);
		cursor: pointer;
		text-align: left;
		font: inherit;
		position: relative;
		overflow: hidden;
		transition: border-color 0.15s, transform 0.1s, background 0.15s;
	}
	.vault-card::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(135deg, rgba(125, 211, 252, 0.06), transparent 60%);
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.2s;
	}
	.vault-card:hover { border-color: #7dd3fc; transform: translateY(-1px); }
	.vault-card:hover::before { opacity: 1; }
	.vault-card-head { display: flex; align-items: center; gap: 10px; }
	.vault-crystal {
		font-size: 1.15rem;
		color: #7dd3fc;
		line-height: 1;
	}
	.vault-name { font-weight: 700; font-size: 1rem; font-family: 'Bricolage Grotesque', var(--sans); }
	.vault-path {
		font-size: 0.78rem;
		color: var(--fg-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.vault-open {
		margin-top: auto;
		font-size: 0.8rem;
		color: var(--fg-dim);
		font-family: var(--mono);
	}
	.vault-card:hover .vault-open { color: #7dd3fc; }
	.mono { font-family: var(--mono); }

	.vault-add {
		border-style: dashed;
		background: transparent;
	}
	.vault-crystal.plus { color: var(--accent); }

	/* ── Add vault form ─────────────────────────────────────────────── */
	.add-form {
		margin-top: 1rem;
		padding: 20px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 12px;
		display: flex; flex-direction: column; gap: 12px;
		max-width: 520px;
	}
	.add-form label { display: flex; flex-direction: column; gap: 4px; }
	.add-form span { font-size: 0.75rem; color: var(--fg-dim); text-transform: uppercase; letter-spacing: 0.1em; }
	.add-form input {
		padding: 9px 12px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 7px;
		color: var(--fg);
		font-family: var(--mono);
		font-size: 0.9rem;
	}
	.add-form input:focus { outline: 2px solid #7dd3fc; outline-offset: 1px; border-color: transparent; }
	.actions { display: flex; gap: 10px; }
	.btn {
		padding: 9px 16px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--fg);
		cursor: pointer;
		font-size: 0.9rem;
		font-family: inherit;
	}
	.btn:hover { border-color: var(--accent); color: var(--accent); }
	.btn.primary {
		background: linear-gradient(135deg, #7dd3fc 0%, #818cf8 100%);
		color: #0a0e1a;
		font-weight: 600;
		border-color: transparent;
	}
	.btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.err { color: var(--danger); margin: 0; font-size: 0.88rem; }

	/* ── Footer ─────────────────────────────────────────────────────── */
	.foot {
		position: relative;
		z-index: 1;
		margin-top: 6rem;
		padding: 2.5rem 2rem 3rem;
		text-align: center;
	}
	.foot-row {
		display: inline-flex; align-items: center; gap: 10px;
		font-size: 0.85rem; color: var(--fg-dim);
		flex-wrap: wrap; justify-content: center;
	}
	.foot-row a { color: var(--fg-muted); }
	.foot-row a:hover { color: var(--accent); }
	.foot-ver { font-size: 0.75rem; }
	.dot { color: var(--border-strong); }
	.foot-credit {
		margin-top: 10px;
		font-size: 0.8rem;
		color: var(--fg-dim);
	}
	.foot-credit a { color: var(--fg-muted); }
</style>
