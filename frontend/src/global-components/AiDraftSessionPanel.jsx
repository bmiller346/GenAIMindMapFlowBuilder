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
    acceptAIDraftSession,
    acceptModeForChangeIntent,
    buildAIDraftMemoryContext,
    buildAIDraftPreviewDiff,
    buildSelectedSourceDraftPayload,
    changeIntentFromAIDraftSession,
    getAIDraftAcceptModeDetail,
    getAIDraftModelMetadata,
    getAIDraftSourceStatus,
    inferAIDraftChangeIntent,
    latestAIDraftRevision,
    draftArtifactPreviewToMarkdown,
    normalizeAcceptedDraftArtifacts,
    normalizePublishableDraftArtifacts,
    normalizeSoftwareOverlapReports,
    rejectAIDraftSession,
    reviseAIDraftSession,
    visibleAIDraftPromptText
} from '../utils/aiDraftSessions';
import { buildSourceLibraryProjection } from '../views/graphProjection';
import { previewDiffToChanges } from '../views/previewDiffSummary';
import { buildLocalGuidedFallbackDraft, isSankeyDraftRequest } from '../utils/localSankeyDraft';
import { createOperationSnapshot, restoreOperationSnapshot } from '../utils/operationSnapshots';
import { trustStatesForSubject } from '../utils/trustStates';
import DraftAcceptControls from './aiDraftSession/DraftAcceptControls';
import DraftArtifactPreviews from './aiDraftSession/DraftArtifactPreviews';
import DraftOutlinePreview from './aiDraftSession/DraftOutlinePreview';
import DraftProjection from './aiDraftSession/DraftProjection';
import DraftReviewNotes from './aiDraftSession/DraftReviewNotes';
import DraftRevisionTimeline from './aiDraftSession/DraftRevisionTimeline';
import DraftSourceCoverage from './aiDraftSession/DraftSourceCoverage';
import SoftwareOverlapReports from './aiDraftSession/SoftwareOverlapReports';
import ConnectedPackagePreview from '../connected-package/ConnectedPackagePreview';

