export const VISUAL_OPTIONS = [
    { id: 'auto', label: 'Auto - choose package/view' },
    { id: 'connected_picture_package', label: 'Connected Package' },
    { id: 'mind_map', label: 'Mind Map' },
    { id: 'outline', label: 'Outline' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'checklist', label: 'Checklist' },
    { id: 'table', label: 'Table' },
    { id: 'flow_chart', label: 'Flowchart' },
    { id: 'knowledge_graph', label: 'Knowledge Graph' },
    { id: 'chart', label: 'Chart' },
    { id: 'kanban', label: 'Kanban' },
    { id: 'executive_summary', label: 'Executive Summary' },
    { id: 'news_article', label: 'News Article' },
    { id: 'newsletter', label: 'Newsletter' },
    { id: 'sme_questions', label: 'SME Questions' },
    { id: 'software_overlap_report', label: 'Software Overlap' },
    { id: 'implementation_handoff_package', label: 'Handoff' },
    { id: 'no_visual', label: 'Text only' }
];

export const MESSY_CONTEXT_STARTER_ID = 'messy_context_to_best_view';
export const CONTEXT_DUMP_OUTPUT_VISUAL = 'connected_picture_package';

export const visualLabel = (visualId) =>
    VISUAL_OPTIONS.find((option) => option.id === visualId)?.label || visualId;

export const WORKSPACE_VIEW_OUTPUTS = new Set([
    'mind_map',
    'knowledge_graph',
    'flow_chart',
    'outline',
    'executive_summary',
    'tasks',
    'kanban',
    'table'
]);
export const CHART_DATA_OUTPUTS = new Set(['chart']);
export const REVIEW_PACKET_OUTPUTS = new Set([
    'checklist',
    'source_coverage',
    'review_annotations',
    'sme_questions',
    'software_overlap_report',
    'missing_info_report'
]);
export const HANDOFF_OUTPUTS = new Set(['implementation_handoff_package']);
export const PUBLISHABLE_OUTPUTS = new Set(['news_article', 'newsletter']);
export const SPECIALIZED_STARTER_IDS = new Set([
    'aec_sow_to_delivery_graph',
    'aec_code_lifecycle_package',
    'standards_completeness_review',
    'complex_issue_team_roadmap',
    'specialize_branch',
    'find_process_bottlenecks',
    'find_duplicate_tools',
    'find_ownership_gaps',
    'find_unsupported_business_critical_systems',
    'create_30_60_90_day_improvement_plan'
]);

export const STARTER_GROUPS = [
    {
        id: 'workspace_views',
        label: 'Workspace views',
        detail: 'Start with messy context or build Map, Connections, Flowchart, Outline, Executive, Table, Tasks, or Kanban.'
    },
    {
        id: 'charts_data',
        label: 'Charts and data',
        detail: 'Create structured rows, tables, chart artifacts, and query-style views.'
    },
    {
        id: 'review_packets',
        label: 'Review packets',
        detail: 'Find gaps, weak evidence, source repairs, SME questions, and overlap signals.'
    },
    {
        id: 'handoff_publish',
        label: 'Handoff and publishing',
        detail: 'Package accepted structure for implementation, stakeholder review, or readable updates.'
    },
    {
        id: 'specialized_work',
        label: 'Specialized work',
        detail: 'Use domain-specific recipes for AEC, standards, enterprise operations, and branch specialization.'
    }
];

export const starterGroupId = (starter = {}) => {
    if (SPECIALIZED_STARTER_IDS.has(starter.id)) {
        return 'specialized_work';
    }
    if (starter.visual === 'auto') {
        return 'workspace_views';
    }
    if (CHART_DATA_OUTPUTS.has(starter.visual)) {
        return 'charts_data';
    }
    if (HANDOFF_OUTPUTS.has(starter.visual) || PUBLISHABLE_OUTPUTS.has(starter.visual)) {
        return 'handoff_publish';
    }
    if (REVIEW_PACKET_OUTPUTS.has(starter.visual)) {
        return 'review_packets';
    }
    if (WORKSPACE_VIEW_OUTPUTS.has(starter.visual)) {
        return 'workspace_views';
    }
    return 'review_packets';
};

export const starterSurfaceLabel = (starter = {}) => {
    const groupId = starterGroupId(starter);
    if (groupId === 'charts_data') {
        return starter.id === 'sankey_flow_lens' ? 'Lens' : 'Chart/data';
    }
    if (groupId === 'review_packets') {
        return 'Review';
    }
    if (groupId === 'handoff_publish') {
        return 'Handoff';
    }
    if (groupId === 'specialized_work') {
        return 'Specialized';
    }
    if (starter.visual === 'auto') {
        return 'Start';
    }
    return 'View';
};

export const starterSortKey = (starter = {}) => {
    if (starter.id === MESSY_CONTEXT_STARTER_ID) {
        return '000';
    }
    if (starter.id === 'aec_code_lifecycle_package') {
        return '040';
    }
    if (starter.id === 'sankey_flow_lens') {
        return '500';
    }
    return `100-${starter.label || starter.id || ''}`;
};

export const sortStarterRecipes = (starters = []) =>
    [...starters].sort((left, right) => starterSortKey(left).localeCompare(starterSortKey(right)));

export const starterById = (starters = [], starterId = '') =>
    starters.find((starter) => starter?.id === starterId);

export const contextDumpStarterDefaults = (starters = []) => {
    const starter = starterById(starters, MESSY_CONTEXT_STARTER_ID) || {};
    return {
        starterId: MESSY_CONTEXT_STARTER_ID,
        prompt: starter.prompt || '',
        visual: CONTEXT_DUMP_OUTPUT_VISUAL,
        roleId: starter.roleId || 'workflow-mapper',
        actionId: starter.actionId || 'custom_prompt',
        evidenceMode: 'auto',
        citationPolicy: 'auto'
    };
};
