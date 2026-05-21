export const mockConnectedPackagePreview = {
    package_id: 'connected-package-preview',
    title: 'Connected Package Preview',
    summary:
        'Preview-only bundle showing how accepted draft outputs can travel together as a graph, table, chart, evidence set, tasks, and review queue.',
    status: 'preview_only',
    updated_at: '2026-05-20T22:45:00.000Z',
    acceptance_groups: [
        {
            id: 'ready-evidence',
            label: 'Evidence-backed outputs',
            status: 'ready',
            item_count: 8,
            accepted_count: 6,
            summary: 'Claims, rows, and graph edges with usable source references.'
        },
        {
            id: 'repair-first',
            label: 'Repair before acceptance',
            status: 'needs_repair',
            item_count: 4,
            accepted_count: 0,
            summary: 'Rows and relationship edges that need better citation or owner confirmation.'
        },
        {
            id: 'review-notes',
            label: 'Review annotations',
            status: 'review',
            item_count: 5,
            accepted_count: 2,
            summary: 'Assumptions, conflicts, and questions that should stay visible during acceptance.'
        }
    ],
    readiness: [
        { id: 'schema', label: 'Schema', state: 'ready', detail: 'Package artifacts share stable ids.' },
        { id: 'sources', label: 'Sources', state: 'warning', detail: '82% source coverage across preview items.' },
        { id: 'flow', label: 'Flow', state: 'ready', detail: 'Flow can render as stages, handoffs, or Sankey.' },
        { id: 'review', label: 'Review', state: 'blocked', detail: '4 repair targets remain before bulk accept.' }
    ],
    repair_targets: [
        {
            id: 'repair-row-03',
            label: 'Add citation for row 3',
            target_type: 'table_row',
            priority: 'high',
            owner: 'Source reviewer',
            reason: 'Flow row has a source and target but no evidence snippet.'
        },
        {
            id: 'repair-edge-07',
            label: 'Confirm dependency edge',
            target_type: 'graph_edge',
            priority: 'medium',
            owner: 'Domain SME',
            reason: 'Relationship is inferred from adjacent notes, not directly cited.'
        },
        {
            id: 'repair-task-02',
            label: 'Resolve task owner',
            target_type: 'task',
            priority: 'medium',
            owner: 'Package author',
            reason: 'Task is actionable but missing an accountable owner.'
        },
        {
            id: 'repair-chart-01',
            label: 'Replace placeholder weight',
            target_type: 'chart_row',
            priority: 'low',
            owner: 'Analyst',
            reason: 'Sankey width is currently a placeholder value.'
        }
    ],
    source_coverage: {
        total_items: 22,
        cited_items: 18,
        uncited_items: 4,
        required_repairs: 4,
        sources: [
            { id: 'src-workspace', title: 'Workspace graph', coverage: 0.91, cited_items: 10 },
            { id: 'src-uploaded', title: 'Uploaded sources', coverage: 0.78, cited_items: 7 },
            { id: 'src-model', title: 'AI assumptions', coverage: 0.35, cited_items: 1 }
        ]
    },
    graph: {
        nodes: [
            { id: 'scope', label: 'Scope', group: 'Input', readiness: 'ready' },
            { id: 'sources', label: 'Sources', group: 'Input', readiness: 'warning' },
            { id: 'claims', label: 'Claims', group: 'Analysis', readiness: 'ready' },
            { id: 'connections', label: 'Connections', group: 'Analysis', readiness: 'ready' },
            { id: 'outputs', label: 'Outputs', group: 'Package', readiness: 'warning' },
            { id: 'review', label: 'Review', group: 'Package', readiness: 'blocked' }
        ],
        edges: [
            { id: 'e1', source: 'scope', target: 'claims', relationship: 'frames', confidence: 0.86 },
            { id: 'e2', source: 'sources', target: 'claims', relationship: 'supports', confidence: 0.78 },
            { id: 'e3', source: 'claims', target: 'connections', relationship: 'drives', confidence: 0.72 },
            { id: 'e4', source: 'connections', target: 'outputs', relationship: 'packages', confidence: 0.81 },
            { id: 'e5', source: 'outputs', target: 'review', relationship: 'requires', confidence: 0.64 }
        ]
    },
    connections: [
        {
            id: 'cx-1',
            from: 'Source-backed claims',
            to: 'Graph edges',
            relationship: 'supports',
            confidence: 0.84,
            evidence_count: 6,
            review_state: 'ready'
        },
        {
            id: 'cx-2',
            from: 'Repair targets',
            to: 'Acceptance groups',
            relationship: 'blocks',
            confidence: 0.71,
            evidence_count: 2,
            review_state: 'needs_repair'
        },
        {
            id: 'cx-3',
            from: 'Tasks',
            to: 'Review notes',
            relationship: 'resolves',
            confidence: 0.67,
            evidence_count: 3,
            review_state: 'review'
        }
    ],
    flow: {
        lenses: ['Stages', 'Handoffs', 'Sankey'],
        stages: [
            { id: 'intake', label: 'Intake', value: 5, status: 'ready' },
            { id: 'analysis', label: 'Analysis', value: 8, status: 'ready' },
            { id: 'packaging', label: 'Packaging', value: 6, status: 'warning' },
            { id: 'review', label: 'Review', value: 4, status: 'blocked' }
        ],
        sankey_rows: [
            { source: 'Sources', target: 'Claims', value: 10 },
            { source: 'Claims', target: 'Connections', value: 8 },
            { source: 'Connections', target: 'Outputs', value: 6 },
            { source: 'Outputs', target: 'Review', value: 4 }
        ]
    },
    table: {
        columns: ['Artifact', 'Type', 'Readiness', 'Sources', 'Repair'],
        rows: [
            ['Executive summary', 'Narrative', 'Ready', '5 refs', 'None'],
            ['Connection map', 'Graph', 'Ready', '8 refs', 'None'],
            ['Flow rows', 'Table', 'Needs repair', '3 refs', '1 row'],
            ['Sankey lens', 'Chart', 'Needs review', '3 refs', 'Weights'],
            ['Task plan', 'Tasks', 'Review', '2 refs', 'Owner']
        ]
    },
    charts: [
        { id: 'coverage', label: 'Source coverage', value: 82, tone: 'ready' },
        { id: 'readiness', label: 'Ready items', value: 64, tone: 'warning' },
        { id: 'repair', label: 'Repair load', value: 18, tone: 'blocked' }
    ],
    evidence: [
        {
            id: 'ev-1',
            title: 'Source-backed claim cluster',
            source: 'Workspace graph',
            coverage: '10 cited items',
            status: 'ready'
        },
        {
            id: 'ev-2',
            title: 'Uploaded-source snippets',
            source: 'Uploaded sources',
            coverage: '7 cited items',
            status: 'ready'
        },
        {
            id: 'ev-3',
            title: 'Assumptions needing support',
            source: 'AI assumptions',
            coverage: '4 uncited items',
            status: 'needs_repair'
        }
    ],
    tasks: [
        { id: 'task-1', title: 'Repair missing row citations', owner: 'Source reviewer', status: 'blocked' },
        { id: 'task-2', title: 'Confirm inferred dependency edge', owner: 'Domain SME', status: 'review' },
        { id: 'task-3', title: 'Choose chart weighting metric', owner: 'Analyst', status: 'review' },
        { id: 'task-4', title: 'Prepare accepted output bundle', owner: 'Package author', status: 'ready' }
    ],
    review: [
        { id: 'rv-1', label: 'Bulk accept disabled until repair targets are resolved.', tone: 'blocked' },
        { id: 'rv-2', label: 'Sankey is available as a chart lens, not the canonical package shape.', tone: 'ready' },
        { id: 'rv-3', label: 'Preview uses local mock artifacts until backend package fields arrive.', tone: 'warning' }
    ]
};
