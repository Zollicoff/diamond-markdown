<script lang="ts">
	interface Props {
		title: string;
		html: string;
		context: Record<string, unknown>;
		height?: number;
	}

	let { title, html, context, height = 160 }: Props = $props();
	let frame = $state<HTMLIFrameElement | null>(null);
	const boundedHeight = $derived(Math.min(720, Math.max(80, Number(height) || 160)));

	function postContext(): void {
		try {
			frame?.contentWindow?.postMessage({
				type: 'diamond:panel-context',
				context
			}, '*');
		} catch (e) {
			console.error('[plugins] iframe context post failed:', e);
		}
	}

	function scheduleContextPost(): void {
		postContext();
		window.setTimeout(postContext, 25);
		window.setTimeout(postContext, 100);
	}

	$effect(() => {
		if (!frame) return;
		context;
		queueMicrotask(scheduleContextPost);
	});
</script>

<iframe
	bind:this={frame}
	{title}
	srcdoc={html}
	sandbox="allow-scripts"
	style={`--plugin-frame-height: ${boundedHeight}px;`}
	onload={scheduleContextPost}
></iframe>

<style>
	iframe {
		display: block;
		width: 100%;
		min-height: var(--plugin-frame-height);
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color-scheme: light dark;
	}
</style>
