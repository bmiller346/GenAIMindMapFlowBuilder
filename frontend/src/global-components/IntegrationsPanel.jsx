import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { getCredentialSettings } from '../config/localSettings';
import flowStore from '../stores/flowStore';
import useActivityStore from '../stores/activityStore';
import useStore from '../stores/store';
import useWorkspacePanelStore from '../stores/workspacePanelStore';

const providerLabels = {
    miro: 'Miro',
    monday: 'monday.com'
};

const nowTime = () =>
    new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const getProviderRef = (node, provider) =>
    node?.data?.external_refs?.[provider] || {};

const getLastDate = (refs, fields) => {
    const dates = refs
        .flatMap((ref) => fields.map((field) => ref[field]))
        .filter(Boolean)
        .map((value) => Date.parse(value))
        .filter((value) => Number.isFinite(value));

    if (dates.length === 0) {
        return '';
    }

    return new Date(Math.max(...dates)).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
};

const summarizeProvider = (nodes, provider, hasCredential, validationIssues) => {
    const refs = nodes
        .map((node) => getProviderRef(node, provider))
        .filter((ref) => Object.keys(ref).length > 0);
    const mappedNodes = refs.filter((ref) => ref.item_id || ref.board_id).length;
    const completeRefs = refs.filter((ref) => ref.board_id && ref.item_id).length;
    const lastPush = getLastDate(refs, ['last_pushed_at']);
    const lastPull = getLastDate(refs, ['last_pulled_at']);
    const exportBatches = new Set(refs.map((ref) => ref.export_batch_id).filter(Boolean));
    const warnings = validationIssues.filter((issue) => {
        const text = [
            issue.code,
            issue.label,
            issue.detail,
            issue.integration
        ].filter(Boolean).join(' ').toLowerCase();
        return text.includes(provider);
    });

    return {
        provider,
        hasCredential,
        mappedNodes,
        completeRefs,
        lastPush,
        lastPull,
        lastExportBatch: [...exportBatches].at(-1) || '',
        warnings
    };
};

const downloadJson = (payload, fileName) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json'
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
};

const readableError = (error, fallback) => {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') {
        return detail;
    }
    if (detail) {
        return detail.message || JSON.stringify(detail);
    }
    return error.message || fallback;
};

const IntegrationStat = ({ label, value }) => (
    <span>
        <small>{label}</small>
        <strong>{value || '-'}</strong>
    </span>
);

