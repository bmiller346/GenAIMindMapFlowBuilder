/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { mockConnectedPackagePreview } from './mockConnectedPackagePreview';
import TrustStateBadges from '../components/TrustStateBadges';
import './ConnectedPackagePreview.css';

const TABS = ['Overview', 'Graph', 'Connections', 'Flow', 'Table', 'Chart', 'Evidence', 'Tasks', 'Review'];

const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const firstText = (...values) =>
    values.find((value) => typeof value === 'string' && value.trim()) || '';

const humanize = (value = '') =>
    String(value || '')
        .replaceAll('_', ' ')
        .replaceAll('-', ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\w/, (letter) => letter.toUpperCase());

const percent = (value, fallback = 0) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
};

const readinessTone = (value = '') => {
    const normalized = String(value || '').toLowerCase();
    if (['ready', 'source_backed', 'accepted', 'complete'].includes(normalized)) {
        return 'ready';
    }
    if (['blocked', 'needs_repair', 'missing', 'error'].includes(normalized)) {
        return 'blocked';
    }
    return 'warning';
};

const sourceRefsFromPackage = (packageData = {}) => [
    ...asArray(packageData.source_refs),
    ...asArray(packageData.primary_nodes).flatMap((item) => asArray(item.source_refs)),
    ...asArray(packageData.relationship_edges).flatMap((item) => asArray(item.source_refs)),
    ...asArray(packageData.structured_evidence).flatMap((item) => asArray(item.source_refs))
];

