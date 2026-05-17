import assert from 'node:assert/strict';
import test from 'node:test';
import {
    AI_DRAFT_ACCEPT_MODE_DETAILS,
    acceptAIDraftSession,
    acceptModeForChangeIntent,
    buildAIDraftMemoryContext,
    buildAIDraftSessionRequestPayload,
    buildSelectedSourceDraftPayload,
    buildSelectedSourcesDraftPayload,
    buildAIDraftPreviewDiff,
    createAIDraftSession,
    formatAIDraftPreviewDiffSummary,
    getAIDraftAcceptModeDetail,
    getAIDraftItemBadges,
    getAIDraftModelMetadata,
    getAIDraftSourceStatus,
    inferAIDraftChangeIntent,
    normalizeSoftwareOverlapReports,
    rejectAIDraftSession,
    reviseAIDraftSession,
    visibleAIDraftPromptText
} from '../src/utils/aiDraftSessions.js';
import {
    getActionsForProfileAndScope,
    getPromptProfilesForScope,
    sourceFirstActionPresets,
    starterTransformations
} from '../src/prompts/promptsModel.js';
import { createWorkspaceEdge, createWorkspaceNode } from '../src/utils/manualNodes.js';

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
    assert.equal(diff.summary, '+1 nodes, +1 edges, !1 reviewable (0 missing citation, 1 AI assumption)');
    assert.equal(
        formatAIDraftPreviewDiffSummary(diff).text,
        '+1 nodes  +1 edges  ~0 updates  -0 removals  !1 needs_review items'
    );
});

test('buildAIDraftPreviewDiff explains before-accept semantics for each mode', () => {
    const session = createAIDraftSession({
        scope: { type: 'branch', node_id: 'root' },
        draftNodes: draftNodes(),
        draftEdges: draftEdges(),
        draftItems: [
            {
                id: 'draft-relationship-cited',
                item_type: 'relationship_candidate',
                title: 'Kellogg supports Mills',
                content: 'Both are cereal manufacturers.',
                source_refs: [{ document_id: 'doc-cereal', page: 7 }],
                metadata: {
                    source_node_id: 'draft-kellogg',
                    target_node_id: 'draft-general-mills',
                    relationship_type: 'related_to'
                }
            },
            {
                id: 'draft-relationship-uncited',
                item_type: 'relationship_candidate',
                title: 'Uncited relation',
                content: 'Generated without source support.',
                source_refs: [],
                metadata: {
                    source_node_id: 'draft-kellogg',
                    target_node_id: 'draft-general-mills',
                    relationship_type: 'conflicts_with'
                }
            }
        ],
        sessionId: 'session-mode-semantics',
        revisionId: 'revision-mode-semantics'
    });
    const currentNodes = [
        createWorkspaceNode({ id: 'root', title: 'Root', body: 'Root node' }),
        createWorkspaceNode({
            id: 'existing-child',
            title: 'Existing child',
            body: 'Existing scoped child'
        })
    ];
    const currentEdges = [{ id: 'edge-existing-child', source: 'root', target: 'existing-child' }];

    const replaceDiff = buildAIDraftPreviewDiff(session, {
        mode: 'replace',
        currentNodes,
        currentEdges
    });
    assert.equal(replaceDiff.removed_nodes, 1);
    assert.equal(replaceDiff.removed_edges, 1);
    assert.match(replaceDiff.preview_lines[0], /may be removed/i);

    const mergeDiff = buildAIDraftPreviewDiff(session, { mode: 'merge' });
    assert.equal(mergeDiff.updated_nodes, 2);
    assert.equal(mergeDiff.added_nodes, 0);
    assert.match(mergeDiff.preview_lines[0], /matching node/i);

    const notesOnlyDiff = buildAIDraftPreviewDiff(session, { mode: 'notes_only' });
    assert.equal(notesOnlyDiff.added_nodes, 0);
    assert.equal(notesOnlyDiff.metadata.follow_up_semantics.canonical_graph_mutated, false);
    assert.match(notesOnlyDiff.preview_lines[0], /Graph will not change/);

    const citedOnlyDiff = buildAIDraftPreviewDiff(session, { mode: 'cited_only' });
    assert.deepEqual(citedOnlyDiff.accepted_item_ids.sort(), ['draft-kellogg']);
    assert.equal(citedOnlyDiff.added_nodes, 1);
    assert.equal(citedOnlyDiff.added_edges, 1);

    const emptySelectedDiff = buildAIDraftPreviewDiff(session, { mode: 'selected' });
    assert.equal(emptySelectedDiff.added_nodes, 0);
    assert.equal(emptySelectedDiff.added_edges, 0);
    assert.match(emptySelectedDiff.preview_lines[0], /No checked draft items/i);
});

