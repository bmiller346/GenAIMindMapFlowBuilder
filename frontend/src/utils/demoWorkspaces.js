import { DEFAULT_MAP_STYLE } from './mapStyles.js';

const nowIso = () => new Date().toISOString();

const node = ({
    id,
    title,
    summary,
    nodeType = 'concept',
    x,
    y,
    status = 'needs_review',
    priority = '',
    owner = '',
    assumption = true,
    sourceRefs = [],
    extraData = {}
}) => ({
    id,
    type: 'response',
    position: { x, y },
    data: {
        title,
        node_type: nodeType,
        status,
        priority,
        owner_id: owner,
        assumption,
        source_refs: sourceRefs,
        metadata: {
            demo_workspace: true,
            initial_seed_visual: nodeType === 'workspace_goal' ? 'tour-root' : 'tour-step'
        },
        data: {
            summ: summary,
            query: '',
            df: [],
            graph: {},
            source_refs: sourceRefs,
            metadata: {
                demo_workspace: true,
                initial_seed_visual: nodeType === 'workspace_goal' ? 'tour-root' : 'tour-step'
            },
            ...extraData
        }
    },
    deletable: true
});

const edge = ({
    id,
    source,
    target,
    relationshipType = 'contains',
    label = '',
    confidence,
    rationale = '',
    animated = true
}) => ({
    id,
    source,
    target,
    type: relationshipType === 'contains' ? 'smoothstep' : 'semantic',
    animated,
    data: {
        relationship_type: relationshipType,
        label,
        confidence,
        rationale
    }
});

const activity = (type, title, summary) => ({
    id: `demo-${type}`,
    type,
    title,
    summary,
    status: 'completed',
    time: nowIso(),
    metadata: {
        demo_workspace: true
    }
});

const baseSnapshot = ({ nodes, edges, workspaceBrief, sourceLibrary = [], activityEvents = [] }) => ({
    nodes,
    edges,
    viewport: { x: 70, y: 110, zoom: 0.65 },
    map_style: { ...DEFAULT_MAP_STYLE, hierarchy: 'depth' },
    workspace_brief: workspaceBrief,
    source_library: sourceLibrary,
    activity_events: [
        activity(
            'demo_workspace_created',
            'Created example workspace',
            'This disposable demo is safe to edit or delete.'
        ),
        ...activityEvents
    ],
    ai_action_runs: [],
    automations: []
});

const sourceRef = (documentId, title, section) => ({
    document_id: documentId,
    source_type: 'demo',
    title,
    section,
    confidence: 0.86
});

const traceSpaceTour = () => {
    const nodes = [
        node({
            id: 'demo-tour-root',
            title: 'TraceSpace Turns Context Into Workspaces',
            summary:
                'Start with a brief, add sources, then shape the result into maps, knowledge graph relationships, tasks, reviews, and handoff outputs.',
            nodeType: 'workspace_goal',
            x: 80,
            y: 80,
            priority: 'high'
        }),
        node({
            id: 'demo-tour-brief',
            title: 'Brief Sets The Contract',
            summary:
                'Goal, audience, output style, review policy, and allowed assumptions tell TraceSpace what kind of workspace to build.',
            nodeType: 'brief',
            x: 520,
            y: -90
        }),
        node({
            id: 'demo-tour-sources',
            title: 'Sources Ground The Work',
            summary:
                'Documents, tables, links, and media can become source-backed nodes with citations and coverage signals.',
            nodeType: 'source_strategy',
            x: 520,
            y: 80,
            status: 'ai_generated',
            assumption: false
        }),
        node({
            id: 'demo-tour-review',
            title: 'Review State Stays Visible',
            summary:
                'Uncited or low-confidence material is marked for review instead of being treated as finished evidence.',
            nodeType: 'review_policy',
            x: 520,
            y: 250
        }),
        node({
            id: 'demo-tour-views',
            title: 'One Workspace, Multiple Views',
            summary:
                'The same structure can be inspected as a map, relationship graph, flowchart, outline, table, task list, or checklist.',
            nodeType: 'output_plan',
            x: 960,
            y: 80
        }),
        node({
            id: 'demo-tour-delete',
            title: 'Kick The Tires, Then Delete It',
            summary:
                'This is just a normal workspace. Rename it, edit nodes, export it, or delete it from the drawer when you are done.',
            nodeType: 'guide',
            x: 960,
            y: 250,
            priority: 'low'
        })
    ];

    return baseSnapshot({
        nodes,
        edges: [
            edge({ id: 'demo-tour-e1', source: 'demo-tour-root', target: 'demo-tour-brief' }),
            edge({ id: 'demo-tour-e2', source: 'demo-tour-root', target: 'demo-tour-sources' }),
            edge({ id: 'demo-tour-e3', source: 'demo-tour-root', target: 'demo-tour-review' }),
            edge({ id: 'demo-tour-e4', source: 'demo-tour-root', target: 'demo-tour-views' }),
            edge({
                id: 'demo-tour-e5',
                source: 'demo-tour-review',
                target: 'demo-tour-delete',
                relationshipType: 'supports',
                label: 'keeps demos safe',
                confidence: 0.9,
                rationale: 'Making review and delete behavior explicit lowers onboarding risk.'
            })
        ],
        workspaceBrief: {
            configured: true,
            preset: 'custom',
            goal: 'Explain what TraceSpace helps people do without turning the landing page into the product manual.',
            audience: 'New evaluators, BIM managers, project leads, and internal reviewers',
            domain_context:
                'This demo is a disposable product-tour workspace. It should make the brief, source grounding, review state, and output views concrete.',
            desired_outputs: ['mind_map', 'knowledge_graph', 'outline', 'tasks'],
            source_mode: 'context_only',
            assumptions_allowed: true,
            output_style: 'training_onboarding_map',
            node_types: ['workspace_goal', 'brief', 'source_strategy', 'review_policy', 'output_plan', 'guide'],
            review_policy: ['mark_uncited_needs_review', 'generate_sme_questions'],
            expected_artifacts: [],
            review_rules: 'Keep claims reviewable because this is a demo, not a source-backed product spec.'
        }
    });
};

