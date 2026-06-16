import { expect, test } from '@playwright/test';
import {
	normalizeSearchResponse,
	savedSearchSavePayload,
	searchQueryParams
} from '../src/lib/api/search';
import type { SearchResponsePayload } from '../src/lib/api/search';

test.describe('search API client helpers', () => {
	test('builds search query params with legacy truthy option behavior', () => {
		const titleParams = searchQueryParams(' roof photos ', {});
		expect(titleParams.get('q')).toBe(' roof photos ');
		expect(titleParams.has('full')).toBe(false);
		expect(titleParams.has('limit')).toBe(false);
		expect(titleParams.has('offset')).toBe(false);

		const fullParams = searchQueryParams('panel', { full: true, limit: 200, offset: 40 });
		expect(Object.fromEntries(fullParams.entries())).toEqual({
			q: 'panel',
			full: '1',
			limit: '200',
			offset: '40'
		});

		const zeroParams = searchQueryParams('meter', { limit: 0, offset: 0 });
		expect(Object.fromEntries(zeroParams.entries())).toEqual({ q: 'meter' });
	});

	test('normalizes sparse search responses with stable pagination defaults', () => {
		const response = normalizeSearchResponse(
			'  roof  ',
			{ full: true, limit: 200, offset: 20 },
			{
				results: [{ path: 'Client/Roof.md', title: 'Roof survey' }]
			}
		);

		expect(response).toEqual({
			query: 'roof',
			mode: 'full',
			limit: 200,
			offset: 20,
			total: 1,
			limited: false,
			hasMore: false,
			nextOffset: null,
			results: [{ path: 'Client/Roof.md', title: 'Roof survey' }]
		});
	});

	test('derives missing next-page metadata from total and returned rows', () => {
		const response = normalizeSearchResponse('panel', {}, {
			query: 'panel',
			mode: 'title',
			limit: 25,
			offset: 25,
			total: 60,
			results: [
				{ path: 'Panels/A.md', title: 'Panel A' },
				{ path: 'Panels/B.md', title: 'Panel B' }
			]
		} satisfies SearchResponsePayload);

		expect(response.nextOffset).toBe(27);
		expect(response.limited).toBe(true);
		expect(response.hasMore).toBe(true);
	});

	test('preserves saved-search mutation payloads explicitly', () => {
		expect(
			savedSearchSavePayload({
				id: 'client-solar',
				name: 'Client Solar',
				query: 'tag:client content:"Illinois Shines"',
				mode: 'full'
			})
		).toEqual({
			id: 'client-solar',
			name: 'Client Solar',
			query: 'tag:client content:"Illinois Shines"',
			mode: 'full'
		});
	});
});
