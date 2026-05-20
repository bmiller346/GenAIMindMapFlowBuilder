export const CORE_VIEWS = [
    { id: 'mindmap', label: 'Map', ariaLabel: 'TraceSpace Map', detail: 'Map the workspace structure', group: 'Explore' },
    { id: 'knowledgeGraph', label: 'Connections', detail: 'Find relationships and overlaps', group: 'Explore' },
    { id: 'flowchart', label: 'Flowchart', detail: 'Explore process steps, decisions, and handoffs', group: 'Explore' },
    { id: 'outline', label: 'Outline', detail: 'Review hierarchy as an outline', group: 'Review' },
    { id: 'executive', label: 'Executive', detail: 'Package summary and evidence', group: 'Review' },
    { id: 'table', label: 'Table', detail: 'View workspace data as table rows', group: 'Review' },
    { id: 'tasks', label: 'Tasks', detail: 'Act on confirmed and potential tasks', group: 'Act' },
    { id: 'kanban', label: 'Kanban', detail: 'Move tasks through board columns', group: 'Act' }
];

export const CANVAS_VIEW_IDS = new Set(CORE_VIEWS.map((view) => view.id));

export const CORE_VIEW_GROUPS = ['Explore', 'Review', 'Act'].map((label) => ({
    label,
    views: CORE_VIEWS.filter((view) => view.group === label)
}));

export const NODE_DENSITY_OPTIONS = [
    { id: 'compact', label: 'Compact' },
    { id: 'outline', label: 'Outline' },
    { id: 'cards', label: 'Cards' }
];

export const REVIEW_VIEWS = [
    { id: 'preview', label: 'Task preview' },
    { id: 'gaps', label: 'Missing info' },
    { id: 'sme', label: 'SME questions' },
    { id: 'sources', label: 'Source repair' }
];

export const AI_OUTPUT_VIEWS = [
    { id: 'connections', label: 'Find connections', detail: 'AI can propose relationship edges' },
    { id: 'chartData', label: 'Create structured table', detail: 'AI can infer table columns and rows' },
    { id: 'preview', label: 'Generate task preview', detail: 'AI preview or current workspace tasks' },
    { id: 'checklist', label: 'Create checklist', detail: 'AI preview or current workspace checklist' }
];

export const HANDOFF_VIEWS = [
    { id: 'mondayInput', label: 'Implementation package' },
    { id: 'mondayStatus', label: 'Status review' }
];

export const WORKSPACE_OUTPUT_GROUPS = [
    { label: 'Explore', views: AI_OUTPUT_VIEWS.filter((view) => ['connections'].includes(view.id)) },
    {
        label: 'Review',
        views: [
            ...REVIEW_VIEWS.filter((view) => view.id !== 'preview'),
            ...AI_OUTPUT_VIEWS.filter((view) => view.id === 'chartData')
        ]
    },
    { label: 'Act', views: AI_OUTPUT_VIEWS.filter((view) => ['preview', 'checklist'].includes(view.id)) },
    { label: 'Share', views: HANDOFF_VIEWS }
];

export const WORKSPACE_OUTPUT_OPTIONS = WORKSPACE_OUTPUT_GROUPS.flatMap((group) => group.views);

export const NEXT_ACTION_DETAILS = {
    connections: {
        title: 'Find connections keeps your map intact',
        description:
            'AI will propose cross-branch relationship edges, including potential software overlap, not rewrite the map hierarchy.',
        expected: [
            'Relationship candidates',
            'Tool overlap signals',
            'Confidence and rationale',
            'Review before accepting'
        ],
        emptyHint:
            'The Connections lens becomes useful after accepted relationship edges exist.'
    },
    flowchart: {
        title: 'Create a flow chart preview',
        description:
            'AI will infer steps, decisions, dependencies, and handoffs for review.',
        expected: ['Process structure', 'Decision points', 'Review before accepting']
    },
    chartData: {
        title: 'Create a structured table preview',
        description:
            'AI will infer useful columns and rows from the current context for review.',
        expected: ['Table columns', 'Candidate rows', 'Review before accepting']
    },
    preview: {
        title: 'Generate task candidates',
        description:
            'AI will suggest task-ready rows from the current workspace or selected branch.',
        expected: ['Task candidates', 'Owners and due-date cues', 'Review before accepting']
    },
    checklist: {
        title: 'Create checklist candidates',
        description:
            'AI will suggest verification-ready checklist items without changing the map first.',
        expected: ['Checklist items', 'Review flags', 'Review before accepting']
    }
};

export const GRAPH_FILTERS = [
    { id: 'source-backed', label: 'Source-backed' },
    { id: 'needs-review', label: 'Needs review' },
    { id: 'manual', label: 'Manual' },
    { id: 'ai-generated', label: 'AI-generated' },
    { id: 'tasks-only', label: 'Tasks only' },
    { id: 'unassigned', label: 'Unassigned' },
    { id: 'missing-due-date', label: 'Missing due' },
    { id: 'missing-source', label: 'Missing source' },
    { id: 'low-confidence', label: 'Low confidence' },
    { id: 'hidden-from-export', label: 'Hidden export' }
];
