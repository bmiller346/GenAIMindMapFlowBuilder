import PROMPTSvg from "../assets/prompt.svg";
import CROSSSvg from "../assets/cross.svg";
import Prompts from "../global-components/Prompts";
import { useMemo, useState } from "react";
import axios from "axios";
import modalStore from "../stores/modalStore";
import useStore from "../stores/store";
import useActivityStore from "../stores/activityStore";
import flowStore from "../stores/flowStore";
import { useShallow } from "zustand/shallow";
import {
    defaultOpenAIModel,
    supportedOpenAIModels,
    getActionsForProfileAndScope,
    getDefaultActionForProfile,
    getFollowUpSuggestions,
    getPromptProfilesForScope,
    legacyPersonaNames
} from "../prompts/promptsModel";
import { getWorkspaceNodeData } from "../utils/manualNodes";
import { createAIDraftSession } from "../utils/aiDraftSessions";

const viewForAction = (actionId) => {
    if (actionId.includes('question')) {
        return 'sme';
    }
    if (actionId.includes('source') || actionId.includes('unsupported')) {
        return 'sources';
    }
    if (actionId.includes('checklist')) {
        return 'checklist';
    }
    if (actionId.includes('gap') || actionId.includes('duplicate')) {
        return 'gaps';
    }
    return 'preview';
};

const legacyAgents = [
    'Strategic Advisor',
    'Research Assistant',
    'Productivity Coach',
    'Data Interpreter',
    'Custom Prompts'
];

const actionsThatDraftNodes = new Set([
    'expand_this_node',
    'generate_child_nodes',
    'convert_to_checklist',
    'generate_tasks',
    'generate_checklist',
    'generate_training_outline',
    'export_branch_as_sop_draft',
    'custom_prompt'
]);

const modelOptions = ['auto', ...supportedOpenAIModels];

const draftSessionEndpoint = ({ flowId }) =>
    `http://localhost:8000/api/workspaces/${flowId}/ai/draft-sessions`;