const sourceReviewDemo = () => {
    const standardsRef = sourceRef('demo-source-standards', 'BIM Standards Excerpt', 'Model setup');
    const handoffRef = sourceRef('demo-source-handoff', 'Project Handoff Notes', 'Closeout requirements');
    const nodes = [
        node({
            id: 'demo-source-root',
            title: 'Review A Source Set Before Handoff',
            summary:
                'Use TraceSpace to inventory source coverage, identify missing information, and create SME questions before work leaves the team.',
            nodeType: 'source_set_review',
            x: 80,
            y: 80,
            status: 'ai_generated',
            assumption: false,
            sourceRefs: [standardsRef, handoffRef],
            priority: 'high'
        }),
        node({
            id: 'demo-source-covered',
            title: 'Covered: Model Setup Standards',
            summary:
                'The source set includes naming, template, coordinate, and shared-parameter expectations for model setup.',
            nodeType: 'standard',
            x: 540,
            y: -90,
            status: 'ai_generated',
            assumption: false,
            sourceRefs: [standardsRef]
        }),
        node({
            id: 'demo-source-gap',
            title: 'Gap: Approval Owner Missing',
            summary:
                'The handoff notes mention approval, but do not name the accountable reviewer or required signoff record.',
            nodeType: 'missing_info',
            x: 540,
            y: 90,
            status: 'needs_review',
            priority: 'high',
            sourceRefs: [handoffRef]
        }),
        node({
            id: 'demo-source-question',
            title: 'SME Question: Who Signs Off?',
            summary:
                'Ask the BIM manager which role approves the final package and where that approval should be recorded.',
            nodeType: 'question',
            x: 980,
            y: 90,
            status: 'needs_review',
            priority: 'high',
            sourceRefs: [handoffRef]
        }),
        node({
            id: 'demo-source-task',
            title: 'Task: Add Approval Record',
            summary:
                'Update the handoff checklist after the owner confirms the approval path.',
            nodeType: 'task',
            x: 980,
            y: 260,
            status: 'needs_review',
            priority: 'medium'
        })
    ];

    return baseSnapshot({
        nodes,
        edges: [
            edge({ id: 'demo-source-e1', source: 'demo-source-root', target: 'demo-source-covered' }),
            edge({ id: 'demo-source-e2', source: 'demo-source-root', target: 'demo-source-gap' }),
            edge({ id: 'demo-source-e3', source: 'demo-source-gap', target: 'demo-source-question' }),
            edge({
                id: 'demo-source-e4',
                source: 'demo-source-question',
                target: 'demo-source-task',
                relationshipType: 'depends_on',
                label: 'answer unlocks task',
                confidence: 0.82,
                rationale: 'The task should wait until the responsible owner is confirmed.'
            })
        ],
        sourceLibrary: [
            {
                id: 'demo-source-standards',
                title: 'BIM Standards Excerpt',
                type: 'demo',
                status: 'example',
                coverage_count: 2
            },
            {
                id: 'demo-source-handoff',
                title: 'Project Handoff Notes',
                type: 'demo',
                status: 'example',
                coverage_count: 3
            }
        ],
        workspaceBrief: {
            configured: true,
            preset: 'source_set_review',
            goal: 'Review a small source set for coverage, gaps, SME questions, and next actions before handoff.',
            audience: 'BIM managers, project leads, reviewers, and SMEs',
            domain_context:
                'Demo source set with standards and handoff notes. The goal is to show source-backed nodes alongside reviewable gaps.',
            desired_outputs: ['source_set_review', 'missing_info_report', 'sme_questions', 'tasks'],
            source_mode: 'source_plus_context',
            assumptions_allowed: false,
            output_style: 'review_approval_map',
            node_types: ['source_set_review', 'standard', 'missing_info', 'question', 'task'],
            review_policy: ['mark_uncited_needs_review', 'generate_sme_questions'],
            expected_artifacts: ['approval owner', 'handoff checklist', 'source coverage'],
            review_rules: 'Treat gaps as Needs Review and keep source-backed claims tied to source references.'
        }
    });
};

