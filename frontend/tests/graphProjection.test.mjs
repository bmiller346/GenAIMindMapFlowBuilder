import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildCompletenessReviewProjection,
    buildGraphProjection,
    getExecutiveOutputProjection,
    getChecklistPreviewRows,
    getConnectionRows,
    getCrossLinkConnectionRows,
    getEnterpriseReadinessSummary,
    getEnterpriseScoreRows,
    getGraphConfidenceSummary,
    getKanbanColumns,
    getSourceRepairPreviewRows,
    getTeamRoadmapProjection,
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

const supportedNode = (id, nodeType = 'definition', data = {}) => ({
    ...node(id, nodeType, data.title || id),
    data: {
        ...node(id, nodeType, data.title || id).data,
        status: 'reviewed',
        summary: `${id} summary`,
        confidence: 0.88,
        source_refs: [{ document_id: 'doc-1', section: id, confidence: 0.88 }],
        ...data
    }
});

const repairById = (summary, id) => summary.repair_items.find((item) => item.id === id);

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

test('connection rows surface nested edge relationship details', () => {
    const sourceRef = {
        document_id: 'doc-edge',
        section: 'Dependencies',
        quote_snippet: 'The permit package depends on the site survey.',
        confidence: 0.86
    };
    const projection = buildGraphProjection(
        [
            supportedNode('permit', 'task', { title: 'Permit package' }),
            supportedNode('survey', 'dependency', { title: 'Site survey' })
        ],
        [
            {
                id: 'edge-nested-dependency',
                source: 'permit',
                target: 'survey',
                data: {
                    relationship_type: 'depends_on',
                    confidence: 0.74,
                    review_state: 'needs_review',
                    rationale: 'Permit package cannot be submitted until survey inputs are confirmed.',
                    source_refs: [sourceRef]
                }
            }
        ]
    );

    const rows = getConnectionRows(projection);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].relationship, 'Depends On');
    assert.equal(rows[0].relationship_type, 'depends_on');
    assert.equal(rows[0].connection_kind, 'Cross-link');
    assert.equal(rows[0].confidence, 0.74);
    assert.equal(rows[0].review_state, 'needs_review');
    assert.equal(rows[0].source_refs[0].document_id, 'doc-edge');
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

test('kanban columns group confirmed task rows by board status', () => {
    const projection = buildGraphProjection(
        [
            node('task-backlog', 'task', 'Backlog task'),
            {
                ...node('task-progress', 'task', 'Active task'),
                data: {
                    ...node('task-progress', 'task').data,
                    status: 'in_progress'
                }
            },
            {
                ...node('task-blocked', 'task', 'Blocked task'),
                data: {
                    ...node('task-blocked', 'task').data,
                    status: 'blocked'
                }
            },
            {
                ...node('task-done', 'task', 'Done task'),
                data: {
                    ...node('task-done', 'task').data,
                    status: 'approved'
                }
            },
            {
                ...node('task-archived', 'task', 'Archived task'),
                data: {
                    ...node('task-archived', 'task').data,
                    status: 'deprecated'
                }
            }
        ],
        []
    );

    const columns = getKanbanColumns(projection);
    const idsByColumn = Object.fromEntries(
        columns.map((column) => [column.id, column.items.map((item) => item.id)])
    );

    assert.deepEqual(idsByColumn.backlog, ['task-backlog']);
    assert.deepEqual(idsByColumn.in_progress, ['task-progress']);
    assert.deepEqual(idsByColumn.blocked, ['task-blocked']);
    assert.deepEqual(idsByColumn.done, ['task-done']);
    assert.deepEqual(idsByColumn.archived, ['task-archived']);
    assert.deepEqual(
        Object.fromEntries(columns.map((column) => [column.id, column.status])),
        {
            backlog: 'needs_review',
            in_progress: 'in_progress',
            blocked: 'blocked',
            done: 'approved',
            archived: 'rejected'
        }
    );
});

