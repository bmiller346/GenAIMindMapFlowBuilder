import assert from 'node:assert/strict';
import test from 'node:test';
import {
    deriveAutoWorkspaceName,
    isDefaultWorkspaceName
} from '../src/utils/workspaceNaming.js';

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