const outputViewsDemo = () => {
    const nodes = [
        node({
            id: 'demo-views-root',
            title: 'Launch Readiness Output Views',
            summary:
                'A single workspace can support different review modes: map for structure, graph for relationships, flowchart for sequence, table for comparison, and tasks for action.',
            nodeType: 'workspace_goal',
            x: 80,
            y: 80,
            priority: 'high'
        }),
        node({
            id: 'demo-views-flow',
            title: 'Flowchart: Intake To Closeout',
            summary:
                'Confirm brief, load sources, review draft, resolve questions, then export the handoff package.',
            nodeType: 'workflow',
            x: 520,
            y: -100
        }),
        node({
            id: 'demo-views-kg',
            title: 'Knowledge Graph: Dependencies',
            summary:
                'Relationships show which decisions support, block, duplicate, or depend on other work items.',
            nodeType: 'knowledge_graph',
            x: 520,
            y: 80
        }),
        node({
            id: 'demo-views-table',
            title: 'Table: Readiness Signals',
            summary:
                'Compare outputs, owners, review state, and confidence in a denser operational view.',
            nodeType: 'table',
            x: 520,
            y: 260,
            extraData: {
                df: [
                    { output: 'Brief', owner: 'Product', state: 'Ready' },
                    { output: 'Source coverage', owner: 'Reviewer', state: 'Needs review' },
                    { output: 'Tasks', owner: 'Ops', state: 'Drafted' }
                ]
            }
        }),
        node({
            id: 'demo-views-task',
            title: 'Task: Confirm Launch Reviewer',
            summary:
                'Assign the reviewer who decides whether the workspace is ready to export or needs another source pass.',
            nodeType: 'task',
            x: 980,
            y: 80,
            priority: 'high'
        }),
        node({
            id: 'demo-views-check',
            title: 'Checklist: Export Package',
            summary:
                'Include map, source coverage, missing info, SME questions, and tasks before sharing outside the team.',
            nodeType: 'checklist',
            x: 980,
            y: 260,
            priority: 'medium'
        })
    ];

    return baseSnapshot({
        nodes,
        edges: [
            edge({ id: 'demo-views-e1', source: 'demo-views-root', target: 'demo-views-flow' }),
            edge({ id: 'demo-views-e2', source: 'demo-views-root', target: 'demo-views-kg' }),
            edge({ id: 'demo-views-e3', source: 'demo-views-root', target: 'demo-views-table' }),
            edge({ id: 'demo-views-e4', source: 'demo-views-kg', target: 'demo-views-task' }),
            edge({ id: 'demo-views-e5', source: 'demo-views-table', target: 'demo-views-check' }),
            edge({
                id: 'demo-views-e6',
                source: 'demo-views-task',
                target: 'demo-views-check',
                relationshipType: 'blocks',
                label: 'review owner needed',
                confidence: 0.78,
                rationale: 'The export package should not be considered ready until a reviewer owns the closeout decision.'
            })
        ],
        workspaceBrief: {
            configured: true,
            preset: 'custom',
            goal: 'Show how one TraceSpace workspace can be inspected through map, graph, flowchart, table, checklist, and task views.',
            audience: 'Evaluators who want to understand why TraceSpace has multiple output views',
            domain_context:
                'This demo focuses on view switching rather than source extraction. It uses reviewable assumptions to show each lens.',
            desired_outputs: ['mind_map', 'knowledge_graph', 'flow_chart', 'table', 'checklist', 'tasks'],
            source_mode: 'context_only',
            assumptions_allowed: true,
            output_style: 'project_execution_map',
            node_types: ['workspace_goal', 'workflow', 'knowledge_graph', 'table', 'task', 'checklist'],
            review_policy: ['mark_uncited_needs_review', 'mark_low_confidence_needs_review'],
            expected_artifacts: ['view comparison', 'task owner', 'export checklist'],
            review_rules: 'Use this workspace to compare lenses, not to validate source-backed content.'
        }
    });
};

