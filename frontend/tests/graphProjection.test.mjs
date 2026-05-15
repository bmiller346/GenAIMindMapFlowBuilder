import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildGraphProjection,
    getChecklistPreviewRows,
    getCrossLinkConnectionRows,
    getGraphConfidenceSummary,
    getTaskCandidateRows,
    getTaskRows
} from '../src/views/graphProjection.js';

const node = (id, nodeType, title = id) => ({
    id,
    type: 'response',
    data: {
        title,
        node_type: nodeType,
        status: 'needs_review'
    }
});

test('task projections keep confirmed tasks separate from potential tasks', () => {
    const projection = buildGraphProjection(
        [
            node('concept-1', 'definition', 'Concept'),
            node('task-1', 'task', 'Confirmed task'),
            node('reference-1', 'reference', 'Reference'),
            node('question-1', 'question', 'Open question')
        ],
        [
            { id: 'edge-1', source: 'concept-1', target: 'task-1' },
            { id: 'edge-2', source: 'concept-1', target: 'reference-1' },
            { id: 'edge-3', source: 'concept-1', target: 'question-1' }
        ]
    );

    assert.deepEqual(getTaskRows(projection).map((row) => row.id), ['task-1']);
    assert.deepEqual(getTaskCandidateRows(projection).map((row) => row.id), ['concept-1']);
});

test('accepted task projections become confirmed task rows', () => {
    const projection = buildGraphProjection(
        [
            {
                ...node('concept-1', 'definition', 'Projected concept'),
                data: {
                    ...node('concept-1', 'definition').data,
                    priority: '',
                    task_projection: {
                        accepted: true,
                        preview_type: 'task',
                        preview_status: 'needs_review',
                        priority: 'high',
                        owner_id: 'ops-team',
                        due_date: '2026-06-01'
                    }
                }
            }
        ],
        []
    );

    const [taskRow] = getTaskRows(projection);

    assert.equal(taskRow.id, 'concept-1');
    assert.equal(taskRow.node_type, 'task');
    assert.equal(taskRow.priority, 'high');
    assert.equal(taskRow.owner_id, 'ops-team');
    assert.equal(taskRow.due_date, '2026-06-01');
    assert.deepEqual(getTaskCandidateRows(projection).map((row) => row.id), []);
});

test('accepted checklist projections preserve checklist metadata in preview rows', () => {
    const projection = buildGraphProjection(
        [
            {
                ...node('step-1', 'procedure', 'Field verification'),
                data: {
                    ...node('step-1', 'procedure').data,
                    checklist_projection: {
                        accepted: true,
                        order: 3,
                        label: 'Verify field install',
                        note: 'Confirm evidence before closeout.',
                        review_required: false,
                        priority: 'medium',
                        owner_id: 'qa-lead',
                        due_date: '2026-06-15'
                    }
                }
            }
        ],
        []
    );

    const [row] = getChecklistPreviewRows(projection);

    assert.equal(row.checklist_order, 3);
    assert.equal(row.checklist_label, 'Verify field install');
    assert.equal(row.checklist_note, 'Confirm evidence before closeout.');
    assert.equal(row.review_required, false);
    assert.equal(row.priority, 'medium');
    assert.equal(row.owner_id, 'qa-lead');
    assert.equal(row.due_date, '2026-06-15');
    assert.equal(row.included, true);
});

test('connection projection separates hierarchy from cross-link edges', () => {
    const projection = buildGraphProjection(
        [
            node('root', 'category', 'Root'),
            node('task-1', 'task', 'Task'),
            node('risk-1', 'risk', 'Risk')
        ],
        [
            { id: 'edge-hierarchy', source: 'root', target: 'task-1', relationship_type: 'contains' },
            { id: 'edge-risk', source: 'risk-1', target: 'task-1', relationship_type: 'blocks' }
        ]
    );

    const crossLinks = getCrossLinkConnectionRows(projection);

    assert.deepEqual(crossLinks.map((row) => row.id), ['edge-risk']);
    assert.equal(crossLinks[0].connection_kind, 'Cross-link');
});

test('graph confidence recommends supplementation when hierarchy has no cross-links', () => {
    const projection = buildGraphProjection(
        [
            {
                ...node('root', 'category', 'Root'),
                data: {
                    ...node('root', 'category').data,
                    summary: 'Root summary',
                    confidence: 0.8,
                    source_refs: [{ document_id: 'doc-1', section: 'A', confidence: 'medium' }]
                }
            },
            node('child-1', 'definition', 'Child 1'),
            node('child-2', 'definition', 'Child 2')
        ],
        [
            { id: 'edge-1', source: 'root', target: 'child-1', relationship_type: 'contains' },
            { id: 'edge-2', source: 'root', target: 'child-2', relationship_type: 'contains' }
        ]
    );

    const summary = getGraphConfidenceSummary(projection);

    assert.equal(summary.cross_link_edges, 0);
    assert(summary.supplement_actions.includes('Find cross-branch connections'));
    assert(summary.reasons.some((reason) => reason.includes('No accepted cross-branch connections')));
});
