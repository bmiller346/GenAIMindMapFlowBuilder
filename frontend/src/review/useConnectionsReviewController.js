import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import modalStore from '../stores/modalStore';
import useActivityStore from '../stores/activityStore';
import PromptModal from '../modals/PromptModal';
import {
    buildFilteredGraphProjection,
    buildRelationshipReviewMarkdown,
    getConnectionRows,
    getCrossLinkConnectionRows,
    getGraphConfidenceSummary,
    getRelationshipFamilyReviewGroups
} from '../views/graphProjection';

const CONNECTIONS_AI_PRESET = {
    role: 'gap-analyst',
    action: 'find_duplicate_overlapping_nodes',
    scope: 'workspace',
    initialVisual: 'knowledge_graph',
    initialPrompt:
        'Find cross-branch connection candidates in the current workspace. Do not rewrite the hierarchy. Propose relationship edges only when there is a clear signal, and include duplicates, overlaps, dependencies, supporting relationships, conflicts, blockers, rationale, confidence, and review state.'
};

const safeDownloadSlug = (value) =>
    String(value || 'workspace')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'workspace';

const useConnectionsReviewController = () => {
    const {
        nodes,
        edges,
        selectedBranchId,
        activeGraphFilters
    } = useStore(
        useShallow((state) => ({
            nodes: state.nodes,
            edges: state.edges,
            selectedBranchId: state.selectedBranchId,
            activeGraphFilters: state.activeGraphFilters
        }))
    );
    const flowId = flowStore((state) => state.flow_id);
    const pushNode = modalStore((state) => state.pushNode);
    const recordActivity = useActivityStore((state) => state.recordActivity);
    const [relationshipExportStatus, setRelationshipExportStatus] = useState('');

    const projection = useMemo(
        () =>
            buildFilteredGraphProjection(nodes, edges, {
                branchId: selectedBranchId,
                filters: activeGraphFilters
            }),
        [activeGraphFilters, edges, nodes, selectedBranchId]
    );
    const selectedBranchTitle =
        projection.nodes.find((node) => node.id === selectedBranchId)?.title || selectedBranchId || '';
    const connectionRows = useMemo(() => getConnectionRows(projection), [projection]);
    const crossLinkRows = useMemo(() => getCrossLinkConnectionRows(projection), [projection]);
    const relationshipReviewGroups = useMemo(
        () => getRelationshipFamilyReviewGroups(projection),
        [projection]
    );
    const relationshipReviewRows = useMemo(
        () => relationshipReviewGroups.flatMap((group) => group.rows),
        [relationshipReviewGroups]
    );
    const graphConfidence = useMemo(() => getGraphConfidenceSummary(projection), [projection]);

    const openConnectionsAiPreset = () => {
        if (!flowId) {
            return;
        }
        pushNode(PromptModal, {
            scope: CONNECTIONS_AI_PRESET.scope,
            initialRoleId: CONNECTIONS_AI_PRESET.role,
            initialActionId: CONNECTIONS_AI_PRESET.action,
            initialPrompt: CONNECTIONS_AI_PRESET.initialPrompt,
            initialVisual: CONNECTIONS_AI_PRESET.initialVisual
        });
        recordActivity({
            type: 'ai_action_picker_opened',
            title: 'Workspace Ask AI opened',
            summary: `Opened preview-first AI action: ${CONNECTIONS_AI_PRESET.action}.`,
            metadata: {
                scope: CONNECTIONS_AI_PRESET.scope,
                action: CONNECTIONS_AI_PRESET.action
            }
        });
    };

    const buildCurrentRelationshipReviewMarkdown = () =>
        buildRelationshipReviewMarkdown({
            projection,
            scopeLabel: selectedBranchId
                ? `Selected branch: ${selectedBranchTitle || selectedBranchId}`
                : 'Whole workspace'
        });

    const recordRelationshipReviewExport = (method) => {
        recordActivity({
            type: 'relationship_review_exported',
            title: 'Relationship review exported',
            summary: `Exported ${relationshipReviewRows.length} reviewable relationship${
                relationshipReviewRows.length === 1 ? '' : 's'
            } as markdown.`,
            metadata: {
                method,
                relationship_count: relationshipReviewRows.length,
                scope: selectedBranchId ? 'branch' : 'workspace'
            }
        });
    };

    const copyRelationshipReviewMarkdown = async () => {
        if (relationshipReviewRows.length === 0) {
            return;
        }
        const markdown = buildCurrentRelationshipReviewMarkdown();
        try {
            await navigator.clipboard.writeText(markdown);
            setRelationshipExportStatus('Copied relationship review markdown.');
            recordRelationshipReviewExport('clipboard');
        } catch {
            setRelationshipExportStatus('Copy unavailable. Download the markdown review instead.');
        }
    };

    const downloadRelationshipReviewMarkdown = () => {
        if (relationshipReviewRows.length === 0) {
            return;
        }
        const markdown = buildCurrentRelationshipReviewMarkdown();
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const scopeSlug = selectedBranchId
            ? safeDownloadSlug(selectedBranchTitle || selectedBranchId)
            : 'workspace';
        anchor.href = url;
        anchor.download = `${scopeSlug}-relationship-review.md`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        setRelationshipExportStatus('Downloaded relationship review markdown.');
        recordRelationshipReviewExport('download');
    };

    return {
        connectionRows,
        crossLinkRows,
        flowId,
        graphConfidence,
        relationshipExportStatus,
        relationshipReviewGroups,
        relationshipReviewRows,
        openConnectionsAiPreset,
        copyRelationshipReviewMarkdown,
        downloadRelationshipReviewMarkdown
    };
};

export default useConnectionsReviewController;
