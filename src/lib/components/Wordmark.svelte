<script lang="ts">
	interface Props {
		/** Rendered pixel size (the crystal + text scale together). */
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
		/** Animate the crystal facets on hover/loop. */
		animated?: boolean;
		href?: string | null;
		/** Override the default wordmark text. */
		text?: string;
		/** Render only the crystal icon, no text. */
		iconOnly?: boolean;
		/** Render only the text, no icon. */
		textOnly?: boolean;
	}

	let { size = 'md', animated = true, href = null, text = 'Diamond Markdown', iconOnly = false, textOnly = false }: Props = $props();

	const dims: Record<Required<Props>['size'], { wm: number; text: string; tracking: string }> = {
		xs: { wm: 18, text: '1rem',    tracking: '-0.02em' },
		sm: { wm: 26, text: '1.35rem', tracking: '-0.02em' },
		md: { wm: 40, text: '2rem',    tracking: '-0.03em' },
		lg: { wm: 72, text: '3.6rem',  tracking: '-0.035em' },
		xl: { wm: 120, text: '6rem',   tracking: '-0.04em' }
	};
	const d = dims[size];
</script>

<svelte:element
	this={href ? 'a' : 'span'}
	href={href ?? undefined}
	class="wordmark"
	class:animated
	class:icon-only={iconOnly}
	class:text-only={textOnly}
	data-size={size}
	style="--wm-size: {d.wm}px; --text-size: {d.text}; --tracking: {d.tracking};"
>
	{#if !textOnly}
	<svg class="crystal" viewBox="0 0 100 100" aria-hidden="true">
		<defs>
			<linearGradient id="diamond-face-a-{size}" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0%" stop-color="#7dd3fc" />
				<stop offset="100%" stop-color="#60a5fa" />
			</linearGradient>
			<linearGradient id="diamond-face-b-{size}" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="#c084fc" />
				<stop offset="100%" stop-color="#818cf8" />
			</linearGradient>
			<linearGradient id="diamond-face-c-{size}" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0%" stop-color="#60a5fa" />
				<stop offset="100%" stop-color="#a855f7" />
			</linearGradient>
			<linearGradient id="diamond-face-d-{size}" x1="1" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="#fbbf24" />
				<stop offset="100%" stop-color="#f97316" />
			</linearGradient>
		</defs>
		<!-- Top-left face -->
		<polygon class="facet f1" points="50,8 24,36 50,36" fill="url(#diamond-face-a-{size})" />
		<!-- Top-right face -->
		<polygon class="facet f2" points="50,8 76,36 50,36" fill="url(#diamond-face-c-{size})" />
		<!-- Left pavilion -->
		<polygon class="facet f3" points="24,36 50,36 50,92" fill="url(#diamond-face-b-{size})" />
		<!-- Right pavilion -->
		<polygon class="facet f4" points="76,36 50,36 50,92" fill="url(#diamond-face-d-{size})" />
		<!-- Girdle edge -->
		<path class="girdle" d="M24 36 L76 36" stroke="rgba(255,255,255,0.35)" stroke-width="0.6" />
		<!-- Crown facet lines -->
		<path class="edge" d="M50 8 L50 36" stroke="rgba(255,255,255,0.45)" stroke-width="0.6" />
		<!-- Pavilion facet -->
		<path class="edge" d="M24 36 L50 92 L76 36" stroke="rgba(255,255,255,0.25)" stroke-width="0.6" fill="none" />
		<!-- Highlight glint -->
		<polygon class="glint" points="38,18 32,30 44,30" fill="rgba(255,255,255,0.6)" />
	</svg>
	{/if}
	{#if !iconOnly}
	<span class="word">{text}</span>
	{/if}
</svelte:element>

<style>
	.wordmark {
		display: inline-flex;
		align-items: center;
		gap: 0.55em;
		color: var(--fg);
		text-decoration: none;
		font-family: 'Bricolage Grotesque', 'Space Grotesk', var(--sans);
		font-variation-settings: 'wdth' 100, 'opsz' 96;
		font-weight: 800;
		font-size: var(--text-size);
		letter-spacing: var(--tracking);
		line-height: 1;
		user-select: none;
	}
	.crystal {
		width: var(--wm-size);
		height: var(--wm-size);
		flex: none;
		filter: drop-shadow(0 6px 14px rgba(96, 165, 250, 0.35));
	}
	.word {
		background: linear-gradient(180deg, var(--fg) 0%, rgba(230, 237, 243, 0.82) 100%);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	/* Subtle rotation on hover + idle shimmer on the glint. */
	.wordmark.animated .crystal {
		transition: transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1);
	}
	.wordmark.animated:hover .crystal {
		transform: rotate(-8deg) scale(1.04);
	}
	.wordmark.animated .glint {
		animation: diamond-glint 4s ease-in-out infinite;
		transform-origin: 38px 24px;
	}
	@keyframes diamond-glint {
		0%, 100% { opacity: 0.7; transform: translate(0, 0); }
		25%      { opacity: 1;   transform: translate(2px, -1px); }
		60%      { opacity: 0.5; transform: translate(-2px, 1px); }
	}

	/* Larger sizes get a faint backdrop halo behind the crystal. */
	[data-size='lg'] .crystal,
	[data-size='xl'] .crystal {
		filter:
			drop-shadow(0 8px 24px rgba(96, 165, 250, 0.38))
			drop-shadow(0 2px 6px rgba(192, 132, 252, 0.28));
	}

	@media (prefers-reduced-motion: reduce) {
		.wordmark.animated .crystal { transition: none; }
		.wordmark.animated:hover .crystal { transform: none; }
		.wordmark.animated .glint { animation: none; }
	}
</style>
