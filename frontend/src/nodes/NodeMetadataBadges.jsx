/* eslint-disable react/prop-types */
import TrustStateBadges from '../components/TrustStateBadges';
import { trustStatesForSubject } from '../utils/trustStates';

const REVIEW_LABELS = {
    ai_generated: 'AI generated',
    needs_review: 'Needs review',
    reviewed: 'Reviewed',
    approved: 'Approved',
    rejected: 'Rejected',
    deprecated: 'Deprecated'
};

const SOURCE_MODE_LABELS = {
    source_only: 'Source only',
    source_plus_context: 'Source + context',
    context_only: 'Context only'
};

const getNestedData = (data) => {
    if (data?.data && typeof data.data === 'object') {
        return data.data;
    }

    return {};
};

const firstValue = (data, nestedData, keys) => {
    for (const key of keys) {
        const value = data?.[key] ?? nestedData?.[key];
        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    return '';
};

const hasSourceRefs = (data, nestedData) => {
    const refs = data?.source_refs ?? nestedData?.source_refs;
    return Array.isArray(refs) && refs.length > 0;
};

const getListValue = (data, nestedData, keys) => {
    const value = firstValue(data, nestedData, keys);
    if (Array.isArray(value)) {
        return value;
    }
    if (typeof value === 'string') {
        return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
    return [];
};

const getGraphData = (data, nestedData) => data?.graph ?? nestedData?.graph;

const hasChartData = (data, nestedData) => {
    const rows = data?.df ?? nestedData?.df;
    const graph = getGraphData(data, nestedData);

    if (Array.isArray(rows) && rows.length > 0) {
        return true;
    }
    if (graph && typeof graph === 'object' && Array.isArray(graph.data)) {
        return graph.data.length > 0;
    }

    return false;
};

const formatConfidence = (value) => {
    if (value === '' || value === undefined || value === null) {
        return '';
    }

    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
        return String(value);
    }

    return parsed <= 1 ? `${Math.round(parsed * 100)}%` : `${Math.round(parsed)}%`;
};

const NodeMetadataBadges = ({ data }) => {
    const nestedData = getNestedData(data);
    const trustStates = trustStatesForSubject(data || {});
    const nodeType = firstValue(data, nestedData, ['node_type', 'component_type', 'name']);
    const status = firstValue(data, nestedData, ['status']) || 'ai_generated';
    const confidence = formatConfidence(
        firstValue(data, nestedData, ['confidence'])
    );
    const sourceMode = firstValue(data, nestedData, ['source_mode']);
    const assumption = firstValue(data, nestedData, ['assumption']);
    const duplicate = firstValue(data, nestedData, ['duplicate', 'duplicate_of']);
    const conflict = firstValue(data, nestedData, ['conflict', 'conflicts']);
    const owner = firstValue(data, nestedData, ['owner_id', 'assignee', 'owner']);
    const desiredOutput = firstValue(data, nestedData, ['desired_output', 'output_type']);
    const sourceBacked = hasSourceRefs(data, nestedData);
    const isTaskLike = ['task', 'procedure', 'workflow', 'requirement'].includes(nodeType);
    const hasConnectionCue =
        sourceBacked ||
        getListValue(data, nestedData, ['tags']).length > 0 ||
        getListValue(data, nestedData, ['entities']).length > 0;
    const needsChartData =
        ['chart', 'rendered_chart', 'chart_data'].includes(desiredOutput) &&
        !hasChartData(data, nestedData);
    const needsReview = status === 'needs_review' || assumption || !sourceBacked;
    const indicators = [
        !sourceBacked
            ? {
                  id: 'missing-source',
                  label: trustStates.find((state) => ['uncited', 'inferred'].includes(state.id))?.label || 'Uncited',
                  className: 'node-review-indicator-source'
              }
            : undefined,
        status === 'needs_review'
            ? {
                  id: 'needs-review',
                  label: 'Needs review',
                  className: 'node-review-indicator-review'
              }
            : undefined,
        isTaskLike && !owner
            ? {
                  id: 'missing-owner',
                  label: 'Missing owner',
                  className: 'node-review-indicator-owner'
              }
            : undefined,
        hasConnectionCue
            ? {
                  id: 'connection-opportunity',
                  label: 'Connection cue',
                  className: 'node-review-indicator-connection'
              }
            : undefined,
        needsChartData
            ? {
                  id: 'chart-data-needed',
                  label: 'Chart data needed',
                  className: 'node-review-indicator-chart'
              }
            : undefined,
        assumption
            ? {
                  id: 'assumption',
                  label: 'Assumption',
                  className: 'node-review-indicator-assumption'
              }
            : undefined
    ].filter(Boolean);

    return (
        <div className="node-metadata-badges">
            {indicators.length > 0 ? (
                <span
                    className={`node-review-indicators ${
                        needsReview ? 'node-review-indicators-active' : ''
                    }`}
                    aria-label={indicators.map((indicator) => indicator.label).join(', ')}
                    title={indicators.map((indicator) => indicator.label).join(', ')}
                >
                    {indicators.map((indicator) => (
                        <span
                            key={indicator.id}
                            className={`node-review-indicator ${indicator.className}`}
                        />
                    ))}
                </span>
            ) : null}
            <span className="node-metadata-badge-list">
                {nodeType ? (
                    <span className="node-metadata-badge node-metadata-badge-type">
                        {nodeType}
                    </span>
                ) : null}
                <span
                    className={`node-metadata-badge node-metadata-badge-status node-status-${status}`}
                >
                    {REVIEW_LABELS[status] || status}
                </span>
                {confidence ? (
                    <span className="node-metadata-badge">
                        Confidence {confidence}
                    </span>
                ) : null}
                {sourceMode ? (
                    <span className="node-metadata-badge">
                        {SOURCE_MODE_LABELS[sourceMode] || sourceMode}
                    </span>
                ) : null}
                {assumption ? (
                    <span className="node-metadata-badge node-metadata-badge-missing-source">
                        Assumption
                    </span>
                ) : null}
                {duplicate ? (
                    <span className="node-metadata-badge node-metadata-badge-missing-source">
                        Duplicate
                    </span>
                ) : null}
                {conflict ? (
                    <span className="node-metadata-badge node-metadata-badge-missing-source">
                        Conflict
                    </span>
                ) : null}
                {isTaskLike && !owner ? (
                    <span className="node-metadata-badge node-metadata-badge-owner">
                        Missing owner
                    </span>
                ) : null}
                {hasConnectionCue ? (
                    <span className="node-metadata-badge node-metadata-badge-connection">
                        Connection cue
                    </span>
                ) : null}
                {needsChartData ? (
                    <span className="node-metadata-badge node-metadata-badge-chart">
                        Chart data needed
                    </span>
                ) : null}
                <span
                    className="node-metadata-badge node-metadata-badge-trust"
                >
                    <TrustStateBadges states={trustStates} />
                </span>
            </span>
        </div>
    );
};

export default NodeMetadataBadges;