const PromptModal = ({
    scope,
    nodeId,
    initialRoleId,
    initialActionId
}) => {
    const selector = (state) => ({
        popNode: state.popNode,
        sourceId: state.sourceId
    });
    const { popNode, sourceId } = modalStore(useShallow(selector));
    const storeSelector = (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        setActiveView: state.setActiveView,
        setSelectedBranchId: state.setSelectedBranchId,
        setGeneratedHelperPreview: state.setGeneratedHelperPreview,
        setActiveAIActionPreview: state.setActiveAIActionPreview,
        setActiveAIDraftSession: state.setActiveAIDraftSession,
        setInspectorNodeId: state.setInspectorNodeId
    });
    const {
        nodes,
        edges,
        setActiveView,
        setSelectedBranchId,
        setGeneratedHelperPreview,
        setActiveAIActionPreview,
        setActiveAIDraftSession,
        setInspectorNodeId
    } = useStore(useShallow(storeSelector));
    const recordActivity = useActivityStore((state) => state.recordActivity);
    const flowId = flowStore((state) => state.flow_id);
    const targetNodeId = nodeId || sourceId;
    const targetNode = nodes.find((node) => node.id === targetNodeId);
    const initialLegacyAgent = legacyAgents.includes(targetNode?.data?.prompt)
        ? targetNode.data.prompt
        : '';
    const [activeAgent, setActiveAgent] = useState(initialLegacyAgent);
    const [selectedModel, setSelectedModel] = useState(
        targetNode?.data?.model_name || (scope ? 'auto' : defaultOpenAIModel)
    );
    const [selectedRoleId, setSelectedRoleId] = useState(initialRoleId || '');
    const [selectedActionId, setSelectedActionId] = useState(initialActionId || '');
    const [customPrompt, setCustomPrompt] = useState('');
    const [stageMessage, setStageMessage] = useState('');
    const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

    const isPreviewFlow = Boolean(scope);
    const targetData = targetNode ? getWorkspaceNodeData(targetNode) : {};
    const targetLabel =
        targetData.title ||
        targetData.body ||
        targetNodeId ||
        (scope === 'workspace' ? 'Whole workspace' : 'Selected scope');

    const profiles = useMemo(
        () => getPromptProfilesForScope(scope || 'node'),
        [scope]
    );
    const role = useMemo(
        () =>
            profiles.find((profile) => profile.id === selectedRoleId) ||
            profiles[0],
        [profiles, selectedRoleId]
    );
    const actions = useMemo(
        () => getActionsForProfileAndScope(role, scope || 'node'),
        [role, scope]
    );
    const selectedAction = useMemo(
        () =>
            actions.find((action) => action.id === selectedActionId) ||
            actions.find((action) => action.id === getDefaultActionForProfile(role, scope || 'node')) ||
            actions[0],
        [actions, role, scope, selectedActionId]
    );
    const suggestions = useMemo(
        () => getFollowUpSuggestions(role, selectedAction, targetLabel, scope || 'node'),
        [role, scope, selectedAction, targetLabel]
    );

    const updateRole = (roleId) => {
        const nextRole = profiles.find((profile) => profile.id === roleId);
        setSelectedRoleId(roleId);
        setSelectedActionId(getDefaultActionForProfile(nextRole, scope || 'node'));
    };

    const stagePreviewRequest = async () => {
        if (!role || !selectedAction || isGeneratingPreview) {
            return;
        }
        if (selectedAction.id === 'custom_prompt' && !customPrompt.trim()) {
            setStageMessage('Add a custom instruction before generating this preview.');
            return;
        }

        setIsGeneratingPreview(true);
        setStageMessage('');
        const childEdges = edges.filter((edge) => edge.source === targetNodeId);
        const sourceRefs = targetData.sourceRefs || [];
        const shouldDraftNode = actionsThatDraftNodes.has(selectedAction.id);
        const draftNodeId = `draft-${Date.now()}`;
        const normalizedScope =
            scope === 'workspace'
                ? { type: 'workspace' }
                : { type: scope || 'node', node_id: targetNodeId };
        const draftNodes = shouldDraftNode
            ? [
                  {
                      id: draftNodeId,
                      parent_id: targetNodeId,
                      title: `${selectedAction.label}: ${targetLabel}`,
                      summary:
                          customPrompt.trim() ||
                          suggestions[0] ||
                          `${role.label} draft for ${targetLabel}.`,
                      node_type: selectedAction.id.includes('checklist')
                          ? 'task'
                          : selectedAction.id.includes('question')
                            ? 'question'
                            : 'concept',
                      status: sourceRefs.length ? 'ai_generated' : 'needs_review',
                      source_refs: sourceRefs
                  }
              ]
            : [];
        const draftEdges =
            shouldDraftNode && targetNodeId
                ? [
                      {
                          id: `draft-edge-${targetNodeId}-${draftNodeId}`,
                          source_node_id: targetNodeId,
                          target_node_id: draftNodeId
                      }
                  ]
                : [];
        const draftAnnotations = suggestions.map((suggestion, index) => ({
            id: `suggestion-${index + 1}`,
            type: 'follow_up_suggestion',
            title: suggestion,
            body: suggestion
        }));
        const fallbackSession = createAIDraftSession({
            workspaceId: flowId || '',
            scope: normalizedScope,
            role: role.label,
            intent: selectedAction.id,
            prompt: customPrompt.trim() || selectedAction.label,
            draftNodes,
            draftEdges,
            draftAnnotations,
            modelPolicy: selectedModel === 'auto' ? 'balanced' : 'explicit',
            selectedModel: selectedModel === 'auto' ? 'auto' : selectedModel,
            modelReason:
                selectedModel === 'auto'
                    ? 'Backend unavailable; model would be selected by intent.'
                    : 'User selected the model explicitly.',
            metadata: {
                role_id: role.id,
                action_label: selectedAction.label,
                preview_mode: 'local_fallback',
                source_node_id: scope === 'workspace' ? null : targetNodeId
            }
        });
        const legacyPreview = {
            preview_id: fallbackSession.session_id,
            ai_action_id: fallbackSession.session_id,
            workspace_id: flowId || '',
            scope: normalizedScope,
            source_node_id: scope === 'workspace' ? null : targetNodeId,
            role: role.label,
            role_id: role.id,
            action: selectedAction.id,
            action_label: selectedAction.label,
            custom_prompt: customPrompt.trim() || null,
            input_node_ids:
                scope === 'branch'
                    ? [targetNodeId, ...childEdges.map((edge) => edge.target)]
                    : targetNodeId
                      ? [targetNodeId]
                      : [],
            draft_nodes: draftNodes,
            draft_edges: draftEdges,
            draft_annotations: draftAnnotations,
            validation_report: {
                status: 'not_run',
                message: 'Waiting for Agent A/C preview contract integration.'
            },
            source_refs: sourceRefs,
            assumptions: customPrompt.trim()
                ? [`User instruction: ${customPrompt.trim()}`]
                : [],
            metadata: {
                preview_mode: 'local_fallback',
                model: selectedModel === 'auto' ? 'auto' : selectedModel,
                model_tier: selectedModel === 'auto' ? 'auto' : 'explicit',
                model_reason:
                    selectedModel === 'auto'
                        ? 'Backend unavailable; model would be selected by intent.'
                        : 'User selected the model explicitly.'
            }
        };

        const activateSession = (session) => {
            const nextSession = session?.session_id
                ? session
                : session?.draft_session?.session_id
                  ? session.draft_session
                  : session?.session?.session_id
                    ? session.session
                    : fallbackSession;
            setGeneratedHelperPreview('nodeAiActionRequest', legacyPreview);
            setActiveAIActionPreview(undefined);
            setActiveAIDraftSession(nextSession);
            if (scope === 'branch' || scope === 'node') {
                setSelectedBranchId(targetNodeId);
                setInspectorNodeId(targetNodeId);
            } else if (scope === 'workspace') {
                setSelectedBranchId(undefined);
                setInspectorNodeId(undefined);
            }
            setActiveView(viewForAction(selectedAction.id));
            recordActivity({
                type: 'ai_preview_requested',
                title: `${role.label}: ${selectedAction.label}`,
                summary: `Staged preview-first ${scope} AI action for ${targetLabel}.`,
                node_ids: targetNodeId ? [targetNodeId] : [],
                metadata: {
                    scope,
                    role: role.label,
                    action: selectedAction.id,
                    model: selectedModel
                }
            });
            setStageMessage('Draft session generated. Refine it in the drafting table before accepting.');
            window.setTimeout(() => popNode(), 150);
        };

        try {
            const endpoint = flowId ? draftSessionEndpoint({ flowId }) : '';
            const response = endpoint
                ? await axios.post(endpoint, {
                      role: role.id,
                      role_id: role.id,
                      action: selectedAction.id,
                      intent: selectedAction.id,
                      scope: normalizedScope,
                      custom_prompt: customPrompt.trim() || null,
                      prompt: customPrompt.trim() || selectedAction.label,
                      created_by: 'user',
                      model_policy: selectedModel === 'auto' ? 'balanced' : 'explicit',
                      model: selectedModel === 'auto' ? null : selectedModel
                  })
                : null;
            activateSession(response?.data || fallbackSession);
        } catch (error) {
            const detail =
                error.response?.data?.detail?.message ||
                error.response?.data?.detail ||
                error.message ||
                'Unable to generate preview.';
            activateSession({
                ...fallbackSession,
                warnings: [String(detail)],
                revisions: fallbackSession.revisions.map((revision) => ({
                    ...revision,
                    validation_report: {
                        ...revision.validation_report,
                        status: 'fallback',
                        message: 'Backend draft session was unavailable; staged a local draft.'
                    }
                })),
                metadata: {
                    ...fallbackSession.metadata,
                    backend_warning: String(detail)
                }
            });
        } finally {
            setIsGeneratingPreview(false);
        }
    };

    if (!isPreviewFlow) {
        return (
            <div className="modal-container prompts-selection">
                <div className="title">
                    <div>
                        <img src={PROMPTSvg} alt="Prompts Svg" />
                        <p>Legacy Personas</p>
                    </div>
                    <img src={CROSSSvg} alt="Cross Svg" onClick={() => popNode()} />
                </div>
                <div className="legacy-prompt-banner">
                    Legacy data-source flow is read-only. Use Ask AI on a node, branch,
                    or workspace to route an intent through the right preview-first role.
                </div>
                <div className="prompt-model-selector">
                    <label htmlFor="model-select">OpenAI model</label>
                    <select
                        id="model-select"
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                    >
                        {modelOptions.map((modelName) => (
                            <option key={modelName} value={modelName}>
                                {modelName === 'auto'
                                    ? 'Auto select by intent'
                                    : modelName}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="legacy-persona-strip">
                    {legacyPersonaNames.map((name) => (
                        <span key={name}>{name}</span>
                    ))}
                </div>
                <div className="prompts">
                    {legacyAgents.map((agentName) => (
                        <Prompts
                            key={agentName}
                            agentName={agentName}
                            activeAgent={activeAgent}
                            setActiveAgent={setActiveAgent}
                            id={sourceId}
                            selectedModel={selectedModel}
                        />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="modal-container prompts-selection ai-action-modal">
            <div className="title">
                <div>
                    <img src={PROMPTSvg} alt="Prompts Svg" />
                    <p>Ask AI</p>
                </div>
                <img src={CROSSSvg} alt="Cross Svg" onClick={() => popNode()} />
            </div>
            <div className="ai-action-scope">
                <span>
                    {scope === 'workspace'
                        ? 'Whole workspace'
                        : scope === 'branch'
                          ? 'Selected branch'
                          : 'Selected node'}
                </span>
                <strong>{targetLabel}</strong>
            </div>
            <div className="ai-action-grid">
                <label>
                    Advanced role
                    <select
                        value={role?.id || ''}
                        onChange={(event) => updateRole(event.target.value)}
                    >
                        {profiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                                {profile.group}: {profile.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    What do you want?
                    <select
                        value={selectedAction?.id || ''}
                        onChange={(event) => setSelectedActionId(event.target.value)}
                    >
                        {actions.map((action) => (
                            <option key={action.id} value={action.id}>
                                {action.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <label className="ai-action-model-policy">
                Model policy
                <select
                    value={selectedModel}
                    onChange={(event) => setSelectedModel(event.target.value)}
                >
                    {modelOptions.map((modelName) => (
                        <option key={modelName} value={modelName}>
                            {modelName === 'auto'
                                ? 'Auto select by intent'
                                : modelName}
                        </option>
                    ))}
                </select>
            </label>
            {role ? (
                <p className="ai-action-description">{role.description}</p>
            ) : null}
            <label className="ai-action-custom">
                Custom instruction
                <textarea
                    value={customPrompt}
                    onChange={(event) => setCustomPrompt(event.target.value)}
                    placeholder="Optional: constrain tone, output shape, or review rules."
                />
            </label>
            <div className="ai-action-suggestions">
                <div>
                    <strong>Follow-up suggestions</strong>
                    <span>Click a suggestion to use it as the custom instruction.</span>
                </div>
                {suggestions.map((suggestion) => (
                    <button
                        type="button"
                        key={suggestion}
                        onClick={() => setCustomPrompt(suggestion)}
                    >
                        {suggestion}
                    </button>
                ))}
            </div>
            {stageMessage ? (
                <div className="ai-action-stage-message">{stageMessage}</div>
            ) : null}
            <div className="ai-action-footer">
                <button type="button" className="secondary" onClick={() => popNode()}>
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={stagePreviewRequest}
                    disabled={isGeneratingPreview}
                >
                    {isGeneratingPreview ? 'Generating preview' : 'Generate preview'}
                </button>
            </div>
        </div>
    );
};

export default PromptModal;
