import SMALLLsvg from '../assets/small-loading.svg';
import ADDSvg from '../assets/add2.svg';
import Flow from './Flow.jsx';
import { useState } from 'react';
import FlowModal from '../modals/FlowModal.jsx';
import WorkspaceBriefModal from '../modals/WorkspaceBriefModal.jsx';
import LoadingModal from '../modals/LoadingModal.jsx';
import ErrorModal from '../modals/ErrorModal.jsx';
import flowStore from '../stores/flowStore.js';
import modalStore from '../stores/modalStore.js';
import errorStore from '../stores/errorStore.js';
import useActivityStore from '../stores/activityStore.js';
import useWorkspacePanelStore from '../stores/workspacePanelStore.js';
import useStore from '../stores/store.js';
import axios from 'axios';
import { useShallow } from 'zustand/shallow';

const Drawer = ({
    isDrawer,
    setIsDrawer,
    flowList,
    setFlowList,
    onOpenSources,
    onToggleAiHelpers
}) => {
    const [isViewModal, setIsViewFlowModal] = useState(false);
    const pushNode = modalStore((s) => s.pushNode);
    const popNode = modalStore((s) => s.popNode);
    const flowId = flowStore((s) => s.flow_id);
    const flowName = flowStore((s) => s.flow_name);
    const flowType = flowStore((s) => s.flow_type);
    const setFlowType = flowStore((s) => s.setFlowType);
    const setFlowSummary = flowStore((s) => s.setFlowSummary);
    const saveStatus = flowStore((s) => s.saveStatus);
    const setSaveStatus = flowStore((s) => s.setSaveStatus);
    const { nodes, edges, workspaceBrief } = useStore(
        useShallow((s) => ({
            nodes: s.nodes,
            edges: s.edges,
            workspaceBrief: s.workspaceBrief
        }))
    );
    const toggleActivity = useActivityStore((s) => s.toggleActivity);
    const recordActivity = useActivityStore((s) => s.recordActivity);
    const runningActivityCount = useActivityStore((s) =>
        s.activities.filter((activity) => activity.status === 'running').length
    );
    const toggleWorkspacePanel = useWorkspacePanelStore((s) => s.togglePanel);
    const activePanel = useWorkspacePanelStore((s) => s.activePanel);
    const setStatus = errorStore((s) => s.setStatus);
    const setMsg = errorStore((s) => s.setMsg);

    const newFlowModal = () => {
        setIsViewFlowModal(true);
    };

    const closeDrawer = () => {
        setIsDrawer(false);
        setIsViewFlowModal(false);
    };

    const runDrawerAction = (action) => {
        action();
        setIsDrawer(false);
    };

    const changeFlowType = (nextType) => {
        if (!flowId || nextType === flowType) {
            return;
        }

        setFlowType(nextType);
        setFlowList((currentList) =>
            currentList.map((flow) =>
                flow.flow_id === flowId
                    ? { ...flow, flow_type: nextType }
                    : flow
            )
        );
        recordActivity({
            type: 'workspace_mode_changed',
            title: 'Changed workspace mode',
            summary: `Workspace mode changed to ${nextType}.`,
            metadata: {
                previous_type: flowType,
                next_type: nextType
            }
        });
        setSaveStatus('dirty');
    };

    const manageErrors = (err) => {
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

    const summarizeWorkspace = () => {
        if (!flowId) {
            setStatus(400);
            setMsg('Open or create a workspace before summarizing.');
            pushNode(ErrorModal);
            return;
        }

        pushNode(LoadingModal);
        axios
            .post(
                'http://localhost:8000/flow-summarizer',
                { flow_id: flowId },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            )
            .then((res) => {
                setFlowSummary(res.data.response);
                popNode();
                import('../modals/FlowSummary').then(({ default: FlowSummary }) => {
                    pushNode(FlowSummary);
                });
            })
            .catch((err) => manageErrors(err));
    };

    const toolItems = [
        {
            id: 'brief',
            label: 'Brief',
            detail: workspaceBrief?.goal ? 'Workspace intent captured' : 'Define intent',
            onClick: () => pushNode(WorkspaceBriefModal)
        },
        {
            id: 'activity',
            label: runningActivityCount ? `Activity ${runningActivityCount}` : 'Activity',
            detail: 'Timeline and AI build history',
            onClick: toggleActivity
        },
        {
            id: 'sources',
            label: 'Sources',
            detail: 'Documents, citations, and media',
            onClick: onOpenSources
        },
        {
            id: 'integrations',
            label: 'Integrations',
            detail: 'Miro, monday, and external refs',
            active: activePanel === 'integrations',
            onClick: () => toggleWorkspacePanel('integrations')
        },
        {
            id: 'automations',
            label: 'Automations',
            detail: 'Planned and recurring handoffs',
            active: activePanel === 'automations',
            onClick: () => toggleWorkspacePanel('automations')
        },
        {
            id: 'ai-helpers',
            label: 'AI helpers',
            detail: 'Agents for repair, review, and handoff',
            onClick: onToggleAiHelpers
        },
        {
            id: 'summary',
            label: 'Summarize',
            detail: 'Create an AI workspace summary',
            onClick: summarizeWorkspace
        }
    ];

    return (
        <div
            className="drawer-container"
            style={isDrawer ? { display: 'block' } : { display: 'none' }}
            onClick={closeDrawer}
        >
            <div
                className="drawer"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="drawer-header">
                    <div className="drawer-holder">
                        <img
                            src={SMALLLsvg}
                            alt="Loader"
                        />
                        <h4>Your Thinkspaces</h4>
                    </div>
                    <div
                        id="new-flow"
                        onClick={(e) => newFlowModal(e)}
                    >
                        <img
                            src={ADDSvg}
                            alt="Add svg"
                        />
                        <p>NEW</p>
                    </div>
                </div>
                <div className="drawer-workspace-card">
                    <span>Active workspace</span>
                    <strong>{flowName || 'Untitled workspace'}</strong>
                    <div className="drawer-workspace-meta">
                        <span>{nodes.length} nodes</span>
                        <span>{edges.length} links</span>
                    </div>
                    <div className="flow-mode-toggle drawer-mode-toggle" aria-label="Workspace mode">
                        <button
                            type="button"
                            className={flowType !== 'automatic' ? 'active' : ''}
                            onClick={() => changeFlowType('manual')}
                            disabled={!flowId || saveStatus === 'saving'}
                        >
                            Manual
                        </button>
                        <button
                            type="button"
                            className={flowType === 'automatic' ? 'active' : ''}
                            onClick={() => changeFlowType('automatic')}
                            disabled={!flowId || saveStatus === 'saving'}
                        >
                            Auto
                        </button>
                    </div>
                </div>
                <div className="drawer-tools">
                    <p className="drawer-section-label">Workspace</p>
                    {toolItems.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={`drawer-tool ${item.active ? 'active' : ''}`}
                            onClick={() => runDrawerAction(item.onClick)}
                        >
                            <span>{item.label}</span>
                            <small>{item.detail}</small>
                        </button>
                    ))}
                </div>
                <hr />
                <p className="drawer-section-label drawer-projects-label">Projects</p>
                <div className="flows">
                    {flowList.map((ele, index) => (
                        <Flow
                            data={ele}
                            key={index}
                            setIsDrawer={setIsDrawer}
                            isDrawer={isDrawer}
							flows={flowList}
							setFlowList={setFlowList}
                        />
                    ))}
                </div>
            </div>
            {isViewModal ? (
                <div onClick={(event) => event.stopPropagation()}>
                    <FlowModal isDrawer={isDrawer} setIsDrawer={setIsDrawer} isViewModal={isViewModal} setIsViewFlowModal={setIsViewFlowModal}/>
                </div>
            ) : null}
        </div>
    );
};

export default Drawer;
