/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { asArray, humanize, normalizePackage, percent, readinessTone } from './connectedPackageModel.js';
import TrustStateBadges from '../components/TrustStateBadges';
import './ConnectedPackagePreview.css';

const TABS = ['Overview', 'Graph', 'Connections', 'Flow', 'Table', 'Chart', 'Evidence', 'Tasks', 'Review'];

const Chip = ({ children, tone = 'warning' }) => (
    <span className={`connected-package-preview__chip ${readinessTone(tone)}`}>{children}</span>
);

const ConnectedPackagePreview = ({ packagePreview, session, revision, onRequestSourceRepair }) => {
    const [activeTab, setActiveTab] = useState('Overview');
    const connectedPackage = useMemo(
        () => normalizePackage({ packagePreview, session, revision }),
        [packagePreview, revision, session]
    );
    const coverage = connectedPackage.source_coverage || {};
    const evidenceMeta = connectedPackage.evidence_meta || {};
    const readinessGate = connectedPackage.readiness_gate || {};
    const coveragePercent = coverage.total_items
        ? percent((Number(coverage.cited_items || 0) / Number(coverage.total_items || 1)) * 100)
        : 0;
    const needsCitationRepair =
        Number(coverage.total_items || 0) > 0 &&
        Number(coverage.cited_items || 0) === 0 &&
        (evidenceMeta.web_evidence_requested ||
            evidenceMeta.citation_required ||
            Number(coverage.required_repairs || 0) > 0);

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

            {needsCitationRepair ? (
                <CitationRepairCallout
                    connectedPackage={connectedPackage}
                    onRequestSourceRepair={onRequestSourceRepair}
                />
            ) : null}
            {!needsCitationRepair && readinessGate.bulk_accept_blocked ? (
                <ReadinessGateCallout readinessGate={readinessGate} />
            ) : null}

            <nav className="connected-package-preview__tabs" role="tablist" aria-label="Connected package tabs">
                {TABS.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab}
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

const CitationRepairCallout = ({ connectedPackage, onRequestSourceRepair }) => {
    const coverage = connectedPackage.source_coverage || {};
    const evidenceMeta = connectedPackage.evidence_meta || {};
    return (
        <section className="connected-package-preview__callout" role="status">
            <div>
                <strong>No citations were attached to this package.</strong>
                <p>
                    {humanize(evidenceMeta.evidence_mode || 'web sources')} was allowed
                    {evidenceMeta.citation_required ? ' and citations were required' : ''}, but all{' '}
                    {coverage.total_items || 'package'} review items still need source repair.
                </p>
            </div>
            <div className="connected-package-preview__callout-actions">
                <Chip tone="blocked">{coverage.required_repairs || coverage.uncited_items || 0} repair targets</Chip>
                {onRequestSourceRepair ? (
                    <button type="button" onClick={() => onRequestSourceRepair(connectedPackage)}>
                        Repair citations
                    </button>
                ) : null}
            </div>
        </section>
    );
};

const ReadinessGateCallout = ({ readinessGate = {} }) => {
    const issues = asArray(readinessGate.issues).slice(0, 4);
    return (
        <section className="connected-package-preview__callout" role="status">
            <div>
                <strong>Bulk acceptance needs readiness repair.</strong>
                <p>
                    Select specific package items to accept, or repair the blockers before accepting
                    the whole connected package.
                </p>
            </div>
            <div className="connected-package-preview__callout-actions">
                <Chip tone="blocked">{readinessGate.blocker_count || issues.length} blockers</Chip>
                {issues.map((issue) => (
                    <Chip key={`${issue.code}-${issue.item_id || issue.title}`} tone="blocked">
                        {issue.label}: {issue.title}
                    </Chip>
                ))}
            </div>
        </section>
    );
};

const OverviewTab = ({ connectedPackage, coveragePercent }) => (
    <>
        <div className="connected-package-preview__grid">
            <Metric label="Acceptance groups" value={asArray(connectedPackage.acceptance_groups).length} />
            <Metric label="Repair targets" value={asArray(connectedPackage.repair_targets).length} />
            <Metric label="Bulk blockers" value={connectedPackage.readiness_gate?.blocker_count || 0} />
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
            {asArray(connectedPackage.readiness_gate?.issues).slice(0, 6).map((issue) => (
                <Chip key={`${issue.code}-${issue.item_id || issue.title}`} tone={issue.severity}>
                    {issue.label}
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
