export const MAP_STYLE_THEMES = [
    {
        id: 'clean',
        label: 'Clean',
        description: 'Balanced app styling for everyday editing and review.',
        exportBackground: '#1e1e1e'
    },
    {
        id: 'print',
        label: 'Print',
        description: 'High-contrast white canvas for printed handouts.',
        exportBackground: '#f8fafc'
    },
    {
        id: 'sketchbook',
        label: 'Sketchbook',
        description: 'Loose ink-like hierarchy for workshop maps.',
        exportBackground: '#fbfaf4'
    }
];

export const MAP_HIERARCHY_MODES = [
    {
        id: 'balanced',
        label: 'Balanced',
        description: 'Keep nodes visually even.'
    },
    {
        id: 'depth',
        label: 'Depth',
        description: 'Make roots and first branches stand out.'
    }
];

export const NODE_EMPHASIS_OPTIONS = [
    { id: '', label: 'Normal', description: 'Use default map styling.' },
    { id: 'key', label: 'Key idea', description: 'Primary takeaway or anchor concept.' },
    { id: 'critical', label: 'Critical', description: 'Needs attention in review or print.' },
    { id: 'supporting', label: 'Supporting', description: 'Secondary or background detail.' },
    { id: 'evidence', label: 'Evidence', description: 'Source-backed proof point.' },
    { id: 'action', label: 'Action', description: 'Follow-up work or decision step.' }
];

export const DEFAULT_MAP_STYLE = {
    theme: 'clean',
    hierarchy: 'depth',
    showEmphasisBadges: true
};

const themeIds = new Set(MAP_STYLE_THEMES.map((theme) => theme.id));
const hierarchyIds = new Set(MAP_HIERARCHY_MODES.map((mode) => mode.id));
const emphasisIds = new Set(NODE_EMPHASIS_OPTIONS.map((option) => option.id));
const HIERARCHY_EDGE_TYPES = new Set([
    '',
    'contains',
    'parent_child',
    'parent-child',
    'child',
    'section',
    'subtopic',
    'branch',
    'step',
    'smoothstep'
]);

const edgeRelationshipType = (edge = {}) =>
    String(
        edge.relationship_type ||
            edge.data?.relationship_type ||
            edge.data?.relationshipType ||
            edge.metadata?.relationship_type ||
            edge.type ||
            ''
    )
        .trim()
        .toLowerCase();

const nestedData = (node = {}) =>
    node.data?.data && typeof node.data.data === 'object' ? node.data.data : {};

const firstValue = (node = {}, keys = []) => {
    const data = node.data || {};
    const legacy = nestedData(node);
    for (const key of keys) {
        const value = data[key] ?? legacy[key];
        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }
    return '';
};

const sourceRefsForNode = (node = {}) => {
    const data = node.data || {};
    const legacy = nestedData(node);
    const refs = data.source_refs ?? legacy.source_refs;
    return Array.isArray(refs) ? refs.filter(Boolean) : [];
};

const buildNodeDepths = (nodes = [], edges = []) => {
    const nodeIds = new Set(nodes.map((node) => node.id));
    const childIds = new Set();
    const childrenByParent = edges
        .filter((edge) => HIERARCHY_EDGE_TYPES.has(edgeRelationshipType(edge)))
        .reduce((lookup, edge) => {
            if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
                return lookup;
            }
            childIds.add(edge.target);
            const children = lookup.get(edge.source) || [];
            children.push(edge.target);
            lookup.set(edge.source, children);
            return lookup;
        }, new Map());
    const roots = nodes.map((node) => node.id).filter((nodeId) => !childIds.has(nodeId));
    const depths = new Map(roots.map((nodeId) => [nodeId, 0]));
    const queue = roots.map((nodeId) => ({ nodeId, depth: 0 }));

    while (queue.length > 0) {
        const { nodeId, depth } = queue.shift();
        (childrenByParent.get(nodeId) || []).forEach((childId) => {
            const nextDepth = depth + 1;
            if (!depths.has(childId) || nextDepth < depths.get(childId)) {
                depths.set(childId, nextDepth);
                queue.push({ nodeId: childId, depth: nextDepth });
            }
        });
    }

    return depths;
};

