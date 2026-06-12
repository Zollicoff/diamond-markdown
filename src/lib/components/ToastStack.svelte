<script lang="ts">
	import type { ToastItem } from '$lib/dialog-ui';

	interface Props {
		toasts: ToastItem[];
		onDismiss: (id: number) => void;
	}

	let { toasts, onDismiss }: Props = $props();
</script>

{#if toasts.length > 0}
	<div class="toast-stack" aria-live="polite" aria-label="Notifications">
		{#each toasts as toast (toast.id)}
			<section class="toast" class:danger={toast.tone === 'danger'} class:success={toast.tone === 'success'}>
				<div>
					<strong>{toast.title}</strong>
					{#if toast.message}<p>{toast.message}</p>{/if}
				</div>
				<button type="button" aria-label="Dismiss notification" onclick={() => onDismiss(toast.id)}>x</button>
			</section>
		{/each}
	</div>
{/if}

<style>
	.toast-stack {
		position: fixed;
		right: 14px;
		bottom: 14px;
		z-index: 1200;
		display: grid;
		gap: 8px;
		width: min(360px, calc(100vw - 28px));
	}
	.toast {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
		border: 1px solid var(--border);
		border-left: 3px solid var(--accent);
		border-radius: 8px;
		background: var(--bg-elev);
		color: var(--fg);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
		padding: 10px 10px 10px 12px;
	}
	.toast.danger { border-left-color: var(--danger); }
	.toast.success { border-left-color: var(--success); }
	.toast strong {
		display: block;
		font-size: 0.84rem;
		font-weight: 650;
	}
	.toast p {
		margin: 3px 0 0;
		color: var(--fg-muted);
		font-size: 0.78rem;
		line-height: 1.35;
	}
	.toast button {
		width: 24px;
		height: 24px;
		padding: 0;
		border-radius: 50%;
		color: var(--fg-muted);
		border: 1px solid var(--border);
		background: var(--bg-elev);
		font: inherit;
		cursor: pointer;
	}
	.toast button:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
</style>
