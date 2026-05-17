/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import axios from 'axios';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import useActivityStore from '../stores/activityStore';
import getLayoutedElements from '../utils/setLayout';
import {
    AI_DRAFT_ACCEPT_MODES,
    acceptAIDraftSession,
    acceptModeForChangeIntent,
    buildAIDraftMemoryContext,
    buildAIDraftPreviewDiff,
    buildSelectedSourceDraftPayload,
    changeIntentFromAIDraftSession,
    getAIDraftAcceptModeDetail,
    getAIDraftItemBadges,
    getAIDraftModelMetadata,
    getAIDraftSourceStatus,
    inferAIDraftChangeIntent,
    latestAIDraftRevision,
    draftArtifactPreviewToMarkdown,
    normalizePublishableDraftArtifacts,
    normalizeSoftwareOverlapReports,
    rejectAIDraftSession,
    reviseAIDraftSession,
    visibleAIDraftPromptText
} from '../utils/aiDraftSessions';
import { buildSourceLibraryProjection } from '../views/graphProjection';
import { PreviewDiffSummary, previewDiffToChanges } from '../views/previewDiffSummary';

const ACCEPT_MODE_LABELS = {
    append: getAIDraftAcceptModeDetail('append').label,
    replace: getAIDraftAcceptModeDetail('replace').label,
    merge: getAIDraftAcceptModeDetail('merge').label,
    selected: getAIDraftAcceptModeDetail('selected').label,
    cited_only: getAIDraftAcceptModeDetail('cited_only').label,
    notes_only: getAIDraftAcceptModeDetail('notes_only').label
};

const CHANGE_INTENT_LABELS = {
    update: 'Update existing graph context',
    supplement: 'Supplement current workspace',
    compare: 'Compare and keep both'
};

const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const acceptResultFromResponse = (result = {}) =>
    result.accept_result && typeof result.accept_result === 'object'
        ? result.accept_result
        : result;

const graphHasRenderableContent = (graph = {}) =>
    asArray(graph.nodes).length > 0 || asArray(graph.edges).length > 0;

const acceptResultHasGraphMutation = (acceptResult = {}) =>
    asArray(acceptResult.accepted_node_ids).length > 0 ||
    asArray(acceptResult.accepted_edge_ids).length > 0 ||
    asArray(acceptResult.patch_operations).some((operation) =>
        ['add_node', 'add_edge', 'update_node', 'update_edge', 'remove_node', 'remove_edge'].includes(operation?.op)
    );

const revisionHasGraphDraft = (revision = {}) =>
    asArray(revision.draft_nodes).length > 0 ||
    asArray(revision.draft_edges).length > 0 ||
    asArray(revision.draft_items).some((item) => {
        const metadata = item?.metadata || {};
        return metadata.source_node_id && metadata.target_node_id;
    });

const humanizeId = (value = '') =>
    String(value || '')
        .replaceAll('_', ' ')
        .replaceAll('-', ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\w/, (letter) => letter.toUpperCase());

const formatTokenCount = (value) => {
    const count = Number(value || 0);
    if (!Number.isFinite(count) || count <= 0) {
        return '';
    }
    return count.toLocaleString();
};

const usageSummary = (modelMeta = {}) => {
    const total = formatTokenCount(modelMeta.totalTokens || modelMeta.tokenEstimate);
    if (!total) {
        return 'Usage available after model response';
    }
    const parts = [`${total} tokens`];
    if (modelMeta.costEstimate) {
        parts.push(`${modelMeta.costEstimate} est.`);
    }
    return parts.join(' · ');
};

const scopeLabel = (scope = {}) => {
    if (typeof scope === 'string') {
        return humanizeId(scope);
    }
    if (scope.type === 'node' || scope.type === 'branch') {
        return `${humanizeId(scope.type)}: ${scope.node_id || 'selected node'}`;
    }
    if (scope.type === 'source') {
        return `Source: ${scope.source_id || 'selected source'}`;
    }
    if (scope.type === 'nodes') {
        return `${asArray(scope.node_ids).length} selected nodes`;
    }
    return 'Whole workspace';
};

const itemText = (item = {}) =>
    item.content || item.body || item.summary || item.text || item.title || item.label || '';

const promptEntryText = (entry = {}) =>
    entry.content || entry.prompt || entry.text || entry.summary || entry.title || entry.label || '';

const nodeText = (node = {}) => node.summary || node.body || node.rationale || node.title || '';

const draftItemKey = (item = {}) =>
    item.metadata?.draft_node_id ||
    item.metadata?.node_id ||
    item.metadata?.draft_annotation_id ||
    item.metadata?.annotation_id ||
    item.metadata?.draft_edge_id ||
    item.metadata?.edge_id ||
    item.node_id ||
    item.id ||
    '';

