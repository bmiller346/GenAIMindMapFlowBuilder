/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import useActivityStore from '../stores/activityStore';
import AiDraftSessionPanel from './AiDraftSessionPanel';
import {
    acceptAIActionPreview,
    createAIActionRun,
    previewDraftEdges,
    previewDraftNodes,
    previewNonNodeOutputs
} from '../utils/aiActionRuns';

const NODE_TYPES = [
    'category',
    'concept',
    'standard',
    'workflow',
    'procedure',
    'decision',
    'risk',
    'requirement',
    'task',
    'reference',
    'definition',
    'question',
    'dependency',
    'needs_review'
];

const REVIEW_STATES = [
    'ai_generated',
    'needs_review',
    'reviewed',
    'approved',
    'rejected',
    'deprecated'
];

const PRIORITIES = ['', 'low', 'medium', 'high', 'critical'];

const getNestedData = (data) => {
    if (data?.data && typeof data.data === 'object') {
        return data.data;
    }

    return {};
};

const firstValue = (data, keys) => {
    const nestedData = getNestedData(data);

    for (const key of keys) {
        const value = data?.[key] ?? nestedData?.[key];
        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    return '';
};

const getSourceRefs = (data) => {
    const nestedData = getNestedData(data);
    const refs = data?.source_refs ?? nestedData?.source_refs;

    return Array.isArray(refs) ? refs.filter(Boolean) : [];
};

const firstSourceRef = (data) => {
    const refs = getSourceRefs(data);

    if (refs.length > 0) {
        return refs[0] || {};
    }

    return {};
};

const getExternalRefs = (data) => {
    const nestedData = getNestedData(data);
    const refs = data?.external_refs ?? nestedData?.external_refs;

    return refs && typeof refs === 'object' ? refs : {};
};

const isEmptyValue = (value) =>
    value === undefined || value === null || String(value).trim() === '';

const hasCitation = (draft) =>
    Boolean(
        draft.source_document ||
        draft.source_page ||
        draft.source_section ||
        draft.source_quote
    );

const citationLocation = (draft) => {
    const parts = [];

    if (draft.source_document) {
        parts.push(draft.source_document);
    }
    if (draft.source_page) {
        parts.push(`p. ${draft.source_page}`);
    }
    if (draft.source_section) {
        parts.push(draft.source_section);
    }

    return parts.join(' | ');
};

const humanizeId = (value = '') =>
    String(value || '')
        .replaceAll('_', ' ')
        .replaceAll('-', ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\w/, (letter) => letter.toUpperCase());

const previewMetadata = (preview = {}) =>
    preview.metadata && typeof preview.metadata === 'object' ? preview.metadata : {};

const previewModelSummary = (preview = {}) => {
    const metadata = previewMetadata(preview);
    const model = metadata.model || preview.model || '';
    const tier = metadata.model_tier || preview.model_tier || '';

    if (!model && !tier) {
        return '';
    }

    return [model || 'auto', tier && tier !== model ? tier : '']
        .filter(Boolean)
        .join(' | ');
};

const previewScopeLabel = (preview = {}) =>
    typeof preview.scope === 'string'
        ? preview.scope
        : preview.scope?.type || 'workspace';

const previewImpactSummary = ({ draftNodes = [], draftEdges = [], outputs = [] }) => {
    const pieces = [];
    if (draftNodes.length) {
        pieces.push(`append ${draftNodes.length} node${draftNodes.length === 1 ? '' : 's'}`);
    }
    if (draftEdges.length) {
        pieces.push(`connect ${draftEdges.length} edge${draftEdges.length === 1 ? '' : 's'}`);
    }
    if (outputs.length) {
        pieces.push(`store ${outputs.length} review output${outputs.length === 1 ? '' : 's'}`);
    }
    return pieces.length ? `Accept will ${pieces.join(', ')}.` : 'Accept stores the reviewed AI output.';
};

const externalRefSummary = (provider, ref) => {
    const details = [
        ref?.board_id ? `Board ${ref.board_id}` : '',
        ref?.item_id ? `Item ${ref.item_id}` : '',
        ref?.export_batch_id ? `Batch ${ref.export_batch_id}` : '',
        ref?.last_pushed_at ? `Pushed ${ref.last_pushed_at}` : '',
        ref?.url ? ref.url : ''
    ].filter(Boolean);

    return details.length ? details.join(' | ') : `${provider} ref is empty`;
};

const requestImmediateWorkspaceSave = () => {
    window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('docmap:save-workspace-now'));
    }, 0);
};

