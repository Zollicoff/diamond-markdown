<script lang="ts">
	import type { GitSyncRecoveryCopy } from '$lib/sync/recovery';

	interface Props {
		copy: GitSyncRecoveryCopy;
	}

	let { copy }: Props = $props();
</script>

<header class="panel-head">
	<div>
		<div class="panel-title">{copy.title}</div>
		<div class="panel-subtitle">{copy.subtitle}</div>
	</div>
	<span class="badge">{copy.badge}</span>
</header>

<style>
	.panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.panel-title {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--fg);
	}
	.panel-subtitle {
		font-size: 0.72rem;
		color: var(--fg-dim);
		margin-top: 2px;
	}
	.badge {
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--accent);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 3px 7px;
	}
</style>