const uniqueByDraftIdentity = (items = []) => {
    const seen = new Set();
    return items.filter((item) => {
        const key = draftItemKey(item);
        if (!key || seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

const reviewLikeTypes = new Set([
    'annotation',
    'follow_up_suggestion',
    'review_output',
    'revision_note',
    'source_context_added',
    'sme_question',
    'source_gap',
    'ai_note'
]);

const isReviewLikeItem = (item = {}) =>
    reviewLikeTypes.has(item.item_type || item.type) || Boolean(item.metadata?.draft_annotation_id);

const isEdgeLikeItem = (item = {}) => {
    const type = String(item.item_type || item.type || '').toLowerCase();
    const id = String(item.id || item.edge_id || item.item_id || '').toLowerCase();
    const title = String(item.title || item.label || '').trim().toLowerCase();
    const content = String(item.content || item.body || item.summary || item.text || '').trim().toLowerCase();
    return (
        type === 'edge' ||
        type === 'relationship' ||
        type === 'draft_edge' ||
        id.startsWith('draft_edge') ||
        id.startsWith('draft-edge') ||
        Boolean(
            item.edge_id ||
                item.source_node_id ||
                item.target_node_id ||
                item.relationship_type ||
                item.metadata?.edge_id ||
                item.metadata?.draft_edge_id ||
                item.metadata?.source_node_id ||
                item.metadata?.target_node_id
        ) ||
        (title.startsWith('draft_edge') && ['contains', 'relates_to', 'supports'].includes(content))
    );
};

const isRelationshipCandidateItem = (item = {}) => {
    const type = String(item.item_type || item.type || '').toLowerCase();
    const relationshipType = String(
        item.relationship_type ||
            item.metadata?.relationship_type ||
            item.metadata?.relationshipType ||
            ''
    ).toLowerCase();
    return (
        type === 'relationship' ||
        type === 'relationship_candidate' ||
        Boolean(item.metadata?.relationship_edge_id) ||
        (relationshipType && !['contains', 'child', 'parent'].includes(relationshipType))
    );
};

const extractRevisionItems = (revision = {}) => {
    const nodeItems = asArray(revision.draft_nodes).map((node) => ({
        id: node.id || node.node_id,
        item_type: 'node',
        title: node.title || node.label || 'AI draft',
        content: nodeText(node),
        source_refs: asArray(node.source_refs),
        assumptions: asArray(node.assumptions),
        confidence: node.confidence,
        status: node.status || 'draft',
        metadata: {
            ...(node.metadata || {}),
            draft_node_id: node.id || node.node_id,
            node_type: node.node_type || node.type
        }
    }));
    const nodeIds = new Set(nodeItems.map((item) => item.metadata.draft_node_id).filter(Boolean));
    const draftItems = asArray(revision.draft_items)
        .filter((item) => !isReviewLikeItem(item) && (!isEdgeLikeItem(item) || isRelationshipCandidateItem(item)))
        .filter((item) => {
            const nodeId = item.metadata?.draft_node_id || item.metadata?.node_id || item.node_id;
            return !nodeId || !nodeIds.has(nodeId);
        })
        .map((item) => ({
            ...item,
            id: item.id || item.node_id,
            title: item.title || item.label || itemText(item) || 'AI draft item',
            content: itemText(item),
            source_refs: asArray(item.source_refs)
        }));
    return uniqueByDraftIdentity([...nodeItems, ...draftItems]);
};

const extractRevisionNotes = (revision = {}) =>
    uniqueByDraftIdentity([
        ...asArray(revision.draft_items)
            .filter(isReviewLikeItem)
            .map((item) => ({
                ...item,
                id: item.id || item.node_id,
                title: item.title || item.label || itemText(item) || 'Review note',
                content: itemText(item),
                source_refs: asArray(item.source_refs)
            })),
        ...asArray(revision.draft_annotations).map((annotation, index) => ({
            id: annotation.id || `annotation-${index}`,
            item_type: annotation.type || 'annotation',
            title: annotation.title || annotation.label || annotation.type || 'Review note',
            content: itemText(annotation),
            source_refs: asArray(annotation.source_refs),
            metadata: { draft_annotation_id: annotation.id }
        }))
    ]);

const primaryActionLabel = (itemCount = 0) =>
    itemCount === 1 ? 'Accept 1 item' : `Accept ${itemCount} items`;

const GRAPH_FILTER_LABELS = {
    'source-backed': 'Source-backed',
    'ai-assumption': 'AI assumption',
    'needs-review': 'Needs review',
    manual: 'Manual',
    'ai-generated': 'AI-generated',
    'tasks-only': 'Tasks only',
    unassigned: 'Unassigned',
    'missing-due-date': 'Missing due',
    'missing-source': 'Missing citation',
    'low-confidence': 'Low confidence',
    'hidden-from-export': 'Hidden export'
};

const CANVAS_LABELS = {
    mindmap: 'TraceSpace Map',
    knowledgeGraph: 'Knowledge Graph',
    executive: 'Executive',
    outline: 'Outline',
    tasks: 'Tasks',
    table: 'Table'
};

const modeNoun = (mode = 'append') => {
    if (mode === 'replace') {
        return 'Replacement';
    }
    if (mode === 'merge') {
        return 'Update';
    }
    if (mode === 'selected') {
        return 'Selection';
    }
    if (mode === 'cited_only') {
        return 'Cited items';
    }
    if (mode === 'notes_only') {
        return 'Preview';
    }
    return 'Supplement';
};

const MAP_REVIEW_SCOPES = new Set(['workspace', 'source', 'nodes']);
const MAP_CANVAS_VIEWS = new Set(['mindmap', 'knowledgeGraph']);

const mapFallbackCanvas = (fallback) =>
    MAP_CANVAS_VIEWS.has(fallback) ? fallback : 'mindmap';

const canvasForDraft = (session = {}, revision = {}, fallback = 'mindmap') => {
    const metadata = {
        ...(session.metadata || {}),
        ...(revision.metadata || {})
    };
    const shape = String(
        metadata.output_shape ||
            metadata.requested_visual ||
            session.intent ||
            ''
    ).toLowerCase();
    const scopeType =
        typeof session.scope === 'string' ? session.scope : session.scope?.type || '';
    const keepMapVisible = MAP_REVIEW_SCOPES.has(scopeType);

    if (shape.includes('task') || shape.includes('checklist')) {
        return keepMapVisible ? mapFallbackCanvas(fallback) : 'tasks';
    }
    if (shape.includes('table') || shape.includes('chart')) {
        return keepMapVisible ? mapFallbackCanvas(fallback) : 'table';
    }
    if (shape.includes('executive')) {
        return keepMapVisible ? mapFallbackCanvas(fallback) : 'executive';
    }
    if (shape.includes('news') || shape.includes('article')) {
        return keepMapVisible ? mapFallbackCanvas(fallback) : 'outline';
    }
    if (shape.includes('outline')) {
        return keepMapVisible ? mapFallbackCanvas(fallback) : 'outline';
    }
    if (
        shape.includes('flow_chart') ||
        shape.includes('flowchart') ||
        shape.includes('flow chart') ||
        shape.includes('process_map') ||
        shape.includes('process map') ||
        shape.includes('decision_tree') ||
        shape.includes('decision tree') ||
        shape.includes('swimlane')
    ) {
        return 'flowchart';
    }
    if (shape.includes('knowledge')) {
        return 'knowledgeGraph';
    }
    if (shape.includes('mind') || shape.includes('graph') || shape.includes('workflow')) {
        return 'mindmap';
    }
    if (shape.includes('no_visual')) {
        return fallback;
    }
    return fallback || 'mindmap';
};

const reviewSummary = (coverage = { cited: 0, uncited: 0, total: 0 }, noteCount = 0) => {
    if (!coverage.total && !noteCount) {
        return 'No draft items yet';
    }
    const parts = [];
    if (coverage.total) {
        parts.push(`${coverage.total} ${coverage.total === 1 ? 'item' : 'items'}`);
        if (coverage.missingRequired || coverage.assumptions) {
            parts.push(
                [
                    coverage.missingRequired ? `${coverage.missingRequired} missing citation` : '',
                    coverage.assumptions ? `${coverage.assumptions} AI assumption` : ''
                ]
                    .filter(Boolean)
                    .join(', ')
            );
        } else {
            parts.push(coverage.uncited ? `${coverage.uncited} needs review` : 'all cited');
        }
    }
    if (noteCount) {
        parts.push(`${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`);
    }
    return parts.join(' · ');
};

const compactPromptHistory = (history = []) =>
    asArray(history)
        .map((entry) => ({
            ...entry,
            content: visibleAIDraftPromptText(promptEntryText(entry))
        }))
        .filter((entry) => entry.content)
        .filter((entry, index, list) => {
            const previous = list[index - 1];
            return !previous || previous.role !== entry.role || previous.content !== entry.content;
        })
        .slice(-3);

const sessionPromptTitle = (session = {}, revision = {}) =>
    visibleAIDraftPromptText(
        promptEntryText(asArray(session.prompt_history).at(-1)),
        visibleAIDraftPromptText(revision.prompt, session.role || 'Ask AI')
    );

const sourceCoverage = (items = []) => {
    const cited = items.filter((item) => asArray(item.source_refs).length > 0).length;
    const statuses = items.map(getAIDraftSourceStatus);
    return {
        cited,
        uncited: Math.max(items.length - cited, 0),
        assumptions: statuses.filter((status) => status.id === 'ai_assumption_uncited').length,
        missingRequired: statuses.filter((status) => status.id === 'missing_required_source').length,
        total: items.length
    };
};

const formatScore = (value) => {
    if (value === undefined || value === null || value === '') {
        return 'Not scored';
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return String(value);
    }
    return numeric <= 1 ? `${Math.round(numeric * 100)}%` : `${Math.round(numeric)}`;
};

const draftNodeId = (node = {}) => node.id || node.node_id || '';

const draftEdgeSourceId = (edge = {}) => edge.source_node_id || edge.source || edge.parent_id || '';

const draftEdgeTargetId = (edge = {}) => edge.target_node_id || edge.target || edge.child_id || '';

const isUnsourcedOrNeedsReview = (node = {}) => {
    const status = String(node.status || node.metadata?.status || '').toLowerCase();
    const nodeType = String(node.node_type || node.type || node.metadata?.node_type || '').toLowerCase();
    return (
        status === 'needs_review' ||
        node.metadata?.needs_review === true ||
        (nodeType !== 'reference' && asArray(node.source_refs).length === 0)
    );
};

const buildDraftOutlinePreview = (revision = {}, session = {}) => {
    const nodes = asArray(revision.draft_nodes);
    const edges = asArray(revision.draft_edges);
    const nodeById = new Map(nodes.map((node) => [draftNodeId(node), node]).filter(([id]) => id));
    const childrenByParent = new Map();
    const draftChildIds = new Set();

    edges.forEach((edge) => {
        const sourceId = draftEdgeSourceId(edge);
        const targetId = draftEdgeTargetId(edge);
        if (!sourceId || !targetId || !nodeById.has(targetId)) {
            return;
        }
        if (nodeById.has(sourceId)) {
            draftChildIds.add(targetId);
        }
        const children = childrenByParent.get(sourceId) || [];
        children.push({ edge, node: nodeById.get(targetId) });
        childrenByParent.set(sourceId, children);
    });

    nodes.forEach((node) => {
        const parentId = node.parent_id || node.metadata?.parent_id;
        const nodeId = draftNodeId(node);
        if (parentId && nodeById.has(parentId)) {
            draftChildIds.add(nodeId);
            const existingChildren = childrenByParent.get(parentId) || [];
            if (!existingChildren.some((child) => draftNodeId(child.node) === nodeId)) {
                existingChildren.push({ edge: { relationship_type: 'contains' }, node });
                childrenByParent.set(parentId, existingChildren);
            }
        }
    });

    const roots = nodes.filter((node) => !draftChildIds.has(draftNodeId(node)));
    const promptTitle = sessionPromptTitle(session, revision);
    return {
        title: promptTitle || 'AI draft',
        nodeCount: nodes.length,
        edgeCount: edges.length,
        needsReviewCount: nodes.filter(isUnsourcedOrNeedsReview).length,
        roots: roots.length ? roots : nodes.slice(0, 1),
        childrenByParent,
        nodeById
    };
};

const collectVisibleDraftOutlineIds = (preview) => {
    const visibleIds = new Set();
    const visit = (node, depth) => {
        const nodeId = draftNodeId(node);
        if (!nodeId || visibleIds.has(nodeId)) {
            return;
        }
        visibleIds.add(nodeId);
        if (depth >= 1) {
            return;
        }
        asArray(preview.childrenByParent.get(nodeId))
            .slice(0, 6)
            .forEach(({ node: child }) => visit(child, depth + 1));
    };
    asArray(preview.roots).forEach((root) => visit(root, 0));
    return visibleIds;
};

const revisionEndpoint = ({ flowId, sessionId }) =>
    `http://localhost:8000/api/workspaces/${flowId}/ai/draft-sessions/${sessionId}/revisions`;

const acceptEndpoint = ({ flowId, sessionId }) =>
    `http://localhost:8000/api/workspaces/${flowId}/ai/draft-sessions/${sessionId}/accept`;

const sourceEndpoint = ({ flowId, sessionId }) =>
    `http://localhost:8000/api/workspaces/${flowId}/ai/draft-sessions/${sessionId}/sources`;

const requestImmediateWorkspaceSave = () => {
    window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('docmap:save-workspace-now'));
    }, 50);
};

const AiDraftSessionPanel = ({ session, onClose, onAccepted }) => {
    const selector = (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        workspaceBrief: state.workspaceBrief,
        sourceLibrary: state.sourceLibrary,
        activeCanvasView: state.activeCanvasView,
        activeGraphFilters: state.activeGraphFilters,
        setNodes: state.setNodes,
        setEdges: state.setEdges,
        setViewPort: state.setViewPort,
        setActiveView: state.setActiveView,
        clearGeneratedHelperPreview: state.clearGeneratedHelperPreview,
        updateActiveAIDraftSession: state.updateActiveAIDraftSession,
        clearActiveAIDraftSession: state.clearActiveAIDraftSession
    });
    const {
        nodes,
        edges,
        workspaceBrief,
        sourceLibrary,
        activeCanvasView,
        activeGraphFilters,
        setNodes,
        setEdges,
        setViewPort,
        setActiveView,
        clearGeneratedHelperPreview,
        updateActiveAIDraftSession,
        clearActiveAIDraftSession
    } = useStore(useShallow(selector));
    const flowId = flowStore((state) => state.flow_id);
    const setSaveStatus = flowStore((state) => state.setSaveStatus);
    const recordActivity = useActivityStore((state) => state.recordActivity);
    const { fitView, setViewport } = useReactFlow();
    const [prompt, setPrompt] = useState('');
    const [acceptMode, setAcceptMode] = useState(() =>
        acceptModeForChangeIntent(changeIntentFromAIDraftSession(session))
    );
    const [selectedItemIds, setSelectedItemIds] = useState([]);
    const [message, setMessage] = useState('');
    const [progressMessage, setProgressMessage] = useState('');
    const [isRevising, setIsRevising] = useState(false);
    const [isAccepting, setIsAccepting] = useState(false);
    const [isAddingSource, setIsAddingSource] = useState(false);
    const [sourceToAddId, setSourceToAddId] = useState('');
    const [copiedArtifactId, setCopiedArtifactId] = useState('');
    const promptRef = useRef(null);
    const revision = useMemo(() => latestAIDraftRevision(session), [session]);
    const sessionChangeIntent = useMemo(
        () => changeIntentFromAIDraftSession(session, revision),
        [revision, session]
    );
    const items = useMemo(() => extractRevisionItems(revision), [revision]);
    const reviewNotes = useMemo(() => extractRevisionNotes(revision), [revision]);
    const publishableArtifacts = useMemo(
        () => normalizePublishableDraftArtifacts(revision),
        [revision]
    );
    const overlapReports = useMemo(() => normalizeSoftwareOverlapReports(revision), [revision]);
    const coverage = useMemo(() => sourceCoverage(items), [items]);
    const outlinePreview = useMemo(
        () => buildDraftOutlinePreview(revision, session),
        [revision, session]
    );
    const selectedSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
    const modelMeta = useMemo(() => getAIDraftModelMetadata(session, revision), [revision, session]);
    const acceptModeDetail = useMemo(
        () => getAIDraftAcceptModeDetail(acceptMode),
        [acceptMode]
    );
    const acceptImpact = useMemo(
        () => {
            const diff = buildAIDraftPreviewDiff(session, {
                mode: acceptMode,
                selectedItemIds: acceptMode === 'selected' ? selectedItemIds : [],
                currentNodes: nodes,
                currentEdges: edges
            });
            const nextCanvas = canvasForDraft(session, revision, activeCanvasView);
            return {
                diff,
                changes: previewDiffToChanges(diff, { acceptLabel: 'before accept' }),
                nextCanvas,
                canvasChanged: nextCanvas !== activeCanvasView,
                activeFilters: asArray(activeGraphFilters)
            };
        },
        [acceptMode, activeCanvasView, activeGraphFilters, edges, nodes, revision, selectedItemIds, session]
    );
    const primaryAcceptText =
        acceptMode === 'selected'
            ? primaryActionLabel(selectedItemIds.length)
            : primaryActionLabel(items.length);
    const promptHistory = useMemo(
        () => compactPromptHistory(session.prompt_history),
        [session.prompt_history]
    );
    const visiblePromptTitle = useMemo(
        () => sessionPromptTitle(session, revision),
        [revision, session]
    );
    const sourceProjection = useMemo(
        () => buildSourceLibraryProjection(nodes, edges, workspaceBrief, sourceLibrary),
        [edges, nodes, sourceLibrary, workspaceBrief]
    );
    const availableSources = sourceProjection.sources;
    const sourceToAdd = availableSources.find((source) => source.id === sourceToAddId);

    useEffect(() => {
        promptRef.current?.focus();
    }, [session?.session_id]);

    useEffect(() => {
        setAcceptMode(acceptModeForChangeIntent(sessionChangeIntent));
    }, [revision?.revision_id, session?.session_id, sessionChangeIntent]);

    const toggleItem = (itemId) => {
        setSelectedItemIds((current) => {
            const next = current.includes(itemId)
                ? current.filter((selectedId) => selectedId !== itemId)
                : [...current, itemId];
            if (next.length > 0 && acceptMode === 'append') {
                setAcceptMode('selected');
            }
            if (next.length === 0 && acceptMode === 'selected') {
                setAcceptMode('append');
            }
            return next;
        });
    };

    const submitRevision = async () => {
        if (!prompt.trim() || isRevising) {
            return;
        }
        setIsRevising(true);
        setMessage('');
        setProgressMessage('Sending revision to the AI model.');
        const revisionPrompt = prompt.trim();
        const revisionSourceRefs = [
            ...asArray(session.source_refs),
            ...asArray(revision.draft_nodes).flatMap((node) => asArray(node.source_refs)),
            ...asArray(revision.draft_items).flatMap((item) => asArray(item.source_refs)),
            ...asArray(revision.draft_annotations).flatMap((annotation) => asArray(annotation.source_refs))
        ];
        const changeIntent = inferAIDraftChangeIntent(revisionPrompt, 'update');
        const memoryContext = buildAIDraftMemoryContext({
            nodes,
            edges,
            scope: session.scope || { type: 'workspace' },
            sourceRefs: revisionSourceRefs,
            activeDraftSession: session,
            prompt: revisionPrompt,
            changeIntent,
            outputMode: 'draft_revision'
        });
        const revisionRequestPayload = {
            prompt: revisionPrompt,
            model_policy: session.model_policy,
            selected_model: session.selected_model || null,
            model: session.selected_model && session.selected_model !== 'auto' ? session.selected_model : null,
            change_intent: changeIntent,
            memory_context: memoryContext,
            metadata: {
                change_intent: changeIntent,
                follow_up_memory: memoryContext,
                prior_session_id: session.session_id,
                prior_revision_id: revision.revision_id
            }
        };
        try {
            const response =
                flowId && session.session_id
                    ? await axios.post(
                          revisionEndpoint({ flowId, sessionId: session.session_id }),
                          revisionRequestPayload
                      )
                    : null;
            setProgressMessage('Validating the revised draft.');
            const nextSession =
                response?.data?.session ||
                response?.data?.draft_session ||
                response?.data ||
                reviseAIDraftSession(session, {
                    prompt: revisionPrompt,
                    draftNodes: revision.draft_nodes || [],
                    draftEdges: revision.draft_edges || [],
                    draftAnnotations: [
                        ...asArray(revision.draft_annotations),
                        {
                            id: `local-revision-${Date.now()}`,
                            type: 'revision_note',
                            title: revisionPrompt,
                            body: revisionPrompt
                        }
                    ],
                    model: session.selected_model || revision.model || 'auto',
                    metadata: {
                        change_intent: changeIntent,
                        follow_up_memory: memoryContext,
                        model_reason: 'Local draft revision staged while backend generation is unavailable.'
                    }
                });
            updateActiveAIDraftSession(nextSession);
            setPrompt('');
            setSelectedItemIds([]);
            setProgressMessage('');
            recordActivity({
                type: 'ai_draft_revised',
                title: 'Revised AI draft session',
                summary: revisionPrompt,
                metadata: {
                    session_id: session.session_id,
                    revision_id: latestAIDraftRevision(nextSession).revision_id,
                    change_intent: changeIntent
                }
            });
        } catch (error) {
            setProgressMessage('Preserving the revision locally.');
            const nextSession = reviseAIDraftSession(session, {
                prompt: revisionPrompt,
                draftNodes: revision.draft_nodes || [],
                draftEdges: revision.draft_edges || [],
                draftAnnotations: [
                    ...asArray(revision.draft_annotations),
                    {
                        id: `local-revision-${Date.now()}`,
                        type: 'revision_note',
                        title: revisionPrompt,
                        body: error.message || revisionPrompt
                    }
                ],
                model: session.selected_model || revision.model || 'auto',
                metadata: {
                    change_intent: changeIntent,
                    follow_up_memory: memoryContext,
                    model_reason: 'Backend revision was unavailable; preserved the request locally.'
                }
            });
            updateActiveAIDraftSession(nextSession);
            setPrompt('');
            setSelectedItemIds([]);
            setMessage('Backend revision is unavailable, so the request was preserved in the draft history.');
        } finally {
            setProgressMessage('');
            setIsRevising(false);
        }
    };

    const acceptDraft = async (modeOverride) => {
        const mode = modeOverride || acceptMode;
        const activeAcceptModeDetail = getAIDraftAcceptModeDetail(mode);
        const effectiveSelectedIds = mode === 'selected' ? selectedItemIds : [];
        const acceptedArtifacts = normalizePublishableDraftArtifacts(revision).map(
            (artifact) => ({
                id: artifact.id,
                artifact_type: artifact.artifactType,
                title: artifact.title,
                label: artifact.label,
                review_state: artifact.reviewState
            })
        );
        if (mode === 'selected' && effectiveSelectedIds.length === 0) {
            setMessage('Select at least one draft item before accepting selected changes.');
            return;
        }
        setIsAccepting(true);
        setMessage('');
        setProgressMessage('Applying accepted draft changes to the workspace.');
        const shouldPreserveScopedLayout =
            ['branch', 'node'].includes(session.scope?.type) &&
            Boolean(session.scope?.node_id) &&
            ['append', 'selected', 'merge'].includes(mode) &&
            MAP_CANVAS_VIEWS.has(activeCanvasView || 'mindmap');
        const applyAcceptedGraph = (graph = {}, { preservePositions = false } = {}) => {
            const hasNodes = Array.isArray(graph.nodes);
            const hasEdges = Array.isArray(graph.edges);
            let nextNodes = hasNodes ? graph.nodes : null;
            let nextEdges = hasEdges ? graph.edges : null;
            if (hasNodes && !preservePositions) {
                const layouted = getLayoutedElements(nextNodes, hasEdges ? nextEdges : edges);
                nextNodes = layouted.nodes;
                nextEdges = layouted.edges;
            }
            if (nextNodes) {
                setNodes(nextNodes);
            }
            if (nextEdges) {
                setEdges(nextEdges);
            }
            if (graph.viewport && typeof graph.viewport === 'object') {
                setViewPort(graph.viewport);
                setViewport(graph.viewport, { duration: 360 });
            } else if (nextNodes?.length) {
                window.setTimeout(() => {
                    const acceptedIds = new Set(asArray(graph.accept_result?.accepted_node_ids));
                    const focusNodes =
                        preservePositions && acceptedIds.size
                            ? nextNodes.filter((node) => acceptedIds.has(node.id) || node.id === session.scope?.node_id)
                            : nextNodes;
                    fitView({ nodes: focusNodes.length ? focusNodes : nextNodes, duration: 420, maxZoom: 0.95, padding: 0.18 });
                }, 80);
            }
        };
        const shouldUseLocalAcceptFallback = (graph = {}, result = {}) => {
            const acceptResult = acceptResultFromResponse(result);
            if (!Array.isArray(graph.nodes) && !Array.isArray(graph.edges)) {
                return true;
            }
            if (graphHasRenderableContent(graph)) {
                return false;
            }
            if (!revisionHasGraphDraft(revision) || mode === 'notes_only') {
                return false;
            }
            return acceptResultHasGraphMutation(acceptResult) || nodes.length > 0;
        };
        const shouldPreserveCurrentGraph = (graph = {}, result = {}) =>
            Array.isArray(graph.nodes) &&
            !graphHasRenderableContent(graph) &&
            nodes.length > 0 &&
            !acceptResultHasGraphMutation(acceptResultFromResponse(result));
        try {
            const response =
                flowId && session.session_id
                    ? await axios.post(acceptEndpoint({ flowId, sessionId: session.session_id }), {
                          mode,
                          selected_item_ids: effectiveSelectedIds,
                          apply_intent: activeAcceptModeDetail.user_choice,
                          change_intent: sessionChangeIntent
                      })
                    : null;
            const result = response?.data || {};
            const graph = result.graph || result.workspace || result;
            const localAcceptedGraph =
                shouldPreserveScopedLayout && revisionHasGraphDraft(revision)
                    ? acceptAIDraftSession({
                          session,
                          nodes,
                          edges,
                          mode,
                          selectedItemIds: effectiveSelectedIds
                      })
                    : null;
            if (shouldUseLocalAcceptFallback(graph, result)) {
                const fallback =
                    localAcceptedGraph ||
                    acceptAIDraftSession({
                        session,
                        nodes,
                        edges,
                        mode,
                        selectedItemIds: effectiveSelectedIds
                    });
                applyAcceptedGraph(fallback, { preservePositions: shouldPreserveScopedLayout });
            } else if (shouldPreserveCurrentGraph(graph, result)) {
                setMessage('Accepted draft did not include graph changes, so the current layout was preserved.');
            } else {
                applyAcceptedGraph(localAcceptedGraph || graph, {
                    preservePositions: Boolean(localAcceptedGraph)
                });
            }
            updateActiveAIDraftSession(
                result.session || result.draft_session || {
                    ...session,
                    status: 'accepted'
                }
            );
            if (flowId) {
                setSaveStatus('dirty');
                requestImmediateWorkspaceSave();
            }
            recordActivity({
                type: 'ai_draft_accepted',
                title: 'Accepted AI draft session',
                summary: `Accepted draft session with ${ACCEPT_MODE_LABELS[mode] || humanizeId(mode)} mode.`,
                metadata: {
                    session_id: session.session_id,
                    revision_id: revision.revision_id,
                    mode,
                    apply_intent: activeAcceptModeDetail.user_choice,
                    change_intent: sessionChangeIntent,
                    accepted_artifacts: acceptedArtifacts
                },
                status: 'completed'
            });
            clearActiveAIDraftSession();
            clearGeneratedHelperPreview('nodeAiActionRequest');
            setActiveView(canvasForDraft(session, revision, activeCanvasView));
            onAccepted?.({ session, result, mode });
            onClose?.();
        } catch (error) {
            setProgressMessage('Applying the local draft fallback.');
            const fallback = acceptAIDraftSession({
                session,
                nodes,
                edges,
                mode,
                selectedItemIds: effectiveSelectedIds
            });
            applyAcceptedGraph(fallback, { preservePositions: shouldPreserveScopedLayout });
            updateActiveAIDraftSession(fallback.session);
            if (flowId) {
                setSaveStatus('dirty');
                requestImmediateWorkspaceSave();
            }
            setMessage('Backend accept is unavailable; applied the local draft contract fallback.');
            recordActivity({
                type: 'ai_draft_accepted_local',
                title: 'Accepted AI draft locally',
                summary: error.message || 'Backend accept was unavailable.',
                metadata: {
                    ...fallback.accept_result,
                    accepted_artifacts: acceptedArtifacts
                },
                status: 'completed'
            });
            clearActiveAIDraftSession();
            clearGeneratedHelperPreview('nodeAiActionRequest');
            setActiveView(canvasForDraft(session, revision, activeCanvasView));
            onAccepted?.({ session, result: fallback, mode, localFallback: true });
            onClose?.();
        } finally {
            setProgressMessage('');
            setIsAccepting(false);
        }
    };

    const discardDraft = () => {
        updateActiveAIDraftSession(
            rejectAIDraftSession(session, {
                reason: 'Draft session was closed without changing the graph.'
            })
        );
        clearActiveAIDraftSession();
        recordActivity({
            type: 'ai_draft_discarded',
            title: 'Discarded AI draft session',
            summary: 'Draft session was closed without changing the graph.',
            metadata: {
                session_id: session.session_id,
                revision_id: revision.revision_id
            }
        });
        setActiveView(activeCanvasView || 'mindmap');
        clearGeneratedHelperPreview('nodeAiActionRequest');
        onClose?.();
    };

    const addSourceToDraft = async () => {
        if (!sourceToAdd || isAddingSource) {
            setMessage('Choose a loaded source before reconciling the draft.');
            return;
        }
        setIsAddingSource(true);
        setMessage('');
        setProgressMessage('Reconciling the draft against the selected source.');
        const sourcePayload = buildSelectedSourceDraftPayload(sourceToAdd);
        try {
            const response =
                flowId && session.session_id
                    ? await axios.post(sourceEndpoint({ flowId, sessionId: session.session_id }), {
                          source_id: sourceToAdd.id,
                          source_chunks: sourcePayload.source_chunks,
                          prompt: `Reconcile this draft against ${sourceToAdd.title || sourceToAdd.id}.`,
                          model_policy: session.model_policy,
                          model: session.selected_model || null
                      })
                    : null;
            const nextSession =
                response?.data?.session ||
                response?.data?.draft_session ||
                response?.data ||
                reviseAIDraftSession(session, {
                    prompt: `Add source context: ${sourceToAdd.title || sourceToAdd.id}`,
                    draftNodes: revision.draft_nodes || [],
                    draftEdges: revision.draft_edges || [],
                    draftAnnotations: [
                        ...asArray(revision.draft_annotations),
                        {
                            id: `source-context-${Date.now()}`,
                            type: 'source_context_added',
                            title: sourceToAdd.title || sourceToAdd.id,
                            body: `Source context was attached locally for ${sourceToAdd.title || sourceToAdd.id}.`,
                            source_refs: sourcePayload.source_refs
                        }
                    ],
                    model: session.selected_model || revision.model || 'auto',
                    metadata: {
                        source_context: sourcePayload.metadata,
                        model_reason: 'Local source reconciliation staged while backend generation is unavailable.'
                    }
                });
            updateActiveAIDraftSession(nextSession);
            setSourceToAddId('');
            setProgressMessage('');
            recordActivity({
                type: 'ai_draft_source_reconciled',
                title: 'Reconciled source into AI draft',
                summary: `Added ${sourceToAdd.title || sourceToAdd.id} to the active draft session.`,
                source_ids: [sourceToAdd.id],
                metadata: {
                    session_id: session.session_id,
                    source_id: sourceToAdd.id,
                    revision_id: latestAIDraftRevision(nextSession).revision_id
                },
                status: 'completed'
            });
            setMessage('Source reconciled into the draft. Review the new revision before accepting.');
        } catch (error) {
            setProgressMessage('Preserving source context locally.');
            const nextSession = reviseAIDraftSession(session, {
                prompt: `Add source context: ${sourceToAdd.title || sourceToAdd.id}`,
                draftNodes: revision.draft_nodes || [],
                draftEdges: revision.draft_edges || [],
                draftAnnotations: [
                    ...asArray(revision.draft_annotations),
                    {
                        id: `source-context-${Date.now()}`,
                        type: 'source_context_added',
                        title: sourceToAdd.title || sourceToAdd.id,
                        body: error.message || 'Backend source reconciliation was unavailable.',
                        source_refs: sourcePayload.source_refs
                    }
                ],
                model: session.selected_model || revision.model || 'auto',
                metadata: {
                    source_context: sourcePayload.metadata,
                    model_reason: 'Backend source reconciliation was unavailable; preserved source context locally.'
                }
            });
            updateActiveAIDraftSession(nextSession);
            setMessage('Backend source reconciliation is unavailable, so the source context was preserved locally.');
        } finally {
            setProgressMessage('');
            setIsAddingSource(false);
        }
    };

    const openSourceModal = () => {
        recordActivity({
            type: 'ai_draft_add_source_opened',
            title: 'Prepared source reconciliation from AI draft',
            summary: 'Source reconciliation controls were used from the active draft session.',
            metadata: {
                session_id: session.session_id
            }
        });
        addSourceToDraft();
    };

    const copyArtifactMarkdown = async (artifact) => {
        const markdown = draftArtifactPreviewToMarkdown(artifact);
        if (!markdown) {
            setMessage('This draft artifact does not have copyable content yet.');
            return;
        }
        try {
            await navigator.clipboard.writeText(markdown);
            setCopiedArtifactId(artifact.id);
            setMessage(`${artifact.label} copied as SharePoint-ready Markdown.`);
            window.setTimeout(() => setCopiedArtifactId(''), 1600);
        } catch {
            setMessage('Copy is unavailable in this browser. Select the preview text and copy it manually.');
        }
    };

    const renderProjection = () => {
        if (items.length === 0) {
            if (publishableArtifacts.length) {
                return null;
            }
            return (
                <div className="ai-draft-empty" role="status">
                    <strong>No draft items yet</strong>
                    <span>
                        Ask for a concrete structure or more detail. Nothing changes in the graph
                        until you accept the draft.
                    </span>
                </div>
            );
        }
        return (
            <div className="ai-draft-projection">
                {items.map((item) => (
                    <article key={`draft-${item.id}`} className="ai-draft-item">
                        <label>
                            <input
                                type="checkbox"
                                checked={selectedSet.has(item.id)}
                                onChange={() => toggleItem(item.id)}
                            />
                            <span>{selectedSet.has(item.id) ? 'Selected' : 'Select'}</span>
                        </label>
                        <strong>{item.title}</strong>
                        {item.content ? (
                            <p>{item.content}</p>
                        ) : (
                            <p className="ai-draft-weak-preview">
                                This draft item has structure but no body yet. Refine the prompt to add
                                detail, sources, or acceptance criteria before accepting it.
                            </p>
                        )}
                        <DraftBadges item={item} />
                    </article>
                ))}
            </div>
        );
    };

    return (
        <div className="ai-draft-session-panel">
            <div className="ai-draft-session-toolbar">
                <div>
                    <p>Draft preview</p>
                    <strong>{visiblePromptTitle || session.role || 'Ask AI'}</strong>
                    <span>{scopeLabel(session.scope)} · {reviewSummary(coverage, reviewNotes.length)}</span>
                </div>
                <button type="button" onClick={discardDraft} aria-label="Close AI draft session">
                    x
                </button>
            </div>

            <div className="ai-draft-conversation" aria-label="Refine draft">
                {promptHistory.length > 1 ? (
                    <div className="ai-draft-history">
                        {promptHistory.map((entry, index) => (
                            <p key={`${entry.revision_id || index}-${entry.created_at}`}>
                                <span>{entry.role || 'user'}</span>
                                {entry.content}
                            </p>
                        ))}
                    </div>
                ) : null}
                <label>
                    Refine draft
                    <textarea
                        ref={promptRef}
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        onKeyDown={(event) => {
                            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                                submitRevision();
                            }
                        }}
                        placeholder="Ask for a sharper structure, a different view, or more detail."
                    />
                </label>
                <button type="button" onClick={submitRevision} disabled={isRevising || !prompt.trim()}>
                    {isRevising ? 'Revising' : 'Add revision'}
                </button>
            </div>

            <DraftOutlinePreview preview={outlinePreview} />

            {publishableArtifacts.length ? (
                <PublishableArtifactPreviews
                    artifacts={publishableArtifacts}
                    copiedArtifactId={copiedArtifactId}
                    onCopy={copyArtifactMarkdown}
                />
            ) : null}

            {renderProjection()}

            {overlapReports.length ? <SoftwareOverlapReports reports={overlapReports} /> : null}

            {reviewNotes.length ? (
                <details className="ai-draft-details">
                    <summary>{reviewNotes.length} review {reviewNotes.length === 1 ? 'note' : 'notes'}</summary>
                    <div className="ai-draft-note-list">
                        {reviewNotes.map((note) => (
                            <article key={`note-${note.id}`}>
                                <strong>{note.title}</strong>
                                {note.content ? <p>{note.content}</p> : null}
                            </article>
                        ))}
                    </div>
                </details>
            ) : null}

            <details className="ai-draft-details">
                <summary>Options</summary>
                <div className="ai-draft-meta-grid">
                    <div>
                        <span>Model</span>
                        <strong>{modelMeta.model}</strong>
                        {modelMeta.reason ? <small>{modelMeta.reason}</small> : null}
                    </div>
                    <div>
                        <span>Usage</span>
                        <strong>{usageSummary(modelMeta)}</strong>
                        <small>
                            {modelMeta.inputTokens || modelMeta.outputTokens
                                ? `${formatTokenCount(modelMeta.inputTokens)} in · ${formatTokenCount(modelMeta.outputTokens)} out`
                                : modelMeta.usageCostSource === 'token_usage_only'
                                  ? 'Cost estimate needs configured pricing.'
                                  : 'Tracked per draft revision.'}
                        </small>
                    </div>
                    <div>
                        <span>Sources</span>
                        <strong>{coverage.total ? `${coverage.cited}/${coverage.total} cited` : 'No items'}</strong>
                        <small>
                            {coverage.uncited
                                ? `${coverage.missingRequired} missing citation · ${coverage.assumptions} AI assumption`
                                : 'Ready for review'}
                        </small>
                    </div>
                </div>
                <div className="ai-draft-source-tools">
                    <label>
                        Add source
                        <select
                            value={sourceToAddId}
                            onChange={(event) => setSourceToAddId(event.target.value)}
                        >
                            <option value="">Choose loaded source</option>
                            {availableSources.map((source) => (
                                <option key={source.id} value={source.id}>
                                    {source.title || source.id}
                                </option>
                            ))}
                        </select>
                    </label>
                    <button
                        type="button"
                        className="secondary"
                        onClick={openSourceModal}
                        disabled={isAddingSource || !sourceToAddId}
                    >
                        {isAddingSource ? 'Reconciling' : 'Reconcile source'}
                    </button>
                    <label>
                        Apply mode
                        <select
                            value={acceptMode}
                            onChange={(event) => setAcceptMode(event.target.value)}
                        >
                            {AI_DRAFT_ACCEPT_MODES.map((mode) => (
                                <option key={mode} value={mode}>
                                    {ACCEPT_MODE_LABELS[mode] || humanizeId(mode)}
                                </option>
                            ))}
                        </select>
                        <small>{acceptModeDetail.help}</small>
                    </label>
                </div>
            </details>

            <div className="ai-draft-apply-mode" aria-label="Draft apply mode">
                <span>{CHANGE_INTENT_LABELS[sessionChangeIntent] || 'Supplement current workspace'}</span>
                <strong>{acceptModeDetail.label}</strong>
                <p>{acceptModeDetail.help}</p>
            </div>

            <div className="ai-draft-impact" aria-label="Before accept">
                <span>Before accept</span>
                <PreviewDiffSummary title={modeNoun(acceptMode)} changes={acceptImpact.changes} />
                <div>
                    <strong>
                        {acceptImpact.diff.metadata?.accept_mode_label || acceptModeDetail.label}
                    </strong>
                    {asArray(acceptImpact.diff.preview_lines).map((line) => (
                        <p key={line}>{line}</p>
                    ))}
                </div>
                <div>
                    <strong>Canvas</strong>
                    <p>
                        {acceptImpact.canvasChanged ? 'Switch to ' : 'Stay on '}
                        {CANVAS_LABELS[acceptImpact.nextCanvas] || humanizeId(acceptImpact.nextCanvas)}
                    </p>
                </div>
                <div>
                    <strong>Filters</strong>
                    <p>
                        Unchanged
                        {acceptImpact.activeFilters.length
                            ? ` (${acceptImpact.activeFilters
                                  .map((filterId) => GRAPH_FILTER_LABELS[filterId] || humanizeId(filterId))
                                  .join(', ')})`
                            : ' (none active)'}
                    </p>
                </div>
            </div>

            <div className="ai-draft-accept">
                <button type="button" className="secondary" onClick={discardDraft}>
                    Discard
                </button>
                {selectedItemIds.length ? (
                    <button type="button" onClick={() => acceptDraft('selected')} disabled={isAccepting}>
                        Accept selected
                    </button>
                ) : null}
                <button type="button" onClick={() => acceptDraft()} disabled={isAccepting || items.length === 0}>
                    {isAccepting ? 'Accepting' : primaryAcceptText}
                </button>
            </div>
            {progressMessage ? <p className="ai-draft-message active">{progressMessage}</p> : null}
            {message ? <p className="ai-draft-message">{message}</p> : null}
        </div>
    );
};

