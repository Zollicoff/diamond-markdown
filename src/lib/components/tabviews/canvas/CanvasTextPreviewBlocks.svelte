<script lang="ts">
	import type { CanvasTextPreviewBlock } from '$lib/canvas/text-preview';
	import CanvasTextPreviewEmbed from './CanvasTextPreviewEmbed.svelte';
	import CanvasTextPreviewInline from './CanvasTextPreviewInline.svelte';

	interface Props {
		vaultId: string;
		blocks: CanvasTextPreviewBlock[];
		emptyLabel?: string;
	}

	let { vaultId, blocks, emptyLabel = 'Empty text card' }: Props = $props();
</script>

{#snippet previewBlock(block: CanvasTextPreviewBlock)}
	{#if block.type === 'heading'}
		<p class={`preview-heading level-${block.level}`}>
			<CanvasTextPreviewInline {vaultId} parts={block.inline} />
		</p>
	{:else if block.type === 'paragraph'}
		<p>
			<CanvasTextPreviewInline {vaultId} parts={block.inline} />
		</p>
	{:else if block.type === 'quote'}
		<blockquote>
			<CanvasTextPreviewInline {vaultId} parts={block.inline} />
		</blockquote>
	{:else if block.type === 'callout'}
		<div class={`preview-callout callout-${block.kind}`} data-fold={block.fold ?? 'none'}>
			<div class="callout-title">
				<span class="callout-kind">{block.kind}</span>
				<span><CanvasTextPreviewInline {vaultId} parts={block.title} /></span>
				{#if block.fold}
					<span class="callout-fold" aria-label={`${block.fold} callout`}>{block.fold === 'closed' ? '-' : '+'}</span>
				{/if}
			</div>
			{#if block.fold !== 'closed' && block.body.length > 0}
				<div class="callout-body">
					{#each block.body as child}
						{@render previewBlock(child)}
					{/each}
				</div>
			{/if}
		</div>
	{:else if block.type === 'unordered-list'}
		<ul>
			{#each block.items as item}
				<li class:checked={item.checked === true} class:unchecked={item.checked === false}>
					{#if item.checked !== undefined}
						<span class="task-state" aria-hidden="true">{item.checked ? 'x' : ''}</span>
					{/if}
					<span><CanvasTextPreviewInline {vaultId} parts={item.inline} /></span>
				</li>
			{/each}
		</ul>
	{:else if block.type === 'ordered-list'}
		<ol>
			{#each block.items as item}
				<li>
					<span><CanvasTextPreviewInline {vaultId} parts={item.inline} /></span>
				</li>
			{/each}
		</ol>
	{:else if block.type === 'table'}
		<div class="table-scroll">
			<table>
				<thead>
					<tr>
						{#each block.table.headers as cell}
							<th><CanvasTextPreviewInline {vaultId} parts={cell.inline} /></th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each block.table.rows as row}
						<tr>
							{#each row as cell}
								<td><CanvasTextPreviewInline {vaultId} parts={cell.inline} /></td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if block.type === 'embed'}
		<CanvasTextPreviewEmbed {vaultId} embed={block.embed} />
	{:else if block.type === 'thematic-break'}
		<hr />
	{:else if block.type === 'code'}
		<pre data-language={block.language}><code>{block.code}</code></pre>
	{/if}
{/snippet}

{#if blocks.length > 0}
	{#each blocks as block}
		{@render previewBlock(block)}
	{/each}
{:else}
	<p class="empty-preview">{emptyLabel}</p>
{/if}

<style>
	p,
	blockquote,
	ul,
	ol,
	pre {
		margin: 0 0 5px;
	}
	p:last-child,
	blockquote:last-child,
	ul:last-child,
	ol:last-child,
	pre:last-child {
		margin-bottom: 0;
	}
	.preview-heading {
		color: var(--fg);
		font-weight: 700;
		line-height: 1.18;
	}
	.preview-heading.level-1 {
		font-size: 0.92rem;
	}
	.preview-heading.level-2 {
		font-size: 0.84rem;
	}
	.preview-heading.level-3 {
		font-size: 0.78rem;
	}
	.preview-heading.level-4,
	.preview-heading.level-5,
	.preview-heading.level-6 {
		font-size: 0.74rem;
	}
	.preview-heading.level-5,
	.preview-heading.level-6 {
		color: var(--fg-muted);
	}
	blockquote {
		border-left: 2px solid var(--canvas-node-border, var(--accent));
		padding-left: 7px;
		color: var(--fg-dim);
	}
	.preview-callout {
		display: grid;
		gap: 5px;
		margin: 0 0 5px;
		border: 1px solid color-mix(in srgb, var(--canvas-node-border, var(--accent)), transparent 45%);
		border-left-width: 3px;
		border-radius: 6px;
		padding: 6px 7px;
		background: color-mix(in srgb, var(--canvas-node-border, var(--accent)), transparent 90%);
	}
	.preview-callout:last-child {
		margin-bottom: 0;
	}
	.callout-title {
		display: flex;
		align-items: baseline;
		gap: 6px;
		min-width: 0;
		color: var(--fg);
		font-weight: 700;
	}
	.callout-kind {
		flex: 0 0 auto;
		color: var(--canvas-node-border, var(--accent));
		font-family: var(--mono);
		font-size: 0.58rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.callout-fold {
		margin-left: auto;
		color: var(--fg-dim);
		font-family: var(--mono);
		font-size: 0.68rem;
	}
	.callout-body {
		min-width: 0;
		color: var(--fg-muted);
	}
	ul,
	ol {
		display: grid;
		gap: 3px;
		padding-left: 17px;
	}
	.table-scroll {
		max-width: 100%;
		margin: 0 0 5px;
		overflow: auto;
		border: 1px solid color-mix(in srgb, var(--canvas-node-border, var(--border)), transparent 48%);
		border-radius: 6px;
	}
	.table-scroll:last-child {
		margin-bottom: 0;
	}
	table {
		width: 100%;
		min-width: 180px;
		border-collapse: collapse;
		font-size: 0.7rem;
	}
	th,
	td {
		border-bottom: 1px solid color-mix(in srgb, var(--canvas-node-border, var(--border)), transparent 62%);
		padding: 4px 6px;
		text-align: left;
		vertical-align: top;
	}
	th {
		background: color-mix(in srgb, var(--canvas-node-border, var(--accent)), transparent 88%);
		color: var(--fg);
		font-weight: 700;
	}
	tr:last-child td {
		border-bottom: 0;
	}
	li {
		min-width: 0;
	}
	li.checked,
	li.unchecked {
		display: flex;
		gap: 5px;
		align-items: baseline;
		list-style: none;
	}
	.task-state {
		display: inline-grid;
		width: 12px;
		height: 12px;
		flex: 0 0 auto;
		place-items: center;
		border: 1px solid var(--canvas-node-border, var(--border));
		border-radius: 3px;
		color: var(--canvas-node-border, var(--accent));
		font-family: var(--mono);
		font-size: 0.55rem;
		line-height: 1;
		text-transform: uppercase;
	}
	pre {
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: 5px;
		padding: 6px;
		background: color-mix(in srgb, var(--bg), transparent 4%);
	}
	pre code {
		border: 0;
		padding: 0;
		background: transparent;
		white-space: pre;
	}
	.empty-preview {
		color: var(--fg-dim);
		font-style: italic;
	}
	hr {
		margin: 6px 0;
		border: 0;
		border-top: 1px solid color-mix(in srgb, var(--canvas-node-border, var(--border)), transparent 45%);
	}
	hr:last-child {
		margin-bottom: 0;
	}
</style>
