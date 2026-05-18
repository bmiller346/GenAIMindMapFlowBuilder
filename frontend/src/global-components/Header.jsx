import DRAWERSvg from '../assets/drawer.svg';
import LoadingModal from '../modals/LoadingModal';
import flowStore from '../stores/flowStore';
import modalStore from '../stores/modalStore';
import axios from 'axios';
import {
    getViewportForBounds,
    useReactFlow
} from '@xyflow/react';
import errorStore from '../stores/errorStore';
import ErrorModal from '../modals/ErrorModal';
import SettingsModal from '../modals/SettingsModal';
import PromptModal from '../modals/PromptModal';
import HelpModal from '../modals/HelpModal';
import DevDebugModal from '../modals/DevDebugModal';
import PdfStudioModal from '../modals/PdfStudioModal';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiMoreHorizontal } from 'react-icons/fi';
import traceLogo from '../assets/landing-logo.svg';
import {
    createFlowSnapshot,
    parseFlowSnapshot,
    stringifyFlowSnapshot
} from '../utils/flowSnapshots';
import useActivityStore from '../stores/activityStore';
import useAutomationStore from '../stores/automationStore';
import { createSourceLibrarySnapshot } from '../views/graphProjection';
import { getMapStyleTheme } from '../utils/mapStyles';
import { buildPdfStudioWorkspaceGraph } from '../export/pdf';

const EMPTY_GRAPH_ALLOWED_ACTIVITY_TYPES = new Set([
    'manual_nodes_deleted',
    'workspace_created',
    'workspace_opened',
    'workspace_reset',
    'revert_snapshot_restored'
]);
const AUTOSAVE_DELAY_MS = 30000;

const latestMeaningfulActivity = (events = []) =>
    (Array.isArray(events) ? events : []).find(
        (event) =>
            event &&
            !['autosave_persisted', 'save_manual', 'workspace_renamed'].includes(event.type)
    );

const acceptedArtifactTypesFromActivity = (events = []) => {
    const types = new Set();
    (Array.isArray(events) ? events : []).forEach((event) => {
        const artifacts = event?.metadata?.accepted_artifacts;
        if (!Array.isArray(artifacts)) {
            return;
        }
        artifacts.forEach((artifact) => {
            const type = artifact?.artifact_type || artifact?.artifactType;
            if (type) {
                types.add(type);
            }
        });
    });
    return types;
};

