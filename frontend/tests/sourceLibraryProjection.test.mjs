import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildSourceLibraryProjection,
    createSourceLibrarySnapshot
} from '../src/views/graphProjection.js';

const sourceNode = {
    id: 'component-1',
    type: 'dataSource',
    data: {
        name: 'pdf',
        content: 'Project Plan.pdf',
        source_document_id: 'src_plan_v1',
        source_document: {
            id: 'src_plan_v1',
            filename: 'Project-Plan.pdf',
            original_filename: 'Project Plan.pdf',
            type: 'pdf',
            file_hash: 'abc123',
            size: 2048,
            version: 1
        },
        document_chunks: [
            {
                id: 'chk_1',
                document_id: 'src_plan_v1',
                text: 'Scope overview',
                page: 1
            }
        ],
        source_segments: [{ text: 'Scope overview', page: 1 }]
    }
};

const citedNode = {
    id: 'node-1',
    type: 'response',
    data: {
        title: 'Scope overview',
        source_refs: [
            {
                document_id: 'src_plan_v1',
                page: 1,
                section: 'Scope',
                quote_snippet: 'Scope overview',
                confidence: 0.91
            }
        ]
    }
};

test('buildSourceLibraryProjection derives coverage and snippets from source refs', () => {
    const projection = buildSourceLibraryProjection([sourceNode, citedNode], []);

    assert.equal(projection.sources.length, 1);
    assert.equal(projection.sources[0].id, 'src_plan_v1');
    assert.equal(projection.sources[0].title, 'Project Plan.pdf');
    assert.equal(projection.sources[0].coverage_count, 1);
    assert.equal(projection.sources[0].snippets[0].text, 'Scope overview');
    assert.equal(projection.cited_node_count, 1);
    assert.equal(projection.uncited_nodes.length, 0);
});

test('single uploaded source folds normalized citation ids onto that source', () => {
    const uploadedOnly = {
        ...sourceNode,
        data: {
            ...sourceNode.data,
            source_document_id: undefined,
            source_document: undefined
        }
    };
    const projection = buildSourceLibraryProjection([uploadedOnly, citedNode], []);

    assert.equal(projection.sources.length, 1);
    assert.equal(projection.sources[0].id, 'component-1');
    assert.equal(projection.sources[0].normalized_document_id, 'src_plan_v1');
    assert.equal(projection.sources[0].coverage_count, 1);
});

test('projection reports uncited nodes and incomplete refs', () => {
    const uncitedNode = {
        id: 'node-2',
        type: 'response',
        data: { title: 'Unverified assumption' }
    };
    const incompleteNode = {
        id: 'node-3',
        type: 'response',
        data: {
            title: 'Partial citation',
            source_refs: [{ document_id: 'src_plan_v1' }]
        }
    };
    const projection = buildSourceLibraryProjection(
        [sourceNode, citedNode, uncitedNode, incompleteNode],
        []
    );

    assert.equal(projection.uncited_nodes.map((node) => node.id).join(','), 'node-2');
    assert.equal(projection.incomplete_refs.length, 1);
    assert.deepEqual(projection.incomplete_refs[0].issues, [
        'Missing source location',
        'Missing source quote',
        'Missing source confidence'
    ]);
});

test('createSourceLibrarySnapshot strips live relationship fields', () => {
    const snapshot = createSourceLibrarySnapshot({
        nodes: [sourceNode, citedNode],
        edges: [],
        workspaceBrief: {},
        sourceLibrary: []
    });

    assert.equal(snapshot.length, 1);
    assert.equal(snapshot[0].id, 'src_plan_v1');
    assert.equal(snapshot[0].status, 'parsed');
    assert.equal(snapshot[0].chunks.length, 1);
    assert.equal(Object.hasOwn(snapshot[0], 'citing_nodes'), false);
    assert.equal(Object.hasOwn(snapshot[0], 'coverage_count'), false);
});
