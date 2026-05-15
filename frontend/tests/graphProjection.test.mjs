import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildGraphProjection,
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
