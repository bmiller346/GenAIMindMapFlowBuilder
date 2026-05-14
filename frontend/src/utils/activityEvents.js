export const ACTIVITY_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'source', label: 'Sources' },
    { id: 'ai', label: 'AI' },
    { id: 'manual', label: 'Manual' },
    { id: 'validation', label: 'Validation' },
    { id: 'export', label: 'Export' },
    { id: 'integration', label: 'Integrations' },
    { id: 'automation', label: 'Automations' },
    { id: 'system', label: 'System' }
];

const TYPE_CATEGORY_PREFIXES = [
    ['source_', 'source'],
    ['brief_', 'ai'],
    ['ai_', 'ai'],
    ['manual_', 'manual'],
    ['node_', 'manual'],
    ['table_', 'manual'],
    ['validation_', 'validation'],
    ['export_', 'export'],
    ['integration_', 'integration'],
    ['miro_', 'integration'],
    ['monday_', 'integration'],
    ['automation_', 'automation'],
    ['workspace_', 'system'],
    ['autosave_', 'system'],
    ['save_', 'system'],
    ['revert_', 'system']
];

export const activityCategoryForType = (type = '') => {
    const match = TYPE_CATEGORY_PREFIXES.find(([prefix]) =>
        String(type).startsWith(prefix)
    );

    return match?.[1] || 'system';
};

export const createActivityEvent = ({
    id,
    workspace_id = '',
    type = 'system_event',
    title = 'Workspace activity',
    summary,
    detail,
    context,
    actor = 'user',
    created_at,
    updated_at,
    node_ids = [],
    source_ids = [],
    integration = '',
    metadata = {},
    status,
    undo
} = {}) => {
    const timestamp = created_at || new Date().toISOString();
    const nextSummary = summary || context || detail || '';

    return {
        id:
            id ||
            `evt_${Date.now().toString(36)}_${Math.random()
                .toString(36)
                .slice(2, 8)}`,
        workspace_id,
        type,
        category: activityCategoryForType(type),
        title,
        summary: nextSummary,
        detail: detail || nextSummary,
        context: context || nextSummary,
        actor,
        created_at: timestamp,
        updated_at: updated_at || timestamp,
        node_ids: Array.isArray(node_ids) ? node_ids.filter(Boolean) : [],
        source_ids: Array.isArray(source_ids) ? source_ids.filter(Boolean) : [],
        integration,
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
        status,
        undo
    };
};

export const normalizeActivityEvents = (events = [], workspaceId = '') =>
    (Array.isArray(events) ? events : [])
        .filter(Boolean)
        .map((event) =>
            createActivityEvent({
                ...event,
                workspace_id: event.workspace_id || workspaceId,
                category: undefined
            })
        );

export const activityTimeLabel = (value) => {
    if (!value) {
        return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
};
