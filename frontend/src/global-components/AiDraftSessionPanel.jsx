/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useShallow } from 'zustand/shallow';
import modalStore from '../stores/modalStore';
import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import useActivityStore from '../stores/activityStore';
import DataSourceSelect from './DataSourceSelect';
import {
    AI_DRAFT_ACCEPT_MODES,
    acceptAIDraftSession,
    buildAIDraftPreviewDiff,
    formatAIDraftPreviewDiffSummary,
    getAIDraftItemBadges,
    getAIDraftModelMetadata,
    latestAIDraftRevision,
    rejectAIDraftSession,
    reviseAIDraftSession
} from '../utils/aiDraftSessions';
import {
    previewDiffToChanges,
    PreviewDiffSummary
} from '../views/previewDiffSummary';

const PROJECTIONS = [
    { id: 'mind_map', label: 'Mind map' },
    { id: 'outline', label: 'Outline' },
    { id: 'checklist', label: 'Checklist' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'table', label: 'Table' },
    { id: 'kanban', label: 'Kanban' },
    { id: 'presentation', label: 'Slides' }
];

const ACCEPT_MODE_LABELS = {
    append: 'Append',
    replace: 'Replace branch',
    merge: 'Merge matches',
    selected: 'Selected',
    cited_only: 'Cited only',
    notes_only: 'Notes only'
};

const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

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

const nodeText = (node = {}) => node.summary || node.body || node.rationale || node.title || '';

const extractRevisionItems = (revision = {}) => [
    ...asArray(revision.draft_nodes).map((node) => ({
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
    })),
    ...asArray(revision.draft_items).map((item) => ({
        ...item,
        id: item.id || item.node_id,
        title: item.title || item.label || itemText(item) || 'AI draft item',
        content: itemText(item),
        source_refs: asArray(item.source_refs)
    })),
    ...asArray(revision.draft_annotations).map((annotation, index) => ({
        id: annotation.id || `annotation-${index}`,
        item_type: annotation.type || 'annotation',
        title: annotation.title || annotation.label || annotation.type || 'Review output',
        content: itemText(annotation),
        source_refs: asArray(annotation.source_refs),
        metadata: { draft_annotation_id: annotation.id }
    }))
].filter((item, index, items) => item.id && items.findIndex((candidate) => candidate.id === item.id) === index);

const sourceCoverage = (items = []) => {
    const cited = items.filter((item) => asArray(item.source_refs).length > 0).length;
    return {
        cited,
        uncited: Math.max(items.length - cited, 0),
        total: items.length
    };
};

const projectionHints = {
    mind_map: 'Draft branches and child nodes will appear here before they touch the graph.',
    outline: 'Ask AI for an outline or accept graph nodes to project a hierarchy here.',
    checklist: 'Checklist items appear when the draft includes tasks, checks, or review steps.',
    tasks: 'Task drafts appear when Ask AI generates owner-ready work items.',
    table: 'Table rows appear when Ask AI returns structured comparison or matrix data.',
    kanban: 'Kanban cards appear when Ask AI groups draft work by status.',
    presentation: 'Presentation sections appear when the draft includes slide-ready structure.'
};

const revisionEndpoint = ({ flowId, sessionId }) =>
    `http://localhost:8000/api/workspaces/${flowId}/ai/draft-sessions/${sessionId}/revisions`;

const acceptEndpoint = ({ flowId, sessionId }) =>
    `http://localhost:8000/api/workspaces/${flowId}/ai/draft-sessions/${sessionId}/accept`;

const requestImmediateWorkspaceSave = () => {
    window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('docmap:save-workspace-now'));
    }, 50);
};

