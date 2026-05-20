import { useMemo } from 'react';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import modalStore from '../stores/modalStore';
import useActivityStore from '../stores/activityStore';
import PromptModal from '../modals/PromptModal';
import { buildFilteredGraphProjection } from '../views/graphProjection';

const ISSUE_AI_PRESETS = {
    gaps: {
        role: 'gap-analyst',
        action: 'find_gaps',
        scope: 'workspace'
    },
    sme: {
        role: 'sme-question-generator',
        action: 'create_sme_questions',
        scope: 'workspace'
    }
};

const useIssuesReviewController = () => {
    const {
        nodes,
        edges,
        setNodes,
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

    const openIssueAiPreset = (presetKey) => {
        const preset = ISSUE_AI_PRESETS[presetKey];
        if (!flowId || !preset) {
            return;
        }
        const preferredScope = preset.scope === 'branch' && selectedBranchId ? 'branch' : 'workspace';
        pushNode(PromptModal, {
            scope: preferredScope,
            nodeId: preferredScope === 'branch' ? selectedBranchId : undefined,
            initialRoleId: preset.role,
            initialActionId: preset.action,
            initialVisual: 'auto'
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

    return {
        generatedReviewerGapsPreview: generatedHelperPreviews.reviewerGaps,
        generatedReviewerSmePreview: generatedHelperPreviews.reviewerSmeQuestions,
        nodes,
        onAskGapsAi: () => openIssueAiPreset('gaps'),
        onAskSmeAi: () => openIssueAiPreset('sme'),
        projection,
        rejectGeneratedGapsPreview: () => clearGeneratedHelperPreview('reviewerGaps'),
        rejectGeneratedSmePreview: () => clearGeneratedHelperPreview('reviewerSmeQuestions'),
        setActiveView,
        setNodes
    };
};

export default useIssuesReviewController;