const ACCEPT_MODE_LABELS = {
    append: getAIDraftAcceptModeDetail('append').label,
    replace: getAIDraftAcceptModeDetail('replace').label,
    merge: getAIDraftAcceptModeDetail('merge').label,
    selected: getAIDraftAcceptModeDetail('selected').label,
    cited_only: getAIDraftAcceptModeDetail('cited_only').label,
    notes_only: getAIDraftAcceptModeDetail('notes_only').label
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

const MAP_REVIEW_SCOPES = new Set(['workspace', 'source', 'nodes']);
const MAP_CANVAS_VIEWS = new Set(['mindmap', 'knowledgeGraph']);

const mapFallbackCanvas = (fallback) =>
    MAP_CANVAS_VIEWS.has(fallback) ? fallback : 'mindmap';

const draftLooksLikeFlowchart = (session = {}, revision = {}) => {
    const promptText = [
        revision.prompt,
        ...asArray(session.prompt_history).map((entry) =>
            typeof entry === 'string' ? entry : entry.content || entry.prompt || entry.text
        )
    ]
        .join(' ')
        .toLowerCase();
    if (/\b(flowchart|flow chart|process map|swimlane|decision tree)\b/.test(promptText)) {
        return true;
    }
    const draftNodes = asArray(revision.draft_nodes);
    if (!draftNodes.length) {
        return false;
    }
    const flowNodeTypes = new Set([
        'process',
        'decision',
        'handoff',
        'milestone',
        'checkpoint',
        'dependency',
        'terminator'
    ]);
    const flowNodeCount = draftNodes.filter((node) =>
        flowNodeTypes.has(String(node.node_type || node.type || node.metadata?.node_type || '').toLowerCase())
    ).length;
    return flowNodeCount >= 2 || draftNodes.some((node) =>
        String(node.node_type || node.type || node.metadata?.node_type || '').toLowerCase() === 'decision'
    );
};

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
    if (draftLooksLikeFlowchart(session, revision)) {
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
    const trustStateIds = items.flatMap((item) => trustStatesForSubject(item).map((state) => state.id));
    return {
        cited,
        uncited: Math.max(items.length - cited, 0),
        assumptions: statuses.filter((status) => status.id === 'ai_assumption_uncited').length,
        missingRequired: statuses.filter((status) => status.id === 'missing_required_source').length,
        webCited: trustStateIds.filter((id) => id === 'web-cited').length,
        sourceBacked: trustStateIds.filter((id) => id === 'source-backed').length,
        inferred: trustStateIds.filter((id) => id === 'inferred').length,
        total: items.length
    };
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
        mapStyle: state.mapStyle,
        viewport: state.viewport,
        sourceLibrary: state.sourceLibrary,
        activeCanvasView: state.activeCanvasView,
        activeGraphFilters: state.activeGraphFilters,
        setNodes: state.setNodes,
        setEdges: state.setEdges,
        setWorkspaceBrief: state.setWorkspaceBrief,
        setMapStyle: state.setMapStyle,
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
        mapStyle,
        viewport,
        sourceLibrary,
        activeCanvasView,
        activeGraphFilters,
        setNodes,
        setEdges,
        setWorkspaceBrief,
        setMapStyle,
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
    const hasGraphDraft = useMemo(() => revisionHasGraphDraft(revision), [revision]);
    const selectedSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
    const modelMeta = useMemo(() => getAIDraftModelMetadata(session, revision), [revision, session]);
    const acceptModeDetail = useMemo(
        () => getAIDraftAcceptModeDetail(acceptMode),
        [acceptMode]
    );
    const isReportOnlyDraft = !hasGraphDraft && (items.length > 0 || publishableArtifacts.length > 0);
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
        const priorPrompt = visibleAIDraftPromptText(revision.prompt || '') || visiblePromptTitle;
        const localGuidedDraft = buildLocalGuidedFallbackDraft({
            prompt: revisionPrompt,
            priorPrompt,
            session,
            revision,
            sourceRefs: revisionSourceRefs
        });
        const shouldReviseLocally =
            session.metadata?.preview_mode === 'local_fallback' ||
            revision.metadata?.preview_mode === 'local_fallback' ||
            Boolean(localGuidedDraft?.draftNodes?.length);
        try {
            const response =
                flowId && session.session_id && !shouldReviseLocally
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
                    draftNodes: localGuidedDraft?.draftNodes?.length
                        ? localGuidedDraft.draftNodes
                        : revision.draft_nodes || [],
                    draftEdges: localGuidedDraft?.draftNodes?.length
                        ? localGuidedDraft.draftEdges
                        : revision.draft_edges || [],
                    draftAnnotations: localGuidedDraft
                        ? localGuidedDraft.draftAnnotations
                        : [
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
                        local_fallback_mode: localGuidedDraft?.draftNodes?.length
                            ? isSankeyDraftRequest({ prompt: revisionPrompt, session, revision })
                                ? 'sankey_structured_rows'
                                : 'guided_start_scaffold'
                            : localGuidedDraft
                              ? 'guided_context_needed'
                              : 'generic',
                        output_shape: localGuidedDraft ? revision.metadata?.output_shape || session.metadata?.output_shape : revision.metadata?.output_shape,
                        requested_visual: localGuidedDraft ? revision.metadata?.requested_visual || session.metadata?.requested_visual : revision.metadata?.requested_visual,
                        model_reason: localGuidedDraft?.draftNodes?.length
                            ? 'Local guided-start scaffold was drafted from the revision while backend generation is unavailable.'
                            : 'Local draft revision staged while backend generation is unavailable.'
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
            const fallbackGuidedDraft =
                localGuidedDraft ||
                (isSankeyDraftRequest({ prompt: revisionPrompt, session, revision })
                    ? buildLocalGuidedFallbackDraft({
                          prompt: revisionPrompt,
                          priorPrompt,
                          session,
                          revision,
                          sourceRefs: revisionSourceRefs
                      })
                    : null);
            const nextSession = reviseAIDraftSession(session, {
                prompt: revisionPrompt,
                draftNodes: fallbackGuidedDraft?.draftNodes?.length
                    ? fallbackGuidedDraft.draftNodes
                    : revision.draft_nodes || [],
                draftEdges: fallbackGuidedDraft?.draftNodes?.length
                    ? fallbackGuidedDraft.draftEdges
                    : revision.draft_edges || [],
                draftAnnotations: fallbackGuidedDraft
                    ? fallbackGuidedDraft.draftAnnotations
                    : [
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
                    local_fallback_mode: fallbackGuidedDraft?.draftNodes?.length
                        ? isSankeyDraftRequest({ prompt: revisionPrompt, session, revision })
                            ? 'sankey_structured_rows'
                            : 'guided_start_scaffold'
                        : fallbackGuidedDraft
                          ? 'guided_context_needed'
                          : 'generic',
                    output_shape: fallbackGuidedDraft ? revision.metadata?.output_shape || session.metadata?.output_shape : revision.metadata?.output_shape,
                    requested_visual: fallbackGuidedDraft ? revision.metadata?.requested_visual || session.metadata?.requested_visual : revision.metadata?.requested_visual,
                    model_reason: fallbackGuidedDraft?.draftNodes?.length
                        ? 'Local guided-start scaffold was drafted from the revision while backend generation is unavailable.'
                        : 'Backend revision was unavailable; preserved the request locally.'
                }
            });
            updateActiveAIDraftSession(nextSession);
            setPrompt('');
            setSelectedItemIds([]);
            setMessage(
                fallbackGuidedDraft?.draftNodes?.length
                    ? 'Backend revision is unavailable, so TraceSpace drafted a local scaffold for review.'
                    : 'Backend revision is unavailable, so the request was preserved in the draft history.'
            );
        } finally {
            setProgressMessage('');
            setIsRevising(false);
        }
    };

    const acceptDraft = async (modeOverride) => {
        const mode = modeOverride || acceptMode;
        const activeAcceptModeDetail = getAIDraftAcceptModeDetail(mode);
        const effectiveSelectedIds = mode === 'selected' ? selectedItemIds : [];
        const acceptedAt = new Date().toISOString();
        const acceptedArtifacts = normalizeAcceptedDraftArtifacts(revision, {
            session,
            mode,
            selectedItemIds: effectiveSelectedIds,
            acceptedAt
        });
        const undoSnapshot = createOperationSnapshot({
            nodes,
            edges,
            viewport,
            workspaceBrief,
            mapStyle
        });
        let acceptActivityId = '';
        const undoAcceptedDraft = () => {
            restoreOperationSnapshot({
                snapshot: undoSnapshot,
                setNodes,
                setEdges,
                setWorkspaceBrief,
                setMapStyle,
                setViewPort,
                setViewport
            });
            updateActiveAIDraftSession(session);
            setSaveStatus('dirty');
            requestImmediateWorkspaceSave();
            if (acceptActivityId) {
                useActivityStore.getState().updateActivity(acceptActivityId, {
                    status: 'completed',
                    summary: 'Accepted AI draft was undone locally.',
                    context: 'Accepted AI draft was undone locally.',
                    undo: undefined
                });
            }
        };
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
        const acceptedCanvasView = canvasForDraft(session, revision, activeCanvasView);
        const applyAcceptedGraph = (graph = {}, { preservePositions = false } = {}) => {
            const hasNodes = Array.isArray(graph.nodes);
            const hasEdges = Array.isArray(graph.edges);
            let nextNodes = hasNodes ? graph.nodes : null;
            let nextEdges = hasEdges ? graph.edges : null;
            if (hasNodes && !preservePositions) {
                const layouted = getLayoutedElements(nextNodes, hasEdges ? nextEdges : edges, {
                    mode: acceptedCanvasView
                });
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
        const shouldAcceptLocally =
            session.metadata?.preview_mode === 'local_fallback' ||
            revision.metadata?.preview_mode === 'local_fallback';
        try {
            const response =
                flowId && session.session_id && !shouldAcceptLocally
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
                          selectedItemIds: effectiveSelectedIds,
                          acceptedAt
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
                        selectedItemIds: effectiveSelectedIds,
                        acceptedAt
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
            const acceptResult = acceptResultFromResponse(result);
            const acceptedArtifactsForActivity = asArray(acceptResult.accepted_artifacts).length
                ? acceptResult.accepted_artifacts
                : acceptedArtifacts;
            acceptActivityId = recordActivity({
                type: 'ai_draft_accepted',
                title: 'Accepted AI draft session',
                summary: `Accepted draft session with ${ACCEPT_MODE_LABELS[mode] || humanizeId(mode)} mode.`,
                metadata: {
                    session_id: session.session_id,
                    revision_id: revision.revision_id,
                    mode,
                    apply_intent: activeAcceptModeDetail.user_choice,
                    change_intent: sessionChangeIntent,
                    accepted_artifacts: acceptedArtifactsForActivity,
                    accepted_at: acceptResult.accepted_at || acceptedAt,
                    undo_kind: acceptResult.undo?.kind || acceptResult.metadata?.undo_kind || 'server_snapshot'
                },
                status: 'completed',
                undo: undoAcceptedDraft
            });
            clearActiveAIDraftSession();
            clearGeneratedHelperPreview('nodeAiActionRequest');
            setActiveView(acceptedCanvasView);
            onAccepted?.({ session, result, mode });
            onClose?.();
            if (flowId) {
                setSaveStatus('dirty');
                requestImmediateWorkspaceSave();
            }
        } catch (error) {
            setProgressMessage('Applying the local draft fallback.');
            const fallback = acceptAIDraftSession({
                session,
                nodes,
                edges,
                mode,
                selectedItemIds: effectiveSelectedIds,
                acceptedAt
            });
            applyAcceptedGraph(fallback, { preservePositions: shouldPreserveScopedLayout });
            updateActiveAIDraftSession(fallback.session);
            setMessage('Backend accept is unavailable; applied the local draft contract fallback.');
            acceptActivityId = recordActivity({
                type: 'ai_draft_accepted_local',
                title: 'Accepted AI draft locally',
                summary: error.message || 'Backend accept was unavailable.',
                metadata: {
                    ...fallback.accept_result,
                    accepted_artifacts: asArray(fallback.accept_result?.accepted_artifacts).length
                        ? fallback.accept_result.accepted_artifacts
                        : acceptedArtifacts,
                    accepted_at: acceptedAt,
                    undo_kind: fallback.accept_result?.undo?.kind || 'react_flow_snapshot'
                },
                status: 'completed',
                undo: undoAcceptedDraft
            });
            clearActiveAIDraftSession();
            clearGeneratedHelperPreview('nodeAiActionRequest');
            setActiveView(acceptedCanvasView);
            onAccepted?.({ session, result: fallback, mode, localFallback: true });
            onClose?.();
            if (flowId) {
                setSaveStatus('dirty');
                requestImmediateWorkspaceSave();
            }
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
            setMessage(`${artifact.label} copied as publish-ready Markdown.`);
            window.setTimeout(() => setCopiedArtifactId(''), 1600);
        } catch {
            setMessage('Copy is unavailable in this browser. Select the preview text and copy it manually.');
        }
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

            <DraftRevisionTimeline
                promptHistory={promptHistory}
                prompt={prompt}
                promptRef={promptRef}
                onPromptChange={setPrompt}
                onSubmitRevision={submitRevision}
                isRevising={isRevising}
            />

            <DraftOutlinePreview preview={outlinePreview} />

            {isReportOnlyDraft ? (
                <div className="ai-draft-guidance" role="status">
                    <strong>This preview is a review packet, not a graph expansion.</strong>
                    <span>
                        It did not return draft nodes or relationship edges to place on the canvas.
                        Copy the artifact, use the Connections review/export table, or refine the
                        draft to ask for explicit relationship edges.
                    </span>
                </div>
            ) : null}

            {publishableArtifacts.length ? (
                <DraftArtifactPreviews
                    artifacts={publishableArtifacts}
                    copiedArtifactId={copiedArtifactId}
                    onCopy={copyArtifactMarkdown}
                />
            ) : null}

            <ConnectedPackagePreview session={session} revision={revision} />

            <DraftProjection
                items={items}
                selectedSet={selectedSet}
                onToggleItem={toggleItem}
                hasArtifactPreviews={publishableArtifacts.length > 0}
            />

            {overlapReports.length ? <SoftwareOverlapReports reports={overlapReports} /> : null}

            <DraftReviewNotes reviewNotes={reviewNotes} />

            <DraftSourceCoverage
                modelMeta={modelMeta}
                coverage={coverage}
                availableSources={availableSources}
                sourceToAddId={sourceToAddId}
                onSourceToAddChange={setSourceToAddId}
                onOpenSourceModal={openSourceModal}
                isAddingSource={isAddingSource}
                acceptMode={acceptMode}
                onAcceptModeChange={setAcceptMode}
                acceptModeDetail={acceptModeDetail}
            />

            <DraftAcceptControls
                sessionChangeIntent={sessionChangeIntent}
                acceptMode={acceptMode}
                acceptModeDetail={acceptModeDetail}
                acceptImpact={acceptImpact}
                selectedItemIds={selectedItemIds}
                isAccepting={isAccepting}
                primaryAcceptText={primaryAcceptText}
                itemCount={items.length}
                onDiscard={discardDraft}
                onAccept={acceptDraft}
            />
            {progressMessage ? <p className="ai-draft-message active">{progressMessage}</p> : null}
            {message ? <p className="ai-draft-message">{message}</p> : null}
        </div>
    );
};

export default AiDraftSessionPanel;