export default AiDraftSessionPanel;

const PublishableArtifactPreviews = ({ artifacts, copiedArtifactId, onCopy }) => (
    <section className="ai-draft-artifact-previews" aria-label="Draft artifact previews">
        {artifacts.map((artifact) => (
            <article key={`artifact-preview-${artifact.id}`} className="ai-draft-artifact-preview">
                <div className="ai-draft-artifact-header">
                    <div>
                        <span>{artifact.label}</span>
                        <strong>{artifact.title}</strong>
                        {artifact.dek ? <p>{artifact.dek}</p> : null}
                    </div>
                    <button type="button" className="secondary" onClick={() => onCopy(artifact)}>
                        {copiedArtifactId === artifact.id ? 'Copied' : 'Copy Markdown'}
                    </button>
                </div>
                {(artifact.audience || artifact.publishTarget || artifact.reviewState) ? (
                    <div className="ai-draft-artifact-meta">
                        {artifact.audience ? <span>{artifact.audience}</span> : null}
                        {artifact.publishTarget ? <span>{artifact.publishTarget}</span> : null}
                        {artifact.reviewState ? <span>{humanizeId(artifact.reviewState)}</span> : null}
                    </div>
                ) : null}
                {artifact.keyPoints.length ? (
                    <ul className="ai-draft-artifact-key-points">
                        {artifact.keyPoints.slice(0, 5).map((point) => (
                            <li key={point}>{point}</li>
                        ))}
                    </ul>
                ) : null}
                {artifact.body ? <p className="ai-draft-artifact-body">{artifact.body}</p> : null}
                {artifact.sections.length ? (
                    <div className="ai-draft-artifact-sections">
                        {artifact.sections.slice(0, 4).map((section) => (
                            <section key={section.id}>
                                <strong>{section.title}</strong>
                                {section.body ? <p>{section.body}</p> : null}
                                {section.bullets.length ? (
                                    <ul>
                                        {section.bullets.slice(0, 4).map((point) => (
                                            <li key={point}>{point}</li>
                                        ))}
                                    </ul>
                                ) : null}
                            </section>
                        ))}
                    </div>
                ) : null}
            </article>
        ))}
    </section>
);

