import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildBoundedSelectedSourcesForAI,
    normalizeSourceSetUploadResult,
    selectedSourceSetFiles,
    sourceSetNodesFromRecords
} from '../src/utils/sourceSetUpload.js';

test('selectedSourceSetFiles preserves webkit relative paths', () => {
    const files = selectedSourceSetFiles([
        {
            name: 'Policy.md',
            size: 12,
            webkitRelativePath: 'standards/Policy.md'
        },
        {
            name: 'Readme.txt',
            size: 4
        }
    ]);

    assert.deepEqual(
        files.map((entry) => entry.relativePath),
        ['standards/Policy.md', 'Readme.txt']
    );
});

test('normalizeSourceSetUploadResult accepts backend uploaded source records', () => {
    const records = normalizeSourceSetUploadResult({
        flowId: 'flow-1',
        selectedFiles: selectedSourceSetFiles([
            {
                name: 'Policy.md',
                size: 128,
                webkitRelativePath: 'standards/Policy.md'
            }
        ]),
        data: {
            flow_id: 'flow-1',
            source_set: {
                id: 'source-set-1',
                label: 'Standards'
            },
            uploaded_sources: [
                {
                    document_id: 'src-policy',
                    component_id: 'component-policy',
                    filename: 'Policy.md',
                    type: 'md',
                    relative_path: 'standards/Policy.md',
                    source_refs: [{ document_id: 'src-policy', page: 2 }],
                    chunks: [{ id: 'chunk-1', text: 'Scope' }]
                }
            ]
        }
    });

    assert.equal(records.length, 1);
    assert.equal(records[0].id, 'src-policy');
    assert.equal(records[0].component_id, 'component-policy');
    assert.equal(records[0].path, 'standards/Policy.md');
    assert.equal(records[0].metadata.source_set_id, 'source-set-1');
    assert.equal(records[0].source_set.label, 'Standards');
    assert.deepEqual(records[0].source_refs, [{ document_id: 'src-policy', page: 2 }]);
    assert.equal(records[0].chunks[0].id, 'chunk-1');
});

test('normalizeSourceSetUploadResult filters full source libraries to selected paths', () => {
    const records = normalizeSourceSetUploadResult({
        flowId: 'flow-1',
        selectedFiles: selectedSourceSetFiles([
            {
                name: 'New.md',
                size: 64,
                webkitRelativePath: 'incoming/New.md'
            }
        ]),
        data: {
            source_library: {
                documents: [
                    {
                        document_id: 'src-old',
                        filename: 'Old.md',
                        relative_path: 'archive/Old.md'
                    },
                    {
                        document_id: 'src-new',
                        filename: 'New.md',
                        relative_path: 'incoming/New.md'
                    }
                ]
            }
        }
    });

    assert.deepEqual(
        records.map((record) => record.id),
        ['src-new']
    );
});

test('sourceSetNodesFromRecords creates dataSource nodes with source metadata', () => {
    const nodes = sourceSetNodesFromRecords(
        [
            {
                id: 'src-policy',
                title: 'Policy.md',
                type: 'md',
                component_id: 'component-policy',
                flow_id: 'flow-1',
                path: 'standards/Policy.md',
                metadata: { filename: 'Policy.md', relative_path: 'standards/Policy.md' },
                chunks: [{ id: 'chunk-1' }],
                segments: [],
                source_refs: [{ document_id: 'src-policy', chunk_id: 'chunk-1' }],
                source_set_id: 'source-set-1'
            }
        ],
        'flow-1'
    );

    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].type, 'dataSource');
    assert.equal(nodes[0].data.content, 'Policy.md');
    assert.equal(nodes[0].data.source_document_id, 'src-policy');
    assert.equal(nodes[0].data.relative_path, 'standards/Policy.md');
    assert.deepEqual(nodes[0].data.source_refs, [{ document_id: 'src-policy', chunk_id: 'chunk-1' }]);
    assert.equal(nodes[0].data.source_set_upload, true);
});

test('buildBoundedSelectedSourcesForAI limits chunks while preserving existing refs', () => {
    const boundedSources = buildBoundedSelectedSourcesForAI(
        [
            {
                id: 'doc-a',
                title: 'A',
                chunks: Array.from({ length: 12 }, (_, index) => ({
                    id: `a-${index}`,
                    source_refs: [{ document_id: 'doc-a', chunk_id: `a-${index}` }]
                })),
                source_refs: [{ document_id: 'doc-a' }]
            },
            {
                id: 'doc-b',
                title: 'B',
                chunks: Array.from({ length: 12 }, (_, index) => ({ id: `b-${index}` })),
                source_refs: [{ document_id: 'doc-b' }]
            }
        ],
        { maxSources: 2, maxChunks: 8, maxChunksPerSource: 6 }
    );

    assert.equal(boundedSources.length, 2);
    assert.deepEqual(
        boundedSources.map((source) => source.chunks.length),
        [6, 2]
    );
    assert.deepEqual(boundedSources[0].source_refs, [{ document_id: 'doc-a' }]);
    assert.equal(boundedSources[0].metadata.source_context_bounded, true);
    assert.equal(boundedSources[0].metadata.source_context_original_chunk_count, 12);
});