const strictPackageToPreview = (packageData = {}, artifact = {}) => {
    const nodes = asArray(packageData.primary_nodes);
    const edges = asArray(packageData.relationship_edges);
    const evidence = asArray(packageData.structured_evidence);
    const repairs = asArray(packageData.repair_targets);
    const tasks = asArray(packageData.tasks);
    const sourceRefs = sourceRefsFromPackage(packageData);
    const totalItems =
        nodes.length +
        edges.length +
        evidence.length +
        repairs.length +
        tasks.length +
        asArray(packageData.risks).length +
        asArray(packageData.decisions).length;
    const citedItems = [
        ...nodes,
        ...edges,
        ...evidence,
        ...repairs,
        ...tasks,
        ...asArray(packageData.risks),
        ...asArray(packageData.decisions)
    ].filter((item) => asArray(item.source_refs).length > 0).length;

    return {
        title: firstText(artifact.title, packageData.title, packageData.package_id, 'Connected package'),
        summary: firstText(
            artifact.summary,
            packageData.summary,
            'Connected package generated from the draft contract.'
        ),
        status: firstText(artifact.status, packageData.review_state, 'preview_only'),
        graph: {
            nodes: nodes.map((node) => ({
                id: node.node_id || node.id,
                label: node.title || node.node_id || node.id,
                group: node.node_type || 'Package',
                readiness: node.review_state || node.status,
                source_refs: node.source_refs
            })),
            edges: edges.map((edge) => ({
                id: edge.id,
                source: edge.source_node_id,
                target: edge.target_node_id,
                relationship: edge.relationship_type,
                confidence: edge.confidence || 0,
                status: edge.review_state,
                source_refs: edge.source_refs
            }))
        },
        connections: edges.map((edge) => ({
            id: edge.id,
            from: edge.source_node_id,
            to: edge.target_node_id,
            relationship: edge.relationship_type,
            confidence: edge.confidence || 0,
            review_state: edge.review_state,
            evidence_count: asArray(edge.source_refs).length,
            source_refs: edge.source_refs
        })),
        flow: {
            lenses: asArray(packageData.view_lenses).map((lens) => lens.title || humanize(lens.lens_type)),
            stages: nodes.map((node) => ({
                id: node.id,
                label: node.title,
                value: 1,
                status: node.review_state || node.status
            })),
            sankey_rows: edges.map((edge) => ({
                source: edge.source_node_id,
                target: edge.target_node_id,
                value: 1
            }))
        },
        table: {
            columns: ['item', 'type', 'review state', 'sources'],
            rows: [
                ...nodes.map((node) => [
                    node.title,
                    node.node_type || 'node',
                    node.review_state || node.status || 'review',
                    asArray(node.source_refs).length
                ]),
                ...evidence.map((item) => [
                    item.title,
                    item.evidence_type || 'evidence',
                    item.review_state || 'review',
                    asArray(item.source_refs).length
                ])
            ]
        },
        charts: [
            { id: 'source-coverage', label: 'Source coverage', value: totalItems ? (citedItems / totalItems) * 100 : 0, tone: citedItems ? 'ready' : 'warning' },
            { id: 'repair-targets', label: 'Repair targets', value: repairs.length * 10, tone: repairs.length ? 'warning' : 'ready' }
        ],
        evidence: evidence.map((item) => ({
            id: item.id,
            title: item.title,
            source: asArray(item.source_refs)[0]?.title || asArray(item.source_refs)[0]?.document_id || 'No source yet',
            coverage: item.review_state || 'needs_review',
            status: item.review_state || item.status,
            source_refs: item.source_refs
        })),
        tasks: [
            ...tasks,
            ...asArray(packageData.risks).map((risk) => ({
                ...risk,
                status: risk.review_state || risk.status,
                owner: 'Reviewer'
            }))
        ],
        repair_targets: repairs.map((target) => ({
            id: target.id,
            label: target.issue || target.title || target.id,
            reason: target.repair_action || target.issue,
            owner: target.metadata?.owner || 'Reviewer',
            priority: target.metadata?.priority || 'review',
            target_type: target.target_type,
            review_state: target.review_state || target.status,
            source_refs: target.source_refs
        })),
        acceptance_groups: asArray(packageData.acceptance_groups).map((group) => ({
            id: group.id,
            label: group.title || group.id,
            summary: group.description || group.summary,
            status: group.review_state || group.status,
            item_count: asArray(group.item_ids).length,
            accepted_count: 0,
            source_refs: group.source_refs
        })),
        readiness: [
            {
                id: 'source-coverage',
                label: 'Source coverage',
                state: citedItems > 0 ? 'ready' : 'needs_review'
            },
            {
                id: 'repair-targets',
                label: 'Repair targets',
                state: repairs.length ? 'needs_repair' : 'ready'
            }
        ],
        source_coverage: {
            total_items: totalItems,
            cited_items: citedItems,
            uncited_items: Math.max(0, totalItems - citedItems),
            required_repairs: repairs.length,
            sources: sourceRefs.length
                ? [
                      {
                          id: sourceRefs[0].document_id || sourceRefs[0].url || 'source',
                          title: sourceRefs[0].title || sourceRefs[0].document_id || sourceRefs[0].url || 'Source',
                          coverage: totalItems ? citedItems / totalItems : 0,
                          cited_items: citedItems
                      }
                  ]
                : []
        },
        review: asArray(packageData.assumptions).map((assumption, index) => ({
            id: `assumption-${index}`,
            label: assumption,
            tone: 'warning'
        }))
    };
};

const normalizePackage = ({ packagePreview, session = {}, revision = {} } = {}) => {
    const metadata = {
        ...(session.metadata || {}),
        ...(revision.metadata || {})
    };
    const connectedArtifact = asArray(revision.generated_artifacts).find(
        (artifact) => artifact?.artifact_type === 'connected_picture_package'
    );
    const connectedArtifactData =
        connectedArtifact?.data && typeof connectedArtifact.data === 'object'
            ? connectedArtifact.data
            : connectedArtifact;
    const candidate =
        packagePreview ||
        revision.connected_package_preview ||
        revision.connected_package ||
        revision.package_preview ||
        metadata.connected_package_preview ||
        metadata.connected_package ||
        metadata.package_preview ||
        (connectedArtifact ? strictPackageToPreview(connectedArtifactData, connectedArtifact) : null) ||
        null;

    if (candidate && typeof candidate === 'object') {
        return {
            ...mockConnectedPackagePreview,
            ...candidate,
            source: 'backend_or_session'
        };
    }

    const draftNodes = asArray(revision.draft_nodes);
    const draftItems = asArray(revision.draft_items);
    const draftEdges = asArray(revision.draft_edges);
    const sourceRefs = [
        ...draftNodes.flatMap((node) => asArray(node.source_refs)),
        ...draftItems.flatMap((item) => asArray(item.source_refs))
    ];
    const uncitedCount = [...draftNodes, ...draftItems].filter((item) => asArray(item.source_refs).length === 0).length;
    const citedCount = Math.max(draftNodes.length + draftItems.length - uncitedCount, sourceRefs.length ? 1 : 0);
    const packageTitle = firstText(
        metadata.connected_package_title,
        metadata.package_title,
        revision.title,
        revision.prompt,
        mockConnectedPackagePreview.title
    );

    return {
        ...mockConnectedPackagePreview,
        title: packageTitle,
        summary:
            draftNodes.length || draftItems.length || draftEdges.length
                ? 'Preview-only connected package assembled from the current draft revision and local mock package artifacts.'
                : mockConnectedPackagePreview.summary,
        source: 'mock',
        source_coverage: {
            ...mockConnectedPackagePreview.source_coverage,
            total_items: Math.max(draftNodes.length + draftItems.length, mockConnectedPackagePreview.source_coverage.total_items),
            cited_items: Math.max(citedCount, mockConnectedPackagePreview.source_coverage.cited_items),
            uncited_items: Math.max(uncitedCount, mockConnectedPackagePreview.source_coverage.uncited_items),
            required_repairs: Math.max(uncitedCount, mockConnectedPackagePreview.source_coverage.required_repairs)
        }
    };
};

