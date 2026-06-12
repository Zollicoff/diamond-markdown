import type { ParsedEmbed } from './wikilink';
import { escAttr } from '$lib/util/strings';

export function embedImageAttrs(embed: Pick<ParsedEmbed, 'alt' | 'target' | 'width' | 'height'>): string {
	const alt = embed.alt ?? embed.target.split('/').pop() ?? '';
	const sizeAttrs = [
		embed.width != null ? ` width="${embed.width}"` : '',
		embed.height != null ? ` height="${embed.height}"` : ''
	].join('');
	return `alt="${escAttr(alt)}" class="embed-image" loading="lazy"${sizeAttrs}`;
}