const AiDraftSessionPanel = ({ session, onClose }) => {
    const selector = (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        setNodes: state.setNodes,
        setEdges: state.setEdges,
        updateActiveAIDraftSession: state.updateActiveAIDraftSession,
        clearActiveAIDraftSession: state.clearActiveAIDraftSession
    });
    const {
        nodes,
        edges,
        setNodes,
        setEdges,
        updateActiveAIDraftSession,
        clearActiveAIDraftSession
    } = useStore(useShallow(selector));
    const pushNode = modalStore((state) => state.pushNode);
    const flowId = flowStore((state) => state.flow_id);
    const setSaveStatus = flowStore((state) => state.setSaveStatus);
    const recordActivity = useActivityStore((state) => state.recordActivity);
    const [prompt, setPrompt] = useState('');
    const [projection, setProjection] = useState('mind_map');
    const [acceptMode, setAcceptMode] = useState('append');
    const [selectedItemIds, setSelectedItemIds] = useState([]);
    const [message, setMessage] = useState('');
    const [isRevising, setIsRevising] = useState(false);
    const [isAccepting, setIsAccepting] = useState(false);
    const promptRef = useRef(null);
    const revision = useMemo(() => latestAIDraftRevision(session), [session]);
    const items = useMemo(() => extractRevisionItems(revision), [revision]);
    const coverage = useMemo(() => sourceCoverage(items), [items]);
    const previewDiff = useMemo(
        () =>
            buildAIDraftPreviewDiff(session, {
                mode: acceptMode,
                selectedItemIds: acceptMode === 'selected' ? selectedItemIds : []
            }),
        [acceptMode, selectedItemIds, session]
    );
    const diffSummary = useMemo(() => formatAIDraftPreviewDiffSummary(previewDiff), [previewDiff]);
    const sharedDiffSummary = useMemo(
        () => previewDiffToChanges(previewDiff),
        [previewDiff]
    );

    const selectedSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
    const modelMeta = useMemo(() => getAIDraftModelMetadata(session, revision), [revision, session]);

    useEffect(() => {
        promptRef.current?.focus();
    }, [session?.session_id]);

    const toggleItem = (itemId) => {
        setSelectedItemIds((current) =>
            current.includes(itemId)
                ? current.filter((selectedId) => selectedId !== itemId)
                : [...current, itemId]
        );
    };

    const submitRevision = async () => {
        if (!prompt.trim() || isRevising) {
            return;
        }
        setIsRevising(true);
        setMessage('');
        try {
            const response =
                flowId && session.session_id
                    ? await axios.post(revisionEndpoint({ flowId, sessionId: session.session_id }), {
                          prompt: prompt.trim(),
                          model_policy: session.model_policy,
                          selected_model: session.selected_model || null
                      })
                    : null;
            const nextSession =
                response?.data?.session ||
                response?.data?.draft_session ||
                response?.data ||
                reviseAIDraftSession(session, {
                    prompt: prompt.trim(),
                    draftNodes: revision.draft_nodes || [],
                    draftEdges: revision.draft_edges || [],
                    draftAnnotations: [
                        ...asArray(revision.draft_annotations),
                        {
                            id: `local-revision-${Date.now()}`,
                            type: 'revision_note',
                            title: prompt.trim(),
                            body: prompt.trim()
                        }
                    ],
                    model: session.selected_model || revision.model || 'auto',
                    metadata: {
                        model_reason: 'Local draft revision staged while backend generation is unavailable.'
                    }
                });
            updateActiveAIDraftSession(nextSession);
            setPrompt('');
            setSelectedItemIds([]);
            recordActivity({
                type: 'ai_draft_revised',
                title: 'Revised AI draft session',
                summary: prompt.trim(),
                metadata: {
                    session_id: session.session_id,
                    revision_id: latestAIDraftRevision(nextSession).revision_id
                }
            });
        } catch (error) {
            const nextSession = reviseAIDraftSession(session, {
                prompt: prompt.trim(),
                draftNodes: revision.draft_nodes || [],
                draftEdges: revision.draft_edges || [],
                draftAnnotations: [
                    ...asArray(revision.draft_annotations),
                    {
                        id: `local-revision-${Date.now()}`,
                        type: 'revision_note',
                        title: prompt.trim(),
                        body: error.message || prompt.trim()
                    }
                ],
                model: session.selected_model || revision.model || 'auto',
                metadata: {
                    model_reason: 'Backend revision was unavailable; preserved the request locally.'
                }
            });
            updateActiveAIDraftSession(nextSession);
            setPrompt('');
            setSelectedItemIds([]);
            setMessage('Backend revision is unavailable, so the request was preserved in the draft history.');
        } finally {
            setIsRevising(false);
        }
    };

    const acceptDraft = async (modeOverride) => {
        const mode = modeOverride || acceptMode;
        const effectiveSelectedIds = mode === 'selected' ? selectedItemIds : [];
        if (mode === 'selected' && effectiveSelectedIds.length === 0) {
            setMessage('Select at least one draft item before accepting selected changes.');
            return;
        }
        setIsAccepting(true);
        setMessage('');
        try {
            const response =
                flowId && session.session_id
                    ? await axios.post(acceptEndpoint({ flowId, sessionId: session.session_id }), {
                          mode,
                          selected_item_ids: effectiveSelectedIds
                      })
                    : null;
            const result = response?.data || {};
            const graph = result.graph || result.workspace || result;
            if (Array.isArray(graph.nodes)) {
                setNodes(graph.nodes);
            }
            if (Array.isArray(graph.edges)) {
                setEdges(graph.edges);
            }
            if (!Array.isArray(graph.nodes) && !Array.isArray(graph.edges)) {
                const fallback = acceptAIDraftSession({
                    session,
                    nodes,
                    edges,
                    mode,
                    selectedItemIds: effectiveSelectedIds
                });
                setNodes(fallback.nodes);
                setEdges(fallback.edges);
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
                    mode
                },
                status: 'completed'
            });
            clearActiveAIDraftSession();
            onClose?.();
        } catch (error) {
            const fallback = acceptAIDraftSession({
                session,
                nodes,
                edges,
                mode,
                selectedItemIds: effectiveSelectedIds
            });
            setNodes(fallback.nodes);
            setEdges(fallback.edges);
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
                metadata: fallback.accept_result,
                status: 'completed'
            });
            clearActiveAIDraftSession();
            onClose?.();
        } finally {
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
        onClose?.();
    };

    const openSourceModal = () => {
        pushNode(DataSourceSelect);
        recordActivity({
            type: 'ai_draft_add_source_opened',
            title: 'Opened source picker from AI draft',
            summary: 'Source picker opened from the active draft session.',
            metadata: {
                session_id: session.session_id
            }
        });
    };

    const renderProjection = () => {
        if (items.length === 0) {
            return (
                <div className="ai-draft-empty" role="status">
                    <strong>{projectionHints[projection]}</strong>
                    <span>
                        Refine the prompt to generate proposed nodes, review notes, source coverage,
                        or projection rows. Nothing changes in the graph until an accept action runs.
                    </span>
                </div>
            );
        }
        if (projection === 'table') {
            return (
                <div className="ai-draft-table" role="table">
                    <div role="row">
                        <span role="columnheader">Item</span>
                        <span role="columnheader">Type</span>
                        <span role="columnheader">Source</span>
                    </div>
                    {items.map((item) => (
                        <div key={`table-${item.id}`} role="row">
                            <strong role="cell">{item.title}</strong>
                            <span role="cell">{humanizeId(item.item_type || item.metadata?.node_type)}</span>
                            <span role="cell">
                                <DraftBadges item={item} compact />
                            </span>
                        </div>
                    ))}
                </div>
            );
        }
        if (projection === 'kanban') {
            const columns = ['draft', 'needs_review', 'cited'];
            return (
                <div className="ai-draft-kanban">
                    {columns.map((column) => (
                        <section key={column}>
                            <strong>{humanizeId(column)}</strong>
                            {items
                                .filter((item) =>
                                    column === 'cited'
                                        ? asArray(item.source_refs).length > 0
                                        : (item.status || 'draft') === column ||
                                          (column === 'needs_review' && asArray(item.source_refs).length === 0)
                                )
                                .map((item) => (
                                    <span key={`${column}-${item.id}`}>{item.title}</span>
                                ))}
                        </section>
                    ))}
                </div>
            );
        }
        return (
            <div className={`ai-draft-projection ai-draft-projection-${projection}`}>
                {items.map((item) => (
                    <article key={`${projection}-${item.id}`} className="ai-draft-item">
                        <label>
                            <input
                                type="checkbox"
                                checked={selectedSet.has(item.id)}
                                onChange={() => toggleItem(item.id)}
                            />
                            <span>{humanizeId(item.item_type || item.metadata?.node_type || 'item')}</span>
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
                    <p>AI drafting table</p>
                    <strong>{session.role || 'Ask AI'}</strong>
                    <span>{scopeLabel(session.scope)}</span>
                </div>
                <button type="button" onClick={discardDraft} aria-label="Close AI draft session">
                    x
                </button>
            </div>

            <div className="ai-draft-meta-grid">
                <div>
                    <span>Actual model</span>
                    <strong>{modelMeta.model}</strong>
                    {modelMeta.reason ? <small>{modelMeta.reason}</small> : null}
                    {modelMeta.policy ? <small>Policy: {humanizeId(modelMeta.policy)}</small> : null}
                </div>
                <div>
                    <span>Risk / cost</span>
                    <strong>{modelMeta.riskTier ? humanizeId(modelMeta.riskTier) : 'Not estimated'}</strong>
                    <small>
                        {modelMeta.tokenEstimate ? `${modelMeta.tokenEstimate} tokens` : 'Token estimate pending'}
                        {modelMeta.costEstimate ? ` / ${modelMeta.costEstimate}` : ''}
                    </small>
                </div>
                <div>
                    <span>Source coverage</span>
                    <strong>
                        {coverage.cited}/{coverage.total} cited
                    </strong>
                    <small>{coverage.uncited} needs review</small>
                </div>
                <div>
                    <span>Preview diff</span>
                    <strong>{diffSummary.text}</strong>
                    <small>{previewDiff.review_outputs} review outputs</small>
                </div>
            </div>

            <div className="ai-draft-conversation">
                <div className="ai-draft-history">
                    {asArray(session.prompt_history).map((entry, index) => (
                        <p key={`${entry.revision_id || index}-${entry.created_at}`}>
                            <span>{entry.role || 'user'}</span>
                            {entry.content}
                        </p>
                    ))}
                </div>
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
                        placeholder="Ask for a sharper structure, a different projection, or more detail."
                    />
                </label>
                <button type="button" onClick={submitRevision} disabled={isRevising || !prompt.trim()}>
                    {isRevising ? 'Revising' : 'Add revision'}
                </button>
            </div>

            <div className="ai-draft-tabs" role="tablist" aria-label="Draft projections">
                {PROJECTIONS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={projection === tab.id}
                        className={projection === tab.id ? 'active' : ''}
                        onClick={() => setProjection(tab.id)}
                        onKeyDown={(event) => {
                            if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) {
                                return;
                            }
                            event.preventDefault();
                            const currentIndex = PROJECTIONS.findIndex((candidate) => candidate.id === projection);
                            const delta = event.key === 'ArrowRight' ? 1 : -1;
                            const next = PROJECTIONS[(currentIndex + delta + PROJECTIONS.length) % PROJECTIONS.length];
                            setProjection(next.id);
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {renderProjection()}

            <PreviewDiffSummary changes={sharedDiffSummary} />

            <div className="ai-draft-accept">
                <label>
                    Accept mode
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
                </label>
                <button type="button" className="secondary" onClick={openSourceModal}>
                    Add source
                </button>
                <button type="button" onClick={() => acceptDraft('append')} disabled={isAccepting}>
                    Accept all
                </button>
                <button
                    type="button"
                    onClick={() => acceptDraft('selected')}
                    disabled={isAccepting || selectedItemIds.length === 0}
                >
                    Accept selected
                </button>
                <button type="button" onClick={() => acceptDraft()} disabled={isAccepting}>
                    {isAccepting ? 'Accepting' : 'Accept mode'}
                </button>
            </div>
            {message ? <p className="ai-draft-message">{message}</p> : null}
        </div>
    );
};

export default AiDraftSessionPanel;

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