const Chip = ({ children, tone = 'warning' }) => (
    <span className={`connected-package-preview__chip ${readinessTone(tone)}`}>{children}</span>
);

const ConnectedPackagePreview = ({ packagePreview, session, revision }) => {
    const [activeTab, setActiveTab] = useState('Overview');
    const connectedPackage = useMemo(
        () => normalizePackage({ packagePreview, session, revision }),
        [packagePreview, revision, session]
    );
    const coverage = connectedPackage.source_coverage || {};
    const coveragePercent = coverage.total_items
        ? percent((Number(coverage.cited_items || 0) / Number(coverage.total_items || 1)) * 100)
        : 0;

    return (
        <section className="connected-package-preview" aria-label="Connected package preview">
            <header className="connected-package-preview__header">
                <div className="connected-package-preview__heading">
                    <span className="connected-package-preview__eyebrow">Connected package</span>
                    <strong>{connectedPackage.title}</strong>
                    <p>{connectedPackage.summary}</p>
                    <span className="connected-package-preview__meta">
                        {connectedPackage.source === 'mock' ? 'Mock preview artifacts' : 'Session package artifacts'} ·{' '}
                        {coveragePercent}% source coverage
                    </span>
                </div>
                <span className="connected-package-preview__status">{humanize(connectedPackage.status || 'preview_only')}</span>
            </header>

            <nav className="connected-package-preview__tabs" aria-label="Connected package tabs">
                {TABS.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        className={activeTab === tab ? 'active' : ''}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab}
                    </button>
                ))}
            </nav>

            <div className="connected-package-preview__body">
                {activeTab === 'Overview' ? <OverviewTab connectedPackage={connectedPackage} coveragePercent={coveragePercent} /> : null}
                {activeTab === 'Graph' ? <GraphTab graph={connectedPackage.graph} /> : null}
                {activeTab === 'Connections' ? <ConnectionsTab connections={connectedPackage.connections} /> : null}
                {activeTab === 'Flow' ? <FlowTab flow={connectedPackage.flow} /> : null}
                {activeTab === 'Table' ? <TableTab table={connectedPackage.table} /> : null}
                {activeTab === 'Chart' ? <ChartTab charts={connectedPackage.charts} flow={connectedPackage.flow} /> : null}
                {activeTab === 'Evidence' ? <EvidenceTab connectedPackage={connectedPackage} /> : null}
                {activeTab === 'Tasks' ? <TasksTab tasks={connectedPackage.tasks} /> : null}
                {activeTab === 'Review' ? <ReviewTab connectedPackage={connectedPackage} /> : null}
            </div>
        </section>
    );
};

