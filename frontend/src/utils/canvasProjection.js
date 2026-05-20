import {
    KG_RELATIONSHIP_MODE_OPTIONS,
    KG_RELATIONSHIP_MODES,
    getKgRelationshipSummary,
    shouldShowKgSemanticEdge
} from './kgRelationshipFilters.js';
import { normalizeMapStyle } from './mapStyles.js';

export const MINDMAP_RELATIONSHIP_MODES = {
    OFF: 'off'
};

export const MINDMAP_RELATIONSHIP_MODE_OPTIONS = [
    {
        id: MINDMAP_RELATIONSHIP_MODES.OFF,
        label: 'Structure Only',
        shortLabel: 'Map',
        description: 'Show the readable mind map backbone without semantic relationship labels.'
    },
    ...KG_RELATIONSHIP_MODE_OPTIONS.filter((option) =>
        [
            KG_RELATIONSHIP_MODES.INSIGHTS,
            KG_RELATIONSHIP_MODES.EXECUTION,
            KG_RELATIONSHIP_MODES.RISKS,
            KG_RELATIONSHIP_MODES.DEPENDENCIES,
            KG_RELATIONSHIP_MODES.EVIDENCE,
            KG_RELATIONSHIP_MODES.ALL
        ].includes(option.id)
    )
];

const TASK_CANVAS_TYPES = new Set([
    'task',
    'procedure',
    'workflow',
    'step',
    'decision',
    'dependency',
    'requirement',
    'needs_review'
]);

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

export const nodeData = (node) => node?.data || {};

export const nodeSourceRefs = (node) => {
    const data = nodeData(node);
    return Array.isArray(data.source_refs)
        ? data.source_refs
        : Array.isArray(data.data?.source_refs)
          ? data.data.source_refs
          : [];
};

const hasSourceEvidence = (ref) =>
    Boolean(
        ref?.document_id ||
            ref?.source_type ||
            ref?.query_id ||
            ref?.table_name ||
            ref?.database_id ||
            ref?.result_hash
    );

const nodeTypeValue = (node) => {
    const data = nodeData(node);
    return data.node_type || node.type || '';
};

const humanizeRelationship = (value = '') =>
    String(value || 'relationship')
        .replaceAll('_', ' ')
        .replaceAll('-', ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());

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

export const isHierarchyEdge = (edge = {}) => HIERARCHY_EDGE_TYPES.has(edgeRelationshipType(edge));

const formatEdgeConfidence = (confidence) => {
    if (confidence === undefined || confidence === null || confidence === '') {
        return '';
    }
    const numeric = Number(confidence);
    if (Number.isFinite(numeric)) {
        const normalized = numeric > 1 ? numeric : numeric * 100;
        return `${Math.round(normalized)}%`;
    }
    return String(confidence);
};

const edgeSemanticTone = (relationshipType = '') => {
    if (/conflict|contradict|risk|block/.test(relationshipType)) {
        return 'conflict';
    }
    if (/depend|requires|prerequisite|blocked_by|blocks/.test(relationshipType)) {
        return 'dependency';
    }
    if (/support|evidence|source|proves|validates|cites/.test(relationshipType)) {
        return 'evidence';
    }
    if (/duplicate|overlap|similar|same/.test(relationshipType)) {
        return 'overlap';
    }
    return 'related';
};

const edgeSemanticInfo = (edge = {}) => {
    const relationshipType = edgeRelationshipType(edge);
    const isHierarchy = HIERARCHY_EDGE_TYPES.has(relationshipType);
    const kgSummary = getKgRelationshipSummary(edge);
    const confidence = formatEdgeConfidence(
        edge.confidence || edge.data?.confidence || edge.metadata?.confidence
    );
    const rationale =
        edge.data?.rationale ||
        edge.metadata?.rationale ||
        edge.rationale ||
        edge.data?.source_signal ||
        '';
    const label = isHierarchy
        ? 'Structure'
        : [kgSummary.relationship_label || humanizeRelationship(relationshipType), confidence].filter(Boolean).join(' / ');
    return {
        relationship_type: relationshipType || 'contains',
        kind: isHierarchy ? 'hierarchy' : 'relationship',
        family: kgSummary.family,
        familyLabel: kgSummary.family_label,
        tone: isHierarchy ? 'hierarchy' : edgeSemanticTone(relationshipType),
        label,
        confidence,
        rationale,
        tooltip: [
            isHierarchy ? 'Hierarchy edge: structure' : `Relationship edge: ${humanizeRelationship(relationshipType)}`,
            confidence ? `Confidence: ${confidence}` : '',
            rationale ? `Rationale: ${rationale}` : ''
        ]
            .filter(Boolean)
            .join('\n')
    };
};

