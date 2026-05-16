import assert from 'node:assert/strict';
import test from 'node:test';
import {
    deriveAutoWorkspaceName,
    isDefaultWorkspaceName
} from '../src/utils/workspaceNaming.js';
import { buildGeneratedSourceDraft } from '../src/utils/generatedSourceDraft.js';

const generatedGraph = () => ({
    nodes: [
        {
            id: 'source-node',
            type: 'dataSource',
            position: { x: 0, y: 0 },
            data: { content: 'uploaded-source.pdf' }
        },
        {
            id: 'summary-node',
            type: 'response',
            position: { x: 360, y: 0 },
            data: {
                title: 'Generated source summary',
                node_type: 'concept',
                source_refs: [{ document_id: 'src-uploaded', page: 1 }]
            }
        }
    ],
    edges: [{ id: 'edge-source-summary', source: 'source-node', target: 'summary-node' }],
    viewport: { x: 12, y: 24, zoom: 0.9 }
});

test('isDefaultWorkspaceName recognizes unnamed workspace labels', () => {
    assert.equal(isDefaultWorkspaceName(''), true);
    assert.equal(isDefaultWorkspaceName('Untitled workspace'), true);
    assert.equal(isDefaultWorkspaceName('New Flow'), true);
    assert.equal(isDefaultWorkspaceName('Migration Readiness Map'), false);
});

test('deriveAutoWorkspaceName prefers generated graph topic over source filename', () => {
    const name = deriveAutoWorkspaceName({
        uploadData: { flow_name: 'Untitled workspace' },
        sourceInput: { name: 'internal-notes.pdf' },
        graph: {
            nodes: [
                {
                    id: 'source',
                    type: 'dataSource',
                    data: { content: 'internal-notes.pdf' }
                },
                {
                    id: 'root',
                    type: 'question',
                    data: { question: 'Autodesk Electrical BIM Review Plan' }
                },
                {
                    id: 'child',
                    type: 'response',
                    data: { label: 'Coordination risks' }
                }
            ],
            edges: [{ id: 'edge-1', source: 'root', target: 'child' }]
        }
    });

    assert.equal(name, 'Autodesk Electrical BIM Review Plan');
});

test('deriveAutoWorkspaceName falls back to cleaned source title', () => {
    assert.equal(
        deriveAutoWorkspaceName({
            sourceInput: { name: 'Q2_customer_research-summary.docx' },
            graph: { nodes: [], edges: [] }
        }),
        'Q2 customer research summary'
    );
});

test('blank canvas generated source graph builds an initial review draft', () => {
    const draft = buildGeneratedSourceDraft({
        graph: generatedGraph(),
        uploadData: {
            flow_id: 'flow-uploaded',
            flow_type: 'automatic',
            type: 'pdf',
            document_id: 'src-uploaded'
        },
        sourceInput: { name: 'uploaded-source.pdf' },
        currentState: {
            nodes: [],
            edges: [],
            sourceLibrary: []
        },
        flowState: {
            flow_id: 'flow-existing',
            flow_name: 'Untitled workspace',
            flow_type: 'manual'
        }
    });

    assert.equal(draft.initialCanvas, true);
    assert.equal(draft.flowId, 'flow-uploaded');
    assert.equal(draft.flowType, 'automatic');
    assert.equal(draft.graph.nodes.length, 2);
    assert.equal(draft.graph.source_library[0].id, 'src-uploaded');
    assert.equal(draft.graph.nodes[0].data.flow_id, 'flow-uploaded');
});

test('existing canvas generated source graph keeps existing sources in draft library', () => {
    const draft = buildGeneratedSourceDraft({
        graph: generatedGraph(),
        uploadData: {
            flow_id: 'flow-uploaded',
            type: 'pdf',
            document_id: 'src-uploaded'
        },
        sourceInput: { name: 'uploaded-source.pdf' },
        currentState: {
            nodes: [{ id: 'existing-node', type: 'response', data: { title: 'Existing' } }],
            edges: [{ id: 'existing-edge', source: 'a', target: 'b' }],
            sourceLibrary: [{ id: 'existing-source', title: 'Existing source' }]
        },
        flowState: {
            flow_id: 'flow-existing',
            flow_name: 'Existing workspace',
            flow_type: 'manual'
        }
    });

    assert.equal(draft.initialCanvas, false);
    assert.deepEqual(
        draft.graph.source_library.map((source) => source.id).sort(),
        ['existing-source', 'src-uploaded']
    );
});