test('accept mode details map product choices onto existing modes', () => {
    assert.equal(AI_DRAFT_ACCEPT_MODE_DETAILS.notes_only.label, 'Preview only');
    assert.equal(AI_DRAFT_ACCEPT_MODE_DETAILS.replace.label, 'Replace selected scope');
    assert.equal(AI_DRAFT_ACCEPT_MODE_DETAILS.merge.label, 'Update matching');
    assert.equal(AI_DRAFT_ACCEPT_MODE_DETAILS.append.label, 'Supplement');
    assert.equal(AI_DRAFT_ACCEPT_MODE_DETAILS.selected.label, 'Accept selected');
    assert.equal(getAIDraftAcceptModeDetail('notes_only').user_choice, 'preview_only');
    assert.match(getAIDraftAcceptModeDetail('merge').help, /matching nodes/i);
    assert.equal(acceptModeForChangeIntent('update'), 'merge');
    assert.equal(acceptModeForChangeIntent('compare'), 'append');
    assert.equal(acceptModeForChangeIntent('supplement'), 'append');
});

test('buildAIDraftPreviewDiff carries follow-up intent and accept semantics', () => {
    const session = createAIDraftSession({
        scope: { type: 'branch', node_id: 'root' },
        prompt: 'make this specific to AEC consulting firm',
        draftNodes: draftNodes(),
        draftEdges: draftEdges(),
        sessionId: 'session-aec-follow-up',
        revisionId: 'revision-aec-follow-up',
        metadata: { change_intent: 'update' }
    });

    const alternateDiff = buildAIDraftPreviewDiff(session, { mode: 'append' });
    assert.equal(session.revisions[0].preview_diff.metadata.change_intent, 'update');
    assert.equal(alternateDiff.metadata.change_intent, 'update');
    assert.equal(alternateDiff.metadata.accept_mode_label, 'Supplement');
    assert.equal(alternateDiff.metadata.user_choice, 'supplement');
    assert.equal(alternateDiff.metadata.follow_up_semantics.adds_as_alternate, true);

    const keepExistingDiff = buildAIDraftPreviewDiff(session, { mode: 'notes_only' });
    assert.equal(keepExistingDiff.added_nodes, 0);
    assert.equal(keepExistingDiff.metadata.accept_mode_label, 'Preview only');
    assert.equal(keepExistingDiff.metadata.follow_up_semantics.canonical_graph_mutated, false);

    const compareSession = createAIDraftSession({
        scope: { type: 'branch', node_id: 'root' },
        prompt: 'compare this against an AEC consulting positioning source',
        draftNodes: draftNodes().slice(0, 1),
        draftEdges: draftEdges().slice(0, 1)
    });
    const compareDiff = buildAIDraftPreviewDiff(compareSession, { mode: 'merge' });
    assert.equal(compareDiff.metadata.change_intent, 'compare');
    assert.equal(compareDiff.metadata.follow_up_semantics.user_choice, 'update_matching');
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
        'ai-assumption',
        'needs-review',
        'low-confidence',
        'duplicate',
        'conflict'
    ]);

    const overlap = getAIDraftItemBadges({
        id: 'overlap',
        item_type: 'software_overlap_report',
        source_refs: [{ document_id: 'inventory' }]
    }).map((badge) => badge.id);
    assert.deepEqual(overlap, ['source-backed', 'potential-overlap']);
});

test('getAIDraftSourceStatus and badges separate AI assumptions from missing citations', () => {
    const exploratory = {
        id: 'exploratory',
        status: 'needs_review',
        source_refs: [],
        assumptions: ['Generated from prompt only.']
    };
    const sourceRequired = {
        id: 'source-required',
        status: 'needs_review',
        source_refs: [],
        metadata: { source_policy_requires_citation: true }
    };

    assert.equal(getAIDraftSourceStatus(exploratory).id, 'ai_assumption_uncited');
    assert.equal(getAIDraftSourceStatus(sourceRequired).id, 'missing_required_source');
    assert.deepEqual(
        getAIDraftItemBadges(exploratory).map((badge) => badge.id).slice(0, 2),
        ['ai-assumption', 'needs-review']
    );
    assert.deepEqual(
        getAIDraftItemBadges(sourceRequired).map((badge) => badge.id).slice(0, 2),
        ['missing-source', 'needs-review']
    );
});

