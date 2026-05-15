import { nanoid } from 'nanoid';

export const WORKSPACE_NODE_TYPE = 'response';
export const DEFAULT_LAYOUT_MODE = 'vertical-children';

export const LAYOUT_MODES = {
    VERTICAL_CHILDREN: 'vertical-children',
    BALANCED_MAP: 'balanced-map',
    OUTLINE_STACK: 'outline-stack',
    COMPACT_TASK_STACK: 'compact-task-stack'
};

export const LAYOUT_SPACING = {
    [LAYOUT_MODES.VERTICAL_CHILDREN]: { x: 430, y: 96 },
    [LAYOUT_MODES.BALANCED_MAP]: { x: 430, y: 112 },
    [LAYOUT_MODES.OUTLINE_STACK]: { x: 280, y: 76 },
    [LAYOUT_MODES.COMPACT_TASK_STACK]: { x: 240, y: 56 }
};

const ROOT_SPACING = { x: 360, y: 180 };
const ROOT_SAFE_OFFSET = { x: 260, y: 160 };
const POSITION_EPSILON = 16;
const DEFAULT_GRAPH_DATA = {};

export const getNodeTitle = (node) =>
    node?.data?.title ||
    node?.data?.data?.summ ||
    node?.data?.question ||
    node?.id ||
    'Untitled node';

const cloneDataFrame = (df) => (Array.isArray(df) ? structuredClone(df) : []);

const cloneValue = (value, fallback) =>
    value !== undefined && value !== null ? structuredClone(value) : fallback;

const firstText = (...values) =>
    values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .find(Boolean) || '';

const normalizePosition = (position = {}) => ({
    x: Number.isFinite(position.x) ? position.x : 0,
    y: Number.isFinite(position.y) ? position.y : 0
});

const normalizeLayoutMode = (mode) =>
    Object.values(LAYOUT_MODES).includes(mode) ? mode : DEFAULT_LAYOUT_MODE;

const getSpacing = (mode) => LAYOUT_SPACING[normalizeLayoutMode(mode)];

export const getEdgeTypeForLayoutMode = (mode) =>
    normalizeLayoutMode(mode) === LAYOUT_MODES.BALANCED_MAP ? 'smoothstep' : 'step';

const samePosition = (a = {}, b = {}) =>
    Math.abs((a.x || 0) - (b.x || 0)) < POSITION_EPSILON &&
    Math.abs((a.y || 0) - (b.y || 0)) < POSITION_EPSILON;

const isPositionOccupied = (nodes, position, excludeIds = new Set()) =>
    nodes.some((node) => !excludeIds.has(node.id) && samePosition(node.position, position));

const firstOpenPosition = ({
    nodes = [],
    preferredPosition,
    spacingY = LAYOUT_SPACING[DEFAULT_LAYOUT_MODE].y,
    excludeIds = new Set()
}) => {
    const position = normalizePosition(preferredPosition);
    let offset = 0;

    while (isPositionOccupied(nodes, { x: position.x, y: position.y + offset }, excludeIds)) {
        offset += spacingY;
    }

    return { x: position.x, y: position.y + offset };
};

export const getDirectChildIds = (edges = [], parentId) =>
    edges
        .filter((edge) => edge.source === parentId && edge.target)
        .map((edge) => edge.target);

export const getParentId = (edges = [], nodeId) =>
    edges.find((edge) => edge.target === nodeId)?.source || '';

export const getRootPosition = (nodes = []) =>
    firstOpenPosition({
        nodes,
        preferredPosition: {
            x: ROOT_SAFE_OFFSET.x + nodes.length * ROOT_SPACING.x,
            y: ROOT_SAFE_OFFSET.y + nodes.length * ROOT_SPACING.y
        },
        spacingY: ROOT_SPACING.y
    });

export const getViewportRootPosition = ({ nodes = [], position = {} } = {}) =>
    firstOpenPosition({
        nodes,
        preferredPosition: normalizePosition(position),
        spacingY: ROOT_SPACING.y
    });

export const getRootFocusViewport = ({
    position = {},
    viewport = {},
    width = 1280,
    height = 720
} = {}) => {
    const zoom = Math.min(Math.max(viewport?.zoom || 0.85, 0.65), 1);
    return {
        x: Math.max(320, width * 0.52) - (position.x || 0) * zoom,
        y: Math.max(170, height * 0.42) - (position.y || 0) * zoom,
        zoom
    };
};

export const getNodeDisplayState = (node = {}) => ({
    collapsed: Boolean(node.data?.display?.collapsed),
    layoutMode: normalizeLayoutMode(node.data?.display?.layoutMode)
});