const OverviewTab = ({ connectedPackage, coveragePercent }) => (
    <>
        <div className="connected-package-preview__grid">
            <Metric label="Acceptance groups" value={asArray(connectedPackage.acceptance_groups).length} />
            <Metric label="Repair targets" value={asArray(connectedPackage.repair_targets).length} />
            <Metric label="Readiness checks" value={asArray(connectedPackage.readiness).length} />
            <Metric label="Source coverage" value={`${coveragePercent}%`} />
        </div>
        <section className="connected-package-preview__grid" aria-label="Acceptance groups">
            {asArray(connectedPackage.acceptance_groups).map((group) => (
                <article key={group.id || group.label} className="connected-package-preview__card">
                    <span>{humanize(group.status || 'review')}</span>
                    <strong>{group.label}</strong>
                    <p>{group.summary}</p>
                    <div className="connected-package-preview__chips">
                        <Chip tone={group.status}>{group.accepted_count || 0} accepted</Chip>
                        <Chip tone={group.status}>{group.item_count || 0} items</Chip>
                        <TrustStateBadges
                            subject={{
                                status: group.status,
                                source_backed: group.status === 'source_backed',
                                source_refs: group.source_refs || []
                            }}
                        />
                    </div>
                </article>
            ))}
        </section>
        <div className="connected-package-preview__chips" aria-label="Readiness chips">
            {asArray(connectedPackage.readiness).map((item) => (
                <Chip key={item.id || item.label} tone={item.state}>
                    {item.label}: {humanize(item.state)}
                </Chip>
            ))}
        </div>
    </>
);

const Metric = ({ label, value }) => (
    <div className="connected-package-preview__metric">
        <span>{label}</span>
        <strong>{value}</strong>
    </div>
);

const GraphTab = ({ graph = {} }) => (
    <section className="connected-package-preview__graph">
        <div className="connected-package-preview__nodes" aria-label="Package graph nodes">
            {asArray(graph.nodes).map((node) => (
                <div key={node.id || node.label} className="connected-package-preview__node">
                    <strong>{node.label || node.id}</strong>
                    <small>
                        {node.group || 'Package'} · {humanize(node.readiness || 'review')}
                    </small>
                </div>
            ))}
        </div>
        <div className="connected-package-preview__sankey" aria-label="Package graph edges">
            {asArray(graph.edges).map((edge) => (
                <div key={edge.id || `${edge.source}-${edge.target}`} className="connected-package-preview__sankey-row">
                    <span>{edge.source}</span>
                    <span className="connected-package-preview__arrow">to</span>
                    <span>{edge.target}</span>
                    <TrustStateBadges subject={edge} />
                    <Chip tone={edge.confidence >= 0.75 ? 'ready' : 'warning'}>
                        {humanize(edge.relationship)} {percent(edge.confidence)}%
                    </Chip>
                </div>
            ))}
        </div>
    </section>
);

const ConnectionsTab = ({ connections = [] }) => (
    <section className="connected-package-preview__flow">
        {asArray(connections).map((connection) => (
            <article key={connection.id} className="connected-package-preview__list-row">
                <span>{humanize(connection.review_state)}</span>
                <strong>
                    {connection.from} to {connection.to}
                </strong>
                <p>
                    {humanize(connection.relationship)} · {percent(connection.confidence)}% confidence ·{' '}
                    {connection.evidence_count || 0} evidence items
                </p>
                <TrustStateBadges
                    subject={{
                        ...connection,
                        status: connection.review_state,
                        source_backed: connection.evidence_count > 0
                    }}
                />
            </article>
        ))}
    </section>
);

const FlowTab = ({ flow = {} }) => (
    <section className="connected-package-preview__flow">
        <div className="connected-package-preview__lens-row" aria-label="Flow lenses">
            {asArray(flow.lenses).map((lens) => (
                <Chip key={lens} tone={lens === 'Sankey' ? 'warning' : 'ready'}>
                    {lens} lens
                </Chip>
            ))}
        </div>
        {asArray(flow.stages).map((stage) => (
            <div key={stage.id || stage.label} className="connected-package-preview__flow-stage">
                <strong>{stage.label}</strong>
                <Progress value={stage.value * 10} tone={stage.status} />
                <Chip tone={stage.status}>{stage.value} items</Chip>
            </div>
        ))}
    </section>
);