const aecSowDeliverablesDemo = () => {
    const sowRef = sourceRef('demo-aec-sow', 'Clinic Renovation SOW Excerpt', 'Scope and deliverables');
    const bimRef = sourceRef('demo-aec-bim', 'BIM Execution Notes', 'Coordination requirements');
    const scheduleRef = sourceRef('demo-aec-schedule', 'Milestone Tracker', 'Design and permit dates');
    const nodes = [
        node({
            id: 'demo-aec-root',
            title: 'AEC SOW Delivery Plan',
            summary:
                'Turn a messy AEC scope into disciplines, deliverables, phase dependencies, risks, missing owner decisions, and handoff-ready work.',
            nodeType: 'workspace_goal',
            x: 80,
            y: 80,
            priority: 'high',
            status: 'ai_generated',
            assumption: false,
            sourceRefs: [sowRef, bimRef, scheduleRef]
        }),
        node({
            id: 'demo-aec-arch',
            title: 'Architecture: Permit Drawing Package',
            summary:
                'Architecture owns the permit drawing package and must confirm room finish scope before construction document closeout.',
            nodeType: 'deliverable',
            x: 540,
            y: -180,
            status: 'ai_generated',
            assumption: false,
            sourceRefs: [sowRef, scheduleRef]
        }),
        node({
            id: 'demo-aec-mep',
            title: 'MEP: Existing Conditions And Load Impacts',
            summary:
                'MEP review depends on existing ceiling conditions and equipment loads before finalizing design impacts.',
            nodeType: 'discipline_scope',
            x: 540,
            y: 0,
            status: 'ai_generated',
            assumption: false,
            sourceRefs: [sowRef]
        }),
        node({
            id: 'demo-aec-bim',
            title: 'BIM/VDC: Coordination Model',
            summary:
                'The BIM/VDC lead must maintain a coordination model and track clashes across architecture, MEP, and contractor inputs.',
            nodeType: 'coordination',
            x: 540,
            y: 180,
            status: 'ai_generated',
            assumption: false,
            sourceRefs: [bimRef]
        }),
        node({
            id: 'demo-aec-owner-decision',
            title: 'Missing Owner Decision: Phasing Constraints',
            summary:
                'The SOW references active clinic operations, but does not define acceptable downtime windows or phasing constraints.',
            nodeType: 'missing_info',
            x: 980,
            y: -80,
            priority: 'high',
            sourceRefs: [sowRef, scheduleRef]
        }),
        node({
            id: 'demo-aec-risk',
            title: 'Risk: Permit Date Depends On Unconfirmed Scope',
            summary:
                'Permit submission could slip if finish scope, equipment loads, or phasing constraints remain unresolved.',
            nodeType: 'risk',
            x: 980,
            y: 100,
            priority: 'high',
            sourceRefs: [sowRef, scheduleRef]
        }),
        node({
            id: 'demo-aec-sme-question',
            title: 'SME Question: Who Approves Final Scope?',
            summary:
                'Ask the owner representative which role approves the final scope matrix and how approval should be recorded.',
            nodeType: 'question',
            x: 1380,
            y: -80,
            priority: 'high',
            sourceRefs: [sowRef]
        }),
        node({
            id: 'demo-aec-monday',
            title: 'monday.com Handoff: Delivery Board',
            summary:
                'Create grouped work items for architecture, MEP, BIM/VDC, owner decisions, risks, and blocked milestones.',
            nodeType: 'handoff',
            x: 1380,
            y: 120,
            priority: 'medium'
        }),
        node({
            id: 'demo-aec-miro',
            title: 'Miro Handoff: Dependency Map',
            summary:
                'Export a dependency map that shows discipline handoffs, decision gates, and unresolved assumptions for kickoff review.',
            nodeType: 'visual_export',
            x: 1380,
            y: 300,
            priority: 'medium'
        })
    ];

    return baseSnapshot({
        nodes,
        edges: [
            edge({ id: 'demo-aec-e1', source: 'demo-aec-root', target: 'demo-aec-arch' }),
            edge({ id: 'demo-aec-e2', source: 'demo-aec-root', target: 'demo-aec-mep' }),
            edge({ id: 'demo-aec-e3', source: 'demo-aec-root', target: 'demo-aec-bim' }),
            edge({
                id: 'demo-aec-e4',
                source: 'demo-aec-arch',
                target: 'demo-aec-owner-decision',
                relationshipType: 'blocked_by',
                label: 'scope approval needed',
                confidence: 0.84,
                rationale: 'The permit package cannot be treated as complete until the owner confirms scope and phasing constraints.'
            }),
            edge({
                id: 'demo-aec-e5',
                source: 'demo-aec-mep',
                target: 'demo-aec-bim',
                relationshipType: 'depends_on',
                label: 'loads inform coordination',
                confidence: 0.8,
                rationale: 'MEP impacts should be reflected in the coordination model before closeout.'
            }),
            edge({
                id: 'demo-aec-e6',
                source: 'demo-aec-owner-decision',
                target: 'demo-aec-risk',
                relationshipType: 'causes',
                label: 'unresolved decision creates risk',
                confidence: 0.86
            }),
            edge({
                id: 'demo-aec-e7',
                source: 'demo-aec-owner-decision',
                target: 'demo-aec-sme-question',
                relationshipType: 'requires',
                label: 'needs owner answer',
                confidence: 0.88
            }),
            edge({
                id: 'demo-aec-e8',
                source: 'demo-aec-risk',
                target: 'demo-aec-monday',
                relationshipType: 'routes_to',
                label: 'track blocked work',
                confidence: 0.78
            }),
            edge({
                id: 'demo-aec-e9',
                source: 'demo-aec-bim',
                target: 'demo-aec-miro',
                relationshipType: 'supports',
                label: 'visual dependency review',
                confidence: 0.81
            }),
            edge({
                id: 'demo-aec-e10',
                source: 'demo-aec-sme-question',
                target: 'demo-aec-monday',
                relationshipType: 'feeds',
                label: 'owner decision task',
                confidence: 0.83
            })
        ],
        sourceLibrary: [
            {
                id: 'demo-aec-sow',
                title: 'Clinic Renovation SOW Excerpt',
                type: 'demo',
                status: 'example',
                coverage_count: 5
            },
            {
                id: 'demo-aec-bim',
                title: 'BIM Execution Notes',
                type: 'demo',
                status: 'example',
                coverage_count: 3
            },
            {
                id: 'demo-aec-schedule',
                title: 'Milestone Tracker',
                type: 'demo',
                status: 'example',
                coverage_count: 3
            }
        ],
        workspaceBrief: {
            configured: true,
            preset: 'custom',
            goal: 'Show how the AEC SOW Deliverables Planner turns scope material into a delivery graph with disciplines, dependencies, risks, missing owner decisions, and handoff-ready outputs.',
            audience: 'AEC project managers, BIM/VDC leads, owner representatives, and delivery teams',
            domain_context:
                'Demo clinic renovation SOW with architecture, MEP, BIM/VDC, owner decision, schedule, and handoff concerns. The workspace should show what depends on what across the project timeline.',
            desired_outputs: ['knowledge_graph', 'flow_chart', 'tasks', 'source_set_review'],
            source_mode: 'source_plus_context',
            assumptions_allowed: false,
            output_style: 'aec_delivery_dependency_map',
            node_types: ['workspace_goal', 'deliverable', 'discipline_scope', 'coordination', 'missing_info', 'risk', 'question', 'handoff', 'visual_export'],
            review_policy: ['mark_uncited_needs_review', 'generate_sme_questions', 'explain_dependency_risk'],
            expected_artifacts: ['SOW deliverable map', 'discipline dependency graph', 'owner decision list', 'monday.com handoff tasks', 'Miro dependency overview'],
            review_rules: 'Separate source-backed scope from assumptions. Keep missing owner decisions and handoff blockers marked Needs Review.'
        },
        activityEvents: [
            activity(
                'demo_aec_sow_seeded',
                'Seeded AEC SOW delivery demo',
                'Includes disciplines, dependencies, risks, missing owner decisions, and Miro/monday handoff targets.'
            )
        ]
    });
};

