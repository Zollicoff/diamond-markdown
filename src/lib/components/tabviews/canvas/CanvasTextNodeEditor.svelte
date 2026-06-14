<script lang="ts">
	import type { CanvasNode } from '$lib/types';
	import {
		canvasNodeTitle,
		canvasTextPreviewBlocks,
		type CanvasTextPreviewBlock,
		type CanvasTextPreviewInline
	} from '$lib/canvas/view';

	interface Props {
		node: CanvasNode;
		draft: string;
		changed: boolean;
		saving: boolean;
		deleting: boolean;
		disableDelete: boolean;
		onDraftChange: (node: CanvasNode, value: string) => void;
		onSave: (node: CanvasNode) => void | Promise<void>;
		onDelete: (node: CanvasNode) => void | Promise<void>;
	}

	let {
		node,
		draft,
		changed,
		saving,
		deleting,
		disableDelete,
		onDraftChange,
		onSave,
		onDelete
	}: Props = $props();

	const title = $derived(canvasNodeTitle(node));
	const previewBlocks = $derived(canvasTextPreviewBlocks(draft));
</script>

{#snippet inline(parts: CanvasTextPreviewInline[])}
	{#each parts as part}
		{#if part.kind === 'strong'}
			<strong>{part.text}</strong>
		{:else if part.kind === 'emphasis'}
			<em>{part.text}</em>
		{:else if part.kind === 'code'}
			<code>{part.text}</code>
		{:else if part.kind === 'strikethrough'}
			<del>{part.text}</del>
		{:else if part.kind === 'highlight'}
			<mark>{part.text}</mark>
		{:else if part.kind === 'wikilink'}
			<span class="wikilink">[[{part.text}]]</span>
		{:else if part.kind === 'link' && part.href}
			<a href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>
		{:else}
			{part.text}
		{/if}
	{/each}
{/snippet}

{#snippet previewBlock(block: CanvasTextPreviewBlock)}
	{#if block.type === 'heading'}
		<p class={`preview-heading level-${block.level}`}>
			{@render inline(block.inline)}
		</p>
	{:else if block.type === 'paragraph'}
		<p>
			{@render inline(block.inline)}
		</p>
	{:else if block.type === 'quote'}
		<blockquote>
			{@render inline(block.inline)}
		</blockquote>
	{:else if block.type === 'callout'}
		<div class={`preview-callout callout-${block.kind}`} data-fold={block.fold ?? 'none'}>
			<div class="callout-title">
				<span class="callout-kind">{block.kind}</span>
				<span>{@render inline(block.title)}</span>
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
					<span>{@render inline(item.inline)}</span>
				</li>
			{/each}
		</ul>
	{:else if block.type === 'ordered-list'}
		<ol>
			{#each block.items as item}
				<li>
					<span>{@render inline(item.inline)}</span>
				</li>
			{/each}
		</ol>
	{:else if block.type === 'table'}
		<div class="table-scroll">
			<table>
				<thead>
					<tr>
						{#each block.table.headers as cell}
							<th>{@render inline(cell.inline)}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each block.table.rows as row}
						<tr>
							{#each row as cell}
								<td>{@render inline(cell.inline)}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if block.type === 'code'}
		<pre data-language={block.language}><code>{block.code}</code></pre>
	{/if}
{/snippet}

<div class="text-node-content">
	<div class="canvas-text-preview" aria-label={`Canvas text preview for ${node.id}`}>
		{#if previewBlocks.length > 0}
			{#each previewBlocks as block}
				{@render previewBlock(block)}
			{/each}
		{:else}
			<p class="empty-preview">Empty text card</p>
		{/if}
	</div>
	<textarea
		class="node-editor"
		aria-label={`Canvas text for ${node.id}`}
		value={draft}
		oninput={(event) => onDraftChange(node, (event.currentTarget as HTMLTextAreaElement).value)}
	></textarea>
</div>
<div class="node-actions">
	<button
		class="mini node-save"
		disabled={saving || !changed}
		onclick={() => void onSave(node)}
	>
		{saving ? 'Saving...' : 'Save text'}
	</button>
	<button
		class="mini node-remove"
		aria-label={`Remove canvas node ${title}`}
		disabled={disableDelete}
		onclick={() => void onDelete(node)}
	>
		{deleting ? 'Removing...' : 'Remove'}
	</button>
</div>

<style>
	.text-node-content {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		gap: 6px;
		overflow: hidden;
	}
	.canvas-text-preview {
		flex: 0 1 auto;
		max-height: 86px;
		overflow: auto;
		border: 1px solid color-mix(in srgb, var(--canvas-node-border, var(--border)), transparent 45%);
		border-radius: 6px;
		padding: 6px 7px;
		background: color-mix(in srgb, var(--bg-elev), transparent 24%);
		color: var(--fg-muted);
		font-size: 0.75rem;
		line-height: 1.35;
	}
	.canvas-text-preview :global(*) {
		max-width: 100%;
	}
	.canvas-text-preview p,
	.canvas-text-preview blockquote,
	.canvas-text-preview ul,
	.canvas-text-preview ol,
	.canvas-text-preview pre {
		margin: 0 0 5px;
	}
	.canvas-text-preview p:last-child,
	.canvas-text-preview blockquote:last-child,
	.canvas-text-preview ul:last-child,
	.canvas-text-preview ol:last-child,
	.canvas-text-preview pre:last-child {
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
	code {
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0 3px;
		background: color-mix(in srgb, var(--bg), transparent 10%);
		color: var(--fg);
		font-family: var(--mono);
		font-size: 0.7rem;
	}
	del {
		color: var(--fg-dim);
		text-decoration-thickness: 1.5px;
	}
	mark {
		border-radius: 3px;
		padding: 0 3px;
		background: color-mix(in srgb, #facc15, transparent 72%);
		color: var(--fg);
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
	a,
	.wikilink {
		color: var(--accent);
		text-decoration: none;
	}
	.empty-preview {
		color: var(--fg-dim);
		font-style: italic;
	}
	.node-editor {
		min-height: 34px;
		width: 100%;
		flex: 1 1 42px;
		resize: none;
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 7px 8px;
		background: color-mix(in srgb, var(--bg), transparent 8%);
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.78rem;
		line-height: 1.35;
	}
	.node-editor:focus {
		outline: 2px solid color-mix(in srgb, var(--accent), transparent 55%);
		border-color: var(--accent);
	}
	.node-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		justify-content: flex-end;
	}
	.node-save,
	.node-remove {
		padding: 2px 7px;
		font-size: 0.7rem;
	}
	.mini {
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 3px 9px;
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.76rem;
		text-decoration: none;
		white-space: nowrap;
	}
	.mini:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.mini:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
</style>
