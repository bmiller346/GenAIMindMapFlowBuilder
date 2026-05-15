import assert from 'node:assert/strict';
import test from 'node:test';
import {
    acceptAIActionPreview,
    createAIActionRun,
    mergeAIActionRun
} from '../src/utils/aiActionRuns.js';
import { createWorkspaceNode } from '../src/utils/manualNodes.js';

test('createAIActionRun captures durable preview metadata', () => {
    const run = createAIActionRun({
        preview: {
            ai_action_id: 'action-1',
            workspace_id: 'workspace-1',
            source_node_id: 'node-1',
            scope: 'node',
            role: 'Task Planner',
            action: 'generate_tasks',
            custom_prompt: 'Make this actionable',
            input_source_refs: [{ document_id: 'doc-1' }]
        },
        status: 'previewed'
    });

    assert.equal(run.ai_action_id, 'action-1');
    assert.equal(run.source_node_id, 'node-1');
    assert.equal(run.status, 'previewed');
    assert.deepEqual(run.input_source_refs, [{ document_id: 'doc-1' }]);
});

test('acceptAIActionPreview creates canonical nodes only on accept', () => {
    const parent = createWorkspaceNode({
        id: 'parent',
        title: 'Parent',
        sourceRefs: [{ document_id: 'doc-1', page: 3 }]
    });
    const preview = {
        ai_action_id: 'action-2',
        source_node_id: 'parent',
        scope: { type: 'node', node_id: 'parent' },
        role: 'SME Question Generator',
        action: 'generate_child_nodes',
        draft_nodes: [
            {
                id: 'draft-1',
                title: 'Ask the SME',
                node_type: 'question',
                source_refs: [{ document_id: 'doc-1', page: 3 }]
            },
            {
                id: 'draft-2',
                title: 'Unsupported inference',
                node_type: 'concept',
                source_refs: []
            }
        ]
    };

    const beforeNodes = [parent];
    const beforeEdges = [];
    const result = acceptAIActionPreview({
        preview,
        nodes: beforeNodes,
        edges: beforeEdges
    });

    assert.equal(beforeNodes.length, 1);
    assert.equal(beforeEdges.length, 0);
    assert.equal(result.nodes.length, 3);
    assert.equal(result.edges.length, 2);
    assert.equal(result.nodes.find((node) => node.id === 'draft-1').data.status, 'ai_generated');
    assert.equal(result.nodes.find((node) => node.id === 'draft-2').data.status, 'needs_review');
    assert.deepEqual(result.run.generated_node_ids, ['draft-1', 'draft-2']);
    assert.equal(result.run.status, 'accepted');
});

test('acceptAIActionPreview stores non-node outputs on the source node', () => {
    const parent = createWorkspaceNode({ id: 'parent', title: 'Parent' });
    const result = acceptAIActionPreview({
        preview: {
            ai_action_id: 'action-outputs',
            preview_id: 'preview-outputs',
            source_node_id: 'parent',
            role: 'Training Guide Builder',
            action: 'convert_to_checklist',
            draft_checklist_items: [{ id: 'item-1', label: 'Confirm training owner' }],
            assumptions: ['Owner is inferred from the branch context.']
        },
        nodes: [parent],
        edges: []
    });
    const sourceNode = result.nodes.find((node) => node.id === 'parent');

    assert.equal(result.nodes.length, 1);
    assert.equal(sourceNode.data.ai_action_outputs.length, 1);
    assert.equal(sourceNode.data.ai_action_outputs[0].outputs.length, 2);
});

test('mergeAIActionRun updates the existing action status', () => {
    const previewed = createAIActionRun({
        preview: { ai_action_id: 'action-3', action: 'expand' },
        status: 'previewed'
    });
    const accepted = { ...previewed, status: 'accepted', generated_node_ids: ['node-9'] };
    const runs = mergeAIActionRun([previewed], accepted);

    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, 'accepted');
    assert.deepEqual(runs[0].generated_node_ids, ['node-9']);
});