const CANVAS_OUT_OF_SCOPE_NODE_CLASS = 'canvas-node-out-of-scope';
const CANVAS_OUT_OF_SCOPE_EDGE_CLASS = 'canvas-edge-out-of-scope';
const CANVAS_BRANCH_SCOPE_NODE_CLASS = 'canvas-node-in-branch-scope';
const CANVAS_BRANCH_ROOT_NODE_CLASS = 'canvas-node-branch-root';
const CANVAS_BRANCH_SCOPE_EDGE_CLASS = 'canvas-edge-in-branch-scope';
const CANVAS_MINDMAP_STRUCTURE_EDGE_CLASS = 'canvas-edge-mindmap-structure';
const CANVAS_MINDMAP_INFERRED_EDGE_CLASS = 'canvas-edge-mindmap-inferred';
const CANVAS_MINDMAP_RELATIONSHIP_EDGE_CLASS = 'canvas-edge-mindmap-relationship';
const CANVAS_BRANCH_COLOR_PREFIX = 'canvas-branch-color-';
const CANVAS_BRANCH_COLOR_COUNT = 6;

export const buildKgRelationshipModeCounts = (edges = []) =>
    Object.fromEntries(
        KG_RELATIONSHIP_MODE_OPTIONS.map((option) => [
            option.id,
            edges.filter((edge) =>
                shouldShowKgSemanticEdge(edge, option.id, { includeHierarchy: false })
            ).length
        ])
    );