const DraftOutlinePreview = ({ preview }) => {
    if (!preview?.nodeCount) {
        return null;
    }
    const shownNodeIds = new Set();
    const visibleNodeIds = collectVisibleDraftOutlineIds(preview);
    const renderedRoots = preview.roots.map((root) => (
        <DraftOutlineNode
            key={`outline-root-${draftNodeId(root)}`}
            node={root}
            preview={preview}
            depth={0}
            shownNodeIds={shownNodeIds}
        />
    ));
    const hiddenNodeCount = Math.max(preview.nodeCount - visibleNodeIds.size, 0);
    return (
        <section className="ai-draft-outline-preview" aria-label="Draft tree preview">
            <div className="ai-draft-outline-header">
                <span>Draft outline</span>
                <strong>{preview.title}</strong>
                <p>
                    {preview.nodeCount} {preview.nodeCount === 1 ? 'node' : 'nodes'} · {preview.edgeCount}{' '}
                    {preview.edgeCount === 1 ? 'edge' : 'edges'} · {preview.needsReviewCount}{' '}
                    unsourced/needs-review
                </p>
            </div>
            <ol className="ai-draft-outline-tree">
                {renderedRoots}
                {hiddenNodeCount ? (
                    <li className="ai-draft-outline-more">
                        {hiddenNodeCount} more {hiddenNodeCount === 1 ? 'node' : 'nodes'} in item review
                    </li>
                ) : null}
            </ol>
        </section>
    );
};

