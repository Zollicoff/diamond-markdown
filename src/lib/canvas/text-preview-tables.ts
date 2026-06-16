import type { CanvasTextPreviewInline } from '$lib/canvas/text-preview-inlines';

export type CanvasTextPreviewTableAlignment = 'left' | 'center' | 'right' | null;

export interface CanvasTextPreviewTableCell {
	inline: CanvasTextPreviewInline[];
	align: CanvasTextPreviewTableAlignment;
}

export interface CanvasTextPreviewTable {
	headers: CanvasTextPreviewTableCell[];
	rows: CanvasTextPreviewTableCell[][];
}

export type CanvasTextInlineParser = (value: string) => CanvasTextPreviewInline[];

export function canvasTextTablePreviewAt(
	lines: string[],
	index: number,
	parseInline: CanvasTextInlineParser
): { table: CanvasTextPreviewTable; nextIndex: number } | null {
	const header = canvasTextTableHeaderRow(lines[index]);
	const alignments = canvasTextTableSeparator(lines[index + 1]);
	if (!header || !alignments) return null;

	const columnCount = header.length;
	const rows: CanvasTextPreviewTableCell[][] = [];
	let nextIndex = index + 2;
	while (nextIndex < lines.length) {
		const row = canvasTextTableBodyRow(lines[nextIndex]);
		if (!row) break;
		rows.push(canvasTextTableCells(row, columnCount, parseInline, alignments));
		nextIndex += 1;
	}

	return {
		table: {
			headers: canvasTextTableCells(header, columnCount, parseInline, alignments),
			rows
		},
		nextIndex
	};
}

function canvasTextTableHeaderRow(line: string | undefined): string[] | null {
	const cells = canvasTextTableRow(line);
	return cells && cells.length >= 2 ? cells : null;
}

function canvasTextTableBodyRow(line: string | undefined): string[] | null {
	const cells = canvasTextTableRow(line);
	return cells && cells.some((cell) => cell.length > 0) ? cells : null;
}

function canvasTextTableRow(line: string | undefined): string[] | null {
	if (!line || !line.includes('|')) return null;
	const trimmed = line.trim();
	if (!trimmed || /^[-:|\s]+$/.test(trimmed)) return null;
	return canvasTextTableSplitCells(trimmed).map((cell) => cell.trim());
}

function canvasTextTableSeparator(line: string | undefined): CanvasTextPreviewTableAlignment[] | null {
	if (!line || !line.includes('|')) return null;
	const cells = canvasTextTableSplitCells(line.trim()).map((cell) => cell.trim());
	if (cells.length < 2) return null;
	const alignments: CanvasTextPreviewTableAlignment[] = [];
	for (const cell of cells) {
		if (!/^:?-{3,}:?$/.test(cell)) return null;
		const left = cell.startsWith(':');
		const right = cell.endsWith(':');
		alignments.push(left && right ? 'center' : right ? 'right' : left ? 'left' : null);
	}
	return alignments;
}

function canvasTextTableSplitCells(row: string): string[] {
	const body = canvasTextTableBody(row);
	const cells: string[] = [];
	let cell = '';
	for (let index = 0; index < body.length; index += 1) {
		const char = body[index];
		if (char === '|' && !canvasTextTablePipeEscaped(body, index)) {
			cells.push(cell);
			cell = '';
			continue;
		}
		if (char === '|' && canvasTextTablePipeEscaped(body, index)) {
			cell = cell.slice(0, -1) + '|';
			continue;
		}
		cell += char;
	}
	cells.push(cell);
	return cells;
}

function canvasTextTableBody(row: string): string {
	let start = 0;
	let end = row.length;
	if (row[start] === '|') start += 1;
	if (end > start && row[end - 1] === '|' && !canvasTextTablePipeEscaped(row, end - 1)) end -= 1;
	return row.slice(start, end);
}

function canvasTextTablePipeEscaped(value: string, pipeIndex: number): boolean {
	let slashCount = 0;
	for (let index = pipeIndex - 1; index >= 0 && value[index] === '\\'; index -= 1) {
		slashCount += 1;
	}
	return slashCount % 2 === 1;
}

function canvasTextTableCells(
	values: string[],
	columnCount: number,
	parseInline: CanvasTextInlineParser,
	alignments: CanvasTextPreviewTableAlignment[] = []
): CanvasTextPreviewTableCell[] {
	return Array.from({ length: columnCount }, (_, index) => ({
		inline: parseInline(values[index] ?? ''),
		align: alignments[index] ?? null
	}));
}