const NodeInspector = ({ selectedNodeId, validationIssues = [], onClose }) => {
    const selector = (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        setNodes: state.setNodes,
        setEdges: state.setEdges,
        activeAIDraftSession: state.activeAIDraftSession,
        activeAIActionPreview: state.activeAIActionPreview,
        clearActiveAIActionPreview: state.clearActiveAIActionPreview,
        recordAIActionRun: state.recordAIActionRun
    });
    const {
        nodes,
        edges,
        setNodes,
        setEdges,
        activeAIDraftSession,
        activeAIActionPreview,
        clearActiveAIActionPreview,
        recordAIActionRun
    } = useStore(useShallow(selector));
    const flowId = flowStore((state) => state.flow_id);
    const setSaveStatus = flowStore((state) => state.setSaveStatus);
    const recordActivity = useActivityStore((state) => state.recordActivity);
    const selectedNode = useMemo(
        () => nodes.find((node) => node.id === selectedNodeId),
        [nodes, selectedNodeId]
    );
    const [draft, setDraft] = useState({});
    const [applyMessage, setApplyMessage] = useState('');
    const recordedPreviewIds = useRef(new Set());
    const aiDraftNodes = useMemo(
        () => previewDraftNodes(activeAIActionPreview),
        [activeAIActionPreview]
    );
    const aiDraftEdges = useMemo(
        () => previewDraftEdges(activeAIActionPreview),
        [activeAIActionPreview]
    );
    const aiNonNodeOutputs = useMemo(
        () => previewNonNodeOutputs(activeAIActionPreview),
        [activeAIActionPreview]
    );
    const aiPreviewAppliesHere =
        activeAIActionPreview &&
        (activeAIActionPreview.source_node_id === selectedNodeId ||
            activeAIActionPreview.node_id === selectedNodeId ||
            activeAIActionPreview.scope?.node_id === selectedNodeId ||
            activeAIActionPreview.scope === 'workspace' ||
            activeAIActionPreview.scope?.type === 'workspace');
    const aiDraftSessionAppliesHere =
        activeAIDraftSession &&
        (activeAIDraftSession.scope?.type === 'workspace' ||
            activeAIDraftSession.scope?.node_id === selectedNodeId ||
            activeAIDraftSession.scope?.source_node_id === selectedNodeId ||
            (activeAIDraftSession.scope?.type === 'nodes' &&
                Array.isArray(activeAIDraftSession.scope?.node_ids) &&
                activeAIDraftSession.scope.node_ids.includes(selectedNodeId)));

    useEffect(() => {
        if (!selectedNode) {
            setDraft({});
            setApplyMessage('');
            return;
        }

        const data = selectedNode.data || {};
        const sourceRef = firstSourceRef(data);
        const externalRefs = getExternalRefs(data);
        setDraft({
            title: firstValue(data, ['title', 'question', 'content', 'prompt', 'summ']),
            node_type: firstValue(data, ['node_type', 'component_type', 'name']),
            status: firstValue(data, ['status']) || 'ai_generated',
            priority: firstValue(data, ['priority']),
            owner_id: firstValue(data, ['owner_id', 'assignee', 'owner']),
            due_date: firstValue(data, ['due_date']),
            confidence:
                firstValue(data, ['confidence']) || sourceRef.confidence || '',
            source_document: sourceRef.document_id || '',
            source_page: sourceRef.page || '',
            source_section: sourceRef.section || '',
            source_quote: sourceRef.quote_snippet || '',
            miro_board_id: externalRefs.miro?.board_id || '',
            miro_item_id: externalRefs.miro?.item_id || '',
            monday_board_id: externalRefs.monday?.board_id || '',
            monday_item_id: externalRefs.monday?.item_id || ''
        });
    }, [selectedNode]);

    useEffect(() => {
        if (!activeAIActionPreview || !aiPreviewAppliesHere) {
            return;
        }

        const previewKey =
            activeAIActionPreview.preview_id ||
            activeAIActionPreview.ai_action_id ||
            `${activeAIActionPreview.role}-${activeAIActionPreview.action}`;
        if (recordedPreviewIds.current.has(previewKey)) {
            return;
        }

        recordedPreviewIds.current.add(previewKey);
        const run = createAIActionRun({
            preview: activeAIActionPreview,
            status: 'previewed'
        });
        recordActivity({
            type: 'ai_action_previewed',
            title: 'Previewed AI action',
            summary: `${run.role}: ${run.action || 'generated preview'}.`,
            node_ids: [run.source_node_id].filter(Boolean),
            source_ids: run.input_source_refs
                .map((ref) => ref.document_id || ref.source_id)
                .filter(Boolean),
            metadata: {
                ai_action_id: run.ai_action_id,
                preview_id: activeAIActionPreview.preview_id,
                scope: run.scope
            },
            status: 'completed'
        });
    }, [activeAIActionPreview, aiPreviewAppliesHere, recordActivity]);

    const updateDraft = (key, value) => {
        setDraft((current) => ({ ...current, [key]: value }));
        setApplyMessage('');
    };

    const saveMetadata = () => {
        const existingExternalRefs = getExternalRefs(selectedNode?.data || {});
        const existingSourceRefs = getSourceRefs(selectedNode?.data || {});
        const sourceRefs =
            draft.source_document ||
            draft.source_page ||
            draft.source_section ||
            draft.source_quote
                ? [
                      {
                          ...(existingSourceRefs[0] || {}),
                          document_id: draft.source_document,
                          page: draft.source_page,
                          section: draft.source_section,
                          quote_snippet: draft.source_quote,
                          confidence: draft.confidence
                      },
                      ...existingSourceRefs.slice(1)
                  ]
                : existingSourceRefs.slice(1);

        const externalRefs = { ...existingExternalRefs };
        if (draft.miro_board_id || draft.miro_item_id || existingExternalRefs.miro) {
            externalRefs.miro = {
                ...(existingExternalRefs.miro || {}),
                board_id: draft.miro_board_id,
                item_id: draft.miro_item_id
            };
        }
        if (
            draft.monday_board_id ||
            draft.monday_item_id ||
            existingExternalRefs.monday
        ) {
            externalRefs.monday = {
                ...(existingExternalRefs.monday || {}),
                board_id: draft.monday_board_id,
                item_id: draft.monday_item_id
            };
        }
        Object.keys(externalRefs).forEach((provider) => {
            if (
                externalRefs[provider] &&
                typeof externalRefs[provider] === 'object' &&
                Object.values(externalRefs[provider]).every(isEmptyValue)
            ) {
                delete externalRefs[provider];
            }
        });

        setNodes(
            nodes.map((node) => {
                if (node.id !== selectedNode.id) {
                    return node;
                }

                return {
                    ...node,
                    data: {
                        ...node.data,
                        title: draft.title,
                        node_type: draft.node_type,
                        status: draft.status,
                        priority: draft.priority,
                        owner_id: draft.owner_id,
                        due_date: draft.due_date,
                        confidence: draft.confidence,
                        source_refs: sourceRefs,
                        external_refs: externalRefs,
                        ...(node.data?.manual
                            ? {
                                  data: {
                                      ...(node.data?.data || {}),
                                      summ: draft.title || node.data?.data?.summ
                                  }
                              }
                            : {})
                    }
                };
            })
        );
        if (flowId) {
            setSaveStatus('dirty');
        }
        recordActivity({
            type: 'node_metadata_applied',
            title: 'Node metadata applied',
            summary: `Updated metadata for ${draft.title || selectedNode.id}.`,
            node_ids: [selectedNode.id],
            source_ids: draft.source_document ? [draft.source_document] : [],
            metadata: {
                node_type: draft.node_type,
                status: draft.status,
                priority: draft.priority,
                has_source: isSourceBacked
            }
        });
        setApplyMessage(
            flowId
                ? 'Applied locally. Save or autosave will persist this workspace.'
                : 'Applied locally. Create or open a workspace to persist it.'
        );
    };

    const acceptAIAction = () => {
        const result = acceptAIActionPreview({
            preview: activeAIActionPreview,
            nodes,
            edges
        });

        setNodes(result.nodes);
        setEdges(result.edges);
        recordAIActionRun(result.run);
        clearActiveAIActionPreview();
        if (flowId) {
            setSaveStatus('dirty');
            requestImmediateWorkspaceSave();
        }
        recordActivity({
            type: 'ai_action_accepted',
            title: 'Accepted AI action preview',
            summary: `Accepted ${result.run.generated_node_ids.length} generated node${
                result.run.generated_node_ids.length === 1 ? '' : 's'
            }.`,
            node_ids: [
                activeAIActionPreview.source_node_id ||
                    activeAIActionPreview.node_id ||
                    activeAIActionPreview.scope?.node_id,
                ...result.run.generated_node_ids
            ].filter(Boolean),
            source_ids: result.run.input_source_refs
                .map((ref) => ref.document_id || ref.source_id)
                .filter(Boolean),
            metadata: {
                ai_action_id: result.run.ai_action_id,
                preview_id: activeAIActionPreview.preview_id,
                role: result.run.role,
                action: result.run.action,
                scope: result.run.scope
            },
            status: 'completed'
        });
    };

    const rejectAIAction = () => {
        const run = createAIActionRun({
            preview: activeAIActionPreview,
            status: 'rejected'
        });

        recordAIActionRun(run);
        clearActiveAIActionPreview();
        if (flowId) {
            setSaveStatus('dirty');
            requestImmediateWorkspaceSave();
        }
        recordActivity({
            type: 'ai_action_rejected',
            title: 'Rejected AI action preview',
            summary: `Rejected ${aiDraftNodes.length} draft node${
                aiDraftNodes.length === 1 ? '' : 's'
            } without changing the graph.`,
            node_ids: [run.source_node_id].filter(Boolean),
            metadata: {
                ai_action_id: run.ai_action_id,
                preview_id: activeAIActionPreview.preview_id,
                role: run.role,
                action: run.action,
                scope: run.scope
            },
            status: 'completed'
        });
    };

    const closeWorkspacePreview = () => {
        clearActiveAIActionPreview();
        onClose();
    };

    const renderAIActionPreview = () =>
        aiPreviewAppliesHere ? (
            <div className="node-inspector-section ai-action-preview-card">
                <p>AI action preview</p>
                <div className="ai-action-preview-summary">
                    <span>
                        {activeAIActionPreview.role ||
                            activeAIActionPreview.helper_id ||
                            'AI action'}
                    </span>
                    <strong>
                        {activeAIActionPreview.action_label ||
                            humanizeId(activeAIActionPreview.action) ||
                            'Generated preview'}
                    </strong>
                    <small>
                        {[
                            `${aiDraftNodes.length} draft nodes`,
                            `${aiDraftEdges.length} draft edges`,
                            `${aiNonNodeOutputs.length} review outputs`
                        ].join(' | ')}
                    </small>
                    <div className="ai-action-preview-meta">
                        <em>{previewScopeLabel(activeAIActionPreview)} scope</em>
                        {previewModelSummary(activeAIActionPreview) ? (
                            <em>{previewModelSummary(activeAIActionPreview)}</em>
                        ) : null}
                        {previewMetadata(activeAIActionPreview).preview_mode ? (
                            <em>
                                {humanizeId(previewMetadata(activeAIActionPreview).preview_mode)}
                            </em>
                        ) : null}
                    </div>
                    {previewMetadata(activeAIActionPreview).model_reason ? (
                        <p className="ai-action-preview-reason">
                            {previewMetadata(activeAIActionPreview).model_reason}
                        </p>
                    ) : null}
                    <p className="ai-action-preview-impact">
                        {previewImpactSummary({
                            draftNodes: aiDraftNodes,
                            draftEdges: aiDraftEdges,
                            outputs: aiNonNodeOutputs
                        })}
                    </p>
                </div>
                {aiDraftNodes.length > 0 ? (
                    <div className="ai-action-preview-list">
                        {aiDraftNodes.map((item, index) => {
                            const sourceRefs = Array.isArray(item.source_refs)
                                ? item.source_refs
                                : [];
                            return (
                                <article
                                    key={item.id || item.node_id || index}
                                    className="ai-action-preview-item"
                                >
                                    <span>
                                        {item.node_type || item.type || 'node'}
                                        {sourceRefs.length === 0
                                            ? ' | needs review'
                                            : ' | source cited'}
                                    </span>
                                    <strong>
                                        {item.title ||
                                            item.label ||
                                            item.question ||
                                            'AI draft'}
                                    </strong>
                                    {item.body || item.summary || item.rationale ? (
                                        <p>
                                            {item.body ||
                                                item.summary ||
                                                item.rationale}
                                        </p>
                                    ) : null}
                                    {item.parent_id || item.source_node_id ? (
                                        <small className="ai-action-preview-parent">
                                            Parent: {item.parent_id || item.source_node_id}
                                        </small>
                                    ) : null}
                                </article>
                            );
                        })}
                    </div>
                ) : null}
                {aiNonNodeOutputs.length > 0 ? (
                    <div className="ai-action-preview-list">
                        {aiNonNodeOutputs.map(({ type, item }, index) => (
                            <article
                                key={`${type}-${item.id || index}`}
                                className="ai-action-preview-item"
                            >
                                <span>{type.replaceAll('_', ' ')}</span>
                                <strong>
                                    {item.title ||
                                        item.question ||
                                        item.label ||
                                        String(item)}
                                </strong>
                                {item.reason ||
                                item.note ||
                                item.summary ||
                                item.body ||
                                item.text ? (
                                    <p>
                                        {item.reason ||
                                            item.note ||
                                            item.summary ||
                                            item.body ||
                                            item.text}
                                    </p>
                                ) : null}
                            </article>
                        ))}
                    </div>
                ) : null}
                {Array.isArray(activeAIActionPreview.assumptions) &&
                activeAIActionPreview.assumptions.length > 0 ? (
                    <div className="ai-action-preview-list">
                        <article className="ai-action-preview-item">
                            <span>Assumptions</span>
                            <strong>Review before accepting</strong>
                            {activeAIActionPreview.assumptions.map((assumption, index) => (
                                <p key={`${assumption}-${index}`}>{assumption}</p>
                            ))}
                        </article>
                    </div>
                ) : null}
                <div className="ai-action-preview-actions">
                    <button type="button" onClick={rejectAIAction}>
                        Reject
                    </button>
                    <button type="button" onClick={acceptAIAction}>
                        Accept
                    </button>
                </div>
            </div>
        ) : null;

    if (!selectedNode) {
        if (!aiPreviewAppliesHere && !aiDraftSessionAppliesHere) {
            return null;
        }

        return (
            <aside className="node-inspector">
                <div className="node-inspector-header">
                    <div>
                        <p className="node-inspector-kicker">Workspace AI</p>
                        <h2>Workspace preview</h2>
                    </div>
                    <button
                        type="button"
                        className="node-inspector-icon-button"
                        onClick={closeWorkspacePreview}
                        aria-label="Close workspace AI preview"
                    >
                        x
                    </button>
                </div>
                <div className="node-inspector-body">
                    {aiDraftSessionAppliesHere ? (
                        <AiDraftSessionPanel
                            session={activeAIDraftSession}
                            onClose={onClose}
                        />
                    ) : null}
                    {renderAIActionPreview()}
                </div>
            </aside>
        );
    }

    const isSourceBacked = hasCitation(draft);
    const citationSummary = citationLocation(draft);
    const sourceRefList = getSourceRefs(selectedNode.data || {});
    const inspectorExternalRefs = getExternalRefs(selectedNode.data || {});
    const externalRefEntries = Object.entries(inspectorExternalRefs).filter(
        ([, ref]) => ref && typeof ref === 'object'
    );

    return (
        <aside className="node-inspector">
            <div className="node-inspector-header">
                <div>
                    <p className="node-inspector-kicker">Node metadata</p>
                    <h2>{draft.title || selectedNode.id}</h2>
                </div>
                <button
                    type="button"
                    className="node-inspector-icon-button"
                    onClick={onClose}
                    aria-label="Close node metadata"
                >
                    x
                </button>
            </div>

            <div className="node-inspector-body">
                {aiDraftSessionAppliesHere ? (
                    <AiDraftSessionPanel
                        session={activeAIDraftSession}
                        onClose={onClose}
                    />
                ) : null}
                <label>
                    Title
                    <input
                        value={draft.title || ''}
                        onChange={(e) => updateDraft('title', e.target.value)}
                    />
                </label>
                <div className="node-inspector-grid">
                    <label>
                        Type
                        <select
                            value={draft.node_type || ''}
                            onChange={(e) => updateDraft('node_type', e.target.value)}
                        >
                            <option value="">Auto</option>
                            {NODE_TYPES.map((nodeType) => (
                                <option key={nodeType} value={nodeType}>
                                    {nodeType}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Review
                        <select
                            value={draft.status || 'ai_generated'}
                            onChange={(e) => updateDraft('status', e.target.value)}
                        >
                            {REVIEW_STATES.map((state) => (
                                <option key={state} value={state}>
                                    {state}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <div className="node-inspector-grid">
                    <label>
                        Priority
                        <select
                            value={draft.priority || ''}
                            onChange={(e) => updateDraft('priority', e.target.value)}
                        >
                            {PRIORITIES.map((priority) => (
                                <option key={priority || 'none'} value={priority}>
                                    {priority || 'None'}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Due
                        <input
                            type="date"
                            value={draft.due_date || ''}
                            onChange={(e) => updateDraft('due_date', e.target.value)}
                        />
                    </label>
                </div>
                <label>
                    Owner
                    <input
                        value={draft.owner_id || ''}
                        onChange={(e) => updateDraft('owner_id', e.target.value)}
                    />
                </label>
                <label>
                    Confidence
                    <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={draft.confidence || ''}
                        onChange={(e) => updateDraft('confidence', e.target.value)}
                    />
                </label>

                {validationIssues.length > 0 ? (
                    <div className="node-inspector-section node-validation-issues">
                        <p>Review findings</p>
                        {validationIssues.map((issue, index) => (
                            <article
                                key={`${issue.code || issue.label || 'issue'}-${index}`}
                                className={`node-validation-issue node-validation-issue-${issue.severity || 'info'}`}
                            >
                                <span>
                                    {issue.label || issue.code || 'Validation issue'}
                                    {issue.repaired ? ' repaired' : ''}
                                </span>
                                <strong>
                                    {issue.detail || 'Review this node before export.'}
                                </strong>
                                {issue.code || issue.edgeId ? (
                                    <small>
                                        {[
                                            issue.code ? `Code ${issue.code}` : '',
                                            issue.edgeId ? `Edge ${issue.edgeId}` : ''
                                        ]
                                            .filter(Boolean)
                                            .join(' | ')}
                                    </small>
                                ) : null}
                            </article>
                        ))}
                    </div>
                ) : null}

                <div className="node-inspector-section">
                    <p>Primary source reference</p>
                    <div
                        className={`node-citation-card ${
                            isSourceBacked
                                ? 'node-citation-card-backed'
                                : 'node-citation-card-missing'
                        }`}
                    >
                        <div>
                            <span>
                                {isSourceBacked
                                    ? 'Source-backed node'
                                    : 'Needs source review'}
                            </span>
                            <strong>
                                {isSourceBacked
                                    ? citationSummary || 'Citation details available'
                                    : 'No document, page, section, or quote is attached yet.'}
                            </strong>
                        </div>
                        {draft.source_quote ? (
                            <blockquote>{draft.source_quote}</blockquote>
                        ) : null}
                    </div>
                    {sourceRefList.length > 1 ? (
                        <div className="node-citation-list">
                            {sourceRefList.map((sourceRef, index) => (
                                <article
                                    key={`${sourceRef.document_id || 'source'}-${index}`}
                                    className="node-citation-list-item"
                                >
                                    <span>Source {index + 1}</span>
                                    <strong>
                                        {[
                                            sourceRef.document_id,
                                            sourceRef.page ? `p. ${sourceRef.page}` : '',
                                            sourceRef.section
                                        ]
                                            .filter(Boolean)
                                            .join(' | ') || 'Unlabeled source'}
                                    </strong>
                                    {sourceRef.quote_snippet ? (
                                        <p>{sourceRef.quote_snippet}</p>
                                    ) : null}
                                </article>
                            ))}
                        </div>
                    ) : null}
                    {sourceRefList.length > 1 ? (
                        <p className="node-inspector-help">
                            Editing fields below updates the primary source only. Other
                            citations remain attached to the node.
                        </p>
                    ) : null}
                    <label>
                        Document
                        <input
                            value={draft.source_document || ''}
                            onChange={(e) =>
                                updateDraft('source_document', e.target.value)
                            }
                        />
                    </label>
                    <div className="node-inspector-grid">
                        <label>
                            Page
                            <input
                                value={draft.source_page || ''}
                                onChange={(e) =>
                                    updateDraft('source_page', e.target.value)
                                }
                            />
                        </label>
                        <label>
                            Section
                            <input
                                value={draft.source_section || ''}
                                onChange={(e) =>
                                    updateDraft('source_section', e.target.value)
                                }
                            />
                        </label>
                    </div>
                    <label>
                        Quote
                        <textarea
                            rows={3}
                            value={draft.source_quote || ''}
                            onChange={(e) =>
                                updateDraft('source_quote', e.target.value)
                            }
                        />
                    </label>
                </div>

                {renderAIActionPreview()}

                <div className="node-inspector-section">
                    <p>External refs</p>
                    {externalRefEntries.length > 0 ? (
                        <div className="node-external-ref-list">
                            {externalRefEntries.map(([provider, ref]) => (
                                <article
                                    key={provider}
                                    className="node-external-ref-list-item"
                                >
                                    <span>{provider}</span>
                                    <strong>{externalRefSummary(provider, ref)}</strong>
                                </article>
                            ))}
                        </div>
                    ) : null}
                    <div className="node-inspector-grid">
                        <label>
                            Miro board
                            <input
                                value={draft.miro_board_id || ''}
                                onChange={(e) =>
                                    updateDraft('miro_board_id', e.target.value)
                                }
                            />
                        </label>
                        <label>
                            Miro item
                            <input
                                value={draft.miro_item_id || ''}
                                onChange={(e) =>
                                    updateDraft('miro_item_id', e.target.value)
                                }
                            />
                        </label>
                    </div>
                    <div className="node-inspector-grid">
                        <label>
                            monday board
                            <input
                                value={draft.monday_board_id || ''}
                                onChange={(e) =>
                                    updateDraft('monday_board_id', e.target.value)
                                }
                            />
                        </label>
                        <label>
                            monday item
                            <input
                                value={draft.monday_item_id || ''}
                                onChange={(e) =>
                                    updateDraft('monday_item_id', e.target.value)
                                }
                            />
                        </label>
                    </div>
                </div>
            </div>

            <div className="node-inspector-actions">
                {applyMessage ? (
                    <span className="node-inspector-apply-message">
                        {applyMessage}
                    </span>
                ) : null}
                <button type="button" onClick={saveMetadata}>
                    Apply
                </button>
            </div>
        </aside>
    );
};

export default NodeInspector;