test('buildAIDraftPreviewDiff exposes source-status counts for reviewable unsourced nodes', () => {
    const session = createAIDraftSession({
        scope: { type: 'branch', node_id: 'root' },
        draftNodes: [
            {
                id: 'draft-assumption',
                title: 'Prompt-only idea',
                summary: 'Generated without source context.',
                source_refs: [],
                assumptions: ['Prompt-only inference.']
            },
            {
                id: 'draft-missing-citation',
                title: 'Source-required claim',
                summary: 'Needs source support.',
                source_refs: [],
                metadata: { source_policy_requires_citation: true }
            }
        ],
        sessionId: 'session-source-status',
        revisionId: 'revision-source-status'
    });

    const diff = buildAIDraftPreviewDiff(session);

    assert.equal(diff.needs_review_repairs, 2);
    assert.equal(diff.ai_assumption_repairs, 1);
    assert.equal(diff.missing_source_repairs, 1);
    assert.deepEqual(diff.metadata.source_status_counts, {
        ai_assumption_uncited: 1,
        missing_required_source: 1
    });
});

test('normalizeSoftwareOverlapReports exposes score confidence review state factors and evidence', () => {
    const reports = normalizeSoftwareOverlapReports({
        generated_artifacts: [
            {
                id: 'software-report-1',
                artifact_type: 'software_overlap_report',
                title: 'Software overlap report',
                summary: 'Review possible duplicate capabilities.',
                candidates: [
                    {
                        id: 'candidate-1',
                        title: 'Slack / Teams',
                        overlap_score: 0.82,
                        confidence: 'medium',
                        review_state: 'owner_review',
                        rationale: 'Both tools support team messaging and file sharing.',
                        recommended_action: 'Ask owners to confirm approved collaboration standard.',
                        factors: [
                            { key: 'capability', value: 'messaging' },
                            'shared user group'
                        ],
                        evidence: [
                            {
                                document_id: 'software-inventory',
                                page: 4,
                                section: 'Collaboration',
                                quote_snippet: 'Slack and Teams are both used for project channels.'
                            }
                        ]
                    }
                ]
            }
        ]
    });

    assert.equal(reports.length, 1);
    assert.equal(reports[0].title, 'Software overlap report');
    assert.equal(reports[0].candidates.length, 1);
    assert.equal(reports[0].candidates[0].score, 0.82);
    assert.equal(reports[0].candidates[0].confidence, 'medium');
    assert.equal(reports[0].candidates[0].reviewState, 'owner_review');
    assert.deepEqual(
        reports[0].candidates[0].factors.map((factor) => `${factor.label}:${factor.value}`),
        ['capability:messaging', 'shared user group:']
    );
    assert.deepEqual(reports[0].candidates[0].evidence[0], {
        id: 'software-inventory',
        label: 'Slack and Teams are both used for project channels.',
        source: 'software-inventory | p. 4 | Collaboration'
    });
});

