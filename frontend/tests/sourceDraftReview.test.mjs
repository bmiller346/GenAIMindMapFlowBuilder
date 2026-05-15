import assert from 'node:assert/strict';
import test from 'node:test';
import {
    normalizeAcceptedSourceDraftGraph,
    previewSourceDraftNodes,
    sourceBackedDraftGraph,
    summarizeSourceDraft
} from '../src/utils/sourceDraftReview.js';

const graph = {
    nodes: [
        {
            id: 'source-1',
            type: 'dataSource',
            data: { content: 'Spec.docx' }
        },
        {
            id: 'root-question',
            type: 'question',
            data: { question: 'What does this cover?' }
        },
        {
            id: 'cited',
            type: 'response',
            data: {
                label: 'Supported requirement',
                source_refs: [{ source_id: 'source-1', page: 4 }]
            }
        },
        {
            id: 'review',
            type: 'response',
            data: {
                label: 'Unverified dependency',
                node_type: 'needs_review'
            }
        },
        {
            id: 'plain',
            type: 'response',
            data: { label: 'Plain extracted topic' }
        }
    ],
    edges: [
        { id: 'e1', source: 'source-1', target: 'root-question' },
        { id: 'e2', source: 'root-question', target: 'cited' },
        { id: 'e3', source: 'root-question', target: 'review' },
        { id: 'e4', source: 'root-question', target: 'plain' }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
};

test('summarizeSourceDraft reports source coverage and review counts', () => {
    assert.deepEqual(summarizeSourceDraft(graph), {
        totalNodes: 5,
        contentNodes: 3,
        totalEdges: 4,
        topLevelNodes: 0,
        sourceBackedNodes: 1,
        needsReviewNodes: 1,
        unsourcedNodes: 2
    });
});

test('previewSourceDraftNodes emits compact status rows', () => {
    assert.deepEqual(previewSourceDraftNodes(graph, 2), [
        {
            id: 'cited',
            label: 'Supported requirement',
            sourceBacked: true,
            needsReview: false
        },
        {
            id: 'review',
            label: 'Unverified dependency',
            sourceBacked: false,
            needsReview: true
        }
    ]);
});

test('sourceBackedDraftGraph keeps structural and cited nodes only', () => {
    const filtered = sourceBackedDraftGraph(graph);

    assert.deepEqual(
        filtered.nodes.map((node) => node.id),
        ['source-1', 'root-question', 'cited']
    );
    assert.deepEqual(
        filtered.edges.map((edge) => edge.id),
        ['e1', 'e2']
    );
});

test('normalizeAcceptedSourceDraftGraph marks uncited content for review', () => {
    const normalized = normalizeAcceptedSourceDraftGraph(graph);
    const plainNode = normalized.nodes.find((node) => node.id === 'plain');
    const citedNode = normalized.nodes.find((node) => node.id === 'cited');

    assert.equal(plainNode.data.node_type, 'needs_review');
    assert.equal(plainNode.data.review_status, 'needs_review');
    assert.equal(citedNode.data.node_type, undefined);
});
