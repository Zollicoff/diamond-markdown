<script lang="ts">
	interface VaultSettingsSummary {
		name: string;
		path: string;
	}

	interface Props {
		vault: VaultSettingsSummary;
	}

	let { vault }: Props = $props();
</script>

<section class="group" id="vault">
	<h2>Vault</h2>
	<div class="row">
		<div class="row-label">
			<div class="row-title">Name</div>
			<div class="row-hint">The display name of the active vault.</div>
		</div>
		<div class="value mono">{vault.name}</div>
	</div>
	<div class="row">
		<div class="row-label">
			<div class="row-title">Location</div>
			<div class="row-hint">Where the markdown files live on disk.</div>
		</div>
		<div class="value mono path" title={vault.path}>{vault.path}</div>
	</div>
	<div class="row">
		<div class="row-label">
			<div class="row-title">Switch vault</div>
			<div class="row-hint">Pick a different vault from the registry.</div>
		</div>
		<a class="link-btn" href="/">Open vault picker →</a>
	</div>
</section>

<style>
	.group {
		scroll-margin-top: 20px;
		margin-bottom: 28px;
		padding-bottom: 20px;
		border-bottom: 1px solid var(--border);
	}
	.group h2 {
		font-family: 'Bricolage Grotesque', var(--sans);
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--fg-muted);
		margin: 0 0 14px;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		padding: 10px 0;
	}
	.row + .row { border-top: 1px dashed var(--border); }
	.row-label { min-width: 0; flex: 1; }
	.row-title { font-size: 0.92rem; color: var(--fg); }
	.row-hint { font-size: 0.78rem; color: var(--fg-dim); margin-top: 2px; }
	.value { font-size: 0.85rem; color: var(--fg-muted); text-align: right; }
	.value.path { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.link-btn {
		color: var(--accent);
		text-decoration: none;
		font-size: 0.86rem;
	}
	.link-btn:hover { text-decoration: underline; }
	.mono { font-family: var(--mono); }

	@media (max-width: 760px) {
		.row {
			align-items: flex-start;
			flex-direction: column;
			gap: 10px;
		}
		.value { text-align: left; }
		.value.path { max-width: 100%; }
	}
</style>
