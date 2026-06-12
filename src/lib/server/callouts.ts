import type { Tokens } from 'marked';
import { escAttr, escHtml } from '$lib/util/strings';

export type CalloutFold = 'open' | 'closed' | null;

export interface ObsidianCallout {
	type: string;
	title: string;
	body: string;
	fold: CalloutFold;
}

const CALLOUT_RE = /^\s*\[!([A-Za-z][\w-]*)\]([+-])?(?:[ \t]+(.+))?\s*$/;

const TYPE_LABELS: Record<string, string> = {
	abstract: 'Abstract',
	bug: 'Bug',
	caution: 'Caution',
	check: 'Check',
	cite: 'Cite',
	danger: 'Danger',
	done: 'Done',
	error: 'Error',
	example: 'Example',
	failure: 'Failure',
	faq: 'FAQ',
	help: 'Help',
	hint: 'Hint',
	important: 'Important',
	info: 'Info',
	missing: 'Missing',
	note: 'Note',
	question: 'Question',
	quote: 'Quote',
	success: 'Success',
	summary: 'Summary',
	tip: 'Tip',
	todo: 'Todo',
	warning: 'Warning'
};

const TYPE_ALIASES: Record<string, string> = {
	attention: 'warning',
	check: 'success',
	done: 'success',
	error: 'danger',
	fail: 'failure',
	faq: 'question',
	help: 'question',
	missing: 'failure',
	tldr: 'summary'
};

export function parseObsidianCallout(text: string): ObsidianCallout | null {
	const normalized = text.replace(/\r\n?/g, '\n');
	const [firstLine = '', ...bodyLines] = normalized.split('\n');
	const match = firstLine.match(CALLOUT_RE);
	if (!match) return null;
	const rawType = match[1].toLowerCase();
	const type = TYPE_ALIASES[rawType] ?? rawType;
	const title = match[3]?.trim() || TYPE_LABELS[type] || titleCase(type);
	const fold = match[2] === '+' ? 'open' : match[2] === '-' ? 'closed' : null;
	return {
		type: type.replace(/[^a-z0-9_-]+/g, '-') || 'note',
		title,
		body: bodyLines.join('\n').trim(),
		fold
	};
}

export function renderObsidianCallout(
	token: Tokens.Blockquote,
	renderBody: (markdown: string) => string
): string | null {
	const callout = parseObsidianCallout(token.text);
	if (!callout) return null;
	const bodyHtml = callout.body ? renderBody(callout.body) : '';
	const classes = `callout callout-${escAttr(callout.type)}${callout.fold ? ' callout-foldable' : ''}`;
	const title = `<span class="callout-title-text">${escHtml(callout.title)}</span>`;
	const body = bodyHtml ? `<div class="callout-body">${bodyHtml}</div>` : '';
	if (callout.fold) {
		const open = callout.fold === 'open' ? ' open' : '';
		return `<details class="${classes}"${open}><summary class="callout-title">${title}</summary>${body}</details>\n`;
	}
	return `<div class="${classes}"><div class="callout-title">${title}</div>${body}</div>\n`;
}

function titleCase(value: string): string {
	return value
		.split(/[-_]+/g)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ') || 'Note';
}
