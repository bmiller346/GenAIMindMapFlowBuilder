import assert from 'node:assert/strict';
import test from 'node:test';
import {
    acceptAIDraftSession,
    buildAIDraftSessionRequestPayload,
    buildSelectedSourceDraftPayload,
    buildAIDraftPreviewDiff,
    createAIDraftSession,
    formatAIDraftPreviewDiffSummary,
    getAIDraftItemBadges,
    getAIDraftModelMetadata,
    rejectAIDraftSession,
    reviseAIDraftSession
} from '../src/utils/aiDraftSessions.js';
import {
    getActionsForProfileAndScope,
    getPromptProfilesForScope
} from '../src/prompts/promptsModel.js';
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
    assert.equal(
        formatAIDraftPreviewDiffSummary(diff).text,
        '+1 nodes  +1 edges  ~0 updates  !1 needs_review items'
    );
});

test('getAIDraftItemBadges renders source and review risk badges', () => {
    const cited = getAIDraftItemBadges({
        id: 'cited',
        source_refs: [{ document_id: 'doc-1' }],
        confidence: 0.92
    }).map((badge) => badge.id);
    const risky = getAIDraftItemBadges({
        id: 'risky',
        status: 'needs_review',
        assumptions: ['Generated from prompt only.'],
        confidence: 'low',
        metadata: { duplicate: true, conflict: true }
    }).map((badge) => badge.id);

    assert.deepEqual(cited, ['source-backed']);
    assert.deepEqual(risky, [
        'needs-review',
        'assumption',
        'low-confidence',
        'duplicate',
        'conflict'
    ]);
});

test('getAIDraftModelMetadata prefers actual model and exposes risk cost fields', () => {
    const session = createAIDraftSession({
        selectedModel: 'gpt-5.4',
        modelReason: 'Fast enough for a low-risk draft.',
        metadata: {
            actual_model: 'gpt-5.5',
            risk: 'deep_review',
            estimated_tokens: 1400,
            estimated_cost_usd: '$0.02'
        }
    });

    const metadata = getAIDraftModelMetadata(session);

    assert.equal(metadata.model, 'gpt-5.5');
    assert.equal(metadata.reason, 'Fast enough for a low-risk draft.');
    assert.equal(metadata.riskTier, 'deep_review');
    assert.equal(metadata.tokenEstimate, 1400);
    assert.equal(metadata.costEstimate, '$0.02');
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

test('acceptAIDraftSession supports accept all and reject preserves noncanonical state', () => {
    const root = createWorkspaceNode({ id: 'root', title: 'Cereals' });
    const session = createAIDraftSession({
        workspaceId: 'workspace-1',
        scope: { type: 'branch', node_id: 'root' },
        prompt: 'create a mind map for cereals by manufacturer',
        draftNodes: draftNodes(),
        draftEdges: draftEdges(),
        sessionId: 'session-cereal',
        revisionId: 'revision-cereal-1'
    });

    const accepted = acceptAIDraftSession({
        session,
        nodes: [root],
        edges: [],
        mode: 'append',
        acceptedAt: '2026-05-14T12:05:00.000Z'
    });
    const rejected = rejectAIDraftSession(session, {
        rejectedAt: '2026-05-14T12:06:00.000Z',
        reason: 'Try a narrower prompt.'
    });

    assert.equal(accepted.nodes.length, 3);
    assert.deepEqual(
        accepted.accept_result.accepted_node_ids.sort(),
        ['draft-general-mills', 'draft-kellogg']
    );
    assert.equal(rejected.status, 'discarded');
    assert.equal(rejected.metadata.canonical, false);
    assert.equal(rejected.metadata.rejection_reason, 'Try a narrower prompt.');
});

test('buildSelectedSourceDraftPayload creates source scope and chunk context', () => {
    const payload = buildSelectedSourceDraftPayload({
        id: 'doc-general-mills',
        title: 'General Mills source',
        type: 'txt',
        chunks: [
            {
                id: 'chunk-1',
                page: 2,
                heading: 'Manufacturers',
                snippet: 'General Mills makes Cheerios cereal.'
            }
        ]
    });

    assert.deepEqual(payload.scope, {
        type: 'source',
        source_id: 'doc-general-mills'
    });
    assert.equal(payload.source_chunks.length, 1);
    assert.deepEqual(payload.source_chunks[0].source_ref, {
        document_id: 'doc-general-mills',
        chunk_id: 'chunk-1',
        page: 2,
        section: 'Manufacturers',
        quote_snippet: 'General Mills makes Cheerios cereal.',
        confidence: 'medium'
    });
    assert.equal(payload.metadata.selected_source_chunk_count, 1);
});

test('source scope exposes Ask AI roles and source-oriented actions', () => {
    const profiles = getPromptProfilesForScope('source');
    const repairProfile = profiles.find((profile) => profile.id === 'source-ref-repair');
    const actions = getActionsForProfileAndScope(repairProfile, 'source').map(
        (action) => action.id
    );

    assert.ok(repairProfile);
    assert.ok(actions.includes('find_missing_source_support'));
    assert.ok(actions.includes('custom_prompt'));
});

test('source scoped draft request sends selected source chunks to backend', () => {
    const selectedSourcePayload = buildSelectedSourceDraftPayload({
        id: 'doc-general-mills',
        title: 'General Mills source',
        chunks: [
            {
                id: 'chunk-1',
                page: 2,
                heading: 'Manufacturers',
                snippet: 'General Mills makes Cheerios cereal.'
            }
        ]
    });
    const request = buildAIDraftSessionRequestPayload({
        role: { id: 'source-ref-repair', label: 'Source Ref Repair' },
        action: { id: 'find_missing_source_support', label: 'Review source coverage' },
        scope: selectedSourcePayload.scope,
        prompt: 'Find cited branches',
        selectedSourcePayload
    });

    assert.deepEqual(request.scope, {
        type: 'source',
        source_id: 'doc-general-mills'
    });
    assert.equal(request.source_chunks.length, 1);
    assert.equal(request.source_chunks[0].source_ref.document_id, 'doc-general-mills');
    assert.equal(
        request.metadata.source_context.selected_source_title,
        'General Mills source'
    );
});
