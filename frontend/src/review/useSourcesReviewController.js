import { useMemo } from 'react';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import modalStore from '../stores/modalStore';
import useActivityStore from '../stores/activityStore';
import PromptModal from '../modals/PromptModal';
import { buildFilteredGraphProjection } from '../views/graphProjection';

const SOURCE_REPAIR_AI_PRESET = {
    role: 'source-ref-repair',
    action: 'find_missing_source_support',
    scope: 'workspace'
};

const useSourcesReviewController = () => {
    const {
        nodes,
        edges,
        setNodes,
        setEdges,
        setActiveView,
        selectedBranchId,
        generatedHelperPreviews,
        clearGeneratedHelperPreview,
        activeGraphFilters
    } = useStore(
        useShallow((state) => ({
            nodes: state.nodes,
            edges: state.edges,
            setNodes: state.setNodes,
            setEdges: state.setEdges,
            setActiveView: state.setActiveView,
            selectedBranchId: state.selectedBranchId,
            generatedHelperPreviews: state.generatedHelperPreviews,
            clearGeneratedHelperPreview: state.clearGeneratedHelperPreview,
            activeGraphFilters: state.activeGraphFilters
        }))
    );
    const flowId = flowStore((state) => state.flow_id);
    const pushNode = modalStore((state) => state.pushNode);
    const recordActivity = useActivityStore((state) => state.recordActivity);

    const projection = useMemo(
        () =>
            buildFilteredGraphProjection(nodes, edges, {
                branchId: selectedBranchId,
                filters: activeGraphFilters
            }),
        [activeGraphFilters, edges, nodes, selectedBranchId]
    );

    const openWorkspaceAskAi = (preset = {}) => {
        if (!flowId) {
            return;
        }
        const normalizedPreset = {
            role: preset.role || preset.roleId,
            action: preset.action || preset.actionId,
            scope: preset.scope,
            initialPrompt: preset.initialPrompt || preset.prompt,
            initialVisual: preset.initialVisual || preset.visual
        };
        const preferredScope =
            normalizedPreset.scope === 'branch' && selectedBranchId ? 'branch' : 'workspace';
        pushNode(PromptModal, {
            scope: preferredScope,
            nodeId: preferredScope === 'branch' ? selectedBranchId : undefined,
            initialRoleId: normalizedPreset.role,
            initialActionId: normalizedPreset.action,
            initialPrompt: normalizedPreset.initialPrompt,
            initialVisual: normalizedPreset.initialVisual || 'auto'
        });
        recordActivity({
            type: 'ai_action_picker_opened',
            title: 'Workspace Ask AI opened',
            summary: normalizedPreset.action
                ? `Opened preview-first AI action: ${normalizedPreset.action}.`
                : 'Opened preview-first AI actions from the workspace.',
            metadata: {
                scope: preferredScope,
                action: normalizedPreset.action || ''
            }
        });
    };

    return {
        edges,
        generatedSourceRepairPreview: generatedHelperPreviews.sourceLibrarianSources,
        nodes,
        openWorkspaceAskAi,
        projection,
        rejectGeneratedSourceRepairPreview: () =>
            clearGeneratedHelperPreview('sourceLibrarianSources'),
        selectedBranchId,
        setActiveView,
        setEdges,
        setNodes,
        sourceRepairPreset: SOURCE_REPAIR_AI_PRESET
    };
};

export default useSourcesReviewController;