export const getWorkspaceNodeData = (node = {}) => {
    const data = node.data || {};
    const legacyData = data.data && typeof data.data === 'object' ? data.data : {};
    const body = firstText(
        data.body,
        data.summary,
        legacyData.body,
        legacyData.summary,
        legacyData.summ
    );
    const title = firstText(
        data.title,
        legacyData.title,
        data.label,
        legacyData.label,
        data.question,
        legacyData.question,
        data.content,
        legacyData.content,
        data.summary,
        legacyData.summary,
        legacyData.summ,
        body,
        node.id,
        'Untitled node'
    );
    const sourceRefs = data.source_refs || legacyData.source_refs;

    return {
        title,
        body,
        nodeType:
            data.node_type ||
            legacyData.node_type ||
            data.component_type ||
            legacyData.component_type ||
            (node.type === WORKSPACE_NODE_TYPE || node.type === 'pdfResponse'
                ? 'concept'
                : node.type || 'concept'),
        status: data.status || legacyData.status || (data.manual ? 'needs_review' : 'ai_generated'),
        priority: data.priority || legacyData.priority || '',
        ownerId: data.owner_id || data.assignee || legacyData.owner_id || legacyData.assignee || '',
        dueDate: data.due_date || legacyData.due_date || '',
        confidence: data.confidence || legacyData.confidence || '',
        sourceRefs: Array.isArray(sourceRefs) ? sourceRefs.filter(Boolean) : [],
        externalRefs: Array.isArray(data.external_refs || legacyData.external_refs)
            ? data.external_refs || legacyData.external_refs
            : [],
        display: getNodeDisplayState(node),
        df: cloneDataFrame(data.df || legacyData.df),
        graph: cloneValue(data.graph || legacyData.graph, DEFAULT_GRAPH_DATA),
        query: data.query || legacyData.query || '',
        manual: Boolean(data.manual)
    };
};

const createLegacyResponseData = ({
    title,
    body,
    df = [],
    graph = DEFAULT_GRAPH_DATA,
    query = '',
    sourceRefs = []
}) => ({
    summ: body || title,
    query,
    df: cloneDataFrame(df),
    graph: cloneValue(graph, DEFAULT_GRAPH_DATA),
    source_refs: Array.isArray(sourceRefs) ? sourceRefs.filter(Boolean) : []
});

export const normalizeWorkspaceNode = (node = {}) => {
    if (!node || typeof node !== 'object') {
        return node;
    }
    if (node.type !== WORKSPACE_NODE_TYPE && node.type !== 'pdfResponse' && node.type !== 'custom') {
        return node;
    }

    const normalized = getWorkspaceNodeData(node);
    const nextData = {
        ...(node.data || {}),
        title: normalized.title,
        body: normalized.body,
        node_type: normalized.nodeType,
        status: normalized.status,
        priority: normalized.priority,
        owner_id: normalized.ownerId,
        due_date: normalized.dueDate,
        confidence: normalized.confidence,
        source_refs: normalized.sourceRefs,
        external_refs: normalized.externalRefs,
        display: normalized.display,
        manual: normalized.manual,
        data: createLegacyResponseData(normalized)
    };

    return {
        ...node,
        type: node.type === 'pdfResponse' ? 'pdfResponse' : WORKSPACE_NODE_TYPE,
        position: normalizePosition(node.position),
        data: nextData,
        deletable: node.deletable !== false,
        targetPosition: node.targetPosition || 'left',
        sourcePosition: node.sourcePosition || 'right'
    };
};

export const normalizeWorkspaceNodes = (nodes = []) =>
    Array.isArray(nodes) ? nodes.map(normalizeWorkspaceNode) : [];

export const getBranchPosition = ({
    nodes = [],
    edges = [],
    parentId,
    childId,
    childIndex,
    mode,
    direction = 'child'
} = {}) => {
    const parentNode = nodes.find((node) => node.id === parentId);
    const baseNode = parentNode || nodes.find((node) => node.id === childId);
    if (!baseNode) {
        return getRootPosition(nodes);
    }

    const layoutMode = normalizeLayoutMode(mode || parentNode?.data?.display?.layoutMode);
    const spacing = getSpacing(layoutMode);
    const childIds = getDirectChildIds(edges, parentId);
    const index =
        Number.isFinite(childIndex) && childIndex >= 0
            ? childIndex
            : childId
              ? Math.max(0, childIds.indexOf(childId))
              : childIds.length;
    const parentPosition = normalizePosition(parentNode?.position || baseNode.position);

    if (direction === 'sibling-above' || direction === 'sibling-below') {
        const delta = direction === 'sibling-above' ? -spacing.y : spacing.y;
        return firstOpenPosition({
            nodes,
            preferredPosition: {
                x: parentPosition.x,
                y: parentPosition.y + delta
            },
            spacingY: delta < 0 ? -spacing.y : spacing.y,
            excludeIds: new Set([childId].filter(Boolean))
        });
    }

    const xDirection =
        layoutMode === LAYOUT_MODES.BALANCED_MAP && index % 2 === 1 ? -1 : 1;
    const rowIndex =
        layoutMode === LAYOUT_MODES.BALANCED_MAP ? Math.floor(index / 2) : index;
    const centeredOffset =
        layoutMode === LAYOUT_MODES.VERTICAL_CHILDREN
            ? (index - Math.max(0, childIds.length - 1) / 2) * spacing.y
            : rowIndex * spacing.y;

    return firstOpenPosition({
        nodes,
        preferredPosition: {
            x: parentPosition.x + spacing.x * xDirection,
            y: parentPosition.y + centeredOffset
        },
        spacingY: spacing.y
    });
};