test('kanban columns sort by due date, priority, then title', () => {
    const projection = buildGraphProjection(
        [
            {
                ...node('task-later-critical', 'task', 'Critical later'),
                data: {
                    ...node('task-later-critical', 'task').data,
                    priority: 'critical',
                    due_date: '2026-06-20'
                }
            },
            {
                ...node('task-sooner-low', 'task', 'Low sooner'),
                data: {
                    ...node('task-sooner-low', 'task').data,
                    priority: 'low',
                    due_date: '2026-06-01'
                }
            },
            {
                ...node('task-alpha', 'task', 'Alpha'),
                data: {
                    ...node('task-alpha', 'task').data,
                    priority: 'high',
                    due_date: '2026-06-20'
                }
            }
        ],
        []
    );

    const backlog = getKanbanColumns(projection).find((column) => column.id === 'backlog');

    assert.deepEqual(backlog.items.map((item) => item.id), [
        'task-sooner-low',
        'task-later-critical',
        'task-alpha'
    ]);
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

test('graph confidence flags unsourced creative graphs as needing source support', () => {
    const projection = buildGraphProjection(
        [
            supportedNode('root', 'category', {
                status: 'ai_generated',
                confidence: 0.72,
                source_refs: []
            }),
            supportedNode('idea-1', 'concept', {
                status: 'ai_generated',
                confidence: 0.72,
                source_refs: []
            }),
            supportedNode('idea-2', 'concept', {
                status: 'ai_generated',
                confidence: 0.72,
                source_refs: []
            })
        ],
        [
            { id: 'edge-1', source: 'root', target: 'idea-1', relationship_type: 'contains' },
            { id: 'edge-2', source: 'root', target: 'idea-2', relationship_type: 'contains' }
        ]
    );

    const summary = getGraphConfidenceSummary(projection);

    assert.equal(summary.score, 58);
    assert.equal(summary.label, 'Needs enrichment');
    assert.equal(summary.sourced_nodes, 0);
    assert(summary.reasons.includes('Graph has no source-backed nodes'));
    assert(summary.supplement_actions.includes('Add source support'));
    assert.deepEqual(repairById(summary, 'missing_sources'), {
        id: 'missing_sources',
        label: 'Add source support to generated graph',
        severity: 'high',
        count: 3,
        suggested_action: 'Add source support',
        target_view: 'sources',
        target_node_ids: ['root', 'idea-1', 'idea-2']
    });
});

test('graph confidence calls out source-backed but sparse graphs', () => {
    const projection = buildGraphProjection(
        [
            supportedNode('claim-1'),
            supportedNode('claim-2'),
            supportedNode('claim-3'),
            supportedNode('claim-4')
        ],
        []
    );

    const summary = getGraphConfidenceSummary(projection);

    assert.equal(summary.score, 59);
    assert.equal(summary.sourced_nodes, 4);
    assert(summary.reasons.includes('Sparse graph structure'));
    assert.deepEqual(summary.supplement_actions, ['Find connections for sparse graph']);
    assert.deepEqual(repairById(summary, 'sparse_branch'), {
        id: 'sparse_branch',
        label: 'Connect sparse graph branches',
        severity: 'medium',
        count: 4,
        suggested_action: 'Find connections for sparse graph',
        action_preset: 'connections'
    });
    assert.equal(repairById(summary, 'source_only_sections').count, 4);
    assert.equal(repairById(summary, 'source_only_sections').target_view, 'sources');
});

test('graph confidence recommends supplementation when hierarchy has no cross-links', () => {
    const projection = buildGraphProjection(
        [
            supportedNode('root', 'category', { confidence: 0.8 }),
            supportedNode('child-1', 'definition', { confidence: 0.8 }),
            supportedNode('child-2', 'definition', { confidence: 0.8 }),
            supportedNode('child-3', 'definition', { confidence: 0.8 })
        ],
        [
            { id: 'edge-1', source: 'root', target: 'child-1', relationship_type: 'contains' },
            { id: 'edge-2', source: 'root', target: 'child-2', relationship_type: 'contains' },
            { id: 'edge-3', source: 'root', target: 'child-3', relationship_type: 'contains' }
        ]
    );

    const summary = getGraphConfidenceSummary(projection);

    assert.equal(summary.score, 78);
    assert.equal(summary.label, 'Developing');
    assert.equal(summary.cross_link_edges, 0);
    assert(summary.supplement_actions.includes('Find cross-branch connections'));
    assert(summary.reasons.some((reason) => reason.includes('No accepted cross-branch connections')));
    assert.deepEqual(repairById(summary, 'weak_connections'), {
        id: 'weak_connections',
        label: 'Add cross-branch relationships',
        severity: 'medium',
        count: 4,
        suggested_action: 'Find cross-branch connections',
        action_preset: 'connections'
    });
});

test('graph confidence treats many review nodes as a trust blocker', () => {
    const projection = buildGraphProjection(
        [
            supportedNode('root', 'category', { status: 'needs_review' }),
            supportedNode('task-1', 'task', { status: 'needs_review' }),
            supportedNode('task-2', 'task', { status: 'needs_review' }),
            supportedNode('risk-1', 'risk', { status: 'needs_review' }),
            supportedNode('decision-1', 'decision', { status: 'needs_review' })
        ],
        [
            { id: 'edge-1', source: 'root', target: 'task-1', relationship_type: 'contains' },
            { id: 'edge-2', source: 'root', target: 'task-2', relationship_type: 'contains' },
            { id: 'edge-3', source: 'risk-1', target: 'task-1', relationship_type: 'blocks' },
            { id: 'edge-4', source: 'decision-1', target: 'task-2', relationship_type: 'informs' }
        ]
    );

    const summary = getGraphConfidenceSummary(projection);

    assert.equal(summary.score, 74);
    assert.equal(summary.label, 'Developing');
    assert.equal(summary.nodes_needing_review, 5);
    assert(summary.reasons.includes('5 nodes need review before handoff'));
    assert(summary.supplement_actions.includes('Resolve review flags'));
    assert.deepEqual(repairById(summary, 'review_flags'), {
        id: 'review_flags',
        label: 'Resolve review-heavy graph before handoff',
        severity: 'high',
        count: 5,
        suggested_action: 'Resolve review flags',
        target_view: 'gaps',
        target_node_ids: ['root', 'task-1', 'task-2', 'risk-1', 'decision-1']
    });
});

test('graph confidence reports healthy graphs without supplement actions', () => {
    const projection = buildGraphProjection(
        [
            supportedNode('root', 'category', { confidence: 0.92 }),
            supportedNode('requirement-1', 'requirement', { confidence: 0.92 }),
            supportedNode('workflow-1', 'workflow', { confidence: 0.92 }),
            supportedNode('decision-1', 'decision', { confidence: 0.92 })
        ],
        [
            { id: 'edge-1', source: 'root', target: 'requirement-1', relationship_type: 'contains' },
            { id: 'edge-2', source: 'root', target: 'workflow-1', relationship_type: 'contains' },
            { id: 'edge-3', source: 'root', target: 'decision-1', relationship_type: 'contains' },
            { id: 'edge-4', source: 'decision-1', target: 'workflow-1', relationship_type: 'informs' }
        ]
    );

    const summary = getGraphConfidenceSummary(projection);

    assert.equal(summary.score, 99);
    assert.equal(summary.label, 'Strong');
    assert.deepEqual(summary.reasons, []);
    assert.deepEqual(summary.supplement_actions, []);
    assert.deepEqual(summary.repair_items, []);
});

test('source repair rows distinguish source refs from confidence repair', () => {
    const projection = buildGraphProjection(
        [
            supportedNode('claim-1', 'requirement', {
                title: 'Missing citation',
                confidence: 0.84,
                source_refs: []
            }),
            supportedNode('claim-2', 'requirement', {
                title: 'Missing confidence',
                confidence: '',
                source_refs: [
                    {
                        document_id: 'doc-1',
                        page: 2,
                        section: 'Controls',
                        quote_snippet: 'Controls are required.'
                    }
                ]
            }),
            supportedNode('claim-3', 'risk', {
                title: 'Low confidence',
                confidence: 0.42,
                source_refs: [
                    {
                        document_id: 'doc-1',
                        page: 3,
                        section: 'Risks',
                        quote_snippet: 'Risks need review.',
                        confidence: 0.42
                    }
                ]
            })
        ],
        [{ id: 'edge-1', source: 'claim-2', target: 'claim-1', relationship_type: 'contains' }]
    );

    const rows = getSourceRepairPreviewRows(projection);
    const sourceRow = rows.find((row) => row.id === 'claim-1');
    const missingConfidenceRow = rows.find((row) => row.id === 'claim-2');
    const lowConfidenceRow = rows.find((row) => row.id === 'claim-3');

    assert.equal(sourceRow.repair_kind, 'source_ref');
    assert.equal(sourceRow.repair_type, 'suggest_source_ref');
    assert.equal(missingConfidenceRow.repair_kind, 'confidence');
    assert.equal(missingConfidenceRow.repair_type, 'suggest_confidence');
    assert.equal(missingConfidenceRow.suggested_confidence, 'medium');
    assert.equal(lowConfidenceRow.repair_kind, 'confidence');
    assert(lowConfidenceRow.issues.includes('Low confidence'));
});

test('executive output projection groups sourced findings, actions, risks, decisions, and appendix', () => {
    const projection = buildGraphProjection(
        [
            supportedNode('root', 'category', { title: 'Launch plan' }),
            supportedNode('task-1', 'task', {
                title: 'Confirm launch owner',
                priority: 'high',
                owner_id: 'ops',
                due_date: '2026-06-01'
            }),
            supportedNode('risk-1', 'risk', {
                title: 'Schedule risk',
                status: 'needs_review',
                confidence: 0.45
            }),
            supportedNode('decision-1', 'decision', {
                title: 'Approve rollout window'
            })
        ],
        [
            { id: 'edge-1', source: 'root', target: 'task-1', relationship_type: 'contains' },
            { id: 'edge-2', source: 'root', target: 'risk-1', relationship_type: 'contains' },
            { id: 'edge-3', source: 'root', target: 'decision-1', relationship_type: 'contains' }
        ]
    );

    const output = getExecutiveOutputProjection(projection, { title: 'Launch Executive Output' });

    assert.equal(output.contract_version, '1');
    assert.equal(output.metadata.node_count, 4);
    assert.equal(output.metadata.source_backed_node_count, 4);
    assert.equal(output.recommended_actions[0].title, 'Confirm launch owner');
    assert.equal(output.recommended_actions[0].source_backed, true);
    assert.deepEqual(output.risks.map((item) => item.title), ['Schedule risk']);
    assert.deepEqual(output.required_decisions.map((item) => item.title), ['Approve rollout window']);
    assert.equal(output.source_backed_appendix.length, 4);
});

test('team roadmap projection groups workstreams, dependencies, milestones, actions, and sources', () => {
    const sourceRef = {
        document_id: 'doc-roadmap',
        page: 4,
        section: 'Execution',
        quote_snippet: 'Security review must happen before pilot.',
        confidence: 0.91
    };
    const projection = buildGraphProjection(
        [
            supportedNode('workstream-1', 'workstream', {
                title: 'Implementation workstream',
                source_refs: [sourceRef]
            }),
            supportedNode('task-1', 'workflow', {
                title: 'Security review task',
                priority: 'high',
                owner_id: 'security',
                due_date: '2026-06-01',
                source_refs: [sourceRef]
            }),
            supportedNode('risk-1', 'risk', {
                title: 'Late security review',
                status: 'needs_review',
                source_refs: [sourceRef]
            }),
            supportedNode('decision-1', 'decision', {
                title: 'Approve rollout window',
                source_refs: [sourceRef]
            }),
            supportedNode('milestone-1', 'milestone', {
                title: 'Pilot complete',
                due_date: '2026-06-15',
                source_refs: [sourceRef]
            })
        ],
        [
            {
                id: 'edge-workstream-task',
                source: 'workstream-1',
                target: 'task-1',
                relationship_type: 'depends_on'
            },
            {
                id: 'edge-risk-task',
                source: 'risk-1',
                target: 'task-1',
                relationship_type: 'blocks'
            },
            { id: 'edge-workstream-decision', source: 'workstream-1', target: 'decision-1' },
            { id: 'edge-task-milestone', source: 'task-1', target: 'milestone-1' }
        ]
    );

    const roadmap = getTeamRoadmapProjection(projection, { title: 'Rollout Team Roadmap' });

    assert.equal(roadmap.contract_version, '1');
    assert.equal(roadmap.metadata.workstream_count, 2);
    assert.equal(roadmap.metadata.dependency_count, 2);
    assert.equal(roadmap.metadata.risk_count, 1);
    assert.equal(roadmap.metadata.required_decision_count, 1);
    assert.equal(roadmap.metadata.milestone_count, 2);
    assert.deepEqual(roadmap.workstreams.map((item) => item.title), [
        'Implementation workstream',
        'Security review task'
    ]);
    assert.equal(roadmap.dependencies[0].relationship_type, 'depends_on');
    assert.equal(roadmap.dependencies[0].source_backed, true);
    assert.deepEqual(roadmap.milestones.map((item) => item.title), [
        'Security review task',
        'Pilot complete'
    ]);
    assert.equal(roadmap.recommended_next_actions[0].title, 'Security review task');
    assert.equal(roadmap.source_backed_appendix.length, 5);
    assert.equal(roadmap.source_backed_appendix[0].metadata.artifact_type, 'team_roadmap');
});

test('completeness review projection separates covered, partial, missing, duplicate, and stale candidates', () => {
    const sourceLibrary = {
        documents: [
            {
                document_id: 'doc-standards',
                filename: 'BIM Standards.md',
                chunks: [
                    {
                        id: 'chunk-qaqc',
                        page: 3,
                        heading: 'QA/QC',
                        snippet: 'QA/QC review process requires model checks before issue.'
                    },
                    {
                        id: 'chunk-legacy',
                        page: 6,
                        heading: 'Legacy templates',
                        snippet: 'The old template standard is deprecated and superseded.'
                    }
                ]
            }
        ]
    };
    const nodes = [
        supportedNode('naming-1', 'requirement', {
            title: 'Naming conventions',
            source_refs: [
                {
                    document_id: 'doc-standards',
                    page: 2,
                    section: 'Naming conventions',
                    quote_snippet: 'Naming conventions must use discipline prefix codes.',
                    confidence: 0.92
                }
            ]
        }),
        supportedNode('naming-2', 'requirement', {
            title: 'Naming conventions',
            source_refs: []
        })
    ];

    const review = buildCompletenessReviewProjection({
        nodes,
        edges: [{ id: 'edge-1', source: 'naming-1', target: 'naming-2' }],
        sourceLibrary,
        expectedCoverage: [
            'Naming conventions',
            'QA/QC review process',
            'Training and support'
        ],
        title: 'BIM Completeness Review'
    });

    assert.deepEqual(review.covered_areas.map((item) => item.title), ['Naming conventions']);
    assert.deepEqual(review.partial_areas.map((item) => item.title), ['QA/QC review process']);
    assert.deepEqual(review.missing_areas.map((item) => item.title), ['Training and support']);
    assert.equal(review.duplicate_conflicting_areas[0].candidate_type, 'duplicate_node');
    assert(review.stale_deprecated_candidates.some((item) => item.candidate_type === 'stale_source'));
    assert(review.sme_questions.some((item) => item.reason === 'missing_area'));
    assert(review.recommended_roadmap.length > 0);
    assert.equal(review.metadata.expected_area_count, 3);
});

test('enterprise scoring weighs impact, effort, risk, sources, and ownership', () => {
    const projection = buildGraphProjection(
        [
            supportedNode('task-1', 'task', {
                title: 'Deploy controls',
                priority: 'high',
                owner_id: 'ops-lead',
                due_date: '2026-06-01',
                business_impact: 'critical',
                implementation_effort: 'medium',
                risk_severity: 'high',
                source_refs: [
                    {
                        document_id: 'doc-1',
                        page: 4,
                        section: 'Controls',
                        quote_snippet: 'Controls must be deployed before launch.',
                        confidence: 0.9
                    }
                ]
            }),
            supportedNode('risk-1', 'risk', {
                title: 'Unowned migration risk',
                status: 'needs_review',
                source_refs: [],
                implementation_effort: 'high'
            })
        ],
        [{ id: 'edge-1', source: 'risk-1', target: 'task-1', relationship_type: 'blocks' }]
    );

    const rows = getEnterpriseScoreRows(projection);
    const taskRow = rows.find((row) => row.id === 'task-1');
    const riskRow = rows.find((row) => row.id === 'risk-1');
    const summary = getEnterpriseReadinessSummary(projection);

    assert.equal(taskRow.enterprise_scores.business_impact, 100);
    assert.equal(taskRow.enterprise_scores.implementation_effort, 70);
    assert.equal(taskRow.enterprise_scores.risk_severity, 85);
    assert.equal(taskRow.enterprise_scores.source_coverage, 99);
    assert.equal(taskRow.enterprise_scores.owner_clarity, 100);
    assert.equal(taskRow.enterprise_readiness, 'watchlist');
    assert(riskRow.enterprise_reasons.includes('Weak source coverage'));
    assert(riskRow.enterprise_reasons.includes('Owner or due date missing'));
    assert.equal(summary.node_count, 2);
    assert.equal(summary.not_ready_count, 1);
    assert(summary.blockers.some((blocker) => blocker.id === 'risk-1'));
});
