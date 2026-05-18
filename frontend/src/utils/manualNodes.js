import { nanoid } from 'nanoid';
import { normalizeNodeEmphasis } from './mapStyles.js';

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
const NODE_COLLISION_SPACING = { x: 340, y: 88 };
const NODE_LAYOUT_BOUNDS = { width: 340, height: 88, gapY: 64 };
const DEFAULT_GRAPH_DATA = {};
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

const isHierarchyEdge = (edge = {}) => HIERARCHY_EDGE_TYPES.has(edgeRelationshipType(edge));

export const getNodeTitle = (node) =>
    node?.data?.title ||
    node?.data?.data?.summ ||
    node?.data?.question ||
    node?.id ||
    'Untitled node';

const cloneDataFrame = (df) => (Array.isArray(df) ? structuredClone(df) : []);

const cloneValue = (value, fallback) =>
    value !== undefined && value !== null ? structuredClone(value) : fallback;

const cloneArray = (value) => (Array.isArray(value) ? structuredClone(value).filter(Boolean) : []);

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

const overlapsNodeBox = (a = {}, b = {}) =>
    Math.abs((a.x || 0) - (b.x || 0)) < NODE_COLLISION_SPACING.x &&
    Math.abs((a.y || 0) - (b.y || 0)) < NODE_COLLISION_SPACING.y;

const isPositionOccupied = (nodes, position, excludeIds = new Set()) =>
    nodes.some(
        (node) =>
            !excludeIds.has(node.id) &&
            (samePosition(node.position, position) || overlapsNodeBox(node.position, position))
    );

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
        .filter((edge) => edge.source === parentId && edge.target && isHierarchyEdge(edge))
        .map((edge) => edge.target);

export const getParentId = (edges = [], nodeId) =>
    edges.find((edge) => edge.target === nodeId && isHierarchyEdge(edge))?.source || '';

export const collectBranchNodeIds = (edges = [], rootId = '') => {
    const root = String(rootId || '').trim();
    if (!root) {
        return new Set();
    }
    const childrenByParent = new Map();
    edges.forEach((edge) => {
        if (!edge?.source || !edge?.target || !isHierarchyEdge(edge)) {
            return;
        }
        childrenByParent.set(edge.source, [...(childrenByParent.get(edge.source) || []), edge.target]);
    });

    const ids = new Set([root]);
    const queue = [root];
    while (queue.length) {
        const parentId = queue.shift();
        (childrenByParent.get(parentId) || []).forEach((childId) => {
            if (ids.has(childId)) {
                return;
            }
            ids.add(childId);
            queue.push(childId);
        });
    }
    return ids;
};

const nodeBounds = (node = {}) => {
    const position = normalizePosition(node.position);
    return {
        left: position.x,
        right: position.x + NODE_LAYOUT_BOUNDS.width,
        top: position.y,
        bottom: position.y + NODE_LAYOUT_BOUNDS.height
    };
};

const mergeBounds = (bounds = []) => {
    const validBounds = bounds.filter(Boolean);
    if (!validBounds.length) {
        return null;
    }
    return validBounds.reduce(
        (merged, item) => ({
            left: Math.min(merged.left, item.left),
            right: Math.max(merged.right, item.right),
            top: Math.min(merged.top, item.top),
            bottom: Math.max(merged.bottom, item.bottom)
        }),
        validBounds[0]
    );
};

export const getNodeIdsBounds = (nodes = [], nodeIds = new Set()) =>
    mergeBounds(nodes.filter((node) => nodeIds.has(node.id)).map(nodeBounds));

const shiftNodeIdsY = (nodes = [], nodeIds = new Set(), deltaY = 0) =>
    deltaY
        ? nodes.map((node) =>
              nodeIds.has(node.id)
                  ? {
                        ...node,
                        position: {
                            ...normalizePosition(node.position),
                            y: normalizePosition(node.position).y + deltaY
                        }
                    }
                  : node
          )
        : nodes;

