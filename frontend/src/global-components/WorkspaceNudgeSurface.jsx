/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import SettingsModal from '../modals/SettingsModal';
import {
    dismissNudge,
    getDismissedNudges,
    isNudgeCategoryEnabled
} from '../config/localSettings';
import useStore from '../stores/store';
import modalStore from '../stores/modalStore';
import {
    NUDGE_CATEGORIES,
    buildWorkspaceNudgeProjection
} from '../utils/workspaceNudges';

const CATEGORY_TO_SETTING = {
    [NUDGE_CATEGORIES.CANVAS_NAVIGATION]: 'canvas',
    [NUDGE_CATEGORIES.KNOWLEDGE_GRAPH_CONNECTIONS]: 'knowledge_graph',
    [NUDGE_CATEGORIES.SOURCE_COVERAGE]: 'sources',
    [NUDGE_CATEGORIES.REVIEW_QUALITY]: 'review',
    [NUDGE_CATEGORIES.TASK_READINESS]: 'tasks',
    [NUDGE_CATEGORIES.AI_OUTPUT_OPPORTUNITIES]: 'ai_outputs',
    [NUDGE_CATEGORIES.INTEGRATION_READINESS]: 'integrations'
};

const CATEGORY_LABELS = {
    canvas: 'Canvas',
    knowledge_graph: 'Knowledge graph',
    sources: 'Sources',
    review: 'Review',
    tasks: 'Tasks',
    ai_outputs: 'AI output',
    integrations: 'Integration'
};

const DENSITY_LIMITS = {
    quiet: 2,
    normal: 4,
    assertive: 7
};

const severityRank = {
    high: 0,
    medium: 1,
    low: 2
};

const viewForAction = (action = {}) => {
    if (action.view === 'tasks') {
        return 'preview';
    }
    if (action.view === 'gaps') {
        return 'gaps';
    }
    if (action.output_type === 'checklist') {
        return 'checklist';
    }
    if (action.output_type === 'knowledge_graph') {
        return 'connections';
    }
    if (action.output_type === 'chart') {
        return 'chartData';
    }
    if (action.output_type === 'flow_chart') {
        return 'flowchart';
    }
    if (action.output_type === 'tasks') {
        return 'preview';
    }
    if (action.view === 'sources') {
        return 'sources';
    }
    if (action.view === 'knowledge_graph') {
        return 'knowledgeGraph';
    }

    return action.view || '';
};

const WorkspaceNudgeSurface = ({
    validationIssues = [],
    onFocusNode,
    onOpenSources,
    onOpenAiHelpers
}) => {
    const selector = (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        selectedBranchId: state.selectedBranchId,
        activeGraphFilters: state.activeGraphFilters,
        workspaceBrief: state.workspaceBrief,
        sourceLibrary: state.sourceLibrary,
        nudgePreferences: state.nudgePreferences,
        setActiveView: state.setActiveView,
        setSelectedBranchId: state.setSelectedBranchId
    });
    const {
        nodes,
        edges,
        selectedBranchId,
        activeGraphFilters,
        workspaceBrief,
        sourceLibrary,
        nudgePreferences,
        setActiveView,
        setSelectedBranchId
    } = useStore(useShallow(selector));
    const pushNode = modalStore((s) => s.pushNode);
    const [dismissedKeys, setDismissedKeys] = useState(() => getDismissedNudges());

    const visibleNudges = useMemo(() => {
        const projection = buildWorkspaceNudgeProjection({
            nodes,
            edges,
            sourceLibrary,
            workspaceBrief,
            selectedBranchId,
            filters: activeGraphFilters,
            validationIssues
        });
        const dismissed = new Set(dismissedKeys);
        const densityLimit = DENSITY_LIMITS[nudgePreferences.density] || DENSITY_LIMITS.normal;

        return projection.nudges
            .filter((nudge) => {
                const settingKey = CATEGORY_TO_SETTING[nudge.category];
                return (
                    settingKey &&
                    isNudgeCategoryEnabled(nudgePreferences, settingKey) &&
                    !dismissed.has(nudge.dismiss_key)
                );
            })
            .sort(
                (left, right) =>
                    (severityRank[left.severity] ?? 3) -
                        (severityRank[right.severity] ?? 3) ||
                    left.title.localeCompare(right.title)
            )
            .slice(0, densityLimit);
    }, [
        activeGraphFilters,
        dismissedKeys,
        edges,
        nodes,
        nudgePreferences,
        selectedBranchId,
        sourceLibrary,
        validationIssues,
        workspaceBrief
    ]);

    const runNudgeAction = (nudge) => {
        const action = nudge.action || {};
        const targetNodeId = action.node_id || action.node_ids?.[0] || nudge.target_node_ids?.[0];

        if (action.type === 'reset_branch') {
            setSelectedBranchId(undefined);
            return;
        }

        if (targetNodeId) {
            onFocusNode?.(targetNodeId);
        }

        if (action.type === 'open_panel' && action.panel === 'integrations') {
            setActiveView('mondayInput');
            return;
        }

        const nextView = viewForAction(action);
        if (nextView) {
            setActiveView(nextView);
        }

        if (nextView === 'sources' || action.flow === 'source_reference_repair') {
            onOpenSources?.();
        }

        if (action.type === 'ai_enrichment' || action.type === 'generate_output') {
            onOpenAiHelpers?.();
        }
    };

    const dismiss = (nudge) => {
        setDismissedKeys(dismissNudge(nudge.dismiss_key));
    };

    if (!nudgePreferences.enabled || visibleNudges.length === 0) {
        return null;
    }

    return (
        <section
            className={`workspace-nudge-surface workspace-nudge-density-${nudgePreferences.density}`}
            aria-label="Workspace nudges"
        >
            <div className="workspace-nudge-header">
                <div>
                    <span>Guidance</span>
                    <strong>{visibleNudges.length}</strong>
                </div>
                <button
                    type="button"
                    className="workspace-nudge-settings"
                    onClick={() => pushNode(SettingsModal)}
                >
                    Settings
                </button>
            </div>
            <ol className="workspace-nudge-list">
                {visibleNudges.map((nudge) => {
                    const settingKey = CATEGORY_TO_SETTING[nudge.category];
                    return (
                        <li
                            key={nudge.id}
                            className={`workspace-nudge workspace-nudge-${nudge.severity}`}
                            data-nudge-category={settingKey}
                        >
                            <div className="workspace-nudge-copy">
                                <span>{CATEGORY_LABELS[settingKey]}</span>
                                <strong>{nudge.title}</strong>
                                <small>{nudge.detail}</small>
                            </div>
                            <div className="workspace-nudge-actions">
                                <button type="button" onClick={() => runNudgeAction(nudge)}>
                                    {nudge.action_label || 'Review'}
                                </button>
                                <button
                                    type="button"
                                    className="workspace-nudge-dismiss"
                                    aria-label={`Dismiss ${nudge.title}`}
                                    title="Dismiss this nudge"
                                    onClick={() => dismiss(nudge)}
                                >
                                    x
                                </button>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
};

export default WorkspaceNudgeSurface;
