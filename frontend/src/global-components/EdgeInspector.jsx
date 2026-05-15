import { useMemo } from 'react';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';

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
        edges: state.edges
    });
    const { nodes, edges } = useStore(useShallow(selector));
    const selectedEdge = useMemo(
        () => edges.find((edge) => edge.id === selectedEdgeId),
        [edges, selectedEdgeId]
    );

    if (!selectedEdge) {
        return null;
    }

    const sourceId = edgeSourceId(selectedEdge);
    const targetId = edgeTargetId(selectedEdge);
    const sourceNode = nodes.find((node) => node.id === sourceId);
    const targetNode = nodes.find((node) => node.id === targetId);
    const relationship = relationshipForEdge(selectedEdge);
    const isHierarchy = HIERARCHY_EDGE_TYPES.has(relationship);
    const sourceRefs = sourceRefsForEdge(selectedEdge);
    const rationale = rationaleForEdge(selectedEdge);
    const sourceSignal = sourceSignalForEdge(selectedEdge);

    return (
        <aside className="node-inspector edge-inspector">
            <div className="node-inspector-header">
                <div>
                    <p className="node-inspector-kicker">Graph relationship</p>
                    <h2>{humanize(relationship)}</h2>
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
                    <Detail
                        label="Confidence"
                        value={formatConfidence(
                            selectedEdge.confidence ||
                                selectedEdge.data?.confidence ||
                                selectedEdge.metadata?.confidence
                        )}
                    />
                    <Detail
                        label="Review state"
                        value={firstText(
                            selectedEdge.review_state,
                            selectedEdge.data?.review_state,
                            selectedEdge.metadata?.review_state
                        )}
                    />
                </div>

                {rationale || sourceSignal ? (
                    <div className="node-inspector-section">
                        <strong>Rationale</strong>
                        <p>{rationale || sourceSignal}</p>
                        {sourceSignal && sourceSignal !== rationale ? <small>{sourceSignal}</small> : null}
                    </div>
                ) : null}

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
