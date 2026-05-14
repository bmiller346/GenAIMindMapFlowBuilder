import axios from 'axios';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import flowStore from '../stores/flowStore';
import useActivityStore from '../stores/activityStore';
import useAutomationStore from '../stores/automationStore';
import useStore from '../stores/store';
import useWorkspacePanelStore from '../stores/workspacePanelStore';

const countNeedsReviewNodes = (nodes) =>
    nodes.filter((node) => {
        const data = node.data || {};
        return (
            data.node_type === 'needs_review' ||
            data.status === 'needs_review' ||
            data.review_status === 'needs_review'
        );
    }).length;

const buildSourceCoverage = (nodes) => {
    const sourceIds = new Set();
    let citedNodes = 0;
    nodes.forEach((node) => {
        const sourceRef = node.data?.source_ref || node.source_ref || {};
        const sourceId = sourceRef.document_id || sourceRef.source_id;
        if (sourceId) {
            sourceIds.add(sourceId);
            citedNodes += 1;
        }
    });

    return {
        sourceCount: sourceIds.size,
        citedNodes,
        uncitedNodes: Math.max(nodes.length - citedNodes, 0)
    };
};

const readableError = (error) => {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') {
        return detail;
    }
    if (detail) {
        return detail.message || JSON.stringify(detail);
    }
    return error.message || 'Automation failed.';
};

const AutomationsPanel = ({ validationReport }) => {
    const activePanel = useWorkspacePanelStore((s) => s.activePanel);
    const closePanel = useWorkspacePanelStore((s) => s.closePanel);
    const { nodes } = useStore(useShallow((state) => ({ nodes: state.nodes })));
    const flowId = flowStore((s) => s.flow_id);
    const addActivity = useActivityStore((s) => s.addActivity);
    const updateActivity = useActivityStore((s) => s.updateActivity);
    const automations = useAutomationStore((s) => s.automations);
    const addAutomationToStore = useAutomationStore((s) => s.addAutomation);
    const updateAutomation = useAutomationStore((s) => s.updateAutomation);
    const deleteAutomation = useAutomationStore((s) => s.deleteAutomation);
    const recordAutomationRun = useAutomationStore((s) => s.recordAutomationRun);
    const [draftName, setDraftName] = useState('');
    const [draftAction, setDraftAction] = useState('needs_review_report');
    const [panelStatus, setPanelStatus] = useState('');

    const coverage = useMemo(() => buildSourceCoverage(nodes), [nodes]);
    const needsReviewCount = useMemo(() => countNeedsReviewNodes(nodes), [nodes]);
    const validationIssueCount = validationReport?.issues?.length || 0;

    const addAutomation = () => {
        const name = draftName.trim();
        if (!name) {
            setPanelStatus('Name the automation before creating it.');
            return;
        }

        addAutomationToStore({
            name,
            action: { type: draftAction, params: {} }
        });
        setDraftName('');
        setPanelStatus(`${name} created.`);
    };

    const runAutomation = async (automation) => {
        if (!flowId) {
            setPanelStatus('Open or create a workspace first.');
            return;
        }

        if (automation.status === 'paused') {
            setPanelStatus('Paused automations must be resumed before running.');
            return;
        }

        const activityId = addActivity({
            title: `Automation: ${automation.name}`,
            detail: `${automation.action.type} started.`,
            context: 'Automations panel'
        });

        try {
            let detail = '';
            if (automation.action.type === 'graph_revalidate') {
                const response = await axios.get(
                    `http://localhost:8000/api/workspaces/${flowId}/exports/json`
                );
                const report = response.data?.validation_report;
                const issues =
                    report?.summary?.errors ||
                    report?.summary?.warnings ||
                    response.data?.validation_report?.issues?.length ||
                    validationIssueCount;
                detail = `Validation refreshed with ${issues || 0} issue(s).`;
            } else if (automation.action.type === 'monday_status_preview') {
                const response = await axios.post(
                    `http://localhost:8000/api/workspaces/${flowId}/sync/monday/status`,
                    {},
                    {
                        params: { dry_run: true, apply: false },
                        headers: { 'Content-Type': 'application/json' }
                    }
                );
                detail = `${response.data?.tracked_node_count || 0} monday-linked node(s) checked.`;
            } else if (automation.action.type === 'source_coverage_report') {
                detail = `${coverage.citedNodes} cited, ${coverage.uncitedNodes} uncited across ${coverage.sourceCount} source(s).`;
            } else {
                detail = `${needsReviewCount} node(s) need review.`;
            }

            updateActivity(activityId, { status: 'completed', detail });
            recordAutomationRun(automation.id, {
                status: 'completed',
                detail,
                finished_at: new Date().toISOString()
            });
            setPanelStatus(detail);
        } catch (error) {
            const detail = readableError(error);
            updateActivity(activityId, { status: 'failed', detail });
            recordAutomationRun(automation.id, {
                status: 'failed',
                detail,
                finished_at: new Date().toISOString()
            });
            setPanelStatus(detail);
        }
    };

    if (activePanel !== 'automations') {
        return null;
    }

    return (
        <aside className="workspace-context-panel automations-panel">
            <div className="workspace-context-header">
                <div>
                    <p>Automations</p>
                    <span>{automations.length} workspace routines</span>
                </div>
                <button type="button" onClick={closePanel}>
                    Close
                </button>
            </div>
            <div className="automation-create">
                <input
                    type="text"
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    placeholder="New automation name"
                    aria-label="New automation name"
                />
                <select
                    value={draftAction}
                    onChange={(event) => setDraftAction(event.target.value)}
                    aria-label="Automation action"
                >
                    <option value="needs_review_report">Review reminder</option>
                    <option value="graph_revalidate">Revalidate graph</option>
                    <option value="monday_status_preview">monday status preview</option>
                    <option value="source_coverage_report">Source coverage</option>
                </select>
                <button type="button" onClick={addAutomation}>
                    Create
                </button>
            </div>
            <div className="automation-list">
                {automations.map((automation) => (
                    <article key={automation.id} className="automation-card">
                        <div className="automation-card-main">
                            <strong>{automation.name}</strong>
                            <span>{automation.action.type}</span>
                            <small>
                                Last run:{' '}
                                {automation.last_run_at
                                    ? new Date(automation.last_run_at).toLocaleString([], {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: 'numeric',
                                          minute: '2-digit'
                                      })
                                    : 'Never'}
                            </small>
                        </div>
                        <div className="automation-actions">
                            <button type="button" onClick={() => runAutomation(automation)}>
                                Run
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    updateAutomation(automation.id, (current) => ({
                                        ...current,
                                        status:
                                            current.status === 'paused'
                                                ? 'active'
                                                : 'paused'
                                    }))
                                }
                            >
                                {automation.status === 'paused' ? 'Resume' : 'Pause'}
                            </button>
                            <button type="button" onClick={() => deleteAutomation(automation.id)}>
                                Delete
                            </button>
                        </div>
                    </article>
                ))}
            </div>
            <div className="automation-snapshot">
                <span>{validationIssueCount} validation issue(s)</span>
                <span>{needsReviewCount} needs review</span>
                <span>{coverage.uncitedNodes} uncited</span>
            </div>
            {panelStatus ? <p className="workspace-context-status">{panelStatus}</p> : null}
        </aside>
    );
};

export default AutomationsPanel;
