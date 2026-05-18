import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import useActivityStore from '../stores/activityStore';
import {
    createWorkspaceEdge,
    createWorkspaceNode,
    getChildPosition,
    getRootPosition
} from '../utils/manualNodes';
import {
    KG_RELATIONSHIP_FAMILIES,
    getKgRelationshipSummary
} from '../utils/kgRelationshipFilters';

const HIERARCHY_EDGE_TYPES = new Set([
    '',
    'contains',
    'parent_child',
    'parent-child',
    'child',
    'hierarchy',
    'structure',
    'section',
    'subtopic',
    'branch',
    'step',
    'smoothstep'
]);

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const firstText = (...values) =>
    values.find((value) => typeof value === 'string' && value.trim())?.trim() || '';

const edgeSourceId = (edge = {}) =>
    firstText(edge.source, edge.source_node_id, edge.data?.source, edge.data?.source_node_id);

const edgeTargetId = (edge = {}) =>
    firstText(edge.target, edge.target_node_id, edge.data?.target, edge.data?.target_node_id);

const humanize = (value = '') =>
    String(value || 'relationship')
        .replaceAll('_', ' ')
        .replaceAll('-', ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatConfidence = (confidence) => {
    if (confidence === undefined || confidence === null || confidence === '') {
        return 'Not set';
    }
    const numeric = Number(confidence);
    if (Number.isFinite(numeric)) {
        const normalized = numeric > 1 ? numeric : numeric * 100;
        return `${Math.round(normalized)}%`;
    }
    return String(confidence);
};

const confidenceForEdge = (edge = {}) =>
    edge.confidence || edge.data?.confidence || edge.metadata?.confidence;

const nodeTitle = (node) =>
    firstText(
        node?.data?.title,
        node?.data?.content,
        node?.data?.body,
        node?.data?.summ,
        node?.id,
        'Unknown node'
    );

const sourceRefsForEdge = (edge = {}) =>
    [
        ...asArray(edge.source_refs),
        ...asArray(edge.data?.source_refs),
        ...asArray(edge.metadata?.source_refs),
        ...asArray(edge.data?.metadata?.source_refs)
    ].filter(Boolean);

const relationshipForEdge = (edge = {}) =>
    firstText(
        edge.relationship_type,
        edge.data?.relationship_type,
        edge.data?.relationshipType,
        edge.metadata?.relationship_type,
        edge.data?.relationship,
        edge.label,
        edge.data?.label,
        edge.type,
        'contains'
    ).toLowerCase();

const rationaleForEdge = (edge = {}) =>
    firstText(
        edge.rationale,
        edge.data?.rationale,
        edge.metadata?.rationale,
        edge.data?.source_signal,
        edge.source_signal,
        edge.data?.reason,
        edge.metadata?.reason
    );

const sourceSignalForEdge = (edge = {}) =>
    firstText(edge.source_signal, edge.data?.source_signal, edge.metadata?.source_signal);

const reviewStateForEdge = (edge = {}) =>
    firstText(edge.review_state, edge.data?.review_state, edge.metadata?.review_state);

const branchLabelForEdge = (edge = {}) =>
    firstText(
        edge.branch_label,
        edge.condition,
        edge.label,
        edge.data?.branch_label,
        edge.data?.condition,
        edge.data?.label,
        edge.metadata?.branch_label,
        edge.metadata?.condition
    );

const conditionForEdge = (edge = {}) =>
    firstText(edge.condition, edge.data?.condition, edge.metadata?.condition);

const isExceptionEdge = (edge = {}) =>
    edge.exception_path === true ||
    edge.data?.exception_path === true ||
    edge.metadata?.exception_path === true ||
    relationshipForEdge(edge) === 'exception';

const FLOW_RELATIONSHIP_OPTIONS = [
    'contains',
    'next',
    'sequence',
    'decision_path',
    'exception',
    'handoff',
    'depends_on',
    'supports'
];

const supportStatusForEdge = ({ sourceRefs = [], sourceSignal = '', isHierarchy = false }) => {
    if (isHierarchy) {
        return {
            tone: 'structure',
            label: 'Structure',
            detail: 'This edge defines map hierarchy.'
        };
    }
    if (sourceRefs.length) {
        return {
            tone: 'source-backed',
            label: 'Source-backed',
            detail: `${sourceRefs.length} source reference${sourceRefs.length === 1 ? '' : 's'} attached.`
        };
    }
    if (/ai|inferred|prompt|generated/i.test(sourceSignal)) {
        return {
            tone: 'inferred',
            label: 'AI inferred',
            detail: 'Review before treating this relationship as canonical.'
        };
    }
    return {
        tone: 'needs-source',
        label: 'Needs source support',
        detail: 'No source references or source signal are attached.'
    };
};

const reviewActionForFamily = (family) => {
    if (family === KG_RELATIONSHIP_FAMILIES.RISKS) {
        return {
            nodeType: 'risk',
            label: 'Create risk',
            titlePrefix: 'Review risk',
            status: 'needs_review'
        };
    }
    if (
        family === KG_RELATIONSHIP_FAMILIES.DEPENDENCIES ||
        family === KG_RELATIONSHIP_FAMILIES.APPROVALS
    ) {
        return {
            nodeType: 'task',
            label: family === KG_RELATIONSHIP_FAMILIES.APPROVALS ? 'Create approval task' : 'Create task',
            titlePrefix:
                family === KG_RELATIONSHIP_FAMILIES.APPROVALS
                    ? 'Confirm approval'
                    : 'Confirm dependency',
            status: 'needs_review'
        };
    }
    if (family === KG_RELATIONSHIP_FAMILIES.METRICS) {
        return {
            nodeType: 'KPI',
            label: 'Create metric check',
            titlePrefix: 'Validate metric',
            status: 'needs_review'
        };
    }
    return {
        nodeType: 'decision',
        label: 'Create decision',
        titlePrefix: 'Review relationship',
        status: 'needs_review'
    };
};

const Detail = ({ label, value }) => (
    <div className="edge-inspector-detail">
        <span>{label}</span>
        <strong>{value || 'Not set'}</strong>
    </div>
);

const SourceRef = ({ sourceRef }) => {
    const title = firstText(
        sourceRef.document_title,
        sourceRef.title,
        sourceRef.document_id,
        sourceRef.source_id,
        'Source'
    );
    const location = [sourceRef.page ? `p. ${sourceRef.page}` : '', sourceRef.section, sourceRef.chunk_id]
        .filter(Boolean)
        .join(' / ');
    const quote = firstText(sourceRef.quote_snippet, sourceRef.snippet, sourceRef.text);

    return (
        <li>
            <strong>{title}</strong>
            {location ? <span>{location}</span> : null}
            {quote ? <small>{quote}</small> : null}
        </li>
    );
};

const EdgeInspector = ({ selectedEdgeId, onClose }) => {
    const selector = (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        setNodes: state.setNodes,
        setEdges: state.setEdges,
        setInspectorNodeId: state.setInspectorNodeId
    });
    const { nodes, edges, setNodes, setEdges, setInspectorNodeId } = useStore(useShallow(selector));
    const flowId = flowStore((state) => state.flow_id);
    const setSaveStatus = flowStore((state) => state.setSaveStatus);
    const recordActivity = useActivityStore((state) => state.recordActivity);
    const selectedEdge = useMemo(
        () => edges.find((edge) => edge.id === selectedEdgeId),
        [edges, selectedEdgeId]
    );
    const [draft, setDraft] = useState({
        relationship_type: '',
        branch_label: '',
        condition: '',
        exception_path: false
    });

    useEffect(() => {
        if (!selectedEdge) {
            return;
        }
        setDraft({
            relationship_type: relationshipForEdge(selectedEdge),
            branch_label: branchLabelForEdge(selectedEdge),
            condition: conditionForEdge(selectedEdge),
            exception_path: isExceptionEdge(selectedEdge)
        });
    }, [selectedEdge]);

    if (!selectedEdge) {
        return null;
    }

    const sourceId = edgeSourceId(selectedEdge);
    const targetId = edgeTargetId(selectedEdge);
    const sourceNode = nodes.find((node) => node.id === sourceId);
    const targetNode = nodes.find((node) => node.id === targetId);
    const relationship = relationshipForEdge(selectedEdge);
    const isHierarchy = HIERARCHY_EDGE_TYPES.has(relationship);
    const relationshipSummary = getKgRelationshipSummary(selectedEdge);
    const sourceRefs = sourceRefsForEdge(selectedEdge);
    const rationale = rationaleForEdge(selectedEdge);
    const sourceSignal = sourceSignalForEdge(selectedEdge);
    const reviewState = reviewStateForEdge(selectedEdge);
    const supportStatus = supportStatusForEdge({ sourceRefs, sourceSignal, isHierarchy });
    const reviewAction = reviewActionForFamily(relationshipSummary.family);
    const canCreateReviewItem = !isHierarchy && sourceNode && targetNode;

    const updateDraft = (field, value) => {
        setDraft((current) => ({
            ...current,
            [field]: value
        }));
    };

    const applyEdgeMetadata = () => {
        const relationshipType = draft.relationship_type || relationship;
        const branchLabel = draft.branch_label.trim();
        const condition = draft.condition.trim();
        setEdges(
            edges.map((edge) =>
                edge.id === selectedEdge.id
                    ? {
                          ...edge,
                          relationship_type: relationshipType,
                          label: branchLabel || edge.label,
                          branch_label: branchLabel,
                          condition,
                          exception_path: draft.exception_path,
                          data: {
                              ...(edge.data || {}),
                              relationship_type: relationshipType,
                              label: branchLabel || edge.data?.label,
                              branch_label: branchLabel,
                              condition,
                              exception_path: draft.exception_path
                          },
                          metadata: {
                              ...(edge.metadata || {}),
                              relationship_type: relationshipType,
                              branch_label: branchLabel,
                              condition,
                              exception_path: draft.exception_path
                          }
                      }
                    : edge
            )
        );
        if (flowId) {
            setSaveStatus('dirty');
            window.setTimeout(() => {
                window.dispatchEvent(new Event('docmap:save-workspace-now'));
            }, 0);
        }
        recordActivity({
            type: 'flow_edge_metadata_applied',
            title: 'Flow edge metadata applied',
            summary: `${humanize(relationshipType)} edge metadata was updated.`,
            node_ids: [sourceId, targetId].filter(Boolean),
            metadata: {
                edge_id: selectedEdge.id,
                relationship_type: relationshipType,
                branch_label: branchLabel,
                condition,
                exception_path: draft.exception_path
            },
            status: 'completed'
        });
    };

    const markReviewed = () => {
        setEdges(
            edges.map((edge) =>
                edge.id === selectedEdge.id
                    ? {
                          ...edge,
                          review_state: 'reviewed',
                          data: {
                              ...(edge.data || {}),
                              review_state: 'reviewed'
                          },
                          metadata: {
                              ...(edge.metadata || {}),
                              review_state: 'reviewed',
                              reviewed_at: new Date().toISOString()
                          }
                      }
                    : edge
            )
        );
        if (flowId) {
            setSaveStatus('dirty');
        }
        recordActivity({
            type: 'relationship_reviewed',
            title: 'Relationship marked reviewed',
            summary: `${humanize(relationship)} between ${nodeTitle(sourceNode)} and ${nodeTitle(targetNode)} was marked reviewed.`,
            node_ids: [sourceId, targetId].filter(Boolean),
            metadata: {
                edge_id: selectedEdge.id,
                relationship_type: relationship
            },
            status: 'completed'
        });
    };

    const createReviewItem = () => {
        if (!canCreateReviewItem) {
            return;
        }
        const title = `${reviewAction.titlePrefix}: ${nodeTitle(sourceNode)} -> ${nodeTitle(targetNode)}`;
        const body = [
            `${nodeTitle(sourceNode)} ${humanize(relationship).toLowerCase()} ${nodeTitle(targetNode)}.`,
            rationale ? `Rationale: ${rationale}` : '',
            sourceSignal ? `Source signal: ${sourceSignal}` : '',
            sourceRefs.length ? '' : 'Source refs are empty; validate before final use.'
        ]
            .filter(Boolean)
            .join('\n\n');
        const reviewNode = createWorkspaceNode({
            title,
            nodeType: reviewAction.nodeType,
            status: reviewAction.status,
            body,
            sourceRefs,
            reviewState: 'needs_review',
            position:
                sourceId && sourceNode
                    ? getChildPosition(nodes, edges, sourceId)
                    : getRootPosition(nodes),
            metadata: {
                source_edge_id: selectedEdge.id,
                relationship_type: relationship,
                relationship_family: relationshipSummary.family,
                source_node_id: sourceId,
                target_node_id: targetId,
                source_signal: sourceSignal,
                rationale
            }
        });
        const nextEdge = {
            ...createWorkspaceEdge(sourceId, reviewNode.id),
            relationship_type: 'contains',
            data: { relationship_type: 'contains' }
        };
        setNodes([...nodes, reviewNode]);
        setEdges([...edges, nextEdge]);
        if (flowId) {
            setSaveStatus('dirty');
        }
        recordActivity({
            type: 'relationship_review_item_created',
            title: reviewAction.label,
            summary: `${title} was created from a relationship edge.`,
            node_ids: [sourceId, targetId, reviewNode.id].filter(Boolean),
            metadata: {
                edge_id: selectedEdge.id,
                relationship_type: relationship,
                review_node_type: reviewAction.nodeType
            },
            status: 'completed'
        });
        setInspectorNodeId(reviewNode.id);
    };

    return (
        <aside className="node-inspector edge-inspector">
            <div className="node-inspector-header">
                <div>
                    <p className="node-inspector-kicker">Graph relationship</p>
                    <h2>{relationshipSummary.relationship_label || humanize(relationship)}</h2>
                    <div className="edge-inspector-badges">
                        <span>{relationshipSummary.family_label}</span>
                        <span className={`is-${supportStatus.tone}`}>{supportStatus.label}</span>
                    </div>
                </div>
                <button
                    type="button"
                    className="node-inspector-icon-button"
                    onClick={onClose}
                    aria-label="Close relationship details"
                >
                    x
                </button>
            </div>

            <div className="node-inspector-body">
                <div className="node-inspector-section">
                    <Detail label="From" value={nodeTitle(sourceNode)} />
                    <Detail label="To" value={nodeTitle(targetNode)} />
                    <Detail label="Kind" value={isHierarchy ? 'Hierarchy / structure' : 'Relationship'} />
                    <Detail label="Family" value={relationshipSummary.family_label} />
                    <Detail
                        label="Confidence"
                        value={formatConfidence(confidenceForEdge(selectedEdge))}
                    />
                    <Detail label="Review state" value={reviewState} />
                </div>

                <div className="node-inspector-section edge-inspector-edit">
                    <strong>Flow connector</strong>
                    <label>
                        Relationship
                        <select
                            value={draft.relationship_type}
                            onChange={(event) => updateDraft('relationship_type', event.target.value)}
                        >
                            {FLOW_RELATIONSHIP_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {humanize(option)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Branch label
                        <input
                            value={draft.branch_label}
                            onChange={(event) => updateDraft('branch_label', event.target.value)}
                            placeholder="Yes, No, Approved, Exception"
                        />
                    </label>
                    <label>
                        Condition
                        <input
                            value={draft.condition}
                            onChange={(event) => updateDraft('condition', event.target.value)}
                            placeholder="What makes this path true?"
                        />
                    </label>
                    <label className="edge-inspector-checkbox">
                        <input
                            type="checkbox"
                            checked={draft.exception_path}
                            onChange={(event) => updateDraft('exception_path', event.target.checked)}
                        />
                        Exception path
                    </label>
                    <button type="button" onClick={applyEdgeMetadata}>
                        Apply connector
                    </button>
                </div>

                {rationale || sourceSignal ? (
                    <div className="node-inspector-section">
                        <strong>Rationale</strong>
                        <p>{rationale || sourceSignal}</p>
                        {sourceSignal && sourceSignal !== rationale ? <small>{sourceSignal}</small> : null}
                    </div>
                ) : null}

                <div className="node-inspector-section edge-inspector-support-card">
                    <strong>{supportStatus.label}</strong>
                    <p>{supportStatus.detail}</p>
                    {!isHierarchy ? (
                        <div className="edge-inspector-actions">
                            <button
                                type="button"
                                onClick={markReviewed}
                                disabled={reviewState === 'reviewed'}
                            >
                                Mark reviewed
                            </button>
                            <button
                                type="button"
                                onClick={createReviewItem}
                                disabled={!canCreateReviewItem}
                            >
                                {reviewAction.label}
                            </button>
                        </div>
                    ) : null}
                </div>

                <div className="node-inspector-section">
                    <strong>Source refs</strong>
                    {sourceRefs.length ? (
                        <ul className="edge-inspector-source-list">
                            {sourceRefs.slice(0, 6).map((sourceRef, index) => (
                                <SourceRef
                                    key={`${sourceRef.document_id || sourceRef.source_id || 'source'}-${sourceRef.chunk_id || index}`}
                                    sourceRef={sourceRef}
                                />
                            ))}
                        </ul>
                    ) : (
                        <p>No source references attached to this edge.</p>
                    )}
                </div>

                <div className="node-inspector-section">
                    <small>Edge id: {selectedEdge.id}</small>
                </div>
            </div>
        </aside>
    );
};

export default EdgeInspector;