const Header = ({
    setIsDrawer,
    setFlowList,
    lightMode,
    setLightMode
}) => {
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const [isUtilityMenuOpen, setIsUtilityMenuOpen] = useState(false);
    const recordActivity = useActivityStore((s) => s.recordActivity);
    const setActivityEvents = useActivityStore((s) => s.setActivityEvents);
    const setActivityWorkspace = useActivityStore((s) => s.setActivityWorkspace);
    const activityEvents = useActivityStore((s) => s.activities);
    const automations = useAutomationStore((s) => s.automations);
    const setAutomations = useAutomationStore((s) => s.setAutomations);
    const autosaveTimerRef = useRef();
    const exportInFlightRef = useRef(false);
    const saveInFlightFingerprintRef = useRef('');
    const utilityMenuRef = useRef(null);
    const pushNode = modalStore((s) => s.pushNode);
    const popNode = modalStore((s) => s.popNode);
    const flow_id = flowStore((s) => s.flow_id);
    const flow_type = flowStore((s) => s.flow_type);
    const rfInstance = flowStore((s) => s.rfInstance);
    const flow_name = flowStore((s) => s.flow_name);
    const setFlowName = flowStore((s) => s.setFlowName);
    const setFlowType = flowStore((s) => s.setFlowType);
    const saveStatus = flowStore((s) => s.saveStatus);
    const lastSavedSnapshot = flowStore((s) => s.lastSavedSnapshot);
    const lastSavedFlowName = flowStore((s) => s.lastSavedFlowName);
    const lastSavedFlowType = flowStore((s) => s.lastSavedFlowType);
    const lastPersistedSnapshot = flowStore((s) => s.lastPersistedSnapshot);
    const lastPersistedFingerprint = flowStore((s) => s.lastPersistedFingerprint);
    const lastPersistedFlowName = flowStore((s) => s.lastPersistedFlowName);
    const lastPersistedFlowType = flowStore((s) => s.lastPersistedFlowType);
    const lastSavedAt = flowStore((s) => s.lastSavedAt);
    const lastSaveError = flowStore((s) => s.lastSaveError);
    const setSaveStatus = flowStore((s) => s.setSaveStatus);
    const setSavedSnapshot = flowStore((s) => s.setSavedSnapshot);
    const setSaveError = flowStore((s) => s.setSaveError);
    const selector = (s) => ({
        trigger: s.trigger,
        setTrigger: s.setTrigger,
        nodes: s.nodes,
        edges: s.edges,
        selectedBranchId: s.selectedBranchId,
        setNodes: s.setNodes,
        setEdges: s.setEdges,
        setViewPort: s.setViewPort,
        setWorkspaceBrief: s.setWorkspaceBrief,
        setMapStyle: s.setMapStyle,
        setSourceLibrary: s.setSourceLibrary,
        setSelectedBranchId: s.setSelectedBranchId,
        setInspectorNodeId: s.setInspectorNodeId,
        viewport: s.viewport,
        workspaceBrief: s.workspaceBrief,
        mapStyle: s.mapStyle,
        sourceLibrary: s.sourceLibrary,
        developerMode: s.developerMode,
        aiActionRuns: s.aiActionRuns,
        setAIActionRuns: s.setAIActionRuns
    });
    const setTheme = flowStore((s) => s.setTheme);
    const {
        trigger,
        setTrigger,
        nodes,
        edges,
        selectedBranchId,
        setNodes,
        setEdges,
        setViewPort,
        setWorkspaceBrief,
        setMapStyle,
        setSourceLibrary,
        setSelectedBranchId,
        setInspectorNodeId,
        viewport,
        workspaceBrief,
        mapStyle,
        sourceLibrary,
        developerMode,
        aiActionRuns,
        setAIActionRuns
    } = useStore(useShallow(selector));
    const { getNodes, getEdges, getNodesBounds, setViewport } = useReactFlow();
    const exportFormats = [
        { id: 'json', label: 'JSON', extension: 'json' },
        { id: 'markdown', label: 'Markdown', extension: 'md' },
        { id: 'csv', label: 'CSV', extension: 'csv' },
        { id: 'opml', label: 'OPML', extension: 'opml' },
        { id: 'mmd-json', label: 'MMD JSON', extension: 'json' },
        { id: 'mermaid', label: 'Mermaid', extension: 'mmd' }
    ];
    const publishableExportFormats = [
        {
            id: 'executive.md',
            label: 'Executive Summary',
            extension: 'md',
            suffix: 'executive-summary',
            artifactTypes: ['executive_summary', 'executive_output']
        },
        {
            id: 'news-article.md',
            label: 'News Article',
            extension: 'md',
            suffix: 'news-article',
            artifactTypes: ['news_article']
        },
        {
            id: 'team-roadmap.md',
            label: 'Team Roadmap',
            extension: 'md',
            suffix: 'team-roadmap',
            artifactTypes: ['team_roadmap']
        },
        {
            id: 'completeness-review.md',
            label: 'Completeness Review',
            extension: 'md',
            suffix: 'completeness-review',
            artifactTypes: ['completeness_review']
        }
    ];
    const imageExportFormats = [
        { id: 'png', label: 'PNG', extension: 'png' },
        { id: 'svg', label: 'SVG', extension: 'svg' }
    ];
    const buildCurrentSnapshot = useCallback(() => {
        const flowObject = rfInstance?.toObject
            ? rfInstance.toObject()
            : { nodes: [], edges: [], viewport: {} };
        return createFlowSnapshot({
            flowObject,
            nodes,
            edges,
            viewport,
            mapStyle,
            workspaceBrief,
            sourceLibrary: createSourceLibrarySnapshot({
                nodes,
                edges,
                workspaceBrief,
                sourceLibrary
            }),
            activityEvents: useActivityStore.getState().activities,
            aiActionRuns: useStore.getState().aiActionRuns,
            automations: useAutomationStore.getState().automations
        });
    }, [
        activityEvents,
        automations,
        edges,
        nodes,
        rfInstance,
        sourceLibrary,
        aiActionRuns,
        mapStyle,
        viewport,
        workspaceBrief
    ]);

    useEffect(() => {
        setActivityWorkspace(flow_id || '');
    }, [flow_id, setActivityWorkspace]);

    useEffect(() => {
        if (!isUtilityMenuOpen) {
            return undefined;
        }

        const handlePointerDown = (event) => {
            if (utilityMenuRef.current?.contains(event.target)) {
                return;
            }
            setIsUtilityMenuOpen(false);
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [isUtilityMenuOpen]);

    const currentSnapshot = useMemo(
        () => buildCurrentSnapshot(),
        [buildCurrentSnapshot]
    );

    const currentFingerprint = useMemo(
        () => stringifyFlowSnapshot(currentSnapshot),
        [currentSnapshot]
    );

    const buildLatestSnapshotFromStores = useCallback(() => {
        const latestState = useStore.getState();
        const flowObject = rfInstance?.toObject
            ? rfInstance.toObject()
            : { nodes: [], edges: [], viewport: {} };

        return createFlowSnapshot({
            flowObject,
            nodes: latestState.nodes,
            edges: latestState.edges,
            viewport: latestState.viewport,
            mapStyle: latestState.mapStyle,
            workspaceBrief: latestState.workspaceBrief,
            sourceLibrary: createSourceLibrarySnapshot({
                nodes: latestState.nodes,
                edges: latestState.edges,
                workspaceBrief: latestState.workspaceBrief,
                sourceLibrary: latestState.sourceLibrary
            }),
            activityEvents: useActivityStore.getState().activities,
            aiActionRuns: latestState.aiActionRuns,
            automations: useAutomationStore.getState().automations
        });
    }, [rfInstance]);

    const hasUnsavedChanges = Boolean(
        flow_id &&
        lastPersistedFingerprint &&
        (currentFingerprint !== lastPersistedFingerprint ||
            flow_name !== lastPersistedFlowName ||
            flow_type !== lastPersistedFlowType)
    );
    const acceptedArtifactTypes = useMemo(
        () => acceptedArtifactTypesFromActivity(activityEvents),
        [activityEvents]
    );

    useEffect(() => {
        if (!flow_id || !lastPersistedFingerprint || !hasUnsavedChanges) {
            return;
        }

        if (saveStatus !== 'saving' && saveStatus !== 'error') {
            setSaveStatus('dirty');
        }
    }, [
        flow_id,
        flow_name,
        flow_type,
        hasUnsavedChanges,
        lastPersistedFingerprint,
        lastPersistedFlowName,
        lastPersistedFlowType,
        saveStatus,
        setSaveStatus
    ]);

    const saveFlow = async ({ showLoading = true } = {}) => {
        if (!flow_id) {
            return;
        }

        setSaveStatus('saving');
        if (showLoading) {
            pushNode(LoadingModal);
        }
        let savedFingerprint = '';
        try {
            if (showLoading) {
                recordActivity({
                    type: 'save_manual',
                    title: 'Saved workspace',
                    summary: 'Saved the current workspace snapshot.',
                    metadata: {
                        nodes: nodes.length,
                        edges: edges.length
                    }
                });
            }
            const savedSnapshot = buildCurrentSnapshot();
            savedFingerprint = stringifyFlowSnapshot(savedSnapshot);
            if (!showLoading && saveInFlightFingerprintRef.current === savedFingerprint) {
                return;
            }
            saveInFlightFingerprintRef.current = savedFingerprint;
            await saveFlowCall(undefined, savedSnapshot);
            const latestSnapshot = buildLatestSnapshotFromStores();
            const latestFingerprint = stringifyFlowSnapshot(latestSnapshot);
            const latestFlowState = flowStore.getState();

            if (
                latestFingerprint === savedFingerprint &&
                latestFlowState.flow_name === flow_name &&
                latestFlowState.flow_type === flow_type
            ) {
                setSavedSnapshot(savedSnapshot, savedFingerprint, flow_name, flow_type, {
                    checkpoint: showLoading
                });
            } else {
                setSaveStatus('dirty');
            }
            if (showLoading) {
                popNode();
            }
        } catch (err) {
            setSaveError(err?.message || 'Autosave failed');
            if (showLoading) {
                manageErrors(err);
            }
        } finally {
            if (saveInFlightFingerprintRef.current === savedFingerprint) {
                saveInFlightFingerprintRef.current = '';
            }
        }
    };

    const saveFlowCall = (nameOverride, snapshotOverride) => {
        const snapshot = snapshotOverride || buildCurrentSnapshot();
        const lastNodeCount = Array.isArray(lastPersistedSnapshot?.nodes)
            ? lastPersistedSnapshot.nodes.length
            : 0;
        const nextNodeCount = Array.isArray(snapshot?.nodes) ? snapshot.nodes.length : 0;
        const lastMeaningfulActivity = latestMeaningfulActivity(
            snapshot?.activity_events || activityEvents
        );
        if (
            lastNodeCount > 0 &&
            nextNodeCount === 0 &&
            !EMPTY_GRAPH_ALLOWED_ACTIVITY_TYPES.has(lastMeaningfulActivity?.type)
        ) {
            const message =
                'Skipped saving an empty graph snapshot because the previous saved workspace had nodes and no delete/reset action was recorded.';
            setSaveError(message);
            return Promise.reject(new Error(message));
        }
        const flow_json = stringifyFlowSnapshot(snapshot);
        const data = {
            flow_id: flow_id,
            flow_name: nameOverride ?? flow_name,
            flow_json: flow_json,
            flow_type: flow_type || 'manual',
            summary: 'Please work'
        };
        return axios.put(`http://localhost:8000/flow-update/`, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    };

    const saveLatestWorkspaceSnapshot = useCallback(async () => {
        if (!flowStore.getState().flow_id) {
            return;
        }

        const latestSnapshot = buildLatestSnapshotFromStores();
        const latestFingerprint = stringifyFlowSnapshot(latestSnapshot);
        const latestFlowState = flowStore.getState();
        if (saveInFlightFingerprintRef.current === latestFingerprint) {
            return;
        }
        saveInFlightFingerprintRef.current = latestFingerprint;
        setSaveStatus('saving');
        try {
            await saveFlowCall(latestFlowState.flow_name, latestSnapshot);
            setSavedSnapshot(
                latestSnapshot,
                latestFingerprint,
                latestFlowState.flow_name,
                latestFlowState.flow_type,
                { checkpoint: false }
            );
        } catch (err) {
            setSaveError(err?.message || 'Autosave failed');
        } finally {
            if (saveInFlightFingerprintRef.current === latestFingerprint) {
                saveInFlightFingerprintRef.current = '';
            }
        }
    }, [
        buildLatestSnapshotFromStores,
        saveFlowCall,
        setSaveError,
        setSaveStatus,
        setSavedSnapshot
    ]);

    useEffect(() => {
        const handleImmediateSave = () => {
            clearTimeout(autosaveTimerRef.current);
            saveLatestWorkspaceSnapshot();
        };

        window.addEventListener('docmap:save-workspace-now', handleImmediateSave);
        return () =>
            window.removeEventListener(
                'docmap:save-workspace-now',
                handleImmediateSave
            );
    }, [saveLatestWorkspaceSnapshot]);

    useEffect(() => {
        if (!hasUnsavedChanges || saveStatus === 'saving' || saveStatus === 'error') {
            return;
        }

        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = setTimeout(() => {
            saveFlow({ showLoading: false });
        }, AUTOSAVE_DELAY_MS);

        return () => clearTimeout(autosaveTimerRef.current);
    }, [currentFingerprint, flow_name, flow_type, hasUnsavedChanges, saveStatus]);

    const selector2 = (state) => ({
        status: state.status,
        message: state.message,
        setStatus: state.setStatus,
        setMsg: state.setMsg
    });
    const { setStatus, setMsg } = errorStore(
        useShallow(selector2)
    );

    const manageErrors = (err) => {
        const isNetworkError = !err.response;
        setStatus(err.response?.status || err.status || (isNetworkError ? 503 : 500));
        setMsg(
            err.response?.data?.detail ||
            err.response?.statusText ||
            (isNetworkError
                ? 'Local backend is not running yet. Start the TraceSpace backend or launch the Electron app so it can start it for you.'
                : err.message || 'Request failed')
        );
        popNode();
        pushNode(ErrorModal);
    };

    const sanitizeFileName = (value) => {
        const nextValue = value?.trim() || 'workspace';
        return nextValue.replace(/[<>:"/\\|?*]/g, '_');
    };

    const triggerFileDownload = (blob, fileName) => {
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
    };

    const triggerUrlDownload = (url, fileName) => {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    };

    const exportWorkspace = async (format) => {
        if (exportInFlightRef.current) {
            return;
        }
        if (!flow_id) {
            setStatus(400);
            setMsg('Create or open a workspace before exporting.');
            pushNode(ErrorModal);
            return;
        }

        pushNode(LoadingModal);
        exportInFlightRef.current = true;
        try {
            await saveFlowCall();
            const response = await axios.get(
                `http://localhost:8000/api/workspaces/${flow_id}/exports/${format.id}`,
                {
                    responseType: 'blob'
                }
            );
            const suffix = format.suffix ? `-${format.suffix}` : '';
            const fileName = `${sanitizeFileName(flow_name)}${suffix}.${format.extension}`;
            triggerFileDownload(response.data, fileName);
            recordActivity({
                type: 'export_file_downloaded',
                title: `Exported ${format.label}`,
                summary: `Downloaded ${fileName}.`,
                metadata: {
                    format: format.id,
                    file_name: fileName
                }
            });
            setIsExportMenuOpen(false);
            popNode();
        } catch (err) {
            manageErrors(err);
        } finally {
            exportInFlightRef.current = false;
        }
    };

    const exportBridgePayload = async (format) => {
        if (!flow_id) {
            setStatus(400);
            setMsg('Create or open a workspace before exporting.');
            pushNode(ErrorModal);
            return;
        }

        const confirmed =
            format.id !== 'monday' ||
            window.confirm(
                'Create a confirmed monday export payload for boards, groups, and items?'
            );

        if (!confirmed) {
            return;
        }

        pushNode(LoadingModal);
        try {
            await saveFlowCall();
            const response = await axios.post(
                `http://localhost:8000/api/workspaces/${flow_id}/export/${format.id}`,
                {},
                {
                    params: format.id === 'monday' ? { confirmed: true } : {},
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            const blob = new Blob([JSON.stringify(response.data, null, 2)], {
                type: 'application/json'
            });
            const fileName = `${sanitizeFileName(flow_name)}.${format.extension}`;
            triggerFileDownload(blob, fileName);
            recordActivity({
                type:
                    format.id === 'monday'
                        ? 'integration_monday_payload_exported'
                        : 'export_bridge_payload',
                title: format.label,
                summary: `Downloaded ${fileName}.`,
                integration: format.id === 'monday' ? 'monday' : '',
                metadata: {
                    format: format.id,
                    file_name: fileName
                }
            });
            setIsExportMenuOpen(false);
            popNode();
        } catch (err) {
            manageErrors(err);
        }
    };

    const mergeExternalRefs = (integration, refsByNodeId) => {
        if (!refsByNodeId || Object.keys(refsByNodeId).length === 0) {
            return;
        }

        setNodes(
            nodes.map((node) => {
                const ref = refsByNodeId[node.id];
                if (!ref) {
                    return node;
                }

                const externalRefs = node.data?.external_refs || {};
                return {
                    ...node,
                    data: {
                        ...node.data,
                        external_refs: {
                            ...externalRefs,
                            [integration]: {
                                ...(externalRefs[integration] || {}),
                                ...ref
                            }
                        }
                    }
                };
            })
        );
    };

    const mergeMiroExternalRefs = (refsByNodeId) => {
        mergeExternalRefs('miro', refsByNodeId);
    };

    const mergeMondayExternalRefs = (refsByNodeId) => {
        mergeExternalRefs('monday', refsByNodeId);
    };

    const promptExistingMondayTarget = () => {
        const boardId = window.prompt('monday board ID for this export');
        if (!boardId?.trim()) {
            return null;
        }

        const groupId = window.prompt('monday group ID for this export');
        if (!groupId?.trim()) {
            return null;
        }

        return {
            boardId: boardId.trim(),
            groupId: groupId.trim()
        };
    };

    const exportWorkspaceMiroBoard = async (format) => {
        if (!flow_id) {
            setStatus(400);
            setMsg('Create or open a workspace before exporting.');
            pushNode(ErrorModal);
            return;
        }

        const boardId = window.prompt('Miro board ID for this workspace export');
        if (!boardId?.trim()) {
            return;
        }

        const confirmed =
            format.dryRun ||
            window.confirm(
                'Push this Miro export and persist returned item IDs?'
            );

        if (!confirmed) {
            return;
        }

        pushNode(LoadingModal);
        try {
            await saveFlowCall();
            const response = await axios.post(
                `http://localhost:8000/api/workspaces/${flow_id}/export/miro/${format.endpoint}`,
                {},
                {
                    params: {
                        board_id: boardId.trim(),
                        dry_run: format.dryRun
                    },
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            mergeMiroExternalRefs(response.data.external_refs);
            const blob = new Blob([JSON.stringify(response.data, null, 2)], {
                type: 'application/json'
            });
            const fileName = `${sanitizeFileName(flow_name)}.${format.extension}`;
            triggerFileDownload(blob, fileName);
            recordActivity({
                type: format.dryRun
                    ? 'integration_miro_dry_run'
                    : 'integration_miro_push',
                title: format.label,
                summary: format.dryRun
                    ? 'Generated a Miro workspace preview.'
                    : 'Pushed workspace data to Miro.',
                integration: 'miro',
                node_ids: Object.keys(response.data.external_refs || {}),
                metadata: {
                    board_id: boardId.trim(),
                    endpoint: format.endpoint,
                    file_name: fileName
                }
            });
            setIsExportMenuOpen(false);
            popNode();
        } catch (err) {
            manageErrors(err);
        }
    };

    const exportSelectedBranchMiroFrame = async (format) => {
        if (!flow_id) {
            setStatus(400);
            setMsg('Create or open a workspace before exporting.');
            pushNode(ErrorModal);
            return;
        }

        if (!selectedBranchId) {
            setStatus(400);
            setMsg('Select one node before exporting a Miro branch frame.');
            pushNode(ErrorModal);
            return;
        }

        const boardId = window.prompt('Miro board ID for this branch frame');
        if (!boardId?.trim()) {
            return;
        }

        const confirmed =
            format.dryRun ||
            window.confirm(
                'Push this selected branch to Miro and persist returned item IDs?'
            );

        if (!confirmed) {
            return;
        }

        pushNode(LoadingModal);
        try {
            await saveFlowCall();
            const response = await axios.post(
                `http://localhost:8000/api/workspaces/${flow_id}/branches/${selectedBranchId}/export/miro/frame`,
                {},
                {
                    params: {
                        board_id: boardId.trim(),
                        dry_run: format.dryRun
                    },
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            mergeMiroExternalRefs(response.data.external_refs);
            const blob = new Blob([JSON.stringify(response.data, null, 2)], {
                type: 'application/json'
            });
            const fileName = `${sanitizeFileName(flow_name)}.${format.extension}`;
            triggerFileDownload(blob, fileName);
            recordActivity({
                type: format.dryRun
                    ? 'integration_miro_branch_dry_run'
                    : 'integration_miro_branch_push',
                title: format.label,
                summary: format.dryRun
                    ? 'Generated a selected-branch Miro preview.'
                    : 'Pushed the selected branch to Miro.',
                integration: 'miro',
                node_ids: [
                    selectedBranchId,
                    ...Object.keys(response.data.external_refs || {})
                ],
                metadata: {
                    board_id: boardId.trim(),
                    file_name: fileName
                }
            });
            setIsExportMenuOpen(false);
            popNode();
        } catch (err) {
            manageErrors(err);
        }
    };

    const exportMondayExistingGroup = async (format) => {
        if (!flow_id) {
            setStatus(400);
            setMsg('Create or open a workspace before exporting.');
            pushNode(ErrorModal);
            return;
        }

        if (format.scope === 'branch' && !selectedBranchId) {
            setStatus(400);
            setMsg('Select one node before exporting branch tasks to monday.');
            pushNode(ErrorModal);
            return;
        }

        const target = promptExistingMondayTarget();
        if (!target) {
            return;
        }

        const confirmed =
            format.dryRun ||
            window.confirm(
                'Create monday items in this existing board/group and persist returned item IDs?'
            );

        if (!confirmed) {
            return;
        }

        const endpoint =
            format.scope === 'branch'
                ? `http://localhost:8000/api/workspaces/${flow_id}/branches/${selectedBranchId}/export/monday/existing-group`
                : `http://localhost:8000/api/workspaces/${flow_id}/export/monday/existing-group`;

        pushNode(LoadingModal);
        try {
            await saveFlowCall();
            const response = await axios.post(
                endpoint,
                {},
                {
                    params: {
                        board_id: target.boardId,
                        group_id: target.groupId,
                        dry_run: format.dryRun,
                        confirmed: !format.dryRun,
                        template_id: format.templateId
                    },
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            mergeMondayExternalRefs(response.data.external_refs);
            const blob = new Blob([JSON.stringify(response.data, null, 2)], {
                type: 'application/json'
            });
            const fileName = `${sanitizeFileName(flow_name)}.${format.extension}`;
            triggerFileDownload(blob, fileName);
            recordActivity({
                type: format.dryRun
                    ? 'integration_monday_dry_run'
                    : 'integration_monday_push',
                title: format.label,
                summary: format.dryRun
                    ? 'Generated a monday export preview.'
                    : 'Pushed workspace tasks to monday.',
                integration: 'monday',
                node_ids: [
                    ...(format.scope === 'branch' ? [selectedBranchId] : []),
                    ...Object.keys(response.data.external_refs || {})
                ],
                metadata: {
                    board_id: target.boardId,
                    group_id: target.groupId,
                    scope: format.scope,
                    file_name: fileName
                }
            });
            setIsExportMenuOpen(false);
            popNode();
        } catch (err) {
            manageErrors(err);
        }
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
                const externalStatusProjections =
                    node.data?.external_status_projections || {};
                return {
                    ...node,
                    data: {
                        ...node.data,
                        external_status_projections: {
                            ...externalStatusProjections,
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

    const pullMondayStatuses = async (format) => {
        if (!flow_id) {
            setStatus(400);
            setMsg('Create or open a workspace before pulling monday statuses.');
            pushNode(ErrorModal);
            return;
        }

        const confirmed =
            format.dryRun ||
            window.confirm('Pull monday statuses and apply them to matching nodes?');

        if (!confirmed) {
            return;
        }

        pushNode(LoadingModal);
        try {
            await saveFlowCall();
            const response = await axios.post(
                `http://localhost:8000/api/workspaces/${flow_id}/sync/monday/status`,
                {},
                {
                    params: {
                        dry_run: format.dryRun,
                        apply: format.apply
                    },
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            applyMondayStatusProjections(
                response.data.status_projections || response.data.status_updates
            );
            const blob = new Blob([JSON.stringify(response.data, null, 2)], {
                type: 'application/json'
            });
            const fileName = `${sanitizeFileName(flow_name)}.${format.extension}`;
            triggerFileDownload(blob, fileName);
            recordActivity({
                type: format.dryRun
                    ? 'integration_monday_status_dry_run'
                    : 'integration_monday_status_pull',
                title: format.label,
                summary: format.dryRun
                    ? 'Generated a monday status pull preview.'
                    : 'Pulled monday statuses into matching nodes.',
                integration: 'monday',
                node_ids: Object.keys(
                    response.data.status_projections ||
                        response.data.status_updates ||
                        {}
                ),
                metadata: {
                    apply: format.apply,
                    file_name: fileName
                }
            });
            setIsExportMenuOpen(false);
            popNode();
        } catch (err) {
            manageErrors(err);
        }
    };

    const buildMindMapExportOptions = () => {
        const nodeBounds = getNodesBounds(getNodes());
        const viewPort = getViewportForBounds(nodeBounds, 1920, 1080, 0, 2);
        const theme = getMapStyleTheme(useStore.getState().mapStyle?.theme);
        return {
            backgroundColor: theme.exportBackground,
            fontEmbedCSS: '',
            skipFonts: true,
            width: 1920,
            height: 1080,
            style: {
                transform: `translate(${viewPort.x}px, ${viewPort.y}px, scale(${viewPort.zoom}))`
            }
        };
    };

    const openPdfStudio = () => {
        const exportGraph = buildPdfStudioWorkspaceGraph({
            nodes,
            edges,
            flowNodes: getNodes(),
            flowEdges: getEdges()
        });
        if (exportGraph.nodes.length === 0) {
            setStatus(400);
            setMsg('Add exportable nodes to the workspace before exporting a PDF.');
            pushNode(ErrorModal);
            return;
        }

        setIsExportMenuOpen(false);
        pushNode(PdfStudioModal, {
            nodes: exportGraph.nodes,
            edges: exportGraph.edges,
            flowName: flow_name,
            mapStyle: mapStyle?.theme || mapStyle,
            workspaceBrief,
            onExportComplete: (result) => {
                recordActivity({
                    type: 'export_pdf_downloaded',
                    title: `Exported ${result.profile.label} PDF`,
                    summary: `Downloaded ${result.filename}.`,
                    metadata: {
                        format: 'pdf',
                        profile: result.profile.id,
                        page_size: result.pageSize.id,
                        orientation: result.pageSize.orientation,
                        page_count: result.pageCount,
                        file_name: result.filename
                    }
                });
            }
        });
    };

    const downloadMindMap = async (format) => {
        const viewport = document.querySelector('.react-flow__viewport');
        if (!viewport) {
            setStatus(400);
            setMsg('Could not find the current workspace map to export.');
            pushNode(ErrorModal);
            return;
        }

        const fileName = `${sanitizeFileName(flow_name)}.${format.extension}`;
        const exportOptions = buildMindMapExportOptions();

        try {
            if (format.id === 'svg') {
                const { toSvg } = await import('html-to-image');
                const svgUrl = await toSvg(viewport, exportOptions);
                triggerUrlDownload(svgUrl, fileName);
            } else {
                const { toPng } = await import('html-to-image');
                const pngUrl = await toPng(viewport, exportOptions);
                triggerUrlDownload(pngUrl, fileName);
            }
            recordActivity({
                type: 'export_image_downloaded',
                title: `Exported ${format.label} image`,
                summary: `Downloaded ${fileName}.`,
                metadata: {
                    format: format.id,
                    file_name: fileName
                }
            });
            setIsExportMenuOpen(false);
        } catch (err) {
            manageErrors(err);
        }
    };

    const syncActiveFlowName = (nextName) => {
        setFlowList((currentList) =>
            currentList.map((flow) =>
                flow.flow_id === flow_id
                    ? { ...flow, flow_name: nextName }
                    : flow
            )
        );
    };

    const setupFlowName = (event) => {
        const nextName = event.target.value;
        setFlowName(nextName);
        syncActiveFlowName(nextName);
        if (flow_id) {
            setSaveStatus('dirty');
        }
    };

    const commitFlowName = async (nextName = flow_name) => {
        if (!flow_id) {
            return;
        }
        const normalizedNextName = String(nextName || '').trim();
        const normalizedCurrentName = String(flow_name || '').trim();
        if (normalizedNextName === normalizedCurrentName) {
            return;
        }

        setSaveStatus('saving');
        try {
            recordActivity({
                type: 'workspace_renamed',
                title: 'Renamed workspace',
                summary: `Workspace name changed to ${normalizedNextName || 'Untitled workspace'}.`,
                metadata: {
                    previous_name: flow_name,
                    next_name: normalizedNextName
                }
            });
            const savedSnapshot = buildCurrentSnapshot();
            await saveFlowCall(normalizedNextName, savedSnapshot);
            setSavedSnapshot(
                savedSnapshot,
                stringifyFlowSnapshot(savedSnapshot),
                normalizedNextName,
                flow_type
            );
        } catch (err) {
            setSaveError(err?.message || 'Save failed');
            manageErrors(err);
        }
    };

    const applySnapshotToWorkspace = (snapshot, name) => {
        setNodes(snapshot.nodes || []);
        setEdges(snapshot.edges || []);
        setWorkspaceBrief(snapshot.workspace_brief || {});
        setMapStyle(snapshot.map_style || {});
        setSourceLibrary(snapshot.source_library || []);
        setAIActionRuns(snapshot.ai_action_runs || []);
        setActivityEvents(snapshot.activity_events || [], flow_id);
        setAutomations(snapshot.automations || []);
        const nextViewport = snapshot.viewport || {};
        setViewPort(nextViewport);
        if (nextViewport) {
            const { x = 0, y = 0, zoom = 1 } = nextViewport;
            setViewport({ x, y, zoom });
        }
        if (name !== undefined) {
            setFlowName(name);
            syncActiveFlowName(name);
        }
    };

    const syncActiveFlowType = (nextType) => {
        setFlowList((currentList) =>
            currentList.map((flow) =>
                flow.flow_id === flow_id
                    ? { ...flow, flow_type: nextType }
                    : flow
            )
        );
    };

    const revertFlow = async () => {
        if (!lastSavedSnapshot || !flow_id) {
            return;
        }

        clearTimeout(autosaveTimerRef.current);
        setSaveStatus('saving');
        try {
            const response = await axios.get(`http://localhost:8000/flows/${flow_id}`);
            const snapshot = parseFlowSnapshot(response.data.flow_json);
            const name = response.data.flow_name;
            setFlowType(response.data.flow_type || 'manual');
            syncActiveFlowType(response.data.flow_type || 'manual');
            applySnapshotToWorkspace(snapshot, name);
            recordActivity({
                type: 'revert_snapshot_restored',
                title: 'Reverted workspace',
                summary:
                    'Restored the last persisted workspace snapshot. The revert was kept in activity.',
                metadata: {
                    restored_from: 'backend'
                }
            });
            const revertedSnapshot = {
                ...snapshot,
                activity_events: useActivityStore.getState().activities,
                automations: useAutomationStore.getState().automations
            };
            await saveFlowCall(name, revertedSnapshot);
            setSavedSnapshot(
                revertedSnapshot,
                stringifyFlowSnapshot(revertedSnapshot),
                name,
                response.data.flow_type || 'manual'
            );
            return;
        } catch (err) {
            applySnapshotToWorkspace(lastSavedSnapshot, lastSavedFlowName);
            recordActivity({
                type: 'revert_snapshot_restored',
                title: 'Reverted workspace',
                summary:
                    'Restored the last local saved snapshot. The revert was kept in activity.',
                metadata: {
                    restored_from: 'local'
                }
            });
            const revertedSnapshot = {
                ...lastSavedSnapshot,
                activity_events: useActivityStore.getState().activities,
                automations: useAutomationStore.getState().automations
            };
            await saveFlowCall(lastSavedFlowName, revertedSnapshot);
            setSavedSnapshot(
                revertedSnapshot,
                stringifyFlowSnapshot(revertedSnapshot),
                lastSavedFlowName,
                lastSavedFlowType
            );
        }
    };

    const handleFlowNameKeyDown = (event) => {
        if (event.key !== 'Enter') {
            return;
        }

        event.currentTarget.blur();
    };

    const getFlowList = () => {
        axios
            .get(`http://localhost:8000/flows`)
            .then((res) => {
                pushNode(LoadingModal);
                setFlowList(res.data);
                setIsDrawer(true);
                popNode(LoadingModal);
            })

            .catch((err) => manageErrors(err));
    };

    const manageTheme = () => {
        setIsUtilityMenuOpen(false);
        setTheme(!lightMode);
        setLightMode(!lightMode);
        setTrigger(!trigger);
    };

    const openSettings = () => {
        setIsExportMenuOpen(false);
        setIsUtilityMenuOpen(false);
        pushNode(SettingsModal);
    };

    const openHelp = () => {
        setIsExportMenuOpen(false);
        setIsUtilityMenuOpen(false);
        pushNode(HelpModal);
    };

    const openDebug = () => {
        setIsExportMenuOpen(false);
        setIsUtilityMenuOpen(false);
        pushNode(DevDebugModal);
    };

    const openWorkspaceAskAi = () => {
        setIsExportMenuOpen(false);
        setIsUtilityMenuOpen(false);
        setSelectedBranchId(undefined);
        setInspectorNodeId(undefined);
        pushNode(PromptModal, { scope: 'workspace' });
        recordActivity({
            type: 'ai_action_picker_opened',
            title: 'Workspace Ask AI opened',
            summary: 'Opened preview-first AI actions for the whole workspace.',
            metadata: {
                scope: 'workspace'
            }
        });
    };

    const toggleExportMenu = () => {
        setIsUtilityMenuOpen(false);
        setIsExportMenuOpen((prev) => !prev);
    };

    const toggleUtilityMenu = () => {
        setIsExportMenuOpen(false);
        setIsUtilityMenuOpen((prev) => !prev);
    };

    const hasWorkspace = Boolean(flow_id);
    const canSave = hasWorkspace;
    const canRevert =
        hasWorkspace && Boolean(lastSavedSnapshot) && saveStatus !== 'saving';
    const saveStatusMessage =
        saveStatus === 'saving'
            ? 'Autosaving...'
            : saveStatus === 'dirty'
                ? 'Unsaved changes'
                : saveStatus === 'error'
                    ? lastSaveError || 'Autosave failed'
                    : lastSavedAt
                        ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], {
                              hour: 'numeric',
                              minute: '2-digit'
                          })}`
                        : hasWorkspace
                            ? 'Ready to save'
                            : 'Open or create a workspace';

    return (
        <div
            className="header"
            style={{ display: 'flex' }}
        >
            <div className="header-left">
                <img
                    className="drawer-trigger"
                    src={DRAWERSvg}
                    alt="Open workspaces"
                    onClick={() => getFlowList(true)}
                />
                <Link
                    to="/landing"
                    className="trace-overview-link"
                    title="About TraceSpace"
                    aria-label="About TraceSpace"
                >
                    <img src={traceLogo} alt="" aria-hidden="true" />
                </Link>
                <input
                    type="text"
                    value={flow_name || ''}
                    placeholder="Untitled workspace"
                    onChange={setupFlowName}
                    onBlur={(event) => commitFlowName(event.target.value)}
                    onKeyDown={handleFlowNameKeyDown}
                    aria-label="Workspace name"
                />
            </div>
            <div className="button header-actions">
                {canSave ? (
                    <button
                        type="button"
                        className="header-action header-action-primary workspace-ask-ai"
                        onClick={openWorkspaceAskAi}
                    >
                        Ask AI
                    </button>
                ) : null}
                <div className="export-actions">
                    <button
                        type="button"
                        className="header-action header-action-secondary"
                        onClick={toggleExportMenu}
                    >
                        Export
                    </button>
                    {isExportMenuOpen ? (
                        <div className="export-menu">
                            <p className="export-menu-label">Workspace map</p>
                            {imageExportFormats.map((format) => (
                                <button
                                    key={format.id}
                                    type="button"
                                    onClick={() => downloadMindMap(format)}
                                >
                                    Download {format.label}
                                </button>
                            ))}
                            <div className="export-menu-divider" />
                            <p className="export-menu-label">PDF studio</p>
                            <button
                                type="button"
                                onClick={openPdfStudio}
                            >
                                Open PDF Studio
                            </button>
                            <div className="export-menu-divider" />
                            <p className="export-menu-label">Neutral files</p>
                            {exportFormats.map((format) => (
                                <button
                                    key={format.id}
                                    type="button"
                                    onClick={() => exportWorkspace(format)}
                                >
                                    {format.label}
                                </button>
                            ))}
                            <div className="export-menu-divider" />
                            <p className="export-menu-label">Publishable outputs</p>
                            {publishableExportFormats.map((format) => {
                                const hasAcceptedArtifact = (format.artifactTypes || []).some(
                                    (type) => acceptedArtifactTypes.has(type)
                                );
                                return (
                                    <button
                                        key={format.id}
                                        type="button"
                                        onClick={() => exportWorkspace(format)}
                                    >
                                        {format.label}
                                        {hasAcceptedArtifact ? ' - Ready' : ''}
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
                {canSave ? (
                    <>
                        <button
                            type="button"
                            className={`save-status save-status-${saveStatus}`}
                            onClick={() => saveFlow()}
                            disabled={saveStatus === 'saving'}
                            title="Click to save now"
                            aria-live="polite"
                        >
                            {saveStatusMessage}
                        </button>
                    </>
                ) : (
                    <span className="save-status" aria-live="polite">
                        {saveStatusMessage}
                    </span>
                )}
                <div className="header-utility" ref={utilityMenuRef}>
                    <button
                        type="button"
                        className="header-action header-action-secondary header-overflow"
                        onClick={toggleUtilityMenu}
                        aria-label="More workspace actions"
                        aria-expanded={isUtilityMenuOpen}
                    >
                        <FiMoreHorizontal aria-hidden="true" />
                    </button>
                    {isUtilityMenuOpen ? (
                        <div className="header-overflow-menu">
                            <button
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={revertFlow}
                                disabled={!canRevert}
                            >
                                Revert
                            </button>
                            <button type="button" onClick={openHelp}>
                                Help
                            </button>
                            <button type="button" onClick={manageTheme}>
                                {lightMode ? 'Dark mode' : 'Light mode'}
                            </button>
                            {developerMode ? (
                                <button
                                    type="button"
                                    onClick={openDebug}
                                    title="Open temporary developer debug panel"
                                >
                                    Debug
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                </div>
                <button
                    type="button"
                    className="header-action iconless-settings"
                    onClick={openSettings}
                >
                    Settings
                </button>
            </div>
        </div>
    );
};

export default Header;
