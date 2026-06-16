export function stripObsidianComments(value: string): string {
	return value.replace(/%%[\s\S]*?%%/g, '');
}

export function stripObsidianCommentsOutsideCode(value: string): string {
	const boundaryRe = /(```[\s\S]*?```|`[^`\n]+`)/g;
	const parts: string[] = [];
	let last = 0;
	for (const match of value.matchAll(boundaryRe)) {
		if (match.index! > last) parts.push(stripObsidianComments(value.slice(last, match.index!)));
		parts.push(match[0]);
		last = match.index! + match[0].length;
	}
	parts.push(stripObsidianComments(value.slice(last)));
	return parts.join('');
}