export const reflowSiblingSubtrees = ({
    nodes = [],
    edges = [],
    parentId = '',
    anchorNodeId = '',
    compact = false
} = {}) => {
    const childIds = getDirectChildIds(edges, parentId).filter((childId) =>
        nodes.some((node) => node.id === childId)
    );
    if (childIds.length < 2) {
        return nodes;
    }

    const anchorIndex = anchorNodeId ? childIds.indexOf(anchorNodeId) : 0;
    const startIndex = anchorIndex >= 0 ? anchorIndex : 0;
    let nextNodes = nodes;
    let previousBounds = null;

    childIds.forEach((childId, index) => {
        const subtreeIds = collectBranchNodeIds(edges, childId);
        let subtreeBounds = getNodeIdsBounds(nextNodes, subtreeIds);
        if (!subtreeBounds) {
            return;
        }

        if (!previousBounds || index < startIndex) {
            previousBounds = subtreeBounds;
            return;
        }

        const desiredTop = previousBounds.bottom + NODE_LAYOUT_BOUNDS.gapY;
        const deltaY = desiredTop - subtreeBounds.top;
        if (deltaY > 0 || (compact && deltaY < 0)) {
            nextNodes = shiftNodeIdsY(nextNodes, subtreeIds, deltaY);
            subtreeBounds = {
                ...subtreeBounds,
                top: subtreeBounds.top + deltaY,
                bottom: subtreeBounds.bottom + deltaY
            };
        }
        previousBounds = subtreeBounds;
    });

    return nextNodes;
};

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
    layoutMode: normalizeLayoutMode(node.data?.display?.layoutMode),
    emphasis: normalizeNodeEmphasis(node.data?.display?.emphasis)
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
    const generatedArtifacts = data.generated_artifacts || legacyData.generated_artifacts;
    const artifactIds = data.artifact_ids || legacyData.artifact_ids;

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
        artifactType: data.artifact_type || legacyData.artifact_type || '',
        artifactIds: cloneArray(artifactIds),
        reviewState: data.review_state || legacyData.review_state || '',
        generatedArtifacts: cloneArray(generatedArtifacts),
        metadata: cloneValue(data.metadata || legacyData.metadata, {}),
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
    sourceRefs = [],
    artifactType = '',
    artifactIds = [],
    reviewState = '',
    generatedArtifacts = [],
    metadata = {}
}) => ({
    summ: body || title,
    query,
    df: cloneDataFrame(df),
    graph: cloneValue(graph, DEFAULT_GRAPH_DATA),
    source_refs: Array.isArray(sourceRefs) ? sourceRefs.filter(Boolean) : [],
    artifact_type: artifactType,
    artifact_ids: cloneArray(artifactIds),
    review_state: reviewState,
    generated_artifacts: cloneArray(generatedArtifacts),
    metadata: cloneValue(metadata, {})
});

const isSemanticWorkspaceQuestionNode = (node = {}) => {
    if (node.type !== 'question') {
        return false;
    }

    const data = node.data || {};
    const legacyData = data.data && typeof data.data === 'object' ? data.data : {};
    return Boolean(
        data.node_type === 'question' ||
            legacyData.node_type === 'question' ||
            data.title ||
            legacyData.title ||
            data.summary ||
            legacyData.summary ||
            data.body ||
            legacyData.body ||
            data.source_refs ||
            legacyData.source_refs
    );
};

export const normalizeWorkspaceNode = (node = {}) => {
    if (!node || typeof node !== 'object') {
        return node;
    }
    const shouldNormalize =
        node.type === WORKSPACE_NODE_TYPE ||
        node.type === 'pdfResponse' ||
        node.type === 'custom' ||
        isSemanticWorkspaceQuestionNode(node);
    if (!shouldNormalize) {
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
        artifact_type: normalized.artifactType,
        artifact_ids: normalized.artifactIds,
        review_state: normalized.reviewState,
        generated_artifacts: normalized.generatedArtifacts,
        metadata: normalized.metadata,
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
    graph = DEFAULT_GRAPH_DATA,
    query = '',
    status = 'needs_review',
    body = '',
    sourceRefs = [],
    artifactType = '',
    artifactIds = [],
    reviewState = '',
    generatedArtifacts = [],
    metadata = {},
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
        artifact_type: artifactType,
        artifact_ids: cloneArray(artifactIds),
        review_state: reviewState,
        generated_artifacts: cloneArray(generatedArtifacts),
        metadata: cloneValue(metadata, {}),
        external_refs: [],
        display: {
            collapsed: Boolean(display.collapsed),
            layoutMode: normalizeLayoutMode(display.layoutMode),
            emphasis: normalizeNodeEmphasis(display.emphasis)
        },
        data: createLegacyResponseData({
            title,
            body,
            df,
            graph,
            query,
            sourceRefs,
            artifactType,
            artifactIds,
            reviewState,
            generatedArtifacts,
            metadata
        })
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
        layoutMode: normalizeLayoutMode(nextDisplay.layoutMode),
        emphasis: normalizeNodeEmphasis(nextDisplay.emphasis)
    };
    nextData.data = createLegacyResponseData({
        title: nextData.title || node?.id || 'Untitled node',
        body: nextData.body || nextData.summary || nextData.data?.summ || '',
        df: nextData.df || nextData.data?.df,
        graph: nextData.graph || nextData.data?.graph,
        query: nextData.query || nextData.data?.query,
        sourceRefs: nextData.source_refs,
        artifactType: nextData.artifact_type || nextData.data?.artifact_type,
        artifactIds: nextData.artifact_ids || nextData.data?.artifact_ids,
        reviewState: nextData.review_state || nextData.data?.review_state,
        generatedArtifacts: nextData.generated_artifacts || nextData.data?.generated_artifacts,
        metadata: nextData.metadata || nextData.data?.metadata
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
    animated: Boolean(options.animated),
    ...(options.relationship_type ? { relationship_type: options.relationship_type } : {}),
    ...(options.label ? { label: options.label } : {}),
    ...(options.branch_label ? { branch_label: options.branch_label } : {}),
    ...(options.condition ? { condition: options.condition } : {}),
    ...(options.metadata && typeof options.metadata === 'object' ? { metadata: cloneValue(options.metadata, {}) } : {}),
    data: {
        ...(options.data && typeof options.data === 'object' ? options.data : {}),
        ...(options.relationship_type ? { relationship_type: options.relationship_type } : {}),
        ...(options.label ? { label: options.label } : {}),
        ...(options.branch_label ? { branch_label: options.branch_label } : {}),
        ...(options.condition ? { condition: options.condition } : {})
    }
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
