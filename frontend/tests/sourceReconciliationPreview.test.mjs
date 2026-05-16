import assert from 'node:assert/strict';
import test from 'node:test';
import { combineReconciliationPreviews } from '../src/utils/reconciliationPreviewCombine.js';

test('combineReconciliationPreviews preserves source-only chunks from every source', () => {
    const combined = combineReconciliationPreviews(
        [
            {
                preview_items: [{ id: 'repair-a' }],
                warnings: ['first warning'],
                metadata: {
                    source_id: 'source-a',
                    source_title: 'Source A',
                    matched_node_count: 1,
                    source_only_chunk_count: 1,
                    source_only_chunks: [
                        {
                            chunk_id: 'chunk-a',
                            section: 'Market',
                            snippet: 'AEC owners need advisory support.'
                        }
                    ]
                }
            },
            {
                preview_items: [{ id: 'repair-b' }],
                warnings: ['second warning'],
                metadata: {
                    source_id: 'source-b',
                    source_title: 'Source B',
                    matched_node_count: 2,
                    source_only_chunk_count: 1,
                    source_only_chunks: [
                        {
                            chunk_id: 'chunk-b',
                            section: 'Delivery',
                            snippet: 'Delivery work should use implementation sprints.'
                        }
                    ]
                }
            }
        ],
        [{ id: 'source-a' }, { id: 'source-b' }]
    );

    assert.equal(combined.metadata.matched_node_count, 3);
    assert.equal(combined.metadata.source_only_chunk_count, 2);
    assert.deepEqual(
        combined.metadata.source_only_chunks.map((chunk) => [
            chunk.source_id,
            chunk.source_title,
            chunk.chunk_id
        ]),
        [
            ['source-a', 'Source A', 'chunk-a'],
            ['source-b', 'Source B', 'chunk-b']
        ]
    );
    assert.deepEqual(
        combined.preview_items.map((item) => item.id),
        ['repair-a', 'repair-b']
    );
    assert.deepEqual(combined.warnings, ['first warning', 'second warning']);
    assert.deepEqual(combined.metadata.selected_source_ids, ['source-a', 'source-b']);
});