const TableTab = ({ table = {} }) => {
    const columns = asArray(table.columns);
    const rows = asArray(table.rows);
    if (!columns.length || !rows.length) {
        return <div className="connected-package-preview__empty">No table preview rows are available yet.</div>;
    }
    return (
        <div className="connected-package-preview__table-wrap">
            <table className="connected-package-preview__table">
                <thead>
                    <tr>
                        {columns.map((column) => (
                            <th key={column}>{column}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={`package-row-${index}`}>
                            {asArray(row).map((cell, cellIndex) => (
                                <td key={`${index}-${columns[cellIndex] || cellIndex}`}>{cell}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const ChartTab = ({ charts = [], flow = {} }) => (
    <section className="connected-package-preview__flow">
        <span className="connected-package-preview__panel-label">Chart lenses</span>
        <div className="connected-package-preview__bars">
            {asArray(charts).map((chart) => (
                <div key={chart.id || chart.label} className="connected-package-preview__bar">
                    <strong>{chart.label}</strong>
                    <Progress value={chart.value} tone={chart.tone} />
                </div>
            ))}
        </div>
        <div className="connected-package-preview__sankey" aria-label="Sankey chart lens">
            <span className="connected-package-preview__panel-label">Sankey lens</span>
            {asArray(flow.sankey_rows).map((row, index) => (
                <div key={`${row.source}-${row.target}-${index}`} className="connected-package-preview__sankey-row">
                    <span>{row.source}</span>
                    <span className="connected-package-preview__arrow">to</span>
                    <span>{row.target}</span>
                    <Chip tone="warning">{row.value}</Chip>
                </div>
            ))}
        </div>
    </section>
);

const Progress = ({ value, tone }) => (
    <div className="connected-package-preview__bar-track" aria-label={`${percent(value)} percent`}>
        <div
            className={`connected-package-preview__bar-fill ${readinessTone(tone)}`}
            style={{ width: `${Math.max(4, Math.min(percent(value), 100))}%` }}
        />
    </div>
);

const EvidenceTab = ({ connectedPackage }) => (
    <section className="connected-package-preview__flow">
        <div className="connected-package-preview__grid">
            {asArray(connectedPackage.source_coverage?.sources).map((source) => (
                <article key={source.id || source.title} className="connected-package-preview__card">
                    <span>{percent(source.coverage)}% covered</span>
                    <strong>{source.title}</strong>
                    <p>{source.cited_items || 0} cited package items</p>
                </article>
            ))}
        </div>
        {asArray(connectedPackage.evidence).map((item) => (
            <article key={item.id || item.title} className="connected-package-preview__list-row">
                <span>{humanize(item.status)}</span>
                <strong>{item.title}</strong>
                <p>
                    {item.source} · {item.coverage}
                </p>
                <TrustStateBadges
                    subject={{
                        ...item,
                        status: item.status,
                        source_refs: item.source_refs || (item.source ? [{ document_id: item.source }] : [])
                    }}
                />
            </article>
        ))}
    </section>
);

const TasksTab = ({ tasks = [] }) => (
    <section className="connected-package-preview__flow">
        {asArray(tasks).map((task) => (
            <article key={task.id || task.title} className="connected-package-preview__task">
                <span>{humanize(task.status)}</span>
                <strong>{task.title}</strong>
                <small>{task.owner || 'Unassigned'}</small>
                <TrustStateBadges subject={{ ...task, status: task.status }} />
            </article>
        ))}
    </section>
);

const ReviewTab = ({ connectedPackage }) => (
    <section className="connected-package-preview__flow">
        {asArray(connectedPackage.repair_targets).map((target) => (
            <article key={target.id || target.label} className="connected-package-preview__list-row">
                <span>
                    {humanize(target.priority)} · {humanize(target.target_type)}
                </span>
                <strong>{target.label}</strong>
                <p>
                    {target.owner} · {target.reason}
                </p>
                <TrustStateBadges subject={{ ...target, status: target.review_state || 'needs_review' }} />
            </article>
        ))}
        {asArray(connectedPackage.review).map((note) => (
            <article key={note.id || note.label} className={`connected-package-preview__review-note ${readinessTone(note.tone)}`}>
                <strong>{note.label}</strong>
            </article>
        ))}
    </section>
);

export default ConnectedPackagePreview;
