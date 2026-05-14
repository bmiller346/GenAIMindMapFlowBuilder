/* eslint-disable react/prop-types */
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
    const nodeType = firstValue(data, nestedData, ['node_type', 'component_type', 'name']);
    const status = firstValue(data, nestedData, ['status']) || 'ai_generated';
    const confidence = formatConfidence(
        firstValue(data, nestedData, ['confidence'])
    );
    const sourceMode = firstValue(data, nestedData, ['source_mode']);
    const assumption = firstValue(data, nestedData, ['assumption']);
    const sourceBacked = hasSourceRefs(data, nestedData);
    const needsReview = status === 'needs_review' || assumption || !sourceBacked;
    const indicators = [
        !sourceBacked
            ? {
                  id: 'missing-source',
                  label: 'No citation',
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
                <span
                    className={`node-metadata-badge ${
                        sourceBacked
                            ? 'node-metadata-badge-source'
                            : 'node-metadata-badge-missing-source'
                    }`}
                >
                    {sourceBacked ? 'Source cited' : 'No citation'}
                </span>
            </span>
        </div>
    );
};

export default NodeMetadataBadges;