const askAiKnowledgeGraphDemo = () => {
    const userQuestionRef = sourceRef('demo-kg-prompt', 'Ask AI Knowledge Graph Prompt', 'Robustness scenario');
    const internalNotesRef = sourceRef('demo-kg-internal', 'Research Assistant Notes', 'Retrieval behavior');
    const externalDocsRef = sourceRef('demo-kg-external', 'Vendor Documentation Excerpt', 'Source policy');
    const nodes = [
        node({
            id: 'demo-kg-root',
            title: 'Ask AI Knowledge Graph Robustness Test',
            summary:
                'A seeded scenario for testing whether Ask AI can create labeled nodes and relationships with conflicts, confidence, limitations, and feedback loops.',
            nodeType: 'workspace_goal',
            x: 80,
            y: 80,
            priority: 'high',
            status: 'ai_generated',
            assumption: false,
            sourceRefs: [userQuestionRef]
        }),
        node({
            id: 'demo-kg-question',
            title: 'Question: How Does The Assistant Answer?',
            summary:
                'The user asks how a research assistant turns vague, specific, or multi-part questions into cited answers.',
            nodeType: 'question',
            x: 500,
            y: -170,
            status: 'ai_generated',
            assumption: false,
            sourceRefs: [userQuestionRef]
        }),
        node({
            id: 'demo-kg-entities',
            title: 'Entities: Intent, Sources, Evidence',
            summary:
                'The same question mentions multiple entities that should connect into search, ranking, answer, and citation behavior.',
            nodeType: 'entity',
            x: 500,
            y: 0,
            status: 'ai_generated',
            assumption: false,
            sourceRefs: [userQuestionRef]
        }),
        node({
            id: 'demo-kg-internal-source',
            title: 'Internal Knowledge Base',
            summary:
                'Internal notes provide trusted retrieval context and should connect to both evidence and search result nodes.',
            nodeType: 'source',
            x: 500,
            y: 180,
            status: 'ai_generated',
            assumption: false,
            sourceRefs: [internalNotesRef]
        }),
        node({
            id: 'demo-kg-external-source',
            title: 'External Source',
            summary:
                'External docs can add coverage but may conflict with internal notes and should be evaluated before synthesis.',
            nodeType: 'source',
            x: 500,
            y: 360,
            status: 'ai_generated',
            assumption: false,
            sourceRefs: [externalDocsRef]
        }),
        node({
            id: 'demo-kg-conflict',
            title: 'Conflict: Source Priority Disagrees',
            summary:
                'Internal notes say internal content wins by default, while external docs say newer public docs should override stale internal notes.',
            nodeType: 'conflict',
            x: 940,
            y: 250,
            priority: 'high',
            sourceRefs: [internalNotesRef, externalDocsRef]
        }),
        node({
            id: 'demo-kg-answer',
            title: 'Answer With Citations And Limitations',
            summary:
                'The final answer should cite supporting evidence, explain uncertainty when sources conflict, and avoid treating unsupported claims as facts.',
            nodeType: 'answer',
            x: 940,
            y: -60,
            status: 'needs_review',
            sourceRefs: [internalNotesRef, externalDocsRef]
        }),
        node({
            id: 'demo-kg-low-confidence',
            title: 'Low Confidence Triggers Follow-up',
            summary:
                'When evidence is weak or contradictory, the assistant should ask a targeted follow-up question before overcommitting.',
            nodeType: 'confidence_score',
            x: 1360,
            y: 70,
            priority: 'high'
        }),
        node({
            id: 'demo-kg-limitation',
            title: 'Limitation: Unsupported Latency Claim',
            summary:
                'A claim that the assistant always answers under two seconds has no source and should remain marked as a limitation.',
            nodeType: 'limitation',
            x: 1360,
            y: 250,
            status: 'needs_review',
            priority: 'medium'
        }),
        node({
            id: 'demo-kg-feedback',
            title: 'Feedback Improves Future Retrieval',
            summary:
                'User feedback should loop back into future retrieval and ranking rather than only attaching to the final answer.',
            nodeType: 'feedback',
            x: 940,
            y: 470,
            priority: 'medium'
        })
    ];

    return baseSnapshot({
        nodes,
        edges: [
            edge({ id: 'demo-kg-e1', source: 'demo-kg-root', target: 'demo-kg-question' }),
            edge({
                id: 'demo-kg-e2',
                source: 'demo-kg-question',
                target: 'demo-kg-entities',
                relationshipType: 'mentions',
                label: 'mentions entities',
                confidence: 0.92
            }),
            edge({
                id: 'demo-kg-e3',
                source: 'demo-kg-entities',
                target: 'demo-kg-internal-source',
                relationshipType: 'guides',
                label: 'guides internal search',
                confidence: 0.88
            }),
            edge({
                id: 'demo-kg-e4',
                source: 'demo-kg-entities',
                target: 'demo-kg-external-source',
                relationshipType: 'guides',
                label: 'guides external search',
                confidence: 0.78
            }),
            edge({
                id: 'demo-kg-e5',
                source: 'demo-kg-internal-source',
                target: 'demo-kg-answer',
                relationshipType: 'supports',
                label: 'supports answer',
                confidence: 0.86,
                rationale: 'Internal notes describe retrieval and synthesis behavior.'
            }),
            edge({
                id: 'demo-kg-e6',
                source: 'demo-kg-external-source',
                target: 'demo-kg-answer',
                relationshipType: 'supports',
                label: 'adds citation',
                confidence: 0.72
            }),
            edge({
                id: 'demo-kg-e7',
                source: 'demo-kg-internal-source',
                target: 'demo-kg-conflict',
                relationshipType: 'conflicts_with',
                label: 'priority rule conflicts',
                confidence: 0.74
            }),
            edge({
                id: 'demo-kg-e8',
                source: 'demo-kg-external-source',
                target: 'demo-kg-conflict',
                relationshipType: 'conflicts_with',
                label: 'freshness rule conflicts',
                confidence: 0.76
            }),
            edge({
                id: 'demo-kg-e9',
                source: 'demo-kg-conflict',
                target: 'demo-kg-low-confidence',
                relationshipType: 'causes',
                label: 'reduces confidence',
                confidence: 0.81
            }),
            edge({
                id: 'demo-kg-e10',
                source: 'demo-kg-low-confidence',
                target: 'demo-kg-answer',
                relationshipType: 'qualifies',
                label: 'requires uncertainty note',
                confidence: 0.83
            }),
            edge({
                id: 'demo-kg-e11',
                source: 'demo-kg-limitation',
                target: 'demo-kg-answer',
                relationshipType: 'qualifies',
                label: 'unsupported claim',
                confidence: 0.69
            }),
            edge({
                id: 'demo-kg-e12',
                source: 'demo-kg-feedback',
                target: 'demo-kg-internal-source',
                relationshipType: 'improves',
                label: 'future retrieval loop',
                confidence: 0.8
            }),
            edge({
                id: 'demo-kg-e13',
                source: 'demo-kg-answer',
                target: 'demo-kg-feedback',
                relationshipType: 'receives',
                label: 'user rates answer',
                confidence: 0.84
            })
        ],
        sourceLibrary: [
            {
                id: 'demo-kg-prompt',
                title: 'Ask AI Knowledge Graph Prompt',
                type: 'demo',
                status: 'example',
                coverage_count: 3
            },
            {
                id: 'demo-kg-internal',
                title: 'Research Assistant Notes',
                type: 'demo',
                status: 'example',
                coverage_count: 4
            },
            {
                id: 'demo-kg-external',
                title: 'Vendor Documentation Excerpt',
                type: 'demo',
                status: 'example',
                coverage_count: 3
            }
        ],
        workspaceBrief: {
            configured: true,
            preset: 'custom',
            goal: 'Stress-test Ask AI knowledge graph generation with labeled relationships, conflicts, confidence, limitations, many-to-many links, and feedback loops.',
            audience: 'Product reviewers testing the Ask AI knowledge graph feature',
            domain_context:
                'Seeded research assistant scenario based on the Ask AI prompt. It intentionally includes contradictory source priority rules and one unsupported claim.',
            desired_outputs: ['knowledge_graph', 'mind_map', 'source_set_review'],
            source_mode: 'source_plus_context',
            assumptions_allowed: true,
            output_style: 'relationship_graph_test_fixture',
            node_types: ['workspace_goal', 'question', 'entity', 'source', 'conflict', 'answer', 'confidence_score', 'limitation', 'feedback'],
            review_policy: ['mark_uncited_needs_review', 'mark_low_confidence_needs_review', 'explain_conflicting_evidence'],
            expected_artifacts: ['labeled graph', 'conflict explanation', 'follow-up question', 'limitation note'],
            review_rules: 'Keep the latency claim as unsupported, preserve the feedback loop, and label non-hierarchical relationships clearly.'
        }
    });
};

