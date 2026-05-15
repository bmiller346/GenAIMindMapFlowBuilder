import assert from 'node:assert/strict';
import test from 'node:test';
import {
    acceptAIDraftSession,
    buildAIDraftPreviewDiff,
    createAIDraftSession,
    reviseAIDraftSession
} from '../src/utils/aiDraftSessions.js';
import { createWorkspaceNode } from '../src/utils/manualNodes.js';

const draftNodes = () => [
    {
        id: 'draft-kellogg',
        title: "Kellogg's",
        summary: "Manufacturer branch for Kellogg's cereals.",
        node_type: 'category',
        parent_id: 'root',
        source_refs: [{ document_id: 'doc-cereal', page: 1 }]
    },
    {
        id: 'draft-general-mills',
        title: 'General Mills',
        summary: 'Manufacturer branch inferred from the prompt.',
        node_type: 'category',
        parent_id: 'root',
        source_refs: []
    }
];

const draftEdges = () => [
    {
        id: 'draft-edge-kellogg',
        source_node_id: 'root',
        target_node_id: 'draft-kellogg'
    },
    {
        id: 'draft-edge-general-mills',
        source_node_id: 'root',
        target_node_id: 'draft-general-mills'
    }
];

test('createAIDraftSession captures noncanonical session and revision contract', () => {
    const session = createAIDraftSession({
        workspaceId: 'workspace-1',
        scope: { type: 'branch', node_id: 'root' },
        role: 'Strategic Advisor',
        intent: 'custom_prompt',
        prompt: 'create a mind map for cereals by manufacturer',
        draftNodes: draftNodes(),
        draftEdges: draftEdges(),
        sessionId: 'session-cereal',
        revisionId: 'revision-cereal-1',
        createdAt: '2026-05-14T12:00:00.000Z'
    });

    assert.equal(session.metadata.canonical, false);
    assert.equal(session.revisions[0].metadata.canonical, false);
    assert.equal(session.revisions[0].preview_diff.needs_review_repairs, 1);
    assert.deepEqual(session.scope, { type: 'branch', node_id: 'root' });
});

test('reviseAIDraftSession appends a conversational revision', () => {
    const session = createAIDraftSession({
        workspaceId: 'workspace-1',
        scope: { type: 'branch', node_id: 'root' },
        prompt: 'create a mind map for cereals by manufacturer',
        draftNodes: draftNodes().slice(0, 1),
        draftEdges: draftEdges().slice(0, 1),
        sessionId: 'session-cereal',
        revisionId: 'revision-cereal-1'
    });

    const revised = reviseAIDraftSession(session, {
        prompt: 'what about General Mills?',
        draftNodes: draftNodes(),
        draftEdges: draftEdges(),
        revisionId: 'revision-cereal-2',
        createdAt: '2026-05-14T12:02:00.000Z'
    });

    assert.equal(revised.revisions.length, 2);
    assert.equal(revised.prompt_history.at(-1).content, 'what about General Mills?');
    assert.equal(revised.status, 'draft');
});

test('buildAIDraftPreviewDiff summarizes accept selected', () => {
    const session = createAIDraftSession({
        scope: { type: 'branch', node_id: 'root' },
        draftNodes: draftNodes(),
        draftEdges: draftEdges(),
        sessionId: 'session-cereal',
        revisionId: 'revision-cereal-1'
    });

    const diff = buildAIDraftPreviewDiff(session, {
        mode: 'selected',
        selectedItemIds: ['draft-general-mills']
    });

    assert.equal(diff.added_nodes, 1);
    assert.equal(diff.added_edges, 1);
    assert.equal(diff.needs_review_repairs, 1);
    assert.equal(diff.summary, '+1 nodes, +1 edges, !1 marked needs_review');
});

test('acceptAIDraftSession creates canonical nodes only on explicit accept', () => {
    const root = createWorkspaceNode({ id: 'root', title: 'Cereals' });
    const session = createAIDraftSession({
        workspaceId: 'workspace-1',
        scope: { type: 'branch', node_id: 'root' },
        role: 'Strategic Advisor',
        prompt: 'create a mind map for cereals by manufacturer',
        draftNodes: draftNodes(),
        draftEdges: draftEdges(),
        sessionId: 'session-cereal',
        revisionId: 'revision-cereal-1'
    });

    const beforeNodes = [root];
    const result = acceptAIDraftSession({
        session,
        nodes: beforeNodes,
        edges: [],
        mode: 'selected',
        selectedItemIds: ['draft-general-mills'],
        acceptedAt: '2026-05-14T12:05:00.000Z'
    });

    assert.equal(beforeNodes.length, 1);
    assert.equal(result.nodes.length, 2);
    const accepted = result.nodes.find((node) => node.id === 'draft-general-mills');
    assert.equal(accepted.data.status, 'needs_review');
    assert.equal(accepted.data.ai_draft_session_id, 'session-cereal');
    assert.equal(result.edges.length, 1);
    assert.equal(result.session.status, 'accepted');
    assert.deepEqual(result.accept_result.accepted_node_ids, ['draft-general-mills']);
});
