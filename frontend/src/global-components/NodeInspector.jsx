/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';

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

const NodeInspector = ({ selectedNodeId, validationIssues = [], onClose }) => {
    const selector = (state) => ({
        nodes: state.nodes,
        setNodes: state.setNodes
    });
    const { nodes, setNodes } = useStore(useShallow(selector));
    const selectedNode = useMemo(
        () => nodes.find((node) => node.id === selectedNodeId),
        [nodes, selectedNodeId]
    );
    const [draft, setDraft] = useState({});

    useEffect(() => {
        if (!selectedNode) {
            setDraft({});
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

    if (!selectedNode) {
        return null;
    }

    const updateDraft = (key, value) => {
        setDraft((current) => ({ ...current, [key]: value }));
    };

    const saveMetadata = () => {
        const existingExternalRefs = getExternalRefs(selectedNode?.data || {});
        const sourceRefs =
            draft.source_document ||
            draft.source_page ||
            draft.source_section ||
            draft.source_quote
                ? [
                      {
                          document_id: draft.source_document,
                          page: draft.source_page,
                          section: draft.source_section,
                          quote_snippet: draft.source_quote,
                          confidence: draft.confidence
                      }
                  ]
                : [];

        const externalRefs = {};
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
                        external_refs: externalRefs
                    }
                };
            })
        );
    };

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
                    <p>Source reference</p>
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
                <button type="button" onClick={saveMetadata}>
                    Apply
                </button>
            </div>
        </aside>
    );
};

export default NodeInspector;