const DraftOutlineNode = ({ node, preview, depth, shownNodeIds }) => {
    const nodeId = draftNodeId(node);
    if (!nodeId || shownNodeIds.has(nodeId)) {
        return null;
    }
    shownNodeIds.add(nodeId);
    const children = asArray(preview.childrenByParent.get(nodeId));
    const visibleChildren = depth < 1 ? children.slice(0, 6) : [];
    const hiddenChildren = Math.max(children.length - visibleChildren.length, 0);
    const relationLabel = humanizeId(node.relationship_type || node.metadata?.relationship_type || '');
    return (
        <li className={`ai-draft-outline-node depth-${Math.min(depth, 2)}`}>
            <div>
                <span>{depth === 0 ? 'Root' : relationLabel || `Level ${depth + 1}`}</span>
                <strong>{node.title || node.label || 'Untitled draft node'}</strong>
                {node.summary || node.body ? <p>{node.summary || node.body}</p> : null}
                <DraftBadges
                    item={{
                        ...node,
                        id: nodeId,
                        item_type: node.node_type || node.type || 'node'
                    }}
                    compact
                />
            </div>
            {visibleChildren.length || hiddenChildren ? (
                <ol>
                    {visibleChildren.map(({ edge, node: child }) => (
                        <DraftOutlineNode
                            key={`outline-${nodeId}-${draftNodeId(child)}`}
                            node={{
                                ...child,
                                relationship_type: edge.relationship_type
                            }}
                            preview={preview}
                            depth={depth + 1}
                            shownNodeIds={shownNodeIds}
                        />
                    ))}
                    {hiddenChildren ? (
                        <li className="ai-draft-outline-more">
                            {hiddenChildren} more below {node.title || nodeId}
                        </li>
                    ) : null}
                </ol>
            ) : null}
        </li>
    );
};

