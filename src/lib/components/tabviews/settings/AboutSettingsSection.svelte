<section class="group" id="about">
	<h2>About</h2>
	<div class="row">
		<div class="row-label">
			<div class="row-title">Diamond Markdown</div>
			<div class="row-hint">Self-hosted, git-native, web-first knowledge base.</div>
		</div>
		<div class="value">
			<a href="https://github.com/Zollicoff/diamondmarkdown" target="_blank" rel="noopener">GitHub</a>
			·
			<a href="https://diamondmarkdown.com" target="_blank" rel="noopener">Site</a>
		</div>
	</div>
</section>

<style>
	.group {
		scroll-margin-top: 20px;
		margin-bottom: 28px;
		padding-bottom: 20px;
		border-bottom: 0;
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
	.row-label { min-width: 0; flex: 1; }
	.row-title { font-size: 0.92rem; color: var(--fg); }
	.row-hint { font-size: 0.78rem; color: var(--fg-dim); margin-top: 2px; }
	.value { font-size: 0.85rem; color: var(--fg-muted); text-align: right; }
	.value a { color: var(--accent); text-decoration: none; }
	.value a:hover { text-decoration: underline; }

	@media (max-width: 760px) {
		.row {
			align-items: flex-start;
			flex-direction: column;
			gap: 10px;
		}
		.value { text-align: left; }
	}
</style>