const IntegrationsPanel = ({ validationReport }) => {
    const activePanel = useWorkspacePanelStore((s) => s.activePanel);
    const closePanel = useWorkspacePanelStore((s) => s.closePanel);
    const { nodes, selectedBranchId, setNodes } = useStore(
        useShallow((state) => ({
            nodes: state.nodes,
            selectedBranchId: state.selectedBranchId,
            setNodes: state.setNodes
        }))
    );
    const flowId = flowStore((s) => s.flow_id);
    const flowName = flowStore((s) => s.flow_name);
    const addActivity = useActivityStore((s) => s.addActivity);
    const updateActivity = useActivityStore((s) => s.updateActivity);
    const [credentials, setCredentials] = useState({});
    const [actionStatus, setActionStatus] = useState('');

    useEffect(() => {
        let cancelled = false;
        getCredentialSettings().then((settings) => {
            if (!cancelled) {
                setCredentials(settings || {});
            }
        });

        return () => {
            cancelled = true;
        };
    }, [activePanel]);

    const integrationIssues = validationReport?.issues || [];
    const summaries = useMemo(
        () => [
            summarizeProvider(
                nodes,
                'miro',
                Boolean(credentials.miroApiToken),
                integrationIssues
            ),
            summarizeProvider(
                nodes,
                'monday',
                Boolean(credentials.mondayApiToken),
                integrationIssues
            )
        ],
        [credentials.miroApiToken, credentials.mondayApiToken, integrationIssues, nodes]
    );

    const mergeExternalRefs = (provider, refsByNodeId) => {
        if (!refsByNodeId || Object.keys(refsByNodeId).length === 0) {
            return;
        }

        setNodes(
            nodes.map((node) => {
                const nextRef = refsByNodeId[node.id];
                if (!nextRef) {
                    return node;
                }

                const externalRefs = node.data?.external_refs || {};
                return {
                    ...node,
                    data: {
                        ...node.data,
                        external_refs: {
                            ...externalRefs,
                            [provider]: {
                                ...(externalRefs[provider] || {}),
                                ...nextRef
                            }
                        }
                    }
                };
            })
        );
    };

    const applyMondayStatusProjections = (projectionsByNodeId) => {
        if (!projectionsByNodeId || Object.keys(projectionsByNodeId).length === 0) {
            return;
        }

        setNodes(
            nodes.map((node) => {
                const projection = projectionsByNodeId[node.id];
                if (!projection) {
                    return node;
                }

                const externalRefs = node.data?.external_refs || {};
                const statusProjections = node.data?.external_status_projections || {};
                return {
                    ...node,
                    data: {
                        ...node.data,
                        external_status_projections: {
                            ...statusProjections,
                            monday: {
                                projected_status: projection.projected_status,
                                status: projection.monday_status,
                                item_id: projection.monday_item_id,
                                last_pulled_at: projection.last_pulled_at
                            }
                        },
                        external_refs: {
                            ...externalRefs,
                            monday: {
                                ...(externalRefs.monday || {}),
                                item_id: projection.monday_item_id,
                                status: projection.monday_status,
                                projected_status: projection.projected_status,
                                last_pulled_at: projection.last_pulled_at
                            }
                        }
                    }
                };
            })
        );
    };

    const requireWorkspace = () => {
        if (flowId) {
            return true;
        }
        setActionStatus('Open or create a workspace first.');
        return false;
    };

    const runIntegrationAction = async ({
        title,
        provider,
        endpoint,
        params,
        mergeRefs,
        applyStatuses,
        fileSuffix
    }) => {
        if (!requireWorkspace()) {
            return;
        }

        const activityId = addActivity({
            title,
            detail: `${providerLabels[provider]} action started.`,
            context: 'Integration workspace panel'
        });
        setActionStatus(`${title} running...`);

        try {
            const response = await axios.post(endpoint, {}, {
                params,
                headers: { 'Content-Type': 'application/json' }
            });
            if (mergeRefs) {
                mergeExternalRefs(provider, response.data.external_refs);
            }
            if (applyStatuses) {
                applyMondayStatusProjections(
                    response.data.status_projections || response.data.status_updates
                );
            }
            downloadJson(
                response.data,
                `${flowName || 'workspace'}-${fileSuffix || provider}.json`
            );
            updateActivity(activityId, {
                status: 'completed',
                detail: `${title} completed at ${nowTime()}.`
            });
            setActionStatus(`${title} completed.`);
        } catch (error) {
            const detail = readableError(error, `${title} failed.`);
            updateActivity(activityId, {
                status: 'failed',
                detail
            });
            setActionStatus(detail);
        }
    };

    const promptMiroBoard = () => {
        const boardId = window.prompt('Miro board ID');
        return boardId?.trim() || '';
    };

    const promptMondayTarget = () => {
        const boardId = window.prompt('monday board ID');
        if (!boardId?.trim()) {
            return null;
        }
        const groupId = window.prompt('monday group ID');
        if (!groupId?.trim()) {
            return null;
        }
        return { boardId: boardId.trim(), groupId: groupId.trim() };
    };

    const runMiroBoard = (dryRun) => {
        const boardId = promptMiroBoard();
        if (!boardId) {
            return;
        }
        runIntegrationAction({
            title: dryRun ? 'Miro board preview' : 'Miro board push',
            provider: 'miro',
            endpoint: `http://localhost:8000/api/workspaces/${flowId}/export/miro/board`,
            params: { board_id: boardId, dry_run: dryRun },
            mergeRefs: !dryRun,
            fileSuffix: dryRun ? 'miro-board-plan' : 'miro-board-result'
        });
    };

    const runMiroBranchFrame = () => {
        if (!selectedBranchId) {
            setActionStatus('Select one branch before previewing a Miro frame.');
            return;
        }
        const boardId = promptMiroBoard();
        if (!boardId) {
            return;
        }
        runIntegrationAction({
            title: 'Miro branch frame preview',
            provider: 'miro',
            endpoint: `http://localhost:8000/api/workspaces/${flowId}/branches/${selectedBranchId}/export/miro/frame`,
            params: { board_id: boardId, dry_run: true },
            fileSuffix: 'miro-frame-plan'
        });
    };

    const runMondayExistingGroup = (dryRun) => {
        const target = promptMondayTarget();
        if (!target) {
            return;
        }
        if (!dryRun && !window.confirm('Create monday items and persist returned item IDs?')) {
            return;
        }
        runIntegrationAction({
            title: dryRun ? 'monday existing group preflight' : 'monday existing group push',
            provider: 'monday',
            endpoint: dryRun
                ? 'http://localhost:8000/api/integrations/monday/preflight/existing-group'
                : `http://localhost:8000/api/workspaces/${flowId}/export/monday/existing-group`,
            params: {
                board_id: target.boardId,
                group_id: target.groupId,
                dry_run: dryRun,
                confirmed: !dryRun,
                template_id: 'autodesk_building_block_review'
            },
            mergeRefs: !dryRun,
            fileSuffix: dryRun ? 'monday-existing-plan' : 'monday-existing-result'
        });
    };

    const runMondayStatusPull = (apply) => {
        if (apply && !window.confirm('Pull monday statuses and apply them to mapped nodes?')) {
            return;
        }
        runIntegrationAction({
            title: apply ? 'monday status pull' : 'monday status preview',
            provider: 'monday',
            endpoint: `http://localhost:8000/api/workspaces/${flowId}/sync/monday/status`,
            params: { dry_run: !apply, apply },
            applyStatuses: apply,
            fileSuffix: apply ? 'monday-status-result' : 'monday-status-plan'
        });
    };

    if (activePanel !== 'integrations') {
        return null;
    }

    return (
        <aside className="workspace-context-panel integrations-panel">
            <div className="workspace-context-header">
                <div>
                    <p>Integrations</p>
                    <span>{nodes.length} graph nodes tracked</span>
                </div>
                <button type="button" onClick={closePanel}>
                    Close
                </button>
            </div>
            <div className="integration-cards">
                {summaries.map((summary) => (
                    <article key={summary.provider} className="integration-card">
                        <div className="integration-card-title">
                            <div>
                                <strong>{providerLabels[summary.provider]}</strong>
                                <span>
                                    {summary.hasCredential ? 'Credential ready' : 'No token saved'}
                                </span>
                            </div>
                            <span className={summary.hasCredential ? 'ready' : 'missing'}>
                                {summary.hasCredential ? 'Ready' : 'Needs setup'}
                            </span>
                        </div>
                        <div className="integration-stats">
                            <IntegrationStat label="Mapped" value={summary.mappedNodes} />
                            <IntegrationStat label="Complete refs" value={summary.completeRefs} />
                            <IntegrationStat label="Last push" value={summary.lastPush} />
                            <IntegrationStat label="Last pull" value={summary.lastPull} />
                        </div>
                        <div className="integration-meta">
                            <span>Batch {summary.lastExportBatch || 'none'}</span>
                            <span>
                                {summary.warnings.length
                                    ? `${summary.warnings.length} warning(s)`
                                    : 'No integration warnings'}
                            </span>
                        </div>
                        {summary.provider === 'miro' ? (
                            <div className="integration-actions">
                                <button type="button" onClick={() => runMiroBoard(true)}>
                                    Board preview
                                </button>
                                <button type="button" onClick={() => runMiroBoard(false)}>
                                    Push board
                                </button>
                                <button type="button" onClick={runMiroBranchFrame}>
                                    Branch frame
                                </button>
                            </div>
                        ) : (
                            <div className="integration-actions">
                                <button type="button" onClick={() => runMondayExistingGroup(true)}>
                                    Preflight group
                                </button>
                                <button type="button" onClick={() => runMondayExistingGroup(false)}>
                                    Push tasks
                                </button>
                                <button type="button" onClick={() => runMondayStatusPull(false)}>
                                    Status preview
                                </button>
                                <button type="button" onClick={() => runMondayStatusPull(true)}>
                                    Pull status
                                </button>
                            </div>
                        )}
                    </article>
                ))}
            </div>
            {actionStatus ? <p className="workspace-context-status">{actionStatus}</p> : null}
        </aside>
    );
};

export default IntegrationsPanel;