const askAiFlowchartDemo = () => {
    const promptRef = sourceRef('demo-flow-prompt', 'Ask AI Flowchart Prompt', 'Decision process');
    const nodes = [
        node({
            id: 'demo-flow-root',
            title: 'Ask AI Flowchart Robustness Test',
            summary:
                'A seeded scenario for testing nested branching, source checks, safety handling, conflict handling, and quality loops.',
            nodeType: 'workspace_goal',
            x: 80,
            y: 80,
            priority: 'high',
            status: 'ai_generated',
            assumption: false,
            sourceRefs: [promptRef]
        }),
        node({
            id: 'demo-flow-receive',
            title: 'Receive User Request',
            summary:
                'Start when the user submits a simple, complex, clear, unclear, safe, or unsafe request.',
            nodeType: 'process',
            x: 500,
            y: -160,
            status: 'ai_generated',
            assumption: false,
            sourceRefs: [promptRef]
        }),
        node({
            id: 'demo-flow-type',
            title: 'Decision: Request Type',
            summary:
                'Classify the request as simple, complex, or requiring specialized handling before drafting.',
            nodeType: 'decision',
            x: 500,
            y: 20,
            status: 'ai_generated',
            assumption: false,
            sourceRefs: [promptRef]
        }),
        node({
            id: 'demo-flow-clear',
            title: 'Decision: Clear Enough?',
            summary:
                'If the request is unclear, ask one focused clarifying question and loop back to analysis.',
            nodeType: 'decision',
            x: 500,
            y: 210,
            priority: 'high',
            sourceRefs: [promptRef]
        }),
        node({
            id: 'demo-flow-clarify',
            title: 'Ask Clarifying Question',
            summary:
                'Ask for the missing detail needed to proceed, then return to request analysis after the user replies.',
            nodeType: 'question',
            x: 80,
            y: 300,
            priority: 'medium',
            sourceRefs: [promptRef]
        }),
        node({
            id: 'demo-flow-knowledge',
            title: 'Decision: Enough Knowledge?',
            summary:
                'Use current knowledge for stable topics, or retrieve more information when the answer depends on sources.',
            nodeType: 'decision',
            x: 940,
            y: 20,
            sourceRefs: [promptRef]
        }),
        node({
            id: 'demo-flow-retrieve',
            title: 'Retrieve And Evaluate Sources',
            summary:
                'Search for supporting material, evaluate source reliability, and flag weak or unreliable evidence.',
            nodeType: 'process',
            x: 940,
            y: 210,
            sourceRefs: [promptRef]
        }),
        node({
            id: 'demo-flow-conflict',
            title: 'Decision: Sources Conflict?',
            summary:
                'When sources disagree, compare evidence and explain uncertainty instead of flattening the disagreement.',
            nodeType: 'decision',
            x: 1360,
            y: 210,
            priority: 'high',
            sourceRefs: [promptRef]
        }),
        node({
            id: 'demo-flow-safety',
            title: 'Decision: Safe Request?',
            summary:
                'Unsafe requests should route to a refusal or safer alternative before final answer delivery.',
            nodeType: 'decision',
            x: 940,
            y: 400,
            priority: 'high',
            sourceRefs: [promptRef]
        }),
        node({
            id: 'demo-flow-draft',
            title: 'Draft Response',
            summary:
                'Compose a relevant answer with citations, uncertainty notes, and the right level of detail.',
            nodeType: 'process',
            x: 1360,
            y: 400,
            sourceRefs: [promptRef]
        }),
        node({
            id: 'demo-flow-quality',
            title: 'Quality Check',
            summary:
                'Check safety, relevance, completeness, and source handling before final delivery.',
            nodeType: 'review_policy',
            x: 1360,
            y: 590,
            sourceRefs: [promptRef]
        }),
        node({
            id: 'demo-flow-final',
            title: 'Provide Final Answer',
            summary:
                'Deliver the answer and offer a useful next step when appropriate.',
            nodeType: 'answer',
            x: 940,
            y: 590,
            sourceRefs: [promptRef]
        })
    ];

    return baseSnapshot({
        nodes,
        edges: [
            edge({ id: 'demo-flow-e1', source: 'demo-flow-root', target: 'demo-flow-receive' }),
            edge({ id: 'demo-flow-e2', source: 'demo-flow-receive', target: 'demo-flow-type' }),
            edge({ id: 'demo-flow-e3', source: 'demo-flow-type', target: 'demo-flow-clear' }),
            edge({
                id: 'demo-flow-e4',
                source: 'demo-flow-clear',
                target: 'demo-flow-clarify',
                relationshipType: 'routes_to',
                label: 'unclear',
                confidence: 0.9
            }),
            edge({
                id: 'demo-flow-e5',
                source: 'demo-flow-clarify',
                target: 'demo-flow-type',
                relationshipType: 'loops_to',
                label: 'user clarifies',
                confidence: 0.88
            }),
            edge({
                id: 'demo-flow-e6',
                source: 'demo-flow-clear',
                target: 'demo-flow-knowledge',
                relationshipType: 'routes_to',
                label: 'clear',
                confidence: 0.91
            }),
            edge({
                id: 'demo-flow-e7',
                source: 'demo-flow-knowledge',
                target: 'demo-flow-retrieve',
                relationshipType: 'routes_to',
                label: 'needs retrieval',
                confidence: 0.84
            }),
            edge({
                id: 'demo-flow-e8',
                source: 'demo-flow-knowledge',
                target: 'demo-flow-safety',
                relationshipType: 'routes_to',
                label: 'enough knowledge',
                confidence: 0.78
            }),
            edge({
                id: 'demo-flow-e9',
                source: 'demo-flow-retrieve',
                target: 'demo-flow-conflict',
                relationshipType: 'routes_to',
                label: 'evaluate reliability',
                confidence: 0.85
            }),
            edge({
                id: 'demo-flow-e10',
                source: 'demo-flow-conflict',
                target: 'demo-flow-draft',
                relationshipType: 'qualifies',
                label: 'explain uncertainty',
                confidence: 0.82
            }),
            edge({
                id: 'demo-flow-e11',
                source: 'demo-flow-conflict',
                target: 'demo-flow-safety',
                relationshipType: 'routes_to',
                label: 'consistent evidence',
                confidence: 0.76
            }),
            edge({
                id: 'demo-flow-e12',
                source: 'demo-flow-safety',
                target: 'demo-flow-draft',
                relationshipType: 'routes_to',
                label: 'safe',
                confidence: 0.9
            }),
            edge({
                id: 'demo-flow-e13',
                source: 'demo-flow-draft',
                target: 'demo-flow-quality',
                relationshipType: 'routes_to',
                label: 'review draft',
                confidence: 0.92
            }),
            edge({
                id: 'demo-flow-e14',
                source: 'demo-flow-quality',
                target: 'demo-flow-draft',
                relationshipType: 'loops_to',
                label: 'fails check',
                confidence: 0.86
            }),
            edge({
                id: 'demo-flow-e15',
                source: 'demo-flow-quality',
                target: 'demo-flow-final',
                relationshipType: 'routes_to',
                label: 'passes check',
                confidence: 0.9
            })
        ],
        sourceLibrary: [
            {
                id: 'demo-flow-prompt',
                title: 'Ask AI Flowchart Prompt',
                type: 'demo',
                status: 'example',
                coverage_count: 8
            }
        ],
        workspaceBrief: {
            configured: true,
            preset: 'custom',
            goal: 'Stress-test Ask AI flowchart generation with decisions, nested branches, source evaluation, safety handling, conflict handling, and loops.',
            audience: 'Product reviewers testing the Ask AI flowchart feature',
            domain_context:
                'Seeded assistant decision-process scenario based on the Ask AI flowchart prompt. It should render as a flowchart and remain readable as a map.',
            desired_outputs: ['flow_chart', 'mind_map', 'checklist'],
            source_mode: 'context_only',
            assumptions_allowed: true,
            output_style: 'workflow_test_fixture',
            node_types: ['workspace_goal', 'process', 'decision', 'question', 'review_policy', 'answer'],
            review_policy: ['mark_unclear_requires_question', 'explain_conflicting_evidence', 'quality_check_before_final'],
            expected_artifacts: ['flowchart', 'decision branches', 'clarification loop', 'quality loop'],
            review_rules: 'Preserve the clarification loop and draft-quality loop, and keep decision labels concise.'
        }
    });
};

