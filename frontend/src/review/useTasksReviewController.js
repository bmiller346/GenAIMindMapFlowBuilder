import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import modalStore from '../stores/modalStore';
import useActivityStore from '../stores/activityStore';
import PromptModal from '../modals/PromptModal';
import { isNudgeCategoryEnabled } from '../config/localSettings';
import { withLocalPreviewAcceptance } from '../views/localPreviewMetadata';
import { makePreviewDiffSummary } from '../views/previewDiffSummary';
import {
    buildFilteredGraphProjection,
    getTaskPreviewRows,
    getTaskRows
} from '../views/graphProjection';

const TASKS_AI_PRESET = {
    role: 'task-planner',
    action: 'generate_tasks',
    scope: 'branch',
    initialVisual: 'tasks'
};

const CHECKLIST_AI_PRESET = {
    role: 'training-guide-builder',
    action: 'generate_checklist',
    scope: 'branch',
    initialVisual: 'checklist'
};

const mergeGeneratedTaskPreviewRows = (rows, generatedPreview) => {
    const items = Array.isArray(generatedPreview?.preview_items)
        ? generatedPreview.preview_items
        : [];
    if (items.length === 0) {
        return rows;
    }

    const itemByNodeId = new Map(items.map((item) => [item.node_id, item]));
    return rows.map((row) => {
        const item = itemByNodeId.get(row.id);
        const mutation = item?.proposed_mutation || {};
        const taskProjection = mutation.task_projection || {};
        if (!item) {
            return row;
        }

        return {
            ...row,
            generated_preview_item: item,
            preview_type: taskProjection.preview_type || mutation.node_type || row.preview_type,
            preview_status: taskProjection.preview_status || mutation.status || row.preview_status,
            priority: taskProjection.priority ?? mutation.priority ?? row.priority,
            owner_id: taskProjection.owner_id ?? mutation.owner_id ?? row.owner_id,
            due_date: taskProjection.due_date ?? mutation.due_date ?? row.due_date,
            included: true
        };
    });
};

