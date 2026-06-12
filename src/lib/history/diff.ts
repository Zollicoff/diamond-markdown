export type HistoryDiffKind = 'same' | 'added' | 'removed';

export interface HistoryDiffRow {
	id: string;
	kind: HistoryDiffKind;
	beforeLine: number | null;
	afterLine: number | null;
	text: string;
}

export interface HistoryDiffSummary {
	added: number;
	removed: number;
	unchanged: number;
	changed: boolean;
}

export function splitHistoryLines(content: string): string[] {
	if (!content) return [];
	const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
	if (lines.at(-1) === '') lines.pop();
	return lines;
}

export function buildHistoryLineDiff(beforeContent: string, afterContent: string): HistoryDiffRow[] {
	const before = splitHistoryLines(beforeContent);
	const after = splitHistoryLines(afterContent);
	const lcs = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0) as number[]);

	for (let i = before.length - 1; i >= 0; i -= 1) {
		for (let j = after.length - 1; j >= 0; j -= 1) {
			lcs[i][j] = before[i] === after[j]
				? lcs[i + 1][j + 1] + 1
				: Math.max(lcs[i + 1][j], lcs[i][j + 1]);
		}
	}

	const rows: HistoryDiffRow[] = [];
	let i = 0;
	let j = 0;
	while (i < before.length && j < after.length) {
		if (before[i] === after[j]) {
			rows.push(row(rows.length, 'same', i + 1, j + 1, before[i]));
			i += 1;
			j += 1;
		} else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
			rows.push(row(rows.length, 'removed', i + 1, null, before[i]));
			i += 1;
		} else {
			rows.push(row(rows.length, 'added', null, j + 1, after[j]));
			j += 1;
		}
	}

	while (i < before.length) {
		rows.push(row(rows.length, 'removed', i + 1, null, before[i]));
		i += 1;
	}
	while (j < after.length) {
		rows.push(row(rows.length, 'added', null, j + 1, after[j]));
		j += 1;
	}

	return rows;
}

export function summarizeHistoryDiff(rows: HistoryDiffRow[]): HistoryDiffSummary {
	let added = 0;
	let removed = 0;
	let unchanged = 0;
	for (const row of rows) {
		if (row.kind === 'added') added += 1;
		else if (row.kind === 'removed') removed += 1;
		else unchanged += 1;
	}
	return { added, removed, unchanged, changed: added > 0 || removed > 0 };
}

function row(
	index: number,
	kind: HistoryDiffKind,
	beforeLine: number | null,
	afterLine: number | null,
	text: string
): HistoryDiffRow {
	return {
		id: `${index}:${kind}:${beforeLine ?? '-'}:${afterLine ?? '-'}`,
		kind,
		beforeLine,
		afterLine,
		text
	};
}
