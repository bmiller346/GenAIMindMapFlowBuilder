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
        data: {
            summ: summary,
            query: '',
            df: [],
            graph: {},
            source_refs: sourceRefs,
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
    }
];