export const createWorkspaceNode = ({
    title = 'New node',
    nodeType = 'concept',
    position = { x: 0, y: 0 },
    df = [],
    status = 'needs_review',
    body = '',
    sourceRefs = [],
    display = {},
    id = nanoid()
} = {}) => ({
    id,
    type: WORKSPACE_NODE_TYPE,
    position: normalizePosition(position),
    data: {
        title,
        node_type: nodeType,
        status,
        body,
        manual: true,
        source_refs: Array.isArray(sourceRefs) ? sourceRefs : [],
        external_refs: [],
        display: {
            collapsed: Boolean(display.collapsed),
            layoutMode: normalizeLayoutMode(display.layoutMode)
        },
        data: createLegacyResponseData({ title, body, df, sourceRefs })
    },
    deletable: true,
    targetPosition: 'left',
    sourcePosition: 'right'
});

export const updateWorkspaceNode = (node, patch = {}) => {
    const nextData = {
        ...(node?.data || {}),
        ...(patch.data || {})
    };
    const nextDisplay = {
        ...(node?.data?.display || {}),
        ...(patch.display || patch.data?.display || {})
    };

    if (patch.title !== undefined) {
        nextData.title = patch.title;
        nextData.data = {
            ...(nextData.data || {}),
            summ: patch.title
        };
    }
    if (patch.nodeType !== undefined) {
        nextData.node_type = patch.nodeType;
    }
    if (patch.status !== undefined) {
        nextData.status = patch.status;
    }
    if (patch.body !== undefined) {
        nextData.body = patch.body;
    }
    if (patch.sourceRefs !== undefined) {
        nextData.source_refs = Array.isArray(patch.sourceRefs) ? patch.sourceRefs : [];
    }
    if (patch.externalRefs !== undefined) {
        nextData.external_refs = Array.isArray(patch.externalRefs) ? patch.externalRefs : [];
    }

    nextData.display = {
        collapsed: Boolean(nextDisplay.collapsed),
        layoutMode: normalizeLayoutMode(nextDisplay.layoutMode)
    };
    nextData.data = createLegacyResponseData({
        title: nextData.title || node?.id || 'Untitled node',
        body: nextData.body || nextData.summary || nextData.data?.summ || '',
        df: nextData.df || nextData.data?.df,
        graph: nextData.graph || nextData.data?.graph,
        query: nextData.query || nextData.data?.query,
        sourceRefs: nextData.source_refs
    });

    return {
        ...node,
        ...patch.node,
        position: patch.position ? normalizePosition(patch.position) : node.position,
        data: nextData
    };
};

export const createWorkspaceEdge = (source, target, options = {}) => ({
    id: options.id || nanoid(),
    source,
    target,
    type: options.type || getEdgeTypeForLayoutMode(options.layoutMode),
    animated: Boolean(options.animated)
});

export const normalizeWorkspaceEdges = (nodes = [], edges = []) => {
    const nodeLookup = new Map(normalizeWorkspaceNodes(nodes).map((node) => [node.id, node]));

    return Array.isArray(edges)
        ? edges
              .filter((edge) => edge?.source && edge?.target)
              .map((edge) => {
                  const sourceNode = nodeLookup.get(edge.source);
                  const layoutMode = sourceNode?.data?.display?.layoutMode;
                  return {
                      ...edge,
                      type: sourceNode
                          ? getEdgeTypeForLayoutMode(layoutMode)
                          : edge.type || 'smoothstep',
                      animated: Boolean(edge.animated)
                  };
              })
        : [];
};

export const layoutDirectChildren = ({
    nodes = [],
    edges = [],
    parentId,
    childIds = getDirectChildIds(edges, parentId),
    mode
} = {}) =>
    nodes.map((node) => {
        const childIndex = childIds.indexOf(node.id);
        if (childIndex === -1) {
            return node;
        }

        return {
            ...node,
            position: getBranchPosition({
                nodes,
                edges,
                parentId,
                childId: node.id,
                childIndex,
                mode
            })
        };
    });

export const getChildPosition = (nodes, edges, parentId) =>
    getBranchPosition({ nodes, edges, parentId });

export const getSiblingPosition = (nodes, nodeId, direction = 'below') => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) {
        return getRootPosition(nodes);
    }

    return getBranchPosition({
        nodes,
        parentId: nodeId,
        childId: nodeId,
        direction: direction === 'above' ? 'sibling-above' : 'sibling-below'
    });
};
