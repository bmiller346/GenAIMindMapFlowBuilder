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
    createAIDraftRevision,
    createAIDraftSession,
    formatAIDraftPreviewDiffSummary,
    getAIDraftAcceptModeDetail,
    getAIDraftItemBadges,
    getAIDraftModelMetadata,
    getAIDraftSourceStatus,
    inferAIDraftChangeIntent,
    inferAIDraftEvidencePreferences,
    inferAIDraftExpansionPreferences,
    draftArtifactPreviewToMarkdown,
    normalizeAcceptedDraftArtifacts,
    normalizePublishableDraftArtifacts,
    normalizeSoftwareOverlapReports,
    rejectAIDraftSession,
    reviseAIDraftSession,
    sourceRefsFromPastedUrls,
    visibleAIDraftPromptText
} from '../src/utils/aiDraftSessions.js';
import {
    getActionsForProfileAndScope,
    getPromptProfilesForScope,
    sourceFirstActionPresets,
    starterTransformations
} from '../src/prompts/promptsModel.js';
import { createWorkspaceEdge, createWorkspaceNode } from '../src/utils/manualNodes.js';
import { buildLocalGuidedFallbackDraft, buildLocalSankeyDraft } from '../src/utils/localSankeyDraft.js';
import { buildGraphProjection, getSankeyFlowProjection } from '../src/views/graphProjection.js';

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

test('acceptAIDraftSession preserves connected package artifacts and undo metadata locally', () => {
    const root = createWorkspaceNode({ id: 'root', title: 'Deployment' });
    const session = createAIDraftSession({
        workspaceId: 'workspace-1',
        scope: { type: 'branch', node_id: 'root' },
        prompt: 'Create connected picture package',
        draftNodes: [],
        draftEdges: [],
        generatedArtifacts: [
            {
                id: 'artifact-connected-package',
                artifact_type: 'connected_picture_package',
                title: 'Connected package',
                status: 'needs_review',
                data: {
                    package_id: 'connected-package-1',
                    view_lenses: [{ id: 'lens-review', lens_type: 'review', source_refs: [] }],
                    source_refs: [{ document_id: 'doc-1' }]
                },
                source_refs: [{ document_id: 'doc-1' }]
            }
        ],
        sessionId: 'session-connected-package',
        revisionId: 'revision-connected-package'
    });

    const result = acceptAIDraftSession({
        session,
        nodes: [root],
        edges: [],
        mode: 'append',
        acceptedAt: '2026-05-20T23:00:00.000Z'
    });

    assert.equal(result.accept_result.accepted_artifacts[0].artifact_type, 'connected_picture_package');
    assert.equal(result.accept_result.accepted_artifacts[0].data.package_id, 'connected-package-1');
    assert.equal(result.accept_result.accepted_artifacts[0].metadata.ai_draft_revision_id, 'revision-connected-package');
    assert.equal(result.accept_result.accepted_artifacts[0].metadata.accepted_at, '2026-05-20T23:00:00.000Z');
    assert.equal(result.accept_result.undo.kind, 'react_flow_snapshot');
    assert.equal(result.session.accept_history[0].metadata.undo_kind, 'react_flow_snapshot');

    const [artifact] = normalizeAcceptedDraftArtifacts(session.revisions[0], {
        session,
        acceptedAt: '2026-05-20T23:00:00.000Z'
    });
    assert.equal(artifact.data.view_lenses[0].id, 'lens-review');
    assert.equal(artifact.metadata.ai_draft_session_id, 'session-connected-package');
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
    assert.ok(generated.every((node) => Math.abs(node.position.y - parent.position.y) <= 900));
    assert.ok(generated.every((node) => ![existingA, existingB].some((existing) => (
        Math.abs(existing.position.x - node.position.x) < 340 &&
        Math.abs(existing.position.y - node.position.y) < 88
    ))));
});

test('acceptAIDraftSession reseats later sibling subtrees after a large node expansion', () => {
    const root = createWorkspaceNode({ id: 'root', title: 'Coffee cart', position: { x: 0, y: 300 } });
    const suppliers = createWorkspaceNode({ id: 'suppliers', title: 'Suppliers', position: { x: 366, y: 500 } });
    const budget = createWorkspaceNode({ id: 'budget', title: 'Budget', position: { x: 366, y: 625 } });
    const budgetChild = createWorkspaceNode({ id: 'budget-child', title: 'Cart buildout', position: { x: 732, y: 520 } });
    const draftNodes = [
        { id: 'supplier-requirements', title: 'Requirements', node_type: 'process', source_refs: [] },
        { id: 'supplier-core', title: 'Core supplies', node_type: 'dependency', source_refs: [] },
        { id: 'supplier-vendors', title: 'Vendor management', node_type: 'process', source_refs: [] },
        { id: 'supplier-controls', title: 'Inventory controls', node_type: 'process', source_refs: [] },
        { id: 'supplier-risk', title: 'Supply risk', node_type: 'risk', source_refs: [] },
        { id: 'supplier-reorder', title: 'Reorder routine', node_type: 'process', source_refs: [] }
    ];
    const session = createAIDraftSession({
        workspaceId: 'workspace-sibling-reseat',
        scope: { type: 'node', node_id: 'suppliers' },
        prompt: 'expand this node in a logical manner',
        draftNodes,
        draftEdges: draftNodes.map((node) => ({
            id: `edge-suppliers-${node.id}`,
            source_node_id: 'suppliers',
            target_node_id: node.id,
            relationship_type: 'contains'
        })),
        sessionId: 'session-sibling-reseat',
        revisionId: 'revision-sibling-reseat-1'
    });

    const accepted = acceptAIDraftSession({
        session,
        nodes: [root, suppliers, budget, budgetChild],
        edges: [
            createWorkspaceEdge('root', 'suppliers', { id: 'edge-root-suppliers' }),
            createWorkspaceEdge('root', 'budget', { id: 'edge-root-budget' }),
            createWorkspaceEdge('budget', 'budget-child', { id: 'edge-budget-child' })
        ],
        mode: 'append',
        acceptedAt: '2026-05-14T12:10:00.000Z'
    });

    const supplierNodes = accepted.nodes.filter((node) => node.id === 'suppliers' || node.id.startsWith('supplier-'));
    const budgetNodes = accepted.nodes.filter((node) => node.id === 'budget' || node.id === 'budget-child');
    const supplierBottom = Math.max(...supplierNodes.map((node) => node.position.y + 88));
    const budgetTop = Math.min(...budgetNodes.map((node) => node.position.y));

    assert.ok(budgetTop >= supplierBottom + 64);
    assert.ok(accepted.nodes.find((node) => node.id === 'budget').position.y > budget.position.y);
    assert.ok(accepted.nodes.find((node) => node.id === 'budget-child').position.y > budgetChild.position.y);
});

