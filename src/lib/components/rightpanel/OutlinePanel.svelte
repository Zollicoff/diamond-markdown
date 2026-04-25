<script lang="ts">
	interface Props {
		body: string;
	}

	let { body }: Props = $props();

	interface Heading { level: number; text: string; id: string; }

	function slugifyHeading(h: string): string {
		return h.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
	}

	const headings = $derived.by<Heading[]>(() => {
		const out: Heading[] = [];
		// Walk lines, but skip code fences so headings inside code aren't counted.
		const lines = body.split(/\r?\n/);
		let inFence = false;
		for (const line of lines) {
			if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
			if (inFence) continue;
			const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
			if (!m) continue;
			const level = m[1].length;
			const text = m[2].replace(/[#*_`]+/g, '').trim();
			out.push({ level, text, id: slugifyHeading(text) });
		}
		return out;
	});

	const minLevel = $derived(headings.length ? Math.min(...headings.map((h) => h.level)) : 1);

	function jump(id: string): void {
		// Use URL hash so the Preview's scroll-to-hash effect picks it up,
		// AND so the link is shareable / reload-stable.
		const url = new URL(window.location.href);
		url.hash = id;
		// Replace state — outline navigation shouldn't pollute history.
		window.history.replaceState(null, '', url.toString());
		const el = document.querySelector(`.preview #${CSS.escape(id)}`) as HTMLElement | null;
		el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
</script>

<section class="outline">
	<h3>Outline <span class="count">{headings.length}</span></h3>
	{#if headings.length === 0}
		<p class="empty">No headings yet.</p>
	{:else}
		<ul>
			{#each headings as h (h.id + h.text)}
				<li style:padding-left="{(h.level - minLevel) * 12}px">
					<button class="h-btn" data-level={h.level} onclick={() => jump(h.id)} title={h.text}>
						{h.text}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.outline {
		font-size: 0.85rem;
	}
	h3 {
		margin: 0 0 8px;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--fg-dim);
		font-weight: 600;
	}
	.count {
		margin-left: 4px;
		color: var(--fg-dim);
		font-weight: 400;
	}
	ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 1px; }
	li { margin: 0; }
	.h-btn {
		display: block;
		width: 100%;
		text-align: left;
		background: transparent;
		border: 0;
		color: var(--fg);
		padding: 3px 8px;
		border-radius: 4px;
		cursor: pointer;
		font: inherit;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.h-btn:hover { background: var(--bg-hover); color: var(--accent); }
	.h-btn[data-level='1'] { font-weight: 600; }
	.h-btn[data-level='2'] { font-weight: 500; }
	.h-btn[data-level='3'],
	.h-btn[data-level='4'],
	.h-btn[data-level='5'],
	.h-btn[data-level='6'] { color: var(--fg-muted); font-size: 0.92em; }
	.empty { color: var(--fg-dim); font-size: 0.82rem; margin: 4px 8px; }
</style>