const DraftBadges = ({ item, compact = false }) => {
    const badges = getAIDraftItemBadges(item);
    return (
        <span className={compact ? 'ai-draft-badges compact' : 'ai-draft-badges'}>
            {badges.map((badge) => (
                <span key={`${item.id}-${badge.id}`} className={`ai-draft-badge ${badge.tone}`}>
                    {badge.label}
                </span>
            ))}
        </span>
    );
};

const SoftwareOverlapReports = ({ reports = [] }) => (
    <details className="ai-draft-details ai-draft-overlap-review" open>
        <summary>
            {reports.reduce((count, report) => count + asArray(report.candidates).length, 0)} potential overlap{' '}
            {reports.reduce((count, report) => count + asArray(report.candidates).length, 0) === 1
                ? 'candidate'
                : 'candidates'}
        </summary>
        <div className="ai-draft-overlap-list">
            {reports.map((report) => (
                <section key={report.id} className="ai-draft-overlap-report">
                    <div className="ai-draft-overlap-report-header">
                        <span>Potential overlap</span>
                        <strong>{report.title}</strong>
                        {report.summary ? <p>{report.summary}</p> : null}
                    </div>
                    {asArray(report.candidates).map((candidate) => (
                        <article key={`${report.id}-${candidate.id}`} className="ai-draft-overlap-candidate">
                            <div className="ai-draft-overlap-title">
                                <strong>{candidate.title}</strong>
                                <span>{candidate.reviewState || report.reviewState || 'needs_review'}</span>
                            </div>
                            <div className="ai-draft-overlap-metrics">
                                <span>Score: {formatScore(candidate.score)}</span>
                                <span>Confidence: {candidate.confidence || 'Not set'}</span>
                            </div>
                            {candidate.rationale ? <p>{candidate.rationale}</p> : null}
                            {candidate.recommendation ? <small>{candidate.recommendation}</small> : null}
                            {candidate.factors.length ? (
                                <div className="ai-draft-overlap-chips" aria-label="Overlap scoring factors">
                                    {candidate.factors.slice(0, 4).map((factor) => (
                                        <span key={`${candidate.id}-${factor.id}`}>
                                            {factor.label}
                                            {factor.value ? `: ${factor.value}` : ''}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                            {candidate.evidence.length ? (
                                <ul className="ai-draft-overlap-evidence">
                                    {candidate.evidence.slice(0, 3).map((evidence) => (
                                        <li key={`${candidate.id}-${evidence.id}`}>
                                            <span>{evidence.label}</span>
                                            {evidence.source ? <small>{evidence.source}</small> : null}
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </article>
                    ))}
                </section>
            ))}
        </div>
    </details>
);