test('acceptAIDraftSession reseats branch siblings when expansion targets existing child anchors', () => {
    const root = createWorkspaceNode({ id: 'root', title: 'Coffee cart', position: { x: 0, y: 300 } });
    const suppliers = createWorkspaceNode({ id: 'suppliers', title: 'Suppliers', position: { x: 366, y: 250 } });
    const budget = createWorkspaceNode({ id: 'budget', title: 'Budget', position: { x: 366, y: 375 } });
    const budgetChild = createWorkspaceNode({ id: 'budget-child', title: 'Cart buildout', position: { x: 732, y: 375 } });
    const draftNodes = [
        { id: 'supplier-beans', title: 'Coffee beans', node_type: 'dependency', source_refs: [] },
        { id: 'supplier-milk', title: 'Milk options', node_type: 'dependency', source_refs: [] },
        { id: 'supplier-packaging', title: 'Packaging', node_type: 'dependency', source_refs: [] },
        { id: 'supplier-backups', title: 'Backup vendors', node_type: 'risk', source_refs: [] }
    ];
    const session = createAIDraftSession({
        workspaceId: 'workspace-existing-anchor-reseat',
        scope: { type: 'branch', node_id: 'root' },
        prompt: 'expand supplier branch leaves',
        draftNodes,
        draftEdges: [
            ...draftNodes.map((node) => ({
                id: `edge-suppliers-${node.id}`,
                source_node_id: 'suppliers',
                target_node_id: node.id,
                relationship_type: 'contains'
            })),
            {
                id: 'edge-missing-source',
                source_node_id: 'missing-source',
                target_node_id: 'supplier-backups',
                relationship_type: 'contains'
            }
        ],
        sessionId: 'session-existing-anchor-reseat',
        revisionId: 'revision-existing-anchor-reseat-1'
    });

    const accepted = acceptAIDraftSession({
        session,
        nodes: [root, suppliers, budget, budgetChild],
        edges: [
            createWorkspaceEdge('root', 'suppliers', { id: 'edge-root-suppliers' }),
            createWorkspaceEdge('root', 'budget', { id: 'edge-root-budget' }),
            createWorkspaceEdge('budget', 'budget-child', { id: 'edge-budget-child' })
        ],
        mode: 'append',
        acceptedAt: '2026-05-14T12:20:00.000Z'
    });

    assert.deepEqual(accepted.nodes.find((node) => node.id === 'root').position, root.position);
    assert.deepEqual(accepted.nodes.find((node) => node.id === 'suppliers').position, suppliers.position);
    assert.ok(accepted.edges.some((edge) => edge.source === 'suppliers' && edge.target === 'supplier-beans'));
    assert.ok(!accepted.edges.some((edge) => edge.source === 'missing-source'));
    assert.ok(accepted.nodes.find((node) => node.id === 'budget').position.y > budget.position.y);
    assert.ok(accepted.nodes.find((node) => node.id === 'budget-child').position.y > budgetChild.position.y);
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

test('draft request carries strict versus exploratory expansion preference', () => {
    const strictPayload = buildAIDraftSessionRequestPayload({
        role: { id: 'workflow-mapper' },
        action: { id: 'generate_child_nodes' },
        scope: { type: 'node', node_id: 'root' },
        prompt: 'Give me 5 more child nodes.',
        expansionMode: 'strict',
        expansionTarget: 'leaves',
        evidenceMode: 'uploaded_sources',
        citationPolicy: 'required'
    });
    const defaultPayload = buildAIDraftSessionRequestPayload({
        role: { id: 'workflow-mapper' },
        action: { id: 'generate_child_nodes' },
        scope: { type: 'node', node_id: 'root' },
        prompt: 'Expand this node.'
    });

    assert.equal(strictPayload.metadata.expansion_mode, 'strict');
    assert.equal(strictPayload.metadata.expansion_target, 'leaves');
    assert.equal(strictPayload.metadata.evidence_mode, 'uploaded_sources');
    assert.equal(strictPayload.metadata.citation_policy, 'required');
    assert.equal(strictPayload.metadata.source_policy_requires_citation, true);
    assert.equal(defaultPayload.metadata.expansion_mode, 'exploratory');
    assert.equal(defaultPayload.metadata.expansion_target, 'selected_node');
    assert.equal(defaultPayload.metadata.evidence_mode, 'workspace');
    assert.equal(defaultPayload.metadata.citation_policy, 'preferred');
});

test('inferAIDraftEvidencePreferences maps source intent to evidence gates', () => {
    assert.deepEqual(
        inferAIDraftEvidencePreferences({
            prompt: 'Create a monthly news article with current online sources.',
            scope: { type: 'workspace' }
        }),
        {
            evidenceMode: 'web_sources',
            citationPolicy: 'required'
        }
    );
    assert.deepEqual(
        inferAIDraftEvidencePreferences({
            prompt: 'Draft an intranet update and stakeholder announcement from the release notes.',
            scope: { type: 'workspace' }
        }),
        {
            evidenceMode: 'sharepoint',
            citationPolicy: 'required'
        }
    );
    assert.deepEqual(
        inferAIDraftEvidencePreferences({
            prompt: 'Use your knowledge to map fire alarm design code references for NFPA 72, NFPA 70, and NJAC.',
            scope: { type: 'workspace' }
        }),
        {
            evidenceMode: 'web_sources',
            citationPolicy: 'required'
        }
    );
    assert.deepEqual(
        inferAIDraftEvidencePreferences({
            prompt: 'Correct evidence for this row from https://example.com/current-code-reference.',
            scope: { type: 'workspace' }
        }),
        {
            evidenceMode: 'web_sources',
            citationPolicy: 'required'
        }
    );
    assert.deepEqual(
        inferAIDraftEvidencePreferences({
            prompt: 'Draft this from general knowledge with no citations.',
            scope: { type: 'node', node_id: 'root' }
        }),
        {
            evidenceMode: 'general_knowledge',
            citationPolicy: 'not_required'
        }
    );
    assert.deepEqual(
        inferAIDraftEvidencePreferences({
            prompt: 'Build an executive summary from uploaded source evidence.',
            scope: { type: 'source', source_id: 'doc-1' },
            selectedSourceCount: 1,
            loadedSourceCount: 1
        }),
        {
            evidenceMode: 'uploaded_sources',
            citationPolicy: 'required'
        }
    );
    assert.deepEqual(
        inferAIDraftEvidencePreferences({
            prompt: 'Check NFPA 72 and NEC requirements against the selected source.',
            scope: { type: 'source', source_id: 'doc-code' },
            selectedSourceCount: 1,
            loadedSourceCount: 1
        }),
        {
            evidenceMode: 'uploaded_sources',
            citationPolicy: 'required'
        }
    );
    assert.deepEqual(sourceRefsFromPastedUrls('Correct from https://example.com/code#section.')[0], {
        document_id: 'https://example.com/code',
        section: 'Pasted URL',
        quote_snippet: '',
        confidence: 'medium',
        source_type: 'url'
    });
});

test('inferAIDraftExpansionPreferences maps plain-language growth intent', () => {
    assert.deepEqual(
        inferAIDraftExpansionPreferences({
            prompt: 'Give me 5 more nodes for this branch.',
            scope: { type: 'branch', node_id: 'root' }
        }),
        {
            expansionMode: 'strict',
            expansionTarget: 'selected_node'
        }
    );
    assert.deepEqual(
        inferAIDraftExpansionPreferences({
            prompt: 'Propagate each child in a logical manner.',
            scope: { type: 'branch', node_id: 'root' }
        }),
        {
            expansionMode: 'exploratory',
            expansionTarget: 'existing_children'
        }
    );
    assert.deepEqual(
        inferAIDraftExpansionPreferences({
            prompt: 'Fully expand the whole branch.',
            scope: { type: 'branch', node_id: 'root' }
        }),
        {
            expansionMode: 'exploratory',
            expansionTarget: 'whole_branch'
        }
    );
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

    assert.equal(starterTransformations.length, 29);
    assert.ok(ids.has('sop_to_checklist'));
    assert.ok(ids.has('pdf_to_training_outline'));
    assert.ok(ids.has('requirements_to_tasks'));
    assert.ok(ids.has('source_coverage_report'));
    assert.ok(ids.has('standards_completeness_review'));
    assert.ok(ids.has('complex_issue_team_roadmap'));
    assert.ok(ids.has('sme_review_packet'));
    assert.ok(ids.has('implementation_handoff_package'));
    assert.ok(ids.has('aec_sow_to_delivery_graph'));
    assert.ok(ids.has('aec_code_lifecycle_package'));
    assert.ok(ids.has('executive_summary'));
    assert.ok(ids.has('news_article'));
    assert.ok(ids.has('newsletter'));
    assert.ok(ids.has('reconcile_source_with_workspace'));
    assert.ok(ids.has('specialize_branch'));
    assert.ok(ids.has('find_process_bottlenecks'));
    assert.ok(ids.has('find_duplicate_tools'));
    assert.ok(ids.has('find_ownership_gaps'));
    assert.ok(ids.has('find_unsupported_business_critical_systems'));
    assert.ok(ids.has('create_30_60_90_day_improvement_plan'));
    assert.ok(ids.has('create_stakeholder_review_package'));
    assert.ok(ids.has('sankey_flow_lens'));
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

    const executiveSummary = starterTransformations.find(
        (starter) => starter.id === 'executive_summary'
    );
    assert.equal(executiveSummary.visual, 'executive_summary');
    assert.equal(executiveSummary.roleId, 'enterprise-readiness-planner');
    assert.equal(executiveSummary.actionId, 'create_stakeholder_review_package');
    assert.match(executiveSummary.prompt, /recommendation or decision requested/i);
    assert.match(executiveSummary.prompt, /go\/no-go decision gate/i);
    assert.match(executiveSummary.prompt, /unsupported costs, ROI, dates, or claims/i);

    const newsArticle = starterTransformations.find((starter) => starter.id === 'news_article');
    assert.equal(newsArticle.visual, 'news_article');
    assert.equal(newsArticle.roleId, 'research-assistant');
    assert.equal(newsArticle.actionId, 'custom_prompt');
    assert.match(newsArticle.prompt, /headline, dek, lede/i);
    assert.match(newsArticle.prompt, /fact-check notes/i);
    assert.match(newsArticle.prompt, /source-backed appendix/i);
    assert.match(newsArticle.prompt, /intranet update/i);

    const newsletter = starterTransformations.find((starter) => starter.id === 'newsletter');
    assert.equal(newsletter.visual, 'newsletter');
    assert.equal(newsletter.roleId, 'research-assistant');
    assert.equal(newsletter.actionId, 'custom_prompt');
    assert.match(newsletter.prompt, /visual blocks/i);
    assert.match(newsletter.prompt, /map\/flow\/table\/status/i);

    const messyContext = starterTransformations.find(
        (starter) => starter.id === 'messy_context_to_best_view'
    );
    assert.equal(messyContext.visual, 'auto');
    assert.equal(messyContext.roleId, 'workflow-mapper');
    assert.match(messyContext.prompt, /best shape/i);
    assert.match(messyContext.prompt, /repair prompts/i);

    const aecSowPlan = starterTransformations.find(
        (starter) => starter.id === 'aec_sow_to_delivery_graph'
    );
    assert.equal(aecSowPlan.visual, 'knowledge_graph');
    assert.equal(aecSowPlan.roleId, 'aec-sow-deliverables');
    assert.match(aecSowPlan.prompt, /disciplines/i);
    assert.match(aecSowPlan.prompt, /monday\.com/i);

    const sankeyFlowLens = starterTransformations.find(
        (starter) => starter.id === 'sankey_flow_lens'
    );
    assert.equal(sankeyFlowLens.visual, 'chart');
    assert.equal(sankeyFlowLens.roleId, 'data-table-interpreter');
    assert.equal(sankeyFlowLens.actionId, 'interpret_table_data');
    assert.match(sankeyFlowLens.prompt, /source, target, value/i);
    assert.match(sankeyFlowLens.prompt, /chart_type=sankey/i);
});

test('local sankey fallback revision creates accept-ready structured rows', () => {
    const localDraft = buildLocalSankeyDraft({
        priorPrompt: 'Create a source-backed Sankey flow lens from this workspace or source context.',
        prompt: 'for fire alarm design using code knowledge in New Jersey NFPA 72 and NFPA 70'
    });

    assert.equal(localDraft.draftNodes.length, 1);
    assert.equal(localDraft.draftNodes[0].artifact_type, 'structured_data_analysis');
    assert.equal(localDraft.draftNodes[0].generated_artifacts[1].data.chart_spec.chart_type, 'sankey');
    assert.match(localDraft.draftNodes[0].title, /Review-only Sankey starter/i);
    assert.equal(localDraft.draftNodes[0].df.length, 10);
    assert.ok(
        localDraft.draftNodes[0].df.some((row) => row.target === 'NFPA 72 system requirements')
    );
    assert.ok(
        localDraft.draftNodes[0].df.some(
            (row) => row.target === 'NFPA 70 circuit and power requirements'
        )
    );
    assert.ok(
        localDraft.draftNodes[0].df.some(
            (row) => row.target === 'AHJ review, inspection, and acceptance testing'
        )
    );
    assert.ok(localDraft.draftNodes[0].df.every((row) => row.row_id));
    assert.ok(localDraft.draftNodes[0].df.every((row) => row.evidence_item_id));
    assert.ok(localDraft.draftNodes[0].df.every((row) => row.evidence_status === 'needs_source'));
    assert.ok(localDraft.draftNodes[0].df.every((row) => row.citation_status === 'needs_source'));
    assert.match(localDraft.draftNodes[0].df[0].evidence_repair_prompt, /Correct and cite this output item/i);
    assert.match(localDraft.draftNodes[0].df[0].source_repair_prompt, /web search\/public context/i);

    const session = createAIDraftSession({
        workspaceId: 'flow-sankey',
        scope: { type: 'workspace' },
        role: 'Data/Table Interpreter',
        intent: 'interpret_table_data',
        prompt: 'for fire alarm design using code knowledge in New Jersey NFPA 72 and NFPA 70',
        draftNodes: localDraft.draftNodes,
        draftAnnotations: localDraft.draftAnnotations,
        metadata: {
            output_shape: 'chart',
            requested_visual: 'chart',
            preview_mode: 'local_fallback',
            local_fallback_mode: 'sankey_structured_rows'
        }
    });
    const accepted = acceptAIDraftSession({ session, nodes: [], edges: [], mode: 'append' });
    const projection = buildGraphProjection(accepted.nodes, accepted.edges);
    const sankey = getSankeyFlowProjection(projection);

    assert.equal(accepted.accept_result.accepted_node_ids.length, 1);
    assert.equal(sankey.eligible, true);
    assert.equal(sankey.path_count, 10);
    assert.equal(sankey.rows[0].value_column, 'value');
    assert.equal(sankey.rows[0].review_state, 'needs_review');
    assert.equal(sankey.rows[0].evidence_status, 'needs_source');
    assert.equal(sankey.rows[0].citation_status, 'needs_source');
    assert.match(sankey.rows[0].evidence_repair_prompt, /uploaded sources, selected sources, pasted URLs/i);
});

test('local sankey fallback extracts dependency rows from pasted Power BI context', () => {
    const localDraft = buildLocalSankeyDraft({
        priorPrompt: 'Create a source-backed Sankey flow lens from this workspace or source context.',
        prompt: [
            'Create a dependency sankey from this context.',
            'Code/Standard\tEdition\tTriggering Code/Section\tDependency Code/Section\tNotes',
            'IMC 2015\t2015\tMechanical Equipment\tSection 606\tDuct smoke detectors required',
            'IMC 2015\t2015\tSection 606\tChapter 10\tInterdependency with Boilers/Plumbing Code',
            '',
            'dependency_id,triggering_code,triggering_edition,triggering_section,dependency_code,dependency_edition,dependency_section,notes',
            '1,IMC,2015,Mechanical Equipment,IMC,2015,Section 606,"Duct smoke detectors required"',
            '2,IMC,2015,Chapter 10,NFPA 85,TBD,Specific Sections,"Boiler safety"',
            '3,ASME CSD-1,TBD,CE-110(A),NEC,2014,Specific Articles,"Electrical for emergency shutdown"'
        ].join('\n')
    });

    const rows = localDraft.draftNodes[0].df;
    assert.ok(rows.length >= 4);
    assert.ok(
        rows.some(
            (row) =>
                row.source === 'IMC 2015 Mechanical Equipment' &&
                row.target === 'IMC 2015 Section 606'
        )
    );
    assert.ok(
        rows.some(
            (row) =>
                row.source === 'IMC 2015 Chapter 10' &&
                row.target === 'NFPA 85 Specific Sections'
        )
    );
    assert.ok(
        rows.some(
            (row) =>
                row.source === 'ASME CSD-1 CE-110(A)' &&
                row.target === 'NEC 2014 Specific Articles'
        )
    );
    assert.equal(localDraft.draftNodes[0].status, 'needs_review');
    assert.match(localDraft.draftNodes[0].title, /Review-only Sankey starter/i);
    assert.ok(rows.every((row) => row.evidence_input_hint));
});

test('local guided fallback creates reviewable scaffold for non-sankey starters', () => {
    const localDraft = buildLocalGuidedFallbackDraft({
        priorPrompt: 'Create a stakeholder review package for enterprise readiness.',
        prompt: 'for fire alarm design review in New Jersey',
        outputShape: 'presentation_sections',
        requestedVisual: 'presentation_sections'
    });

    assert.equal(localDraft.draftNodes.length, 5);
    assert.match(localDraft.draftNodes[0].title, /Stakeholder package: fire alarm design review/i);
    assert.equal(localDraft.draftNodes[0].status, 'needs_review');
    assert.equal(localDraft.draftEdges.length, 4);

    const session = createAIDraftSession({
        workspaceId: 'flow-guided',
        scope: { type: 'workspace' },
        role: 'Enterprise Readiness Planner',
        intent: 'create_stakeholder_review_package',
        prompt: 'for fire alarm design review in New Jersey',
        draftNodes: localDraft.draftNodes,
        draftEdges: localDraft.draftEdges,
        draftAnnotations: localDraft.draftAnnotations,
        metadata: {
            output_shape: 'presentation_sections',
            requested_visual: 'presentation_sections',
            preview_mode: 'local_fallback',
            local_fallback_mode: 'guided_start_scaffold'
        }
    });
    const accepted = acceptAIDraftSession({ session, nodes: [], edges: [], mode: 'append' });

    assert.equal(accepted.accept_result.accepted_node_ids.length, 5);
    assert.equal(accepted.nodes[0].data.title, localDraft.draftNodes[0].title);
    assert.equal(accepted.nodes[0].data.status, 'needs_review');
});

test('local guided fallback creates connected package artifacts for package requests', () => {
    const localDraft = buildLocalGuidedFallbackDraft({
        prompt: 'Map this fire alarm design code context from SD through CA and closeout.',
        outputShape: 'graph_draft',
        requestedVisual: 'auto',
        requestedOutputs: ['connected_picture_package']
    });

    assert.equal(localDraft.draftNodes.length, 5);
    assert.match(localDraft.draftNodes[1].title, /Code basis and phases/i);
    assert.equal(localDraft.generatedArtifacts.length, 1);
    assert.equal(localDraft.generatedArtifacts[0].artifact_type, 'connected_picture_package');
    assert.equal(localDraft.generatedArtifacts[0].data.primary_nodes.length, 5);
    assert.equal(localDraft.generatedArtifacts[0].data.relationship_edges.length, 4);
    assert.equal(localDraft.generatedArtifacts[0].data.view_lenses.length, 2);
    assert.ok(localDraft.generatedArtifacts[0].data.repair_targets.length >= 1);

    const session = createAIDraftSession({
        workspaceId: 'flow-connected-fallback',
        scope: { type: 'workspace' },
        role: 'Workflow Mapper',
        intent: 'custom_prompt',
        prompt: 'Map this fire alarm design code context from SD through CA and closeout.',
        draftNodes: localDraft.draftNodes,
        draftEdges: localDraft.draftEdges,
        draftAnnotations: localDraft.draftAnnotations,
        generatedArtifacts: localDraft.generatedArtifacts,
        metadata: {
            output_shape: 'graph_draft',
            requested_visual: 'auto',
            requested_output_shapes: ['connected_picture_package'],
            preview_mode: 'local_fallback',
            local_fallback_mode: 'guided_start_scaffold'
        }
    });

    assert.equal(session.revisions[0].generated_artifacts[0].artifact_type, 'connected_picture_package');
    assert.ok(
        session.revisions[0].draft_items.some(
            (item) => item.metadata?.artifact_type === 'connected_picture_package'
        )
    );
    const accepted = acceptAIDraftSession({ session, nodes: [], edges: [], mode: 'append' });
    assert.equal(accepted.accept_result.accepted_artifacts[0].artifact_type, 'connected_picture_package');
});

test('connected picture package revision normalizes package artifacts into selectable draft items', () => {
    const revision = createAIDraftRevision({
        sessionId: 'session-connected-package',
        prompt: 'Create an implementation handoff package from this connected picture.',
        draftNodes: [
            {
                id: 'package-root',
                title: 'Connected picture package',
                summary: 'Review package that connects scope, blockers, owners, and next actions.',
                node_type: 'task',
                artifact_type: 'implementation_handoff_package',
                artifact_ids: ['handoff-package-1'],
                source_refs: [{ document_id: 'workspace-brief', chunk_id: 'scope' }]
            }
        ],
        generatedArtifacts: [
            {
                id: 'handoff-package-1',
                artifact_type: 'implementation_handoff_package',
                title: 'Implementation handoff package',
                summary: 'Scope, ready items, blockers, dependencies, owners, and next actions.',
                source_refs: [{ document_id: 'workspace-brief', chunk_id: 'scope' }]
            }
        ],
        metadata: {
            output_shape: 'implementation_handoff_package',
            requested_visual: 'implementation_handoff_package'
        }
    });

    assert.equal(revision.draft_nodes[0].artifact_type, 'implementation_handoff_package');
    assert.deepEqual(revision.draft_nodes[0].artifact_ids, ['handoff-package-1']);
    assert.equal(revision.generated_artifacts.length, 1);
    assert.equal(revision.draft_items.length, 2);
    assert.deepEqual(
        revision.draft_items.map((item) => item.id),
        ['package-root', 'handoff-package-1']
    );
    assert.equal(revision.draft_items[1].item_type, 'implementation_handoff_package');
    assert.equal(revision.draft_items[1].metadata.artifact_type, 'implementation_handoff_package');
    assert.equal(revision.preview_diff.added_nodes, 1);
});

const connectedPackageArtifact = () => ({
    id: 'connected-package-artifact',
    artifact_type: 'connected_picture_package',
    title: 'Connected package',
    data: {
        package_id: 'connected-package-1',
        primary_nodes: [
            { id: 'primary-root', node_id: 'root', title: 'Root', source_refs: [{ document_id: 'doc-1' }] }
        ],
        relationship_edges: [
            {
                id: 'edge-root-approval',
                source_node_id: 'root',
                target_node_id: 'approval',
                relationship_type: 'depends_on',
                source_refs: [{ document_id: 'doc-1' }]
            }
        ],
        view_lenses: [{ id: 'lens-graph', lens_type: 'graph', title: 'Graph', edge_ids: ['edge-root-approval'] }],
        structured_evidence: [{ id: 'evidence-approval', title: 'Approval evidence', source_refs: [{ document_id: 'doc-1' }] }],
        evidence_links: [
            {
                id: 'link-approval',
                source_evidence_id: 'evidence-approval',
                target_package_item_id: 'primary-root',
                target_id: 'primary-root'
            }
        ],
        tasks: [
            {
                id: 'task-1',
                title: 'Confirm owner',
                metadata: { required_sibling_ids: ['evidence-approval'] }
            }
        ],
        risks: [],
        decisions: [],
        repair_targets: [],
        acceptance_groups: [{ id: 'graph-only', title: 'Graph', item_ids: ['edge-root-approval'] }],
        source_refs: [{ document_id: 'doc-1' }],
        assumptions: []
    },
    source_refs: [{ document_id: 'doc-1' }]
});

test('connected picture package items can be accepted selectively without dangling artifact refs', () => {
    const session = createAIDraftSession({
        sessionId: 'session-connected-selective',
        revisionId: 'revision-connected-selective',
        prompt: 'Create a connected picture package.',
        generatedArtifacts: [connectedPackageArtifact()]
    });

    assert.ok(session.revisions[0].draft_items.some((item) => item.id === 'item_edge-root-approval'));
    assert.ok(session.revisions[0].draft_items.some((item) => item.id === 'item_evidence-approval'));

    const evidenceOnly = acceptAIDraftSession({
        session,
        nodes: [],
        edges: [],
        mode: 'selected',
        selectedItemIds: ['item_evidence-approval']
    });
    const evidencePackage = evidenceOnly.accept_result.accepted_artifacts[0].data;
    assert.deepEqual(evidencePackage.structured_evidence.map((item) => item.id), ['evidence-approval']);
    assert.deepEqual(evidencePackage.evidence_links, []);
    assert.deepEqual(evidencePackage.relationship_edges, []);

    const taskOnly = acceptAIDraftSession({
        session,
        nodes: [],
        edges: [],
        mode: 'selected',
        selectedItemIds: ['item_task-1']
    });
    const taskPackage = taskOnly.accept_result.accepted_artifacts[0].data;
    assert.deepEqual(taskPackage.tasks.map((item) => item.id), ['task-1']);
    assert.deepEqual(taskPackage.structured_evidence.map((item) => item.id), ['evidence-approval']);
    assert.deepEqual(taskPackage.relationship_edges, []);
});

test('selected package item ids stay review-only when no graph node is selected', () => {
    const session = createAIDraftSession({
        sessionId: 'session-selected-package',
        revisionId: 'revision-selected-package',
        prompt: 'Create a handoff package.',
        draftNodes: [],
        draftEdges: [],
        generatedArtifacts: [
            {
                id: 'handoff-package-1',
                artifact_type: 'implementation_handoff_package',
                title: 'Implementation handoff package',
                source_refs: [{ document_id: 'doc-handoff', chunk_id: 'summary' }],
                metadata: {
                    package_id: 'handoff-package-1',
                    review_state: 'needs_review'
                }
            }
        ],
        draftItems: [
            {
                id: 'handoff-package-1',
                item_type: 'implementation_handoff_package',
                title: 'Implementation handoff package',
                content: 'Review-only package artifact.',
                source_refs: [{ document_id: 'doc-handoff', chunk_id: 'summary' }],
                metadata: {
                    artifact_id: 'handoff-package-1',
                    artifact_type: 'implementation_handoff_package'
                }
            }
        ],
        metadata: {
            output_shape: 'implementation_handoff_package',
            requested_visual: 'implementation_handoff_package'
        }
    });

    const diff = buildAIDraftPreviewDiff(session, {
        mode: 'selected',
        selectedItemIds: ['handoff-package-1']
    });
    const accepted = acceptAIDraftSession({
        session,
        nodes: [],
        edges: [],
        mode: 'selected',
        selectedItemIds: ['handoff-package-1']
    });

    assert.deepEqual(diff.accepted_item_ids, ['handoff-package-1']);
    assert.equal(diff.added_nodes, 0);
    assert.equal(diff.added_edges, 0);
    assert.deepEqual(accepted.accept_result.preview_diff.accepted_item_ids, ['handoff-package-1']);
    assert.deepEqual(accepted.session.accept_history[0].selected_item_ids, ['handoff-package-1']);
    assert.deepEqual(
        accepted.accept_result.accepted_artifacts.map((artifact) => artifact.id),
        ['handoff-package-1']
    );
    assert.equal(accepted.accept_result.undo.kind, 'react_flow_snapshot');
    assert.deepEqual(accepted.session.accept_history[0].undo.before_graph, { nodes: [], edges: [] });
    assert.equal(accepted.accept_result.canonical_graph_mutated, true);
    assert.equal(accepted.nodes.length, 0);
});

test('no-source package drafts preserve missing citation provenance for review', () => {
    const [preview] = normalizePublishableDraftArtifacts({
        metadata: {
            evidence_mode: 'uploaded_sources',
            citation_policy: 'required'
        },
        generated_artifacts: [
            {
                id: 'exec-no-source',
                artifact_type: 'executive_summary',
                title: 'Package readiness summary',
                summary: 'The package can be reviewed before publication.',
                key_points: ['Confirm source support before sharing'],
                assumptions: ['Owner and timing still need confirmation.']
            }
        ]
    });

    assert.equal(preview.provenance.evidenceMode, 'uploaded_sources');
    assert.equal(preview.provenance.citationPolicy, 'required');
    assert.equal(preview.provenance.sourceRefCount, 0);
    assert.equal(preview.provenance.assumptionCount, 1);
    assert.equal(preview.provenance.tone, 'warn');
    assert.equal(
        preview.provenance.summary,
        'Uploaded sources, Citations required, No source references yet, 1 assumption'
    );
});

test('web citation mode keeps URL-backed package provenance source-backed', () => {
    const [preview] = normalizePublishableDraftArtifacts({
        metadata: {
            evidence_mode: 'web_sources',
            citation_policy: 'required'
        },
        generated_artifacts: [
            {
                id: 'news-web-package',
                artifact_type: 'news_article',
                title: 'Code update review package',
                lede: 'A package for checking current public code references.',
                source_refs: [
                    {
                        title: 'NFPA public reference',
                        url: 'https://www.nfpa.org/',
                        quote_snippet: 'Public code and standards reference.'
                    }
                ],
                assumptions: ['Applicability must be checked by the responsible reviewer.']
            }
        ]
    });

    assert.equal(preview.provenance.evidenceMode, 'web_sources');
    assert.equal(preview.provenance.evidenceLabel, 'Web/current sources');
    assert.equal(preview.provenance.citationLabel, 'Citations required');
    assert.equal(preview.provenance.sourceRefCount, 1);
    assert.equal(preview.provenance.tone, 'good');
    assert.equal(
        preview.provenance.summary,
        'Web/current sources, Citations required, 1 source reference, 1 assumption'
    );
});

test('existing non-package draft paths still accept selected graph nodes and edges', () => {
    const root = createWorkspaceNode({ id: 'root', title: 'Workspace root' });
    const session = createAIDraftSession({
        sessionId: 'session-non-package',
        revisionId: 'revision-non-package',
        scope: { type: 'branch', node_id: 'root' },
        prompt: 'Add source-backed child nodes.',
        draftNodes: draftNodes(),
        draftEdges: draftEdges()
    });

    const result = acceptAIDraftSession({
        session,
        nodes: [root],
        edges: [],
        mode: 'selected',
        selectedItemIds: ['draft-kellogg']
    });

    assert.deepEqual(result.accept_result.accepted_node_ids, ['draft-kellogg']);
    assert.deepEqual(result.accept_result.preview_diff.accepted_item_ids, ['draft-kellogg']);
    assert.equal(result.nodes.length, 2);
    assert.equal(result.edges.length, 1);
    assert.equal(result.nodes.find((node) => node.id === 'draft-kellogg').data.status, 'ai_generated');
});

test('publishable draft artifacts normalize executive summary preview fields', () => {
    const previews = normalizePublishableDraftArtifacts({
        generated_artifacts: [
            {
                id: 'exec-1',
                artifact_type: 'executive_summary',
                headline: 'Modernize source review',
                dek: 'A concise leadership brief for operational rollout.',
                summary: 'Source review needs a governed operating cadence.',
                key_points: ['Reduce review drift', { text: 'Protect cited decisions' }],
                recommended_actions: [{ title: 'Name a source owner' }],
                risks: [{ title: 'Unowned reviews drift again' }],
                sections: [
                    {
                        heading: 'Decision needed',
                        body: 'Approve a source-backed review cadence.',
                        bullets: ['Assign owners', 'Set quarterly review dates']
                    }
                ],
                metadata: {
                    audience: 'Leadership team',
                    publish_target: 'SharePoint news',
                    evidence_mode: 'uploaded_sources',
                    citation_policy: 'required'
                },
                source_refs: [{ document_id: 'doc-1', quote_snippet: 'review cadence' }],
                assumptions: ['Quarterly cadence needs owner confirmation.']
            }
        ]
    });

    assert.equal(previews.length, 1);
    assert.equal(previews[0].label, 'Executive summary');
    assert.equal(previews[0].title, 'Modernize source review');
    assert.equal(previews[0].dek, 'A concise leadership brief for operational rollout.');
    assert.equal(previews[0].summary, 'Source review needs a governed operating cadence.');
    assert.deepEqual(previews[0].keyPoints, ['Reduce review drift', 'Protect cited decisions']);
    assert.deepEqual(previews[0].recommendedActions, ['Name a source owner']);
    assert.deepEqual(previews[0].risks, ['Unowned reviews drift again']);
    assert.deepEqual(previews[0].assumptions, ['Quarterly cadence needs owner confirmation.']);
    assert.equal(previews[0].sections[0].title, 'Decision needed');
    assert.equal(previews[0].audience, 'Leadership team');
    assert.equal(previews[0].publishTarget, 'SharePoint news');
    assert.equal(previews[0].provenance.evidenceLabel, 'Uploaded sources');
    assert.equal(previews[0].provenance.citationLabel, 'Citations required');
    assert.equal(previews[0].provenance.sourceRefCount, 1);
    assert.equal(previews[0].provenance.assumptionCount, 1);
    assert.equal(previews[0].provenance.tone, 'good');
    assert.equal(
        previews[0].provenance.summary,
        'Uploaded sources, Citations required, 1 source reference, 1 assumption'
    );
    const markdown = draftArtifactPreviewToMarkdown(previews[0]);
    assert.match(markdown, /## Summary\n\nSource review needs a governed operating cadence\./);
    assert.match(markdown, /## Recommended actions\n- Name a source owner/);
    assert.match(markdown, /## Risks\n- Unowned reviews drift again/);
    assert.match(markdown, /## Assumptions\n- Quarterly cadence needs owner confirmation\./);
});

test('publishable draft artifacts normalize news article payloads and copy markdown', () => {
    const [preview] = normalizePublishableDraftArtifacts({
        metadata: {
            evidence_mode: 'sharepoint',
            citation_policy: 'required'
        },
        artifacts: [
            {
                artifact_type: 'news_article',
                data: {
                    title: 'TraceSpace pilots monthly source reviews',
                    subhead: 'Teams get a faster way to keep workspace knowledge current.',
                    lede: 'TraceSpace is piloting a monthly source-review workflow for internal teams.',
                    highlights: ['New review queue', 'SME questions stay visible'],
                    body: 'The pilot helps teams review loaded source material before publishing.',
                    article_sections: [
                        {
                            title: 'What changed',
                            content: 'Source reviews can now be packaged for internal updates.'
                        }
                    ],
                    quotes: [
                        {
                            source: 'Program notes',
                            quote_snippet: 'SME questions stay visible during review.'
                        }
                    ],
                    fact_checks: [
                        {
                            claim: 'Monthly source reviews are in pilot',
                            status: 'supported',
                            note: 'Backed by the source-review program note.'
                        }
                    ],
                    source_refs: [
                        {
                            document_id: 'program-note',
                            page: 2,
                            section: 'Pilot',
                            quote_snippet: 'monthly source reviews'
                        }
                    ],
                    assumptions: ['Pilot timing should be confirmed with the rollout owner.'],
                    review_state: 'ready_for_editor',
                    confidence: 'medium',
                    channel: 'Intranet'
                }
            }
        ]
    });

    assert.equal(preview.label, 'News article');
    assert.equal(preview.title, 'TraceSpace pilots monthly source reviews');
    assert.equal(preview.lede, 'TraceSpace is piloting a monthly source-review workflow for internal teams.');
    assert.deepEqual(preview.keyPoints, ['New review queue', 'SME questions stay visible']);
    assert.deepEqual(preview.factChecks, [
        'Monthly source reviews are in pilot - supported - Backed by the source-review program note.'
    ]);
    assert.deepEqual(preview.sourceNotes, [
        'Program notes: SME questions stay visible during review.'
    ]);
    assert.equal(preview.sourceRefs.length, 1);
    assert.equal(preview.reviewState, 'ready_for_editor');
    assert.equal(preview.confidence, 'medium');
    assert.equal(preview.provenance.tone, 'good');
    assert.equal(
        preview.provenance.summary,
        'SharePoint/internal, Citations required, 1 source reference, 1 assumption'
    );

    const markdown = draftArtifactPreviewToMarkdown(preview);
    assert.match(markdown, /^# TraceSpace pilots monthly source reviews/);
    assert.match(markdown, /_Teams get a faster way to keep workspace knowledge current\._/);
    assert.match(markdown, /Channel: Intranet/);
    assert.match(markdown, /Evidence: SharePoint\/internal, Citations required, 1 source reference, 1 assumption/);
    assert.match(markdown, /TraceSpace is piloting a monthly source-review workflow for internal teams\./);
    assert.match(markdown, /## What changed/);
    assert.match(markdown, /## Fact-check notes\n- Monthly source reviews are in pilot - supported - Backed by the source-review program note\./);
    assert.match(markdown, /## Source notes\n- Program notes: SME questions stay visible during review\./);
    assert.match(markdown, /## Source-backed appendix\n- program-note \| p\. 2 \| Pilot: monthly source reviews/);
    assert.match(markdown, /## Assumptions\n- Pilot timing should be confirmed with the rollout owner\./);
    assert.ok(markdown.indexOf('## Fact-check notes') < markdown.indexOf('## Source notes'));
    assert.ok(markdown.indexOf('## Source notes') < markdown.indexOf('## Source-backed appendix'));
    assert.ok(markdown.indexOf('## Source-backed appendix') < markdown.indexOf('## Assumptions'));
});

test('publishable draft artifacts normalize newsletter payloads with visual blocks', () => {
    const [preview] = normalizePublishableDraftArtifacts({
        generated_artifacts: [
            {
                artifact_type: 'newsletter',
                data: {
                    title: 'Operations Monthly Update',
                    issue_label: 'May 2026',
                    audience: 'Operations leaders',
                    cadence: 'Monthly',
                    opening_note: 'This issue highlights source-backed launch readiness.',
                    highlights: [
                        {
                            title: 'Launch checklist is ready',
                            description: 'The launch checklist is ready for review.'
                        }
                    ],
                    sections: [
                        {
                            title: 'What changed',
                            description: 'The team added an approval gate.'
                        }
                    ],
                    upcoming: [{ title: 'Next review', description: 'Confirm owner assignments.' }],
                    risks: [{ title: 'Unowned approvals', description: 'Approvals need named owners.' }],
                    decisions_needed: [{ title: 'Approve rollout', description: 'Confirm the publish window.' }],
                    visual_blocks: [
                        {
                            title: 'Approval flow',
                            description: 'Insert a flowchart showing approval and publish steps.'
                        }
                    ],
                    source_refs: [{ document_id: 'doc-news', quote_snippet: 'launch checklist' }],
                    assumptions: ['Publish date needs confirmation.'],
                    metadata: {
                        evidence_mode: 'uploaded_sources',
                        citation_policy: 'required'
                    }
                },
                source_refs: [{ document_id: 'doc-news', quote_snippet: 'launch checklist' }],
                assumptions: ['Publish date needs confirmation.']
            }
        ]
    });

    assert.equal(preview.label, 'Newsletter');
    assert.equal(preview.title, 'Operations Monthly Update');
    assert.equal(preview.issueLabel, 'May 2026');
    assert.equal(preview.cadence, 'Monthly');
    assert.equal(preview.newsletterHighlights[0].title, 'Launch checklist is ready');
    assert.equal(preview.visualBlocks[0].title, 'Approval flow');
    assert.equal(preview.provenance.sourceRefCount, 1);

    const markdown = draftArtifactPreviewToMarkdown(preview);
    assert.match(markdown, /^# Operations Monthly Update/);
    assert.match(markdown, /Issue: May 2026 \| Cadence: Monthly \| Audience: Operations leaders/);
    assert.match(markdown, /## Top highlights/);
    assert.match(markdown, /## Visual blocks/);
    assert.match(markdown, /Approval flow/);
    assert.match(markdown, /## Source-backed appendix/);
    assert.match(markdown, /## Assumptions\n- Publish date needs confirmation\./);
});

test('intent prompt profiles include standards review and roadmap actions', () => {
    const profiles = getPromptProfilesForScope('workspace');
    const standardsProfile = profiles.find((profile) => profile.id === 'standards-completeness-reviewer');
    const roadmapProfile = profiles.find((profile) => profile.id === 'roadmap-planner');
    const aecProfile = profiles.find((profile) => profile.id === 'aec-sow-deliverables');

    assert.equal(standardsProfile.group, 'TraceSpace');
    assert.equal(aecProfile.group, 'TraceSpace AEC');
    assert.deepEqual(
        getActionsForProfileAndScope(aecProfile, 'workspace').map((action) => action.id),
        [
            'create_team_roadmap',
            'create_sme_questions',
            'generate_tasks',
            'generate_checklist',
            'custom_prompt'
        ]
    );
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
    assert.ok(sourceFirstActionPresets.some((preset) => preset.id === 'source_aec_sow_deliverables'));
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

test('pasted URL source refs are carried into correction draft requests', () => {
    const [urlRef] = sourceRefsFromPastedUrls(
        'Correct this row using https://example.com/source?chapter=1#notes.'
    );
    const request = buildAIDraftSessionRequestPayload({
        role: { id: 'research-assistant', label: 'Research Assistant' },
        action: { id: 'custom_prompt', label: 'Correct evidence' },
        scope: { type: 'node', node_id: 'node-1' },
        prompt: 'Correct and cite this output item with the pasted URL.',
        adHocSourceRefs: [urlRef],
        evidenceMode: 'web_sources',
        citationPolicy: 'required'
    });

    assert.equal(urlRef.document_id, 'https://example.com/source?chapter=1');
    assert.equal(request.source_refs[0].document_id, 'https://example.com/source?chapter=1');
    assert.equal(request.source_refs[0].source_type, 'url');
    assert.equal(request.metadata.evidence_mode, 'web_sources');
    assert.equal(request.metadata.source_policy_requires_citation, true);
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