export const normalizeMapStyle = (style = {}) => ({
    ...DEFAULT_MAP_STYLE,
    ...(style && typeof style === 'object' ? style : {}),
    theme: themeIds.has(style?.theme) ? style.theme : DEFAULT_MAP_STYLE.theme,
    hierarchy: hierarchyIds.has(style?.hierarchy)
        ? style.hierarchy
        : DEFAULT_MAP_STYLE.hierarchy,
    showEmphasisBadges:
        style?.showEmphasisBadges === undefined
            ? DEFAULT_MAP_STYLE.showEmphasisBadges
            : Boolean(style.showEmphasisBadges)
});

export const normalizeNodeEmphasis = (value = '') =>
    emphasisIds.has(value) ? value : '';

export const inferNodeEmphasis = ({ node = {}, depth = 1 } = {}) => {
    const nodeType = String(firstValue(node, ['node_type', 'component_type', 'name'])).toLowerCase();
    const status = String(firstValue(node, ['status'])).toLowerCase();
    const priority = String(firstValue(node, ['priority'])).toLowerCase();
    const refs = sourceRefsForNode(node);
    const isManual = Boolean(node.data?.manual);

    if (priority === 'critical' || nodeType === 'risk') {
        return 'critical';
    }
    if (status === 'rejected' || (status === 'needs_review' && !isManual)) {
        return 'critical';
    }
    if (depth === 0) {
        return 'key';
    }
    if (['task', 'action', 'decision'].includes(nodeType)) {
        return 'action';
    }
    if (refs.length > 0 || ['reference', 'standard', 'requirement'].includes(nodeType)) {
        return 'evidence';
    }
    if (depth >= 3) {
        return 'supporting';
    }
    return '';
};

export const autoStyleWorkspaceNodes = (nodes = [], edges = []) => {
    const depths = buildNodeDepths(nodes, edges);
    return nodes.map((node) => {
        const emphasis = inferNodeEmphasis({
            node,
            depth: depths.get(node.id) || 0
        });
        return {
            ...node,
            data: {
                ...(node.data || {}),
                display: {
                    ...(node.data?.display || {}),
                    emphasis
                }
            }
        };
    });
};

export const resetWorkspaceNodeEmphasis = (nodes = []) =>
    nodes.map((node) => ({
        ...node,
        data: {
            ...(node.data || {}),
            display: {
                ...(node.data?.display || {}),
                emphasis: ''
            }
        }
    }));

export const getMapStyleTheme = (themeId = '') =>
    MAP_STYLE_THEMES.find((theme) => theme.id === themeId) ||
    MAP_STYLE_THEMES.find((theme) => theme.id === DEFAULT_MAP_STYLE.theme);

export const getMapStyleCanvasBackground = (style = {}, lightMode = false) => {
    const normalized = normalizeMapStyle(style);
    if (normalized.theme === 'clean') {
        return lightMode ? '#f8fafc' : '#1e1e1e';
    }
    return getMapStyleTheme(normalized.theme).exportBackground;
};

export const getMapStyleGridColor = (style = {}, lightMode = false) => {
    const normalized = normalizeMapStyle(style);
    if (normalized.theme === 'clean') {
        return lightMode ? '#cbd5e1' : '#3d3d3d';
    }
    if (normalized.theme === 'print') {
        return '#cbd5e1';
    }
    return '#d6cdb7';
};

export const getMapStyleClassNames = (style = {}) => {
    const normalized = normalizeMapStyle(style);
    return [
        `map-style-${normalized.theme}`,
        `map-hierarchy-${normalized.hierarchy}`,
        normalized.showEmphasisBadges ? 'map-emphasis-badges-on' : 'map-emphasis-badges-off'
    ].join(' ');
};
