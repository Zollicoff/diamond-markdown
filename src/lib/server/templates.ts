/**
 * Template substitution engine.
 *
 * Supports the Obsidian-style tokens we care about:
 *   {{date}}              — today, default YYYY-MM-DD
 *   {{date:FORMAT}}       — today, custom format
 *   {{date+Nd}}           — N days from today
 *   {{date-Nd:FORMAT}}    — N days before today, custom format
 *   {{time}}              — now, default HH:mm
 *   {{time:FORMAT}}       — now, custom format
 *   {{title}}             — the note's title (caller-supplied)
 *   {{cursor}}            — cursor placement marker (left in place; the
 *                           editor strips it on insert and positions
 *                           the caret there)
 *
 * Format tokens (case-sensitive, single-pass leftmost-longest):
 *   YYYY YY MM M DD D dddd ddd HH H mm m ss s
 *
 * Literal text inside a format is wrapped in `[brackets]` (Moment-style),
 * so `[Today is] dddd` produces "Today is Monday" — the bracketed bit is
 * passed through verbatim. Anything else outside the {{ }} token is also
 * literal because the engine only operates inside `{{ }}`.
 *
 * Wikilinks, tags, and frontmatter pass through as normal markdown — they
 * are not template-engine concerns.
 */

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(n: number): string { return String(n).padStart(2, '0'); }

// Single-pass alternation so longer tokens beat shorter ones. JS regex
// alternation is ordered: at each position the first alternative that
// matches wins, and the match advances past all consumed characters —
// so MM is picked over M, dddd over ddd, etc. The `\[([^\]]*)\]` arm at
// the front is the literal-escape: `[anything]` passes through.
const TOKEN_OR_LITERAL =
	/\[([^\]]*)\]|YYYY|YY|dddd|ddd|MM|M|DD|D|HH|H|mm|m|ss|s/g;

export function formatDate(d: Date, fmt: string): string {
	return fmt.replace(TOKEN_OR_LITERAL, (match, literal: string | undefined) => {
		if (literal !== undefined) return literal;
		switch (match) {
			case 'YYYY': return String(d.getFullYear());
			case 'YY':   return String(d.getFullYear()).slice(-2);
			case 'dddd': return WEEKDAYS_LONG[d.getDay()];
			case 'ddd':  return WEEKDAYS_SHORT[d.getDay()];
			case 'MM':   return pad2(d.getMonth() + 1);
			case 'M':    return String(d.getMonth() + 1);
			case 'DD':   return pad2(d.getDate());
			case 'D':    return String(d.getDate());
			case 'HH':   return pad2(d.getHours());
			case 'H':    return String(d.getHours());
			case 'mm':   return pad2(d.getMinutes());
			case 'm':    return String(d.getMinutes());
			case 'ss':   return pad2(d.getSeconds());
			case 's':    return String(d.getSeconds());
		}
		return match;
	});
}

export interface TemplateVars {
	title?: string;
	now?: Date;
}

const DATE_TOKEN_RE = /\{\{(date|time)([+-]\d+d)?(?::([^}]+))?\}\}/g;
const TITLE_TOKEN_RE = /\{\{title\}\}/g;

/**
 * Expand template tokens. `{{cursor}}` is intentionally NOT replaced — it
 * passes through so the editor can find and consume it.
 */
export function expandTemplate(body: string, vars: TemplateVars = {}): string {
	const now = vars.now ?? new Date();
	const title = vars.title ?? '';

	let out = body.replace(
		DATE_TOKEN_RE,
		(_match, kind: string, offset: string | undefined, fmt: string | undefined) => {
			const d = new Date(now.getTime());
			if (offset) {
				const days = parseInt(offset.replace('d', ''), 10);
				if (!Number.isNaN(days)) d.setDate(d.getDate() + days);
			}
			const defaultFmt = kind === 'time' ? 'HH:mm' : 'YYYY-MM-DD';
			return formatDate(d, fmt && fmt.trim() ? fmt : defaultFmt);
		}
	);
	out = out.replace(TITLE_TOKEN_RE, title);
	return out;
}

/** Marker the engine emits — the editor splits on this and places the caret. */
export const CURSOR_TOKEN = '{{cursor}}';