export const DEMO_WORKSPACE_TEMPLATES = [
    {
        id: 'tracespace-tour',
        name: 'Example: What TraceSpace Is For',
        summary: 'A short product-tour workspace about brief, sources, review state, and outputs.',
        cta: 'Create product tour',
        buildSnapshot: traceSpaceTour
    },
    {
        id: 'source-review',
        name: 'Example: Source Review Handoff',
        summary: 'A source-set review demo with cited nodes, a gap, an SME question, and a task.',
        cta: 'Create source review',
        buildSnapshot: sourceReviewDemo
    },
    {
        id: 'output-views',
        name: 'Example: Output Views',
        summary: 'A compact workspace for trying map, knowledge graph, flowchart, table, checklist, and task views.',
        cta: 'Create output demo',
        buildSnapshot: outputViewsDemo
    },
    {
        id: 'aec-sow-deliverables',
        name: 'Example: AEC SOW Delivery Plan',
        summary: 'A discipline dependency demo with SOW deliverables, risks, missing owner decisions, and Miro/monday handoff targets.',
        cta: 'Create AEC demo',
        buildSnapshot: aecSowDeliverablesDemo
    },
    {
        id: 'ask-ai-knowledge-graph',
        name: 'Example: Ask AI Knowledge Graph',
        summary: 'A graph stress test with labeled relationships, conflicting evidence, confidence, limitations, and feedback loops.',
        cta: 'Create graph test',
        buildSnapshot: askAiKnowledgeGraphDemo
    },
    {
        id: 'ask-ai-flowchart',
        name: 'Example: Ask AI Flowchart',
        summary: 'A flowchart stress test with nested decisions, retrieval, conflict handling, safety checks, and loops.',
        cta: 'Create flowchart test',
        buildSnapshot: askAiFlowchartDemo
    }
];