export const truncateInsightText = (value = '', maxLength = 132) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength - 1).trim()}...`;
};

export const kgNodeTitle = (node = {}) => {
    const data = nodeData(node);
    return (
        data.title ||
        data.label ||
        data.content ||
        data.body ||
        data.summary ||
        data.data?.title ||
        data.data?.summ ||
        node.id ||
        'Untitled'
    );
};

const numericEdgeConfidence = (edge = {}) => {
    const value = edge.confidence || edge.data?.confidence || edge.metadata?.confidence;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
};

const KG_INSIGHT_FAMILY_PRIORITY = {
    risks: 0,
    dependencies: 1,
    approvals: 2,
    ownership: 3,
    metrics: 4,
    evidence: 5,
    related: 6
};

export const buildKgTopInsights = ({ nodes = [], edges = [], mode = KG_RELATIONSHIP_MODES.INSIGHTS, limit = 4 } = {}) => {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    return edges
        .filter((edge) =>
            shouldShowKgSemanticEdge(edge, mode, { includeHierarchy: false })
        )
        .filter((edge) => edge.id && nodeById.has(edge.source) && nodeById.has(edge.target))
        .map((edge) => {
            const summary = getKgRelationshipSummary(edge);
            const sourceTitle = kgNodeTitle(nodeById.get(edge.source));
            const targetTitle = kgNodeTitle(nodeById.get(edge.target));
            const rationale =
                edge.data?.rationale ||
                edge.metadata?.rationale ||
                edge.rationale ||
                edge.data?.source_signal ||
                '';
            return {
                id: edge.id,
                family: summary.family,
                familyLabel: summary.family_short_label || summary.family_label,
                relationship: summary.relationship_label,
                sourceTitle,
                targetTitle,
                confidence: numericEdgeConfidence(edge),
                rationale: truncateInsightText(rationale)
            };
        })
        .sort(
            (left, right) =>
                (KG_INSIGHT_FAMILY_PRIORITY[left.family] ?? 9) -
                    (KG_INSIGHT_FAMILY_PRIORITY[right.family] ?? 9) ||
                right.confidence - left.confidence ||
                left.sourceTitle.localeCompare(right.sourceTitle)
        )
        .slice(0, limit);
};

const scopedClassName = (className = '', scopeClass, isActive) => {
    const classes = String(className || '')
        .split(/\s+/)
        .filter(
            (value) =>
                value &&
                value !== CANVAS_OUT_OF_SCOPE_NODE_CLASS &&
                value !== CANVAS_BRANCH_SCOPE_NODE_CLASS &&
                value !== CANVAS_BRANCH_ROOT_NODE_CLASS &&
                !value.startsWith(CANVAS_BRANCH_COLOR_PREFIX) &&
                !value.startsWith('canvas-node-density-') &&
                value !== CANVAS_OUT_OF_SCOPE_EDGE_CLASS
        );
    if (isActive) {
        classes.push(scopeClass);
    }
    return classes.join(' ') || undefined;
};

const canvasEdgeClassName = ({
    className = '',
    isOutOfScope = false,
    isBranchScope = false,
    semantic,
    activeCanvasView,
    showSemanticStyling = activeCanvasView === 'knowledgeGraph'
}) => {
    const classes = String(className || '')
        .split(/\s+/)
        .filter(
            (value) =>
                value &&
                value !== CANVAS_OUT_OF_SCOPE_EDGE_CLASS &&
                value !== CANVAS_BRANCH_SCOPE_EDGE_CLASS &&
                !value.startsWith('semantic-edge-') &&
                value !== 'semantic-edge'
        );
    if (isOutOfScope) {
        classes.push(CANVAS_OUT_OF_SCOPE_EDGE_CLASS);
    }
    if (isBranchScope) {
        classes.push(CANVAS_BRANCH_SCOPE_EDGE_CLASS);
    }
    if (showSemanticStyling && semantic) {
        classes.push('semantic-edge');
        classes.push(
            semantic.kind === 'hierarchy'
                ? 'semantic-edge-hierarchy'
                : 'semantic-edge-relationship'
        );
        classes.push(`semantic-edge-${semantic.tone || 'related'}`);
    }
    return classes.join(' ') || undefined;
};

const isHierarchyCanvasEdge = (edge = {}) => HIERARCHY_EDGE_TYPES.has(edgeRelationshipType(edge));

const edgeAxisScore = (edge = {}, nodeById = new Map()) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) {
        return 0;
    }
    const sourceX = Number(source.position?.x || 0);
    const sourceY = Number(source.position?.y || 0);
    const targetX = Number(target.position?.x || 0);
    const targetY = Number(target.position?.y || 0);
    const dx = targetX - sourceX;
    const dy = Math.abs(targetY - sourceY);
    if (dx < -40) {
        return -180 + dx;
    }
    return Math.min(dx, 520) - dy * 0.08;
};

const wouldCreateTreeCycle = (sourceId, targetId, parentByNode) => {
    let current = sourceId;
    const seen = new Set([targetId]);
    while (current) {
        if (seen.has(current)) {
            return true;
        }
        seen.add(current);
        current = parentByNode.get(current);
    }
    return false;
};

export const buildMindmapStructureEdgeIds = (nodes = [], edges = []) => {
    const nodeIds = new Set(nodes.map((node) => node.id));
    const validEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    const explicitHierarchyEdges = validEdges.filter(isHierarchyCanvasEdge);
    if (explicitHierarchyEdges.length > 0) {
        return new Set(explicitHierarchyEdges.map((edge) => edge.id));
    }

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const incomingByTarget = validEdges.reduce((lookup, edge) => {
        lookup.set(edge.target, [...(lookup.get(edge.target) || []), edge]);
        return lookup;
    }, new Map());
    const parentByNode = new Map();
    const selectedEdgeIds = new Set();
    const targets = [...incomingByTarget.keys()].sort((left, right) => {
        const leftNode = nodeById.get(left);
        const rightNode = nodeById.get(right);
        return (
            Number(leftNode?.position?.x || 0) - Number(rightNode?.position?.x || 0) ||
            Number(leftNode?.position?.y || 0) - Number(rightNode?.position?.y || 0)
        );
    });

    targets.forEach((targetId) => {
        const candidates = (incomingByTarget.get(targetId) || [])
            .map((edge, index) => ({ edge, index, score: edgeAxisScore(edge, nodeById) }))
            .sort((left, right) => right.score - left.score || left.index - right.index);
        const selected = candidates.find(
            ({ edge }) => !wouldCreateTreeCycle(edge.source, edge.target, parentByNode)
        )?.edge;
        if (selected) {
            parentByNode.set(selected.target, selected.source);
            selectedEdgeIds.add(selected.id);
        }
    });

    return selectedEdgeIds;
};

const edgeMatchesCanvasLens = (edge, activeCanvasView) => {
    const relationshipType = edgeRelationshipType(edge);
    const isHierarchy = isHierarchyCanvasEdge(edge);

    if (activeCanvasView === 'mindmap') {
        return isHierarchy;
    }
    if (activeCanvasView === 'knowledgeGraph') {
        return true;
    }
    if (activeCanvasView === 'flowchart') {
        return (
            isHierarchy ||
            /depend|requires|prerequisite|blocked_by|blocks|handoff|process|sequence|next|precedes|decision/.test(
                relationshipType
            )
        );
    }

    return isHierarchy;
};

const buildKgFocusNodeIds = (edges = [], focusNodeIds = []) => {
    const originalFocusIds = new Set(focusNodeIds.filter(Boolean));
    const visibleIds = new Set(originalFocusIds);
    if (originalFocusIds.size === 0) {
        return visibleIds;
    }

    edges.forEach((edge) => {
        if (originalFocusIds.has(edge.source)) {
            visibleIds.add(edge.target);
        }
        if (originalFocusIds.has(edge.target)) {
            visibleIds.add(edge.source);
        }
    });
    return visibleIds;
};

const buildNodeDepths = (nodes = [], edges = []) => {
    const nodeIds = new Set(nodes.map((node) => node.id));
    const validEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    const explicitHierarchyEdges = validEdges.filter((edge) => HIERARCHY_EDGE_TYPES.has(edgeRelationshipType(edge)));
    const structuralEdgeIds =
        explicitHierarchyEdges.length > 0
            ? new Set(explicitHierarchyEdges.map((edge) => edge.id))
            : buildMindmapStructureEdgeIds(nodes, edges);
    const childIds = new Set();
    const childrenByParent = validEdges.reduce((lookup, edge) => {
        if (!structuralEdgeIds.has(edge.id)) {
            return lookup;
        }
        childIds.add(edge.target);
        const children = lookup.get(edge.source) || [];
        children.push(edge.target);
        lookup.set(edge.source, children);
        return lookup;
    }, new Map());
    const roots = nodes
        .map((node) => node.id)
        .filter((nodeId) => !childIds.has(nodeId));
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

const sortedNodeIdsByPosition = (nodeIds = [], nodeById = new Map()) =>
    [...nodeIds].sort((left, right) => {
        const leftNode = nodeById.get(left);
        const rightNode = nodeById.get(right);
        return (
            Number(leftNode?.position?.x || 0) - Number(rightNode?.position?.x || 0) ||
            Number(leftNode?.position?.y || 0) - Number(rightNode?.position?.y || 0) ||
            String(left).localeCompare(String(right))
        );
    });

export const buildBranchColorAssignments = (nodes = [], edges = [], structuralEdgeIds = new Set()) => {
    if (!nodes.length || !structuralEdgeIds.size) {
        return { nodeColors: new Map(), edgeColors: new Map(), branchRoots: [] };
    }

    const nodeIds = new Set(nodes.map((node) => node.id));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const structuralEdges = edges.filter(
        (edge) => structuralEdgeIds.has(edge.id) && nodeIds.has(edge.source) && nodeIds.has(edge.target)
    );
    const childrenByParent = structuralEdges.reduce((lookup, edge) => {
        const children = lookup.get(edge.source) || [];
        children.push(edge.target);
        lookup.set(edge.source, children);
        return lookup;
    }, new Map());
    const edgeByParentChild = structuralEdges.reduce((lookup, edge) => {
        lookup.set(`${edge.source}->${edge.target}`, edge.id);
        return lookup;
    }, new Map());
    const childIds = new Set(structuralEdges.map((edge) => edge.target));
    const roots = sortedNodeIdsByPosition(
        nodes.map((node) => node.id).filter((nodeId) => !childIds.has(nodeId)),
        nodeById
    );
    const nodeColors = new Map();
    const edgeColors = new Map();
    const branchRoots = [];
    let nextColor = 0;

    const paintBranch = (startId, colorIndex) => {
        const queue = [startId];
        while (queue.length) {
            const nodeId = queue.shift();
            if (nodeColors.has(nodeId)) {
                continue;
            }
            nodeColors.set(nodeId, colorIndex);
            (childrenByParent.get(nodeId) || []).forEach((childId) => {
                const edgeId = edgeByParentChild.get(`${nodeId}->${childId}`);
                if (edgeId) {
                    edgeColors.set(edgeId, colorIndex);
                }
                queue.push(childId);
            });
        }
    };

    roots.forEach((rootId) => {
        let anchorId = rootId;
        const trunkColor = nextColor % CANVAS_BRANCH_COLOR_COUNT;
        nodeColors.set(anchorId, trunkColor);

        while ((childrenByParent.get(anchorId) || []).length === 1) {
            const childId = childrenByParent.get(anchorId)[0];
            const edgeId = edgeByParentChild.get(`${anchorId}->${childId}`);
            if (edgeId) {
                edgeColors.set(edgeId, trunkColor);
            }
            nodeColors.set(childId, trunkColor);
            anchorId = childId;
        }

        const children = sortedNodeIdsByPosition(childrenByParent.get(anchorId) || [], nodeById);
        if (!children.length) {
            branchRoots.push({ nodeId: anchorId, colorIndex: trunkColor });
            nextColor += 1;
            return;
        }
        children.forEach((childId) => {
            const colorIndex = nextColor % CANVAS_BRANCH_COLOR_COUNT;
            const edgeId = edgeByParentChild.get(`${anchorId}->${childId}`);
            if (edgeId) {
                edgeColors.set(edgeId, colorIndex);
            }
            branchRoots.push({ nodeId: childId, colorIndex });
            paintBranch(childId, colorIndex);
            nextColor += 1;
        });
    });

    return { nodeColors, edgeColors, branchRoots };
};

const collectVisibleBranchIds = (nodes, edges, selectedBranchId) => {
    if (!selectedBranchId) {
        return new Set(nodes.map((node) => node.id));
    }

    const nodeIds = new Set(nodes.map((node) => node.id));
    const validEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    const explicitHierarchyEdges = validEdges.filter((edge) => HIERARCHY_EDGE_TYPES.has(edgeRelationshipType(edge)));
    const structuralEdgeIds =
        explicitHierarchyEdges.length > 0
            ? new Set(explicitHierarchyEdges.map((edge) => edge.id))
            : buildMindmapStructureEdgeIds(nodes, edges);
    const childrenByParent = edges
        .filter((edge) => structuralEdgeIds.has(edge.id))
        .reduce((children, edge) => {
            const next = children.get(edge.source) || [];
            next.push(edge.target);
            children.set(edge.source, next);
            return children;
        }, new Map());
    const visibleIds = new Set([selectedBranchId]);
    const queue = [selectedBranchId];
    while (queue.length > 0) {
        const current = queue.shift();
        (childrenByParent.get(current) || []).forEach((childId) => {
            if (!visibleIds.has(childId)) {
                visibleIds.add(childId);
                queue.push(childId);
            }
        });
    }
    return visibleIds;
};

const nodeMatchesCanvasLens = (node, activeCanvasView) => {
    const data = nodeData(node);
    const type = nodeTypeValue(node);
    if (activeCanvasView === 'tasks') {
        return TASK_CANVAS_TYPES.has(type);
    }
    if (activeCanvasView === 'table') {
        return Boolean(data.table_rows?.length || data.table_columns?.length || data.data?.df?.length);
    }
    if (activeCanvasView === 'knowledgeGraph') {
        return node.type !== 'dataSource';
    }
    return true;
};

const nodeMatchesGraphFilter = (node, filterId) => {
    const data = nodeData(node);
    const type = nodeTypeValue(node);
    const sourceRefs = nodeSourceRefs(node);

    if (filterId === 'source-backed') {
        return sourceRefs.some(hasSourceEvidence);
    }
    if (filterId === 'needs-review') {
        return data.status === 'needs_review' || type === 'needs_review';
    }
    if (filterId === 'manual') {
        return Boolean(data.manual);
    }
    if (filterId === 'ai-generated') {
        return !data.manual && data.status !== 'approved' && data.status !== 'reviewed';
    }
    if (filterId === 'tasks-only') {
        return TASK_CANVAS_TYPES.has(type);
    }
    if (filterId === 'unassigned') {
        return TASK_CANVAS_TYPES.has(type) && !data.owner_id;
    }
    if (filterId === 'missing-due-date') {
        return TASK_CANVAS_TYPES.has(type) && !data.due_date;
    }
    if (filterId === 'missing-source') {
        return node.type !== 'dataSource' && !sourceRefs.some(hasSourceEvidence);
    }
    if (filterId === 'low-confidence') {
        const confidence = Number(data.confidence);
        return data.confidence !== '' && Number.isFinite(confidence) && confidence < 0.6;
    }
    if (filterId === 'hidden-from-export') {
        return Boolean(data.hidden_from_export);
    }
    return true;
};

export const projectCanvasGraph = ({
    nodes,
    edges,
    activeCanvasView,
    activeGraphFilters,
    selectedBranchId,
    canvasNodeDensity,
    mapStyle,
    kgRelationshipMode = KG_RELATIONSHIP_MODES.INSIGHTS,
    mindmapRelationshipMode = MINDMAP_RELATIONSHIP_MODES.OFF,
    kgFocusNodeIds = []
}) => {
    const hasBranchScope = Boolean(selectedBranchId);
    const branchIds = collectVisibleBranchIds(nodes, edges, selectedBranchId);
    const filters = Array.isArray(activeGraphFilters) ? activeGraphFilters : [];
    const normalizedMapStyle = normalizeMapStyle(mapStyle);
    const nodeDepths = buildNodeDepths(nodes, edges);
    const isKnowledgeGraph = activeCanvasView === 'knowledgeGraph';
    const isMindmap = activeCanvasView === 'mindmap';
    const mindmapStructureEdgeIds = isMindmap
        ? buildMindmapStructureEdgeIds(nodes, edges)
        : new Set();
    const branchColorAssignments = isMindmap
        ? buildBranchColorAssignments(nodes, edges, mindmapStructureEdgeIds)
        : { nodeColors: new Map(), edgeColors: new Map() };
    const shouldShowMindmapRelationships =
        isMindmap && mindmapRelationshipMode !== MINDMAP_RELATIONSHIP_MODES.OFF;
    const visibleEdges = edges
        .filter((edge) => {
            if (!isMindmap) {
                return edgeMatchesCanvasLens(edge, activeCanvasView);
            }
            if (mindmapStructureEdgeIds.has(edge.id)) {
                return true;
            }
            return (
                shouldShowMindmapRelationships &&
                shouldShowKgSemanticEdge(edge, mindmapRelationshipMode, { includeHierarchy: false })
            );
        })
        .filter((edge) =>
            isKnowledgeGraph
                ? shouldShowKgSemanticEdge(edge, kgRelationshipMode, { includeHierarchy: true })
                : true
        );
    const kgFocusIds = isKnowledgeGraph
        ? buildKgFocusNodeIds(visibleEdges, kgFocusNodeIds)
        : new Set();
    const hasKgFocus = isKnowledgeGraph && kgFocusIds.size > 0;
    const projectedIds = new Set(
        nodes
            .filter((node) => nodeMatchesCanvasLens(node, activeCanvasView))
            .filter((node) => filters.every((filterId) => nodeMatchesGraphFilter(node, filterId)))
            .map((node) => node.id)
    );

    return {
        nodes: nodes.map((node) => {
            const isProjected = projectedIds.has(node.id);
            const isOutOfScope = hasBranchScope && !branchIds.has(node.id);
            const densityClass = canvasNodeDensity
                ? `canvas-node-density-${canvasNodeDensity}`
                : 'canvas-node-density-compact';
            const nextClassName = scopedClassName(
                node.className,
                CANVAS_OUT_OF_SCOPE_NODE_CLASS,
                isProjected && isOutOfScope
            );
            const kgMutedClass = hasKgFocus && isProjected && !kgFocusIds.has(node.id)
                ? 'kg-node-muted'
                : '';
            const emphasis = node.data?.display?.emphasis || '';
            const emphasisClass = emphasis ? `canvas-node-emphasis-${emphasis}` : '';
            const branchScopeClass =
                hasBranchScope && isProjected && branchIds.has(node.id)
                    ? CANVAS_BRANCH_SCOPE_NODE_CLASS
                    : '';
            const branchRootClass =
                hasBranchScope && node.id === selectedBranchId
                    ? CANVAS_BRANCH_ROOT_NODE_CLASS
                    : '';
            const branchColor = branchColorAssignments.nodeColors.get(node.id);
            const branchColorClass =
                isMindmap && branchColor !== undefined
                    ? `${CANVAS_BRANCH_COLOR_PREFIX}${branchColor}`
                    : '';
            const depth = nodeDepths.get(node.id) || 0;
            const depthClass =
                normalizedMapStyle.hierarchy === 'depth'
                    ? `canvas-node-depth-${Math.min(depth, 3)}`
                    : '';
            return {
                ...node,
                hidden: !isProjected,
                className: [
                    nextClassName,
                    densityClass,
                    kgMutedClass,
                    emphasisClass,
                    branchScopeClass,
                    branchRootClass,
                    branchColorClass,
                    depthClass
                ]
                    .filter(Boolean)
                    .join(' ')
            };
        }),
        edges: visibleEdges.map((edge) => {
            const isProjected = projectedIds.has(edge.source) && projectedIds.has(edge.target);
            const isOutOfScope =
                hasBranchScope && (!branchIds.has(edge.source) || !branchIds.has(edge.target));
            const semantic = edgeSemanticInfo(edge);
            const isKgMuted =
                hasKgFocus && !kgFocusIds.has(edge.source) && !kgFocusIds.has(edge.target);
            const isMindmapStructureEdge = isMindmap && mindmapStructureEdgeIds.has(edge.id);
            const isMindmapRelationshipEdge = isMindmap && !isMindmapStructureEdge;
            const isMindmapInferredEdge = isMindmapStructureEdge && !isHierarchyCanvasEdge(edge);
            const showSemanticEdge = isKnowledgeGraph || isMindmapRelationshipEdge;
            const branchColor = branchColorAssignments.edgeColors.get(edge.id);
            const branchColorClass =
                isMindmap && branchColor !== undefined
                    ? `${CANVAS_BRANCH_COLOR_PREFIX}${branchColor}`
                    : '';
            return {
                ...edge,
                type: showSemanticEdge
                    ? 'semantic'
                    : isMindmapStructureEdge
                      ? 'smoothstep'
                      : edge.type || 'smoothstep',
                label: isKnowledgeGraph ? semantic.label : isMindmap ? undefined : edge.label,
                data: {
                    ...(edge.data || {}),
                    semantic_edge: showSemanticEdge
                        ? {
                              ...semantic,
                              kgMuted: isKgMuted,
                              mindmapRelationship: isMindmapRelationshipEdge
                          }
                        : undefined,
                    mindmap_structure: isMindmapStructureEdge ? true : undefined
                },
                hidden: !isProjected,
                className: canvasEdgeClassName({
                    className: [
                        edge.className,
                        isKgMuted ? 'kg-edge-muted' : '',
                        isMindmapStructureEdge ? CANVAS_MINDMAP_STRUCTURE_EDGE_CLASS : '',
                        isMindmapInferredEdge ? CANVAS_MINDMAP_INFERRED_EDGE_CLASS : '',
                        isMindmapRelationshipEdge ? CANVAS_MINDMAP_RELATIONSHIP_EDGE_CLASS : '',
                        branchColorClass
                    ]
                        .filter(Boolean)
                        .join(' '),
                    isOutOfScope: isProjected && isOutOfScope,
                    isBranchScope:
                        hasBranchScope &&
                        isProjected &&
                        isMindmapStructureEdge &&
                        branchIds.has(edge.source) &&
                        branchIds.has(edge.target),
                    semantic,
                    activeCanvasView,
                    showSemanticStyling: showSemanticEdge
                })
            };
        })
    };
};
