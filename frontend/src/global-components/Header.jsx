import DRAWERSvg from '../assets/drawer.svg';
import LIGHT from '../assets/lightMode.svg';
import DARK from '../assets/darkMode.svg';
import LoadingModal from '../modals/LoadingModal';
import flowStore from '../stores/flowStore';
import modalStore from '../stores/modalStore';
import axios from 'axios';
import {
    getNodesBounds,
    getViewportForBounds,
    useReactFlow
} from '@xyflow/react';
import errorStore from '../stores/errorStore';
import ErrorModal from '../modals/ErrorModal';
import SettingsModal from '../modals/SettingsModal';
import WorkspaceBriefModal from '../modals/WorkspaceBriefModal';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    createFlowSnapshot,
    parseFlowSnapshot,
    stringifyFlowSnapshot
} from '../utils/flowSnapshots';
import useActivityStore from '../stores/activityStore';
import useWorkspacePanelStore from '../stores/workspacePanelStore';
const Header = ({
    isDrawer,
    setIsDrawer,
    setFlowList,
    lightMode,
    setLightMode,
    onOpenSources
}) => {
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const [isAiMenuOpen, setIsAiMenuOpen] = useState(false);
    const toggleActivity = useActivityStore((s) => s.toggleActivity);
    const toggleWorkspacePanel = useWorkspacePanelStore((s) => s.togglePanel);
    const recordActivity = useActivityStore((s) => s.recordActivity);
    const setActivityEvents = useActivityStore((s) => s.setActivityEvents);
    const setActivityWorkspace = useActivityStore((s) => s.setActivityWorkspace);
    const activityEvents = useActivityStore((s) => s.activities);
    const runningActivityCount = useActivityStore((s) =>
        s.activities.filter((activity) => activity.status === 'running').length
    );
    const autosaveTimerRef = useRef();
    const exportInFlightRef = useRef(false);
    const pushNode = modalStore((s) => s.pushNode);
    const popNode = modalStore((s) => s.popNode);
    const flow_id = flowStore((s) => s.flow_id);
    const flow_type = flowStore((s) => s.flow_type);
    const rfInstance = flowStore((s) => s.rfInstance);
    const flow_name = flowStore((s) => s.flow_name);
    const setFlowName = flowStore((s) => s.setFlowName);
    const setFlowType = flowStore((s) => s.setFlowType);
    const setFlowSummary = flowStore((s) => s.setFlowSummary);
    const saveStatus = flowStore((s) => s.saveStatus);
    const lastSavedSnapshot = flowStore((s) => s.lastSavedSnapshot);
    const lastSavedFingerprint = flowStore((s) => s.lastSavedFingerprint);
    const lastSavedFlowName = flowStore((s) => s.lastSavedFlowName);
    const lastSavedFlowType = flowStore((s) => s.lastSavedFlowType);
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
        viewport: s.viewport,
        workspaceBrief: s.workspaceBrief
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
        viewport,
        workspaceBrief
    } = useStore(useShallow(selector));
    const { getNodes, setViewport } = useReactFlow();
    const exportFormats = [
        { id: 'json', label: 'JSON', extension: 'json' },
        { id: 'markdown', label: 'Markdown', extension: 'md' },
        { id: 'csv', label: 'CSV', extension: 'csv' },
        { id: 'opml', label: 'OPML', extension: 'opml' },
        { id: 'mmd-json', label: 'MMD JSON', extension: 'json' },
        { id: 'mermaid', label: 'Mermaid', extension: 'mmd' }
    ];
    const imageExportFormats = [
        { id: 'png', label: 'PNG', extension: 'png' },
        { id: 'svg', label: 'SVG', extension: 'svg' }
    ];
    const bridgeExportFormats = [
        {
            id: 'miro',
            label: 'Miro dry-run preview',
            extension: 'miro-preview.json'
        },
        {
            id: 'monday',
            label: 'monday confirmed payload',
            extension: 'monday-batch.json'
        }
    ];
    const workspaceMiroFormats = [
        {
            id: 'miro-board-plan',
            label: 'Workspace Miro board plan',
            extension: 'miro-board-plan.json',
            dryRun: true,
            endpoint: 'board'
        },
        {
            id: 'miro-board-push',
            label: 'Push workspace to Miro',
            extension: 'miro-board-result.json',
            dryRun: false,
            endpoint: 'board'
        },
        {
            id: 'miro-sme-review-plan',
            label: 'SME review Miro board plan',
            extension: 'miro-sme-review-plan.json',
            dryRun: true,
            endpoint: 'sme-review'
        },
        {
            id: 'miro-sme-review-push',
            label: 'Push SME review board to Miro',
            extension: 'miro-sme-review-result.json',
            dryRun: false,
            endpoint: 'sme-review'
        },
        {
            id: 'miro-native-mindmap-plan',
            label: 'Native Miro mind map plan',
            extension: 'miro-native-mindmap-plan.json',
            dryRun: true,
            endpoint: 'native-mindmap'
        }
    ];
    const mondayExistingGroupFormats = [
        {
            id: 'monday-existing-plan',
            label: 'monday existing group plan',
            extension: 'monday-existing-plan.json',
            dryRun: true,
            scope: 'workspace',
            templateId: 'autodesk_building_block_review'
        },
        {
            id: 'monday-existing-push',
            label: 'Push workspace tasks to monday',
            extension: 'monday-existing-result.json',
            dryRun: false,
            scope: 'workspace',
            templateId: 'autodesk_building_block_review'
        },
        {
            id: 'monday-branch-existing-plan',
            label: 'Selected branch monday plan',
            extension: 'monday-branch-existing-plan.json',
            dryRun: true,
            scope: 'branch',
            templateId: 'autodesk_building_block_review'
        },
        {
            id: 'monday-branch-existing-push',
            label: 'Push selected branch tasks to monday',
            extension: 'monday-branch-existing-result.json',
            dryRun: false,
            scope: 'branch',
            templateId: 'autodesk_building_block_review'
        }
    ];
    const mondayStatusPullFormats = [
        {
            id: 'monday-status-plan',
            label: 'monday status pull plan',
            extension: 'monday-status-plan.json',
            dryRun: true,
            apply: false
        },
        {
            id: 'monday-status-apply',
            label: 'Pull monday status into nodes',
            extension: 'monday-status-result.json',
            dryRun: false,
            apply: true
        }
    ];
    const selectedBranchMiroFormats = [
        {
            id: 'miro-frame-plan',
            label: 'Selected branch Miro frame plan',
            extension: 'miro-frame-plan.json',
            dryRun: true
        },
        {
            id: 'miro-frame-push',
            label: 'Push selected branch to Miro',
            extension: 'miro-frame-result.json',
            dryRun: false
        }
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
            workspaceBrief,
            activityEvents: useActivityStore.getState().activities
        });
    }, [activityEvents, edges, nodes, rfInstance, viewport, workspaceBrief]);

    useEffect(() => {
        setActivityWorkspace(flow_id || '');
    }, [flow_id, setActivityWorkspace]);

    const currentSnapshot = useMemo(
        () => buildCurrentSnapshot(),
        [buildCurrentSnapshot]
    );

    const currentFingerprint = useMemo(
        () => stringifyFlowSnapshot(currentSnapshot),
        [currentSnapshot]
    );

    const hasUnsavedChanges = Boolean(
        flow_id &&
        lastSavedFingerprint &&
        (currentFingerprint !== lastSavedFingerprint ||
            flow_name !== lastSavedFlowName ||
            flow_type !== lastSavedFlowType)
    );

    useEffect(() => {
        if (!flow_id || !lastSavedFingerprint || !hasUnsavedChanges) {
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
        lastSavedFingerprint,
        lastSavedFlowName,
        lastSavedFlowType,
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
        try {
            recordActivity({
                type: showLoading ? 'save_manual' : 'autosave_persisted',
                title: showLoading ? 'Saved workspace' : 'Autosaved workspace',
                summary: showLoading
                    ? 'Saved the current workspace snapshot.'
                    : 'Persisted local workspace changes.',
                metadata: {
                    nodes: nodes.length,
                    edges: edges.length
                }
            });
            const savedSnapshot = buildCurrentSnapshot();
            const savedFingerprint = stringifyFlowSnapshot(savedSnapshot);
            await saveFlowCall(undefined, savedSnapshot);
            setSavedSnapshot(savedSnapshot, savedFingerprint, flow_name, flow_type);
            if (showLoading) {
                popNode();
            }
        } catch (err) {
            setSaveError(err?.message || 'Autosave failed');
            if (showLoading) {
                manageErrors(err);
            }
        }
    };

    const saveFlowCall = (nameOverride, snapshotOverride) => {
        const flow_json = stringifyFlowSnapshot(
            snapshotOverride || buildCurrentSnapshot()
        );
        const data = {
            flow_id: flow_id,
            flow_name: nameOverride ?? flow_name,
            flow_json: flow_json,
            flow_type: flow_type || 'manual',
            summary: 'Please work'
        };
        console.log('JSON DATA', data);
        return axios.put(`http://localhost:8000/flow-update`, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    };

    useEffect(() => {
        if (!hasUnsavedChanges || saveStatus === 'saving') {
            return;
        }

        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = setTimeout(() => {
            saveFlow({ showLoading: false });
        }, 1500);

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
        console.log(err);
        console.log('Errroro', err.status);
        console.log('Errroross', err.response?.statusText);
        const isNetworkError = !err.response;
        setStatus(err.response?.status || err.status || (isNetworkError ? 503 : 500));
        setMsg(
            err.response?.data?.detail ||
            err.response?.statusText ||
            (isNetworkError
                ? 'Local backend is not running yet. Start the DocMap backend or launch the Electron app so it can start it for you.'
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
            const fileName = `${sanitizeFileName(flow_name)}.${format.extension}`;
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
        return {
            backgroundColor: '#1e1e1e',
            style: {
                transform: `translate(${viewPort.x}px, ${viewPort.y}px, scale(${viewPort.zoom}))`
            }
        };
    };

    const downloadMindMap = async (format) => {
        const viewport = document.querySelector('.react-flow__viewport');
        if (!viewport) {
            setStatus(400);
            setMsg('Could not find the current mind map to export.');
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
        console.log(nextName);
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

        setSaveStatus('saving');
        try {
            recordActivity({
                type: 'workspace_renamed',
                title: 'Renamed workspace',
                summary: `Workspace name changed to ${nextName || 'Untitled workspace'}.`,
                metadata: {
                    previous_name: flow_name,
                    next_name: nextName
                }
            });
            const savedSnapshot = buildCurrentSnapshot();
            await saveFlowCall(nextName, savedSnapshot);
            setSavedSnapshot(
                savedSnapshot,
                stringifyFlowSnapshot(savedSnapshot),
                nextName,
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
        setActivityEvents(snapshot.activity_events || [], flow_id);
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

    const changeFlowType = (nextType) => {
        if (!flow_id || nextType === flow_type) {
            return;
        }

        setFlowType(nextType);
        syncActiveFlowType(nextType);
        recordActivity({
            type: 'workspace_mode_changed',
            title: 'Changed workspace mode',
            summary: `Workspace mode changed to ${nextType}.`,
            metadata: {
                previous_type: flow_type,
                next_type: nextType
            }
        });
        setSaveStatus('dirty');
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
                activity_events: useActivityStore.getState().activities
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
                activity_events: useActivityStore.getState().activities
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

    const flowSummary = () => {
        pushNode(LoadingModal);
        console.log('THIS IS FLOW ID', flow_id);
        const data = {
            flow_id: flow_id
        };
        axios
            .post(`http://localhost:8000/flow-summarizer`, data, {
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then((res) => {
                setFlowSummary(res.data.response);
                popNode();
                import('../modals/FlowSummary').then(({ default: FlowSummary }) => {
                    pushNode(FlowSummary);
                });
            })
            .catch((err) => manageErrors(err));
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
        setTheme(!lightMode);
        setLightMode(!lightMode);
        setTrigger(!trigger);
    };

    const openSettings = () => {
        setIsAiMenuOpen(false);
        setIsExportMenuOpen(false);
        pushNode(SettingsModal);
    };

    const openWorkspaceBrief = () => {
        setIsAiMenuOpen(false);
        setIsExportMenuOpen(false);
        pushNode(WorkspaceBriefModal);
    };

    const toggleExportMenu = () => {
        setIsAiMenuOpen(false);
        setIsExportMenuOpen((prev) => !prev);
    };

    const toggleAiMenu = () => {
        setIsExportMenuOpen(false);
        setIsAiMenuOpen((prev) => !prev);
    };

    const hasWorkspace = Boolean(flow_id);
    const canSave = hasWorkspace;
    const canRevert =
        hasWorkspace && Boolean(lastSavedSnapshot) && saveStatus !== 'saving';
    const saveLabel =
        saveStatus === 'saving'
            ? 'Saving...'
            : saveStatus === 'saved'
                ? 'Saved'
                : saveStatus === 'dirty'
                    ? 'Unsaved'
                    : saveStatus === 'error'
                    ? 'Retry save'
                    : 'Save now';
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
            style={isDrawer ? { display: 'none' } : { display: 'flex' }}
        >
            <div className="header-left">
                <img
                    className="drawer-trigger"
                    src={DRAWERSvg}
                    alt="Open workspaces"
                    onClick={() => getFlowList(true)}
                />
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
                <div className="flow-mode-toggle" aria-label="Workspace mode">
                    <button
                        type="button"
                        className={flow_type !== 'automatic' ? 'active' : ''}
                        onClick={() => changeFlowType('manual')}
                        disabled={!flow_id || saveStatus === 'saving'}
                    >
                        Manual
                    </button>
                    <button
                        type="button"
                        className={flow_type === 'automatic' ? 'active' : ''}
                        onClick={() => changeFlowType('automatic')}
                        disabled={!flow_id || saveStatus === 'saving'}
                    >
                        Auto
                    </button>
                </div>
                <button
                    type="button"
                    className="header-action header-action-secondary"
                    onClick={openWorkspaceBrief}
                >
                    Brief
                </button>
                <button
                    type="button"
                    className="header-action header-action-secondary"
                    onClick={toggleActivity}
                >
                    {runningActivityCount
                        ? `Activity ${runningActivityCount}`
                        : 'Activity'}
                </button>
                <button
                    type="button"
                    className="header-action header-action-secondary"
                    onClick={onOpenSources}
                >
                    Sources
                </button>
                <button
                    type="button"
                    className="header-action header-action-secondary"
                    onClick={() => toggleWorkspacePanel('integrations')}
                >
                    Integrations
                </button>
                <button
                    type="button"
                    className="header-action header-action-secondary"
                    onClick={() => toggleWorkspacePanel('automations')}
                >
                    Automations
                </button>
                <div className="export-actions">
                    <button
                        type="button"
                        className="header-action header-action-primary"
                        onClick={toggleExportMenu}
                    >
                        Export
                    </button>
                    {isExportMenuOpen ? (
                        <div className="export-menu">
                            <p className="export-menu-label">Mind map image</p>
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
                            <p className="export-menu-label">Preview payloads</p>
                            {bridgeExportFormats.map((format) => (
                                <button
                                    key={format.id}
                                    type="button"
                                    onClick={() => exportBridgePayload(format)}
                                >
                                    {format.label}
                                </button>
                            ))}
                            <div className="export-menu-divider" />
                            <p className="export-menu-label">Miro</p>
                            {workspaceMiroFormats.map((format) => (
                                <button
                                    key={format.id}
                                    type="button"
                                    onClick={() => exportWorkspaceMiroBoard(format)}
                                >
                                    {format.label}
                                </button>
                            ))}
                            {selectedBranchMiroFormats.map((format) => (
                                <button
                                    key={format.id}
                                    type="button"
                                    onClick={() => exportSelectedBranchMiroFrame(format)}
                                >
                                    {format.label}
                                </button>
                            ))}
                            <div className="export-menu-divider" />
                            <p className="export-menu-label">monday.com</p>
                            {mondayExistingGroupFormats.map((format) => (
                                <button
                                    key={format.id}
                                    type="button"
                                    onClick={() => exportMondayExistingGroup(format)}
                                >
                                    {format.label}
                                </button>
                            ))}
                            {mondayStatusPullFormats.map((format) => (
                                <button
                                    key={format.id}
                                    type="button"
                                    onClick={() => pullMondayStatuses(format)}
                                >
                                    {format.label}
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>
                {flow_type !== 'automatic' ? (
                    <div className="export-actions">
                        <button
                            type="button"
                            className="header-action header-action-secondary"
                            onClick={toggleAiMenu}
                        >
                            AI actions
                        </button>
                        {isAiMenuOpen ? (
                            <div className="export-menu ai-actions-menu">
                                <p className="export-menu-label">Workspace</p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAiMenuOpen(false);
                                        flowSummary();
                                    }}
                                >
                                    Summarize workspace
                                </button>
                            </div>
                        ) : null}
                    </div>
                ) : null}
                {canSave ? (
                    <>
                        <button
                            type="button"
                            className={`header-action save-now ${saveStatus}`}
                            onClick={() => saveFlow()}
                            disabled={saveStatus === 'saving'}
                        >
                            {saveLabel}
                        </button>
                        <button
                            type="button"
                            className="header-action header-action-secondary revert-flow"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={revertFlow}
                            disabled={!canRevert}
                        >
                            Revert
                        </button>
                        <span
                            className={`save-status save-status-${saveStatus}`}
                            aria-live="polite"
                        >
                            {saveStatusMessage}
                        </span>
                    </>
                ) : (
                    <span className="save-status" aria-live="polite">
                        {saveStatusMessage}
                    </span>
                )}
                <button
                    type="button"
                    className="theme-toggle-button"
                    onClick={manageTheme}
                    aria-label={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}
                >
                    <img
                        className="theme-toggle"
                        src={lightMode ? LIGHT : DARK}
                        alt=""
                    />
                </button>
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
