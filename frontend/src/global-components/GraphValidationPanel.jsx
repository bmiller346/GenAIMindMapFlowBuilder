/* eslint-disable react/prop-types */
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import useActivityStore from '../stores/activityStore';

const TASK_TYPES = new Set(['task', 'procedure', 'workflow', 'needs_review']);
const LOW_CONFIDENCE_THRESHOLD = 0.6;
const EXTERNAL_REF_REQUIRED_FIELDS = {
    miro: ['board_id', 'item_id', 'export_batch_id', 'last_pushed_at'],
    monday: ['board_id', 'item_id', 'export_batch_id', 'last_pushed_at']
};
const ISSUE_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'error', label: 'Errors' },
    { id: 'warning', label: 'Warnings' },
    { id: 'info', label: 'Notes' },
    { id: 'repaired', label: 'Repaired' },
    { id: 'open', label: 'Open' }
];

const getNestedData = (node) => {
    const data = node?.data || {};

    if (data.data && typeof data.data === 'object') {
        return data.data;
    }

    return {};
};

const firstValue = (node, keys) => {
    const data = node?.data || {};
    const nestedData = getNestedData(node);

    for (const key of keys) {
        const value = data[key] ?? nestedData[key];
        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    return '';
};

const nodeTitle = (node) =>
    firstValue(node, ['title', 'question', 'content', 'prompt', 'summ']) ||
    node?.type ||
    node?.id ||
    'Untitled node';

const sourceRefs = (node) => {
    const data = node?.data || {};
    const nestedData = getNestedData(node);
    const refs = data.source_refs ?? nestedData.source_refs;

    return Array.isArray(refs) ? refs.filter(Boolean) : [];
};

const externalRefs = (node) => {
    const data = node?.data || {};
    const nestedData = getNestedData(node);
    const refs = data.external_refs ?? nestedData.external_refs;

    return refs && typeof refs === 'object' ? refs : {};
};

const rawExternalRefs = (node) => {
    const data = node?.data || {};
    const nestedData = getNestedData(node);

    return data.external_refs ?? nestedData.external_refs;
};

const nodeType = (node) => {
    const explicitType = firstValue(node, ['node_type', 'component_type', 'name']);

    if (explicitType) {
        return explicitType;
    }

    if (node?.type === 'dataSource') {
        return 'reference';
    }
    if (node?.type === 'question') {
        return 'question';
    }
    if (node?.type === 'followUp') {
        return 'needs_review';
    }

    return node?.type || 'concept';
};

const formatIssueTitle = (node) => {
    const title = nodeTitle(node);
    return title.length > 72 ? `${title.slice(0, 69)}...` : title;
};

const isBlankObject = (value) =>
    value &&
    typeof value === 'object' &&
    Object.values(value).every(
        (entry) => entry === undefined || entry === null || entry === ''
    );

const invalidExternalRefIssues = (node) => {
    const refs = rawExternalRefs(node);
    const title = formatIssueTitle(node);

    if (!refs) {
        return [];
    }

    if (typeof refs !== 'object' || Array.isArray(refs)) {
        return [
            {
                severity: 'warning',
                label: 'Invalid external ref',
                nodeId: node.id,
                detail: `${title} has external refs that are not keyed by provider.`,
                code: 'invalid_external_ref'
            }
        ];
    }

    return Object.entries(refs).flatMap(([provider, ref]) => {
        if (!ref || typeof ref !== 'object' || Array.isArray(ref)) {
            return [
                {
                    severity: 'warning',
                    label: 'Invalid external ref',
                    nodeId: node.id,
                    detail: `${title} has a malformed ${provider} external ref.`,
                    code: 'invalid_external_ref'
                }
            ];
        }

        if (isBlankObject(ref)) {
            return [
                {
                    severity: 'warning',
                    label: 'Invalid external ref',
                    nodeId: node.id,
                    detail: `${title} has an empty ${provider} external ref.`,
                    code: 'invalid_external_ref'
                }
            ];
        }

        const requiredFields = EXTERNAL_REF_REQUIRED_FIELDS[provider];
        if (!requiredFields) {
            return [];
        }

        const missingFields = requiredFields.filter(
            (field) => ref[field] === undefined || ref[field] === null || ref[field] === ''
        );

        if (missingFields.length === 0) {
            return [];
        }

        return [
            {
                severity: 'warning',
                label: 'Invalid external ref',
                nodeId: node.id,
                detail: `${title} ${provider} external ref is missing ${missingFields.join(', ')}.`,
                code: 'invalid_external_ref'
            }
        ];
    });
};

const humanizeCode = (value) => {
    if (!value) {
        return 'Validation issue';
    }

    return value
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const summarizeIssues = (issues) => ({
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
    info: issues.filter((issue) => issue.severity === 'info').length
});

const formatIssueCode = (value) => {
    if (!value) {
        return '';
    }

    return String(value).replace(/\s+/g, '_').toLowerCase();
};

const normalizeBackendReport = (validationReport) => {
    if (!validationReport || !Array.isArray(validationReport.issues)) {
        return undefined;
    }

    const issues = validationReport.issues.map((issue) => ({
        severity: issue.severity || 'info',
        label: humanizeCode(issue.code),
        nodeId: issue.node_id || '',
        edgeId: issue.edge_id || '',
        detail: issue.message || humanizeCode(issue.code),
        repaired: Boolean(issue.repaired),
        code: formatIssueCode(issue.code)
    }));

    return {
        isValid: Boolean(validationReport.is_valid),
        repaired: Boolean(validationReport.repaired),
        rootNodeId: validationReport.root_node_id || '',
        source: 'backend',
        summary: summarizeIssues(issues),
        issues
    };
};

const buildValidationReport = (nodes, edges) => {
    const nodeIds = new Set();
    const duplicateIds = new Set();
    const targetedIds = new Set();
    const sourceIds = new Set();
    const issues = [];

    nodes.forEach((node) => {
        if (nodeIds.has(node.id)) {
            duplicateIds.add(node.id);
        }
        nodeIds.add(node.id);
    });

    edges.forEach((edge) => {
        if (edge.source) {
            sourceIds.add(edge.source);
        }
        if (edge.target) {
            targetedIds.add(edge.target);
        }

        if (edge.source && !nodeIds.has(edge.source)) {
            issues.push({
                severity: 'error',
                label: 'Broken edge',
                nodeId: edge.source,
                detail: `Edge ${edge.id || ''} points from a missing source node.`
            });
        }

        if (edge.target && !nodeIds.has(edge.target)) {
            issues.push({
                severity: 'error',
                label: 'Broken edge',
                nodeId: edge.target,
                detail: `Edge ${edge.id || ''} points to a missing target node.`
            });
        }
    });

    duplicateIds.forEach((id) => {
        issues.push({
            severity: 'error',
            label: 'Duplicate ID',
            nodeId: id,
            detail: 'Multiple nodes share this ID.'
        });
    });

    const roots = nodes.filter((node) => !targetedIds.has(node.id));
    if (nodes.length > 0 && roots.length !== 1) {
        issues.push({
            severity: 'warning',
            label: roots.length === 0 ? 'No root' : 'Multiple roots',
            nodeId: '',
            detail:
                roots.length === 0
                    ? 'Every node has a parent edge, so there is no clear graph root.'
                    : `${roots.length} nodes have no parent edge.`
        });
    }

    nodes.forEach((node) => {
        const refs = sourceRefs(node);
        const confidenceValue = firstValue(node, ['confidence']);
        const parsedConfidence = Number(confidenceValue);
        const type = nodeType(node);

        if (!refs.length && type !== 'reference') {
            issues.push({
                severity: 'warning',
                label: 'Missing source',
                nodeId: node.id,
                detail: `${formatIssueTitle(node)} has no source reference.`
            });
        }

        if (
            confidenceValue !== '' &&
            !Number.isNaN(parsedConfidence) &&
            parsedConfidence < LOW_CONFIDENCE_THRESHOLD
        ) {
            issues.push({
                severity: 'warning',
                label: 'Low confidence',
                nodeId: node.id,
                detail: `${formatIssueTitle(node)} is below ${Math.round(
                    LOW_CONFIDENCE_THRESHOLD * 100
                )}% confidence.`
            });
        }

        issues.push(...invalidExternalRefIssues(node));

        if (TASK_TYPES.has(type)) {
            const missingFields = [
                ['priority', 'priority'],
                ['owner_id', 'owner'],
                ['due_date', 'due date']
            ].filter(
                ([key]) =>
                    !firstValue(
                        node,
                        key === 'owner_id' ? ['owner_id', 'assignee', 'owner'] : [key]
                    )
            );

            if (missingFields.length > 0) {
                issues.push({
                    severity: 'info',
                    label: 'Task metadata',
                    nodeId: node.id,
                    detail: `${formatIssueTitle(node)} is missing ${missingFields
                        .map(([, label]) => label)
                        .join(', ')}.`
                });
            }
        }
    });

    const orphanNodes = nodes.filter(
        (node) =>
            !targetedIds.has(node.id) &&
            !sourceIds.has(node.id) &&
            nodes.length > 1
    );

    orphanNodes.forEach((node) => {
        issues.push({
            severity: 'warning',
            label: 'Orphan node',
            nodeId: node.id,
            detail: `${formatIssueTitle(node)} is not connected to the graph.`
        });
    });

    return {
        source: 'local',
        isValid: issues.every((issue) => issue.severity !== 'error'),
        repaired: false,
        rootNodeId: roots.length === 1 ? roots[0].id : '',
        summary: {
            errors: issues.filter((issue) => issue.severity === 'error').length,
            warnings: issues.filter((issue) => issue.severity === 'warning').length,
            info: issues.filter((issue) => issue.severity === 'info').length
        },
        issues
    };
};

const GraphValidationPanel = ({
    flowId,
    nodes,
    edges,
    onSelectNode,
    onReportChange,
    defaultExpanded = false
}) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [backendReport, setBackendReport] = useState();
    const [backendStatus, setBackendStatus] = useState('idle');
    const [backendError, setBackendError] = useState('');
    const [issueFilter, setIssueFilter] = useState('all');
    const [issueSearch, setIssueSearch] = useState('');
    const [refreshCounter, setRefreshCounter] = useState(0);
    const recordActivity = useActivityStore((s) => s.recordActivity);
    const localReport = useMemo(
        () => buildValidationReport(nodes, edges),
        [nodes, edges]
    );
    const report = backendReport || localReport;
    const totalIssues = report.issues.length;
    const reportState = totalIssues === 0 ? 'clean' : 'needs-review';
    const sourceLabel =
        report.source === 'backend'
            ? 'Backend validation report'
            : 'Live frontend fallback';
    const filteredIssues = useMemo(() => {
        const normalizedSearch = issueSearch.trim().toLowerCase();

        return report.issues.filter((issue) => {
            const matchesFilter =
                issueFilter === 'all' ||
                issue.severity === issueFilter ||
                (issueFilter === 'repaired' && issue.repaired) ||
                (issueFilter === 'open' && !issue.repaired);

            if (!matchesFilter) {
                return false;
            }

            if (!normalizedSearch) {
                return true;
            }

            return [
                issue.label,
                issue.detail,
                issue.code,
                issue.nodeId,
                issue.edgeId
            ]
                .filter(Boolean)
                .some((value) =>
                    String(value).toLowerCase().includes(normalizedSearch)
                );
        });
    }, [issueFilter, issueSearch, report.issues]);

    useEffect(() => {
        onReportChange?.(report);
    }, [onReportChange, report]);

    useEffect(() => {
        let isCancelled = false;

        if (!flowId) {
            setBackendReport(undefined);
            setBackendStatus('idle');
            setBackendError('');
            return undefined;
        }

        const loadBackendReport = async () => {
            setBackendStatus('loading');
            setBackendError('');

            try {
                const response = await axios.get(
                    `http://localhost:8000/api/workspaces/${flowId}/exports/json`
                );
                if (isCancelled) {
                    return;
                }

                const normalizedReport = normalizeBackendReport(
                    response.data?.validation_report
                );

                if (normalizedReport) {
                    setBackendReport(normalizedReport);
                    setBackendStatus('ready');
                    recordActivity({
                        type: 'validation_run',
                        title: 'Validated graph',
                        summary: normalizedReport.isValid
                            ? 'Backend validation completed without schema errors.'
                            : 'Backend validation found issues.',
                        node_ids: normalizedReport.issues
                            .map((issue) => issue.nodeId)
                            .filter(Boolean),
                        metadata: {
                            source: 'backend',
                            errors: normalizedReport.summary.errors,
                            warnings: normalizedReport.summary.warnings,
                            info: normalizedReport.summary.info,
                            repaired: normalizedReport.repaired
                        }
                    });
                } else {
                    setBackendReport(undefined);
                    setBackendStatus('fallback');
                    setBackendError('Backend response did not include validation_report.');
                    recordActivity({
                        type: 'validation_run',
                        title: 'Validated graph locally',
                        summary:
                            'Backend validation did not return a report, so local checks are shown.',
                        metadata: {
                            source: 'local_fallback'
                        }
                    });
                }
            } catch (err) {
                if (isCancelled) {
                    return;
                }

                setBackendReport(undefined);
                setBackendStatus('fallback');
                setBackendError(
                    err.response?.statusText || err.message || 'Backend validation unavailable.'
                );
                recordActivity({
                    type: 'validation_run',
                    title: 'Validated graph locally',
                    summary:
                        err.response?.statusText ||
                        err.message ||
                        'Backend validation unavailable.',
                    metadata: {
                        source: 'local_fallback'
                    }
                });
            }
        };

        loadBackendReport();

        return () => {
            isCancelled = true;
        };
    }, [flowId, recordActivity, refreshCounter]);

    if (nodes.length === 0) {
        return null;
    }

    return (
        <section className={`graph-validation-panel graph-validation-${reportState}`}>
            <button
                type="button"
                className="graph-validation-summary"
                onClick={() => setIsExpanded((current) => !current)}
                aria-expanded={isExpanded}
            >
                <span>Workspace health</span>
                <strong>{totalIssues === 0 ? 'Clear' : `${totalIssues} to review`}</strong>
            </button>

            {isExpanded ? (
                <div className="graph-validation-body">
                    <div className="graph-validation-meta">
                        <span>{sourceLabel}</span>
                        {flowId ? (
                            <button
                                type="button"
                                onClick={() => setRefreshCounter((current) => current + 1)}
                                disabled={backendStatus === 'loading'}
                            >
                                {backendStatus === 'loading' ? 'Checking' : 'Refresh'}
                            </button>
                        ) : null}
                    </div>
                    {backendError ? (
                        <p className="graph-validation-fallback-note">
                            {backendError} Showing local fallback checks.
                        </p>
                    ) : null}
                    {report.source === 'backend' && report.repaired ? (
                        <p className="graph-validation-repaired-note">
                            Backend repaired graph issues before producing this report.
                        </p>
                    ) : null}
                    <div className="graph-validation-context">
                        <span>
                            {report.isValid ? 'Schema valid' : 'Schema invalid'}
                        </span>
                        {report.rootNodeId ? (
                            <button
                                type="button"
                                onClick={() => onSelectNode(report.rootNodeId)}
                            >
                                Root {report.rootNodeId}
                            </button>
                        ) : (
                            <span>No root node</span>
                        )}
                    </div>
                    <div className="graph-validation-counts">
                        <span>{report.summary.errors} errors</span>
                        <span>{report.summary.warnings} warnings</span>
                        <span>{report.summary.info} notes</span>
                    </div>
                    {totalIssues > 0 ? (
                        <div className="graph-validation-triage">
                            <div className="graph-validation-filters">
                                {ISSUE_FILTERS.map((filter) => (
                                    <button
                                        key={filter.id}
                                        type="button"
                                        className={
                                            issueFilter === filter.id
                                                ? 'graph-validation-filter-active'
                                                : ''
                                        }
                                        onClick={() => setIssueFilter(filter.id)}
                                    >
                                        {filter.label}
                                    </button>
                                ))}
                            </div>
                            <input
                                value={issueSearch}
                                onChange={(event) =>
                                    setIssueSearch(event.target.value)
                                }
                                placeholder="Search issues"
                            />
                        </div>
                    ) : null}
                    {totalIssues === 0 ? (
                        <p className="graph-validation-empty">
                            No workspace health issues detected.
                        </p>
                    ) : filteredIssues.length === 0 ? (
                        <p className="graph-validation-empty">
                            No validation issues match the current filter.
                        </p>
                    ) : (
                        <ul className="graph-validation-issues">
                            {filteredIssues.map((issue, index) => (
                                <li
                                    key={`${issue.label}-${issue.nodeId}-${index}`}
                                    className={`graph-validation-issue graph-validation-issue-${issue.severity}`}
                                >
                                    <div>
                                        <span>
                                            {issue.label}
                                            {issue.repaired ? ' repaired' : ''}
                                        </span>
                                        <p>{issue.detail}</p>
                                        {issue.code ? (
                                            <small>Code {issue.code}</small>
                                        ) : null}
                                        {issue.edgeId ? (
                                            <small>Edge {issue.edgeId}</small>
                                        ) : null}
                                    </div>
                                    {issue.nodeId ? (
                                        <button
                                            type="button"
                                            onClick={() => onSelectNode(issue.nodeId)}
                                        >
                                            Inspect
                                        </button>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ) : null}
        </section>
    );
};

export default GraphValidationPanel;