const useTasksReviewController = ({ onSelectNode } = {}) => {
    const {
        nodes,
        edges,
        setNodes,
        activeGraphFilters,
        selectedBranchId,
        setActiveView,
        generatedHelperPreviews,
        clearGeneratedHelperPreview,
        nudgePreferences
    } = useStore(
        useShallow((state) => ({
            nodes: state.nodes,
            edges: state.edges,
            setNodes: state.setNodes,
            activeGraphFilters: state.activeGraphFilters,
            selectedBranchId: state.selectedBranchId,
            setActiveView: state.setActiveView,
            generatedHelperPreviews: state.generatedHelperPreviews,
            clearGeneratedHelperPreview: state.clearGeneratedHelperPreview,
            nudgePreferences: state.nudgePreferences
        }))
    );
    const flowId = flowStore((state) => state.flow_id);
    const setSaveStatus = flowStore((state) => state.setSaveStatus);
    const pushNode = modalStore((state) => state.pushNode);
    const addActivity = useActivityStore((state) => state.addActivity);
    const recordActivity = useActivityStore((state) => state.recordActivity);
    const [acceptedPreviewIds, setAcceptedPreviewIds] = useState(new Set());

    const projection = useMemo(
        () =>
            buildFilteredGraphProjection(nodes, edges, {
                branchId: selectedBranchId,
                filters: activeGraphFilters
            }),
        [activeGraphFilters, edges, nodes, selectedBranchId]
    );
    const selectedRoot = projection.nodes.find((node) => node.id === selectedBranchId);
    const taskRows = useMemo(() => getTaskRows(projection), [projection]);
    const generatedTaskPreview = generatedHelperPreviews.projectPlannerTasks;
    const generatedChecklistPreview = generatedHelperPreviews.projectPlannerChecklist;
    const previewRows = useMemo(
        () => mergeGeneratedTaskPreviewRows(getTaskPreviewRows(projection), generatedTaskPreview),
        [generatedTaskPreview, projection]
    );
    const allPreviewIds = useMemo(
        () => new Set(previewRows.filter((row) => row.included).map((row) => row.id)),
        [previewRows]
    );
    const activePreviewIds =
        acceptedPreviewIds.size > 0 ? acceptedPreviewIds : allPreviewIds;
    const taskPreviewDiffSummary = useMemo(
        () =>
            makePreviewDiffSummary({
                rows: previewRows,
                activeIds: activePreviewIds,
                artifactLabel: 'task preview item',
                updatedFields: ['type', 'status', 'owner/status fields'],
                relationshipEdges: projection.edges.length,
                mode: generatedTaskPreview ? 'generated' : 'local'
            }),
        [activePreviewIds, generatedTaskPreview, previewRows, projection.edges.length]
    );
    const showTaskNudges = isNudgeCategoryEnabled(nudgePreferences, 'tasks');

    const openAiPreset = (preset) => {
        if (!flowId) {
            return;
        }
        const preferredScope =
            preset.scope === 'branch' && selectedBranchId ? 'branch' : 'workspace';
        pushNode(PromptModal, {
            scope: preferredScope,
            nodeId: preferredScope === 'branch' ? selectedBranchId : undefined,
            initialRoleId: preset.role,
            initialActionId: preset.action,
            initialVisual: preset.initialVisual
        });
        recordActivity({
            type: 'ai_action_picker_opened',
            title: 'Workspace Ask AI opened',
            summary: `Opened preview-first AI action: ${preset.action}.`,
            metadata: {
                scope: preferredScope,
                action: preset.action
            }
        });
    };

    const openTasksAiPreset = () => openAiPreset(TASKS_AI_PRESET);
    const openChecklistAiPreset = () => openAiPreset(CHECKLIST_AI_PRESET);

    const togglePreviewRow = (nodeId) => {
        setAcceptedPreviewIds(() => {
            const next = new Set(activePreviewIds);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    };

    const acceptTaskPreview = () => {
        if (activePreviewIds.size === 0) {
            return;
        }

        const acceptedAt = new Date().toISOString();
        const rowsById = new Map(previewRows.map((row) => [row.id, row]));

        setNodes(
            nodes.map((node) => {
                if (!activePreviewIds.has(node.id)) {
                    return node;
                }

                const row = rowsById.get(node.id);
                const mutation = row?.generated_preview_item?.proposed_mutation || {};
                const taskProjection = mutation.task_projection || {};
                const nextNodeType =
                    taskProjection.preview_type ||
                    mutation.node_type ||
                    row?.preview_type ||
                    'task';
                const nextStatus =
                    taskProjection.preview_status ||
                    mutation.status ||
                    row?.preview_status ||
                    'needs_review';
                const nextPriority =
                    taskProjection.priority ?? mutation.priority ?? row?.priority ?? node.data?.priority ?? '';
                const nextOwner =
                    taskProjection.owner_id ?? mutation.owner_id ?? row?.owner_id ?? node.data?.owner_id ?? '';
                const nextDue =
                    taskProjection.due_date ?? mutation.due_date ?? row?.due_date ?? node.data?.due_date ?? '';
                const data = withLocalPreviewAcceptance(node.data, {
                    flow: row?.generated_preview_item
                        ? 'generated_project_planner_task'
                        : 'branch_to_task',
                    accepted_at: acceptedAt,
                    node_id: node.id,
                    helper_id: row?.generated_preview_item ? 'project_planner' : undefined,
                    preview_id: generatedTaskPreview?.preview_id,
                    preview_item_id: row?.generated_preview_item?.id,
                    preview_type: nextNodeType,
                    preview_status: nextStatus
                });

                return {
                    ...node,
                    data: {
                        ...data,
                        node_type: nextNodeType,
                        status: nextStatus || data.status,
                        priority: nextPriority,
                        owner_id: nextOwner,
                        due_date: nextDue,
                        task_projection: {
                            accepted: true,
                            accepted_at: acceptedAt,
                            preview_type: nextNodeType,
                            preview_status: nextStatus,
                            priority: nextPriority,
                            owner_id: nextOwner,
                            due_date: nextDue,
                            generated_preview_id: generatedTaskPreview?.preview_id || '',
                            generated_preview_item_id: row?.generated_preview_item?.id || ''
                        }
                    }
                };
            })
        );
        setAcceptedPreviewIds(new Set());
        if (flowId) {
            setSaveStatus('dirty');
        }
        addActivity({
            status: 'completed',
            title: 'Accepted task preview',
            detail: `Accepted ${activePreviewIds.size} branch-to-task candidate${
                activePreviewIds.size === 1 ? '' : 's'
            }.`,
            context: selectedRoot ? `Scope: ${selectedRoot.title}` : 'Scope: whole graph'
        });
        setActiveView('tasks');
    };

    return {
        activePreviewIds,
        acceptTaskPreview,
        clearGeneratedTaskPreview: () => clearGeneratedHelperPreview('projectPlannerTasks'),
        clearGeneratedChecklistPreview: () => clearGeneratedHelperPreview('projectPlannerChecklist'),
        flowId,
        generatedChecklistPreview,
        generatedTaskPreview,
        nodes,
        openNode: onSelectNode,
        openChecklistAiPreset,
        openTasksAiPreset,
        previewRows,
        projection,
        setActiveView,
        setNodes,
        showTaskNudges,
        taskPreviewDiffSummary,
        taskRows,
        togglePreviewRow
    };
};

export default useTasksReviewController;
