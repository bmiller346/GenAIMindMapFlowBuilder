import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeProvider } from '../src/utils/integrationSummary.js';

test('summarizeProvider projects mapped refs, batches, credentials, and warnings', () => {
    const nodes = [
        {
            id: 'node-1',
            data: {
                external_refs: {
                    monday: {
                        board_id: 'board-1',
                        item_id: 'item-1',
                        export_batch_id: 'batch-1',
                        last_pushed_at: '2026-05-14T14:00:00.000Z'
                    }
                }
            }
        },
        {
            id: 'node-2',
            data: {
                external_refs: {
                    monday: {
                        board_id: 'board-1',
                        export_batch_id: 'batch-2',
                        last_pulled_at: '2026-05-14T15:00:00.000Z'
                    }
                }
            }
        },
        {
            id: 'node-3',
            data: {
                external_refs: {
                    miro: {
                        board_id: 'miro-board',
                        item_id: 'miro-item'
                    }
                }
            }
        }
    ];
    const validationIssues = [
        {
            code: 'invalid_external_ref',
            detail: 'monday external ref is missing item_id.'
        },
        {
            code: 'missing_source_ref',
            detail: 'Source refs are incomplete.'
        }
    ];

    const summary = summarizeProvider(nodes, 'monday', true, validationIssues);

    assert.equal(summary.provider, 'monday');
    assert.equal(summary.hasCredential, true);
    assert.equal(summary.mappedNodes, 2);
    assert.equal(summary.completeRefs, 1);
    assert.equal(summary.lastExportBatch, 'batch-2');
    assert.equal(summary.warnings.length, 1);
    assert.match(summary.lastPush, /May 14/);
    assert.match(summary.lastPull, /May 14/);
});