test('getAIDraftModelMetadata prefers actual model and exposes risk cost fields', () => {
    const session = createAIDraftSession({
        selectedModel: 'gpt-5.4',
        modelReason: 'Fast enough for a low-risk draft.',
        metadata: {
            actual_model: 'gpt-5.5',
            risk: 'deep_review',
            usage: {
                input_tokens: 900,
                output_tokens: 500,
                total_tokens: 1400,
                estimated_cost_usd: '$0.02',
                cost_source: 'OPENAI_PRICING_PER_1M_JSON'
            }
        }
    });

    const metadata = getAIDraftModelMetadata(session);

    assert.equal(metadata.model, 'gpt-5.5');
    assert.equal(metadata.reason, 'Fast enough for a low-risk draft.');
    assert.equal(metadata.riskTier, 'deep_review');
    assert.equal(metadata.tokenEstimate, 1400);
    assert.equal(metadata.costEstimate, '$0.02');
    assert.equal(metadata.inputTokens, 900);
    assert.equal(metadata.outputTokens, 500);
    assert.equal(metadata.totalTokens, 1400);
    assert.equal(metadata.usageCostSource, 'OPENAI_PRICING_PER_1M_JSON');
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
    assert.equal(accepted.data.metadata.source_status, 'ai_assumption_uncited');
    assert.equal(accepted.data.metadata.reviewable_unsourced, true);
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

test('acceptAIDraftSession places branch supplements locally and preserves non-hierarchy edges as relationships', () => {
    const root = createWorkspaceNode({ id: 'root', title: 'Business plan', position: { x: 120, y: 120 } });
    const risk = createWorkspaceNode({ id: 'risk', title: 'Risk management', position: { x: 560, y: 120 } });
    const session = createAIDraftSession({
        workspaceId: 'workspace-risk',
        scope: { type: 'branch', node_id: 'risk' },
        prompt: 'expand risk management',
        draftNodes: [
            {
                id: 'sales-risk',
                title: 'Sales Shortfall Risk',
                node_type: 'risk',
                source_refs: []
            },
            {
                id: 'sales-mitigation',
                title: 'Sales Mitigation',
                node_type: 'control',
                source_refs: []
            }
        ],
        draftEdges: [
            {
                id: 'edge-risk-sales',
                source_node_id: 'risk',
                target_node_id: 'sales-risk',
                relationship_type: 'contains'
            },
            {
                id: 'edge-mitigation-supports-sales',
                source_node_id: 'sales-mitigation',
                target_node_id: 'sales-risk',
                relationship_type: 'supports'
            }
        ],
        sessionId: 'session-risk',
        revisionId: 'revision-risk-1'
    });

    const accepted = acceptAIDraftSession({
        session,
        nodes: [root, risk],
        edges: [createWorkspaceEdge('root', 'risk', { id: 'edge-root-risk' })],
        mode: 'append',
        acceptedAt: '2026-05-14T12:05:00.000Z'
    });

    const salesRisk = accepted.nodes.find((node) => node.id === 'sales-risk');
    const mitigation = accepted.nodes.find((node) => node.id === 'sales-mitigation');
    assert.ok(salesRisk.position.x < 1200);
    assert.ok(mitigation.position.x < 1200);
    assert.notDeepEqual(salesRisk.position, mitigation.position);
    assert.ok(accepted.edges.some((edge) => edge.source === 'risk' && edge.target === 'sales-risk'));
    const supportEdge = accepted.edges.find((edge) => edge.id === 'edge-mitigation-supports-sales');
    assert.equal(supportEdge?.data?.relationship_type, 'supports');
});

test('acceptAIDraftSession normalizes blank hierarchy edge semantics on accepted edges', () => {
    const parent = createWorkspaceNode({ id: 'parent', title: 'Implementation', position: { x: 200, y: 240 } });
    const session = createAIDraftSession({
        workspaceId: 'workspace-blank-edge',
        scope: { type: 'node', node_id: 'parent' },
        prompt: 'add next step',
        draftNodes: [
            {
                id: 'draft-child',
                title: 'Prepare rollout checklist',
                node_type: 'task',
                source_refs: []
            }
        ],
        draftEdges: [
            {
                id: 'edge-parent-draft-child',
                source_node_id: 'parent',
                target_node_id: 'draft-child',
                relationship_type: '   ',
                metadata: { relationship_type: '' }
            }
        ],
        sessionId: 'session-blank-edge',
        revisionId: 'revision-blank-edge-1'
    });

    const accepted = acceptAIDraftSession({
        session,
        nodes: [parent],
        edges: [],
        mode: 'append',
        acceptedAt: '2026-05-14T12:08:00.000Z'
    });

    const acceptedEdge = accepted.edges.find((edge) => edge.id === 'edge-parent-draft-child');
    assert.equal(acceptedEdge?.type, 'step');
    assert.equal(acceptedEdge?.relationship_type, 'contains');
    assert.equal(acceptedEdge?.data?.relationship_type, 'contains');
    assert.equal(acceptedEdge?.metadata?.relationship_type, 'contains');
});

test('acceptAIDraftSession lays out five generated branch children in a local non-overlapping lane', () => {
    const parent = createWorkspaceNode({ id: 'parent', title: 'Branch root', position: { x: 320, y: 360 } });
    const existingA = createWorkspaceNode({ id: 'existing-a', title: 'Existing A', position: { x: 750, y: 312 } });
    const existingB = createWorkspaceNode({ id: 'existing-b', title: 'Existing B', position: { x: 750, y: 408 } });
    const draftNodes = Array.from({ length: 5 }, (_, index) => ({
        id: `generated-${index + 1}`,
        title: `Generated child ${index + 1}`,
        node_type: 'task',
        source_refs: []
    }));
    const session = createAIDraftSession({
        workspaceId: 'workspace-five-children',
        scope: { type: 'branch', node_id: 'parent' },
        prompt: 'expand this branch with five child tasks',
        draftNodes,
        draftEdges: draftNodes.map((node, index) => ({
            id: `edge-parent-${node.id}`,
            source_node_id: 'parent',
            target_node_id: node.id,
            relationship_type: index % 2 === 0 ? '' : 'contains'
        })),
        sessionId: 'session-five-children',
        revisionId: 'revision-five-children-1'
    });

    const accepted = acceptAIDraftSession({
        session,
        nodes: [parent, existingA, existingB],
        edges: [
            createWorkspaceEdge('parent', 'existing-a', { id: 'edge-existing-a' }),
            createWorkspaceEdge('parent', 'existing-b', { id: 'edge-existing-b' })
        ],
        mode: 'append',
        acceptedAt: '2026-05-14T12:09:00.000Z'
    });

    const generated = draftNodes.map((node) => accepted.nodes.find((acceptedNode) => acceptedNode.id === node.id));
    const positionKeys = new Set(generated.map((node) => `${node.position.x}:${node.position.y}`));
    assert.equal(positionKeys.size, 5);
    assert.ok(generated.every((node) => Math.abs(node.position.x - parent.position.x) <= 500));
    assert.ok(generated.every((node) => Math.abs(node.position.y - parent.position.y) <= 600));
    assert.ok(generated.every((node) => ![existingA, existingB].some((existing) => (
        existing.position.x === node.position.x && existing.position.y === node.position.y
    ))));
});

test('acceptAIDraftSession replace removes scoped descendants before local fallback accept', () => {
    const root = createWorkspaceNode({ id: 'root', title: 'Cereals' });
    const oldChild = createWorkspaceNode({
        id: 'old-child',
        title: 'Old child',
        body: 'Replace this branch child.'
    });
    const oldGrandchild = createWorkspaceNode({
        id: 'old-grandchild',
        title: 'Old grandchild',
        body: 'Replace this branch grandchild.'
    });
    const session = createAIDraftSession({
        workspaceId: 'workspace-1',
        scope: { type: 'branch', node_id: 'root' },
        prompt: 'replace this cereal branch',
        draftNodes: [draftNodes()[0]],
        draftEdges: [draftEdges()[0]],
        sessionId: 'session-replace-cereal',
        revisionId: 'revision-replace-cereal-1'
    });

    const accepted = acceptAIDraftSession({
        session,
        nodes: [root, oldChild, oldGrandchild],
        edges: [
            { id: 'edge-root-old', source: 'root', target: 'old-child' },
            { id: 'edge-old-grandchild', source: 'old-child', target: 'old-grandchild' }
        ],
        mode: 'replace',
        acceptedAt: '2026-05-14T12:07:00.000Z'
    });

    const nodeIds = new Set(accepted.nodes.map((node) => node.id));
    assert.ok(nodeIds.has('root'));
    assert.ok(nodeIds.has('draft-kellogg'));
    assert.equal(nodeIds.has('old-child'), false);
    assert.equal(nodeIds.has('old-grandchild'), false);
    assert.ok(
        accepted.edges.every((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    );
    assert.deepEqual(
        accepted.accept_result.preview_diff.metadata.removed_node_ids.sort(),
        ['old-child', 'old-grandchild']
    );
    assert.deepEqual(
        accepted.accept_result.patch_operations.map((operation) => operation.op).sort(),
        ['remove_edge', 'remove_edge', 'remove_node', 'remove_node']
    );
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

test('draft request carries visual routing metadata and desired outputs', () => {
    const request = buildAIDraftSessionRequestPayload({
        role: { id: 'task-planner', label: 'Task Planner' },
        action: { id: 'generate_checklist', label: 'Generate checklist' },
        scope: { type: 'workspace' },
        prompt: 'how do I make a grilled cheese?',
        desiredOutputs: ['checklist'],
        metadata: {
            requested_visual: 'auto',
            output_shape: 'checklist',
            routed_role_id: 'task-planner'
        }
    });

    assert.deepEqual(request.desired_outputs, ['checklist']);
    assert.equal(request.metadata.requested_visual, 'auto');
    assert.equal(request.metadata.output_shape, 'checklist');
    assert.equal(request.action, 'generate_checklist');
});

test('follow-up memory captures scoped graph context and update intent', () => {
    const nodeSourceRef = { document_id: 'doc-aec', chunk_id: 'chunk-1' };
    const priorSourceRef = { document_id: 'doc-reconciled', chunk_id: 'chunk-9' };
    const selectedSourcePayload = buildSelectedSourceDraftPayload({
        id: 'doc-context',
        title: 'AEC consulting discovery notes',
        chunks: [
            {
                id: 'chunk-context-1',
                heading: 'Positioning',
                snippet: 'AEC consulting firms need owner representation and BIM coordination.',
                source_ref: {
                    document_id: 'doc-context',
                    chunk_id: 'chunk-context-1',
                    quote_snippet: 'AEC consulting firms need owner representation and BIM coordination.'
                }
            }
        ]
    });
    const nodes = [
        createWorkspaceNode({
            id: 'aec-root',
            title: 'Consulting Offer',
            body: 'Generic consulting business plan',
            sourceRefs: [nodeSourceRef]
        }),
        createWorkspaceNode({
            id: 'aec-child',
            title: 'Delivery Model',
            body: 'How the consulting team delivers engagements'
        })
    ];
    const edges = [
        {
            id: 'edge-aec-child',
            source: 'aec-root',
            target: 'aec-child',
            type: 'step',
            metadata: {
                relationship_type: 'contains',
                rationale: 'Delivery model is part of the offer.'
            }
        }
    ];
    const session = createAIDraftSession({
        sessionId: 'session-aec',
        revisionId: 'revision-aec-1',
        scope: { type: 'branch', node_id: 'aec-root' },
        prompt: 'Create a consulting business plan',
        draftNodes: draftNodes().slice(0, 1),
        draftEdges: draftEdges().slice(0, 1)
    });
    session.source_refs = [priorSourceRef];
    const prompt = 'make this specific to AEC consulting';
    const changeIntent = inferAIDraftChangeIntent(prompt);
    const memoryContext = buildAIDraftMemoryContext({
        nodes,
        edges,
        scope: { type: 'branch', node_id: 'aec-root' },
        selectedSourcePayload,
        activeDraftSession: session,
        prompt,
        changeIntent
    });

    const request = buildAIDraftSessionRequestPayload({
        role: { id: 'workflow-mapper', label: 'Workflow Mapper' },
        action: { id: 'custom_prompt', label: 'Custom prompt' },
        scope: { type: 'branch', node_id: 'aec-root' },
        prompt,
        selectedSourcePayload,
        memoryContext,
        changeIntent
    });

    assert.equal(changeIntent, 'update');
    assert.equal(request.change_intent, 'update');
    assert.deepEqual(request.scope, { type: 'branch', node_id: 'aec-root' });
    assert.equal(request.memory_context.scope.node_id, 'aec-root');
    assert.equal(request.memory_context.graph_context.scoped_node_count, 2);
    assert.deepEqual(
        request.memory_context.graph_context.nodes.map((node) => node.id),
        ['aec-root', 'aec-child']
    );
    assert.deepEqual(request.memory_context.graph_context.edges[0], {
        id: 'edge-aec-child',
        source: 'aec-root',
        target: 'aec-child',
        relationship_type: 'step',
        confidence: '',
        rationale: 'Delivery model is part of the offer.'
    });
    assert.equal(request.memory_context.prior_draft_session.session_id, 'session-aec');
    assert.equal(request.memory_context.source_context.selected_source_id, 'doc-context');
    assert.deepEqual(
        request.source_refs.map((ref) => ref.document_id),
        ['doc-context', 'doc-aec', 'doc-cereal', 'doc-reconciled']
    );
    assert.equal(request.metadata.follow_up_memory.change_intent, 'update');
});

test('visibleAIDraftPromptText hides internal memory prompts and recovers user prompt', () => {
    const memoryPrompt = [
        'Use this follow-up AI memory while answering.',
        'Follow-up memory context JSON:',
        '{ "current_prompt": "Improve this flowchart with source-backed notes." }',
        '',
        'User question: Improve this flowchart with source-backed notes.'
    ].join('\n');

    assert.equal(
        visibleAIDraftPromptText(memoryPrompt),
        'Improve this flowchart with source-backed notes.'
    );
    assert.equal(
        visibleAIDraftPromptText('Use this structured workspace brief while answering.\n\nUser question: Build a setup map'),
        'Build a setup map'
    );
    assert.equal(visibleAIDraftPromptText('Make a BIM flowchart'), 'Make a BIM flowchart');
});

test('follow-up intent preserves supplement and compare prompts over update wording', () => {
    assert.equal(
        inferAIDraftChangeIntent('add AEC consulting examples to make this more specific'),
        'supplement'
    );
    assert.equal(
        inferAIDraftChangeIntent('compare this with an AEC consulting firm positioning'),
        'compare'
    );
});

test('starter transformation catalog includes operational prompt defaults', () => {
    const ids = new Set(starterTransformations.map((starter) => starter.id));

    assert.equal(starterTransformations.length, 22);
    assert.ok(ids.has('sop_to_checklist'));
    assert.ok(ids.has('pdf_to_training_outline'));
    assert.ok(ids.has('requirements_to_tasks'));
    assert.ok(ids.has('source_coverage_report'));
    assert.ok(ids.has('standards_completeness_review'));
    assert.ok(ids.has('complex_issue_team_roadmap'));
    assert.ok(ids.has('sme_review_packet'));
    assert.ok(ids.has('implementation_handoff_package'));
    assert.ok(ids.has('reconcile_source_with_workspace'));
    assert.ok(ids.has('specialize_branch'));
    assert.ok(ids.has('find_process_bottlenecks'));
    assert.ok(ids.has('find_duplicate_tools'));
    assert.ok(ids.has('find_ownership_gaps'));
    assert.ok(ids.has('find_unsupported_business_critical_systems'));
    assert.ok(ids.has('create_30_60_90_day_improvement_plan'));
    assert.ok(ids.has('create_stakeholder_review_package'));
    assert.ok(
        starterTransformations.every(
            (starter) =>
                starter.label &&
                starter.prompt &&
                starter.visual &&
                starter.roleId &&
                starter.actionId &&
                Array.isArray(starter.scopes) &&
                starter.scopes.length
        )
    );

    const toolOverlap = starterTransformations.find(
        (starter) => starter.id === 'find_duplicate_tools'
    );
    assert.equal(toolOverlap.label, 'Software overlap');
    assert.equal(toolOverlap.visual, 'software_overlap_report');
    assert.match(toolOverlap.description, /overlapping applications/i);
    assert.match(toolOverlap.prompt, /potential overlap/i);
});

test('intent prompt profiles include standards review and roadmap actions', () => {
    const profiles = getPromptProfilesForScope('workspace');
    const standardsProfile = profiles.find((profile) => profile.id === 'standards-completeness-reviewer');
    const roadmapProfile = profiles.find((profile) => profile.id === 'roadmap-planner');

    assert.equal(standardsProfile.group, 'TraceSpace');
    assert.deepEqual(
        getActionsForProfileAndScope(standardsProfile, 'workspace').map((action) => action.id),
        [
            'find_missing_source_support',
            'assess_standards_completeness',
            'create_sme_questions',
            'custom_prompt'
        ]
    );
    assert.deepEqual(
        getActionsForProfileAndScope(roadmapProfile, 'workspace').map((action) => action.id),
        ['create_team_roadmap', 'create_sme_questions', 'generate_tasks', 'generate_checklist', 'custom_prompt']
    );
});

test('source-first action presets cover source-only and graph-aware routing', () => {
    const sourceOnlyIds = sourceFirstActionPresets
        .filter((preset) => preset.availability === 'source_only')
        .map((preset) => preset.id);
    const graphIds = sourceFirstActionPresets
        .filter((preset) => preset.availability === 'graph')
        .map((preset) => preset.id);

    assert.deepEqual(sourceOnlyIds, [
        'source_to_mind_map',
        'source_to_table',
        'source_to_tasks'
    ]);
    assert.ok(sourceFirstActionPresets.some((preset) => preset.id === 'source_entities_connections'));
    assert.ok(sourceFirstActionPresets.some((preset) => preset.id === 'source_summary'));
    assert.deepEqual(graphIds, [
        'source_compare_workspace',
        'source_supplement_workspace',
        'source_reconcile_workspace'
    ]);
    assert.ok(
        sourceFirstActionPresets.every(
            (preset) =>
                preset.label &&
                preset.description &&
                preset.prompt &&
                preset.visual &&
                preset.roleId &&
                preset.actionId &&
                !/chunk/i.test(`${preset.label} ${preset.description}`)
        )
    );

    assert.deepEqual(
        getActionsForProfileAndScope(
            getPromptProfilesForScope('source').find((profile) => profile.id === 'data-table-interpreter'),
            'source'
        ).map((action) => action.id),
        ['interpret_table_data', 'generate_tasks', 'custom_prompt']
    );
});

test('enterprise prompt profiles expose guided readiness actions', () => {
    const profiles = getPromptProfilesForScope('workspace');
    const processProfile = profiles.find((profile) => profile.id === 'enterprise-process-analyst');
    const toolsProfile = profiles.find((profile) => profile.id === 'enterprise-tool-rationalization');
    const plannerProfile = profiles.find((profile) => profile.id === 'enterprise-readiness-planner');

    assert.equal(processProfile.group, 'TraceSpace Enterprise');
    assert.deepEqual(
        getActionsForProfileAndScope(processProfile, 'workspace').map((action) => action.id),
        ['find_process_bottlenecks', 'find_ownership_gaps', 'create_sme_questions', 'custom_prompt']
    );
    assert.deepEqual(
        getActionsForProfileAndScope(toolsProfile, 'workspace').map((action) => action.id),
        [
            'find_missing_source_support',
            'find_duplicate_tools',
            'find_unsupported_business_critical_systems',
            'custom_prompt'
        ]
    );
    assert.deepEqual(
        getActionsForProfileAndScope(toolsProfile, 'workspace').map((action) => action.label),
        [
            'Find missing source support',
            'Find software overlap',
            'Find unsupported business-critical systems',
            'Custom prompt'
        ]
    );
    assert.match(toolsProfile.description, /software overlap/i);
    assert.ok(
        getActionsForProfileAndScope(plannerProfile, 'workspace')
            .map((action) => action.id)
            .includes('create_stakeholder_review_package')
    );
});

test('multi-source draft payload bounds workspace request to selected chunks', () => {
    const selectedSourcePayload = buildSelectedSourcesDraftPayload([
        {
            id: 'doc-general-mills',
            title: 'General Mills source',
            chunks: [{ id: 'gm-1', snippet: 'General Mills makes Cheerios.' }]
        },
        {
            id: 'doc-kellogg',
            title: 'Kellogg source',
            chunks: [{ id: 'kg-1', snippet: "Kellogg's makes Corn Flakes." }]
        }
    ]);
    const request = buildAIDraftSessionRequestPayload({
        role: { id: 'source-librarian', label: 'Source Librarian' },
        action: { id: 'custom_prompt', label: 'Compare sources' },
        scope: selectedSourcePayload.scope,
        prompt: 'Compare cereal manufacturers',
        selectedSourcePayload
    });

    assert.deepEqual(request.scope, { type: 'workspace' });
    assert.equal(request.source_chunks.length, 2);
    assert.deepEqual(request.metadata.source_context.selected_source_ids, [
        'doc-general-mills',
        'doc-kellogg'
    ]);
    assert.equal(request.metadata.source_context.source_context_mode, 'bounded_multi_source');
});

test('selected relationship draft items accept only chosen semantic edges locally', () => {
    const session = createAIDraftSession({
        sessionId: 'session-relationships',
        revisionId: 'revision-relationships',
        prompt: 'Find connections',
        draftNodes: [],
        draftEdges: [],
        draftItems: [
            {
                id: 'item-rel-approval',
                item_type: 'relationship',
                title: 'Plan depends on approval',
                content: 'Approval is required before launch.',
                confidence: 0.84,
                source_refs: [{ document_id: 'doc-plan', chunk_id: 'approval' }],
                metadata: {
                    relationship_edge_id: 'rel-approval',
                    source_node_id: 'plan',
                    target_node_id: 'approval',
                    relationship_type: 'depends_on',
                    rationale: 'Approval is required before launch.'
                }
            },
            {
                id: 'item-rel-risk',
                item_type: 'relationship',
                title: 'Risk blocks launch',
                content: 'Risk may block launch.',
                confidence: 0.42,
                metadata: {
                    relationship_edge_id: 'rel-risk',
                    source_node_id: 'risk',
                    target_node_id: 'launch',
                    relationship_type: 'blocks',
                    rationale: 'Risk may block launch.'
                }
            }
        ]
    });

    const result = acceptAIDraftSession({
        session,
        nodes: [
            createWorkspaceNode({ id: 'plan', title: 'Plan' }),
            createWorkspaceNode({ id: 'approval', title: 'Approval' }),
            createWorkspaceNode({ id: 'risk', title: 'Risk' }),
            createWorkspaceNode({ id: 'launch', title: 'Launch' })
        ],
        edges: [],
        mode: 'selected',
        selectedItemIds: ['item-rel-risk']
    });

    assert.equal(result.edges.length, 1);
    assert.equal(result.edges[0].id, 'rel-risk');
    assert.equal(result.edges[0].relationship_type, 'blocks');
    assert.equal(result.edges[0].metadata.confidence, 0.42);
    assert.deepEqual(result.accept_result.accepted_edge_ids, ['rel-risk']);
    assert.equal(result.accept_result.preview_diff.added_edges, 1);
    assert.deepEqual(result.accept_result.preview_diff.accepted_item_ids, ['item-rel-risk']);
});
