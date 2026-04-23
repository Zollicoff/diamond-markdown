<script lang="ts">
	interface LinkRef { path: string; title: string; }

	interface Props {
		vaultId: string;
		backlinks: LinkRef[];
		outgoing?: { target: string; resolved: string | null }[];
		tags?: string[];
	}

	let { vaultId, backlinks, outgoing = [], tags = [] }: Props = $props();
</script>

<aside class="panel">
	<section>
		<h3>Backlinks <span class="count">{backlinks.length}</span></h3>
		{#if backlinks.length === 0}
			<p class="empty">No notes link here yet.</p>
		{:else}
			<ul>
				{#each backlinks as b}
					<li><a href={`/vault/${vaultId}/note/${encodeURI(b.path)}`}>{b.title}</a></li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h3>Outgoing <span class="count">{outgoing.length}</span></h3>
		{#if outgoing.length === 0}
			<p class="empty">This note has no wikilinks.</p>
		{:else}
			<ul>
				{#each outgoing as o}
					<li>
						{#if o.resolved}
							<a href={`/vault/${vaultId}/note/${encodeURI(o.resolved)}`}>{o.target}</a>
						{:else}
							<span class="broken" title="Broken link">{o.target}</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if tags.length > 0}
		<section>
			<h3>Tags <span class="count">{tags.length}</span></h3>
			<div class="tag-row">
				{#each tags as t}
					<a href={`/vault/${vaultId}/tag/${encodeURIComponent(t)}`} class="tag-pill">#{t}</a>
				{/each}
			</div>
		</section>
	{/if}
</aside>

<style>
	.panel {
		padding: 18px 16px;
		overflow-y: auto;
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: 24px;
		font-size: 0.85rem;
	}
	h3 {
		margin: 0 0 10px;
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
	ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
	li a {
		display: block;
		padding: 5px 8px;
		border-radius: 5px;
		color: var(--fg);
	}
	li a:hover { background: var(--bg-hover); text-decoration: none; color: var(--accent); }
	.broken { color: var(--link-broken); font-style: italic; padding: 5px 8px; display: block; }
	.empty { color: var(--fg-dim); font-size: 0.82rem; margin: 0; padding: 4px 8px; }
	.tag-row { display: flex; flex-wrap: wrap; gap: 4px; }
	.tag-pill {
		padding: 2px 10px;
		background: var(--accent-soft);
		color: var(--accent);
		border-radius: 99px;
		font-size: 0.78rem;
	}
	.tag-pill:hover { text-decoration: none; filter: brightness(1.1); }
</style>
