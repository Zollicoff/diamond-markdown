/**
 * Minimal YAML frontmatter parser. We only need: strings, arrays of strings,
 * booleans, and ISO dates. A dependency-free micro-parser is plenty for that.
 *
 * If a vault grows to use exotic YAML (nested objects, anchors, flow style),
 * swap in `js-yaml` — for now, keep the zero-dep surface.
 */

export interface Frontmatter {
	title?: string;
	tags?: string[];
	aliases?: string[];
	created?: string;
	updated?: string;
	public?: boolean;
	/** Pass-through for unknown keys — plugins may use them. */
	[key: string]: unknown;
}

const FENCE_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;

export interface Split {
	frontmatter: Frontmatter;
	body: string;
	raw: string;
	hasFrontmatter: boolean;
}

export function splitFrontmatter(source: string): Split {
	const m = source.match(FENCE_RE);
	if (!m) {
		return { frontmatter: {}, body: source, raw: '', hasFrontmatter: false };
	}
	return {
		frontmatter: parseSimpleYaml(m[1]),
		body: source.slice(m[0].length),
		raw: m[1],
		hasFrontmatter: true
	};
}

/**
 * Parse a tiny subset of YAML: `key: value` lines with string / array /
 * boolean / number values. No nesting, no multi-line scalars.
 */
function parseSimpleYaml(src: string): Frontmatter {
	const out: Frontmatter = {};
	const lines = src.split(/\r?\n/);
	for (const line of lines) {
		const trimmed = line.replace(/\s+$/, '');
		if (!trimmed || trimmed.startsWith('#')) continue;
		const kv = trimmed.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
		if (!kv) continue;
		const [, key, rawVal] = kv;
		out[key] = parseYamlValue(rawVal);
	}
	return out;
}

function parseYamlValue(raw: string): unknown {
	const val = raw.trim();
	if (val === '') return '';
	if (val === 'true') return true;
	if (val === 'false') return false;
	if (val === 'null' || val === '~') return null;
	// quoted string
	if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
		return val.slice(1, -1);
	}
	// flow-style array: [a, b, "c"]
	if (val.startsWith('[') && val.endsWith(']')) {
		const inner = val.slice(1, -1);
		return inner
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
			.map((s) => {
				if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
					return s.slice(1, -1);
				}
				return s;
			});
	}
	// number
	if (/^-?\d+(\.\d+)?$/.test(val)) return Number(val);
	// bare string
	return val;
}

/**
 * Collect both inline tags and frontmatter tags into one deduped set.
 */
export function collectTags(fm: Frontmatter, inline: string[]): string[] {
	const set = new Set(inline);
	const fmTags = fm.tags;
	if (Array.isArray(fmTags)) {
		for (const t of fmTags) if (typeof t === 'string') set.add(t);
	} else if (typeof fmTags === 'string') {
		// allow `tags: foo` shorthand
		set.add(fmTags);
	}
	return [...set];
}

export function aliasesOf(fm: Frontmatter): string[] {
	const a = fm.aliases;
	if (Array.isArray(a)) return a.filter((x): x is string => typeof x === 'string');
	if (typeof a === 'string') return [a];
	return [];
}

/**
 * Emit a frontmatter block as YAML — symmetric with splitFrontmatter.
 * Preserves the order of keys as they appear in the object.
 */
export function stringifyFrontmatter(fm: Frontmatter): string {
	const lines: string[] = ['---'];
	for (const [key, value] of Object.entries(fm)) {
		if (value === undefined) continue;
		lines.push(`${key}: ${stringifyYamlValue(value)}`);
	}
	lines.push('---');
	return lines.join('\n');
}

function stringifyYamlValue(val: unknown): string {
	if (Array.isArray(val)) {
		return '[' + val.map((v) => stringifyYamlScalar(v)).join(', ') + ']';
	}
	return stringifyYamlScalar(val);
}

function stringifyYamlScalar(val: unknown): string {
	if (val === null) return 'null';
	if (typeof val === 'boolean') return val ? 'true' : 'false';
	if (typeof val === 'number') return String(val);
	const s = String(val);
	// quote if contains ambiguous chars
	if (/^[-\d]|[:#,\[\]{}&*!|>'"%@`]|^\s|\s$/.test(s)) {
		return `"${s.replace(/"/g, '\\"')}"`;
	}
	return s;
}
