import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import { useShallow } from 'zustand/shallow';
import modalStore from '../stores/modalStore';
import LoadingModal from '../modals/LoadingModal';
import DELETESvg from '../assets/delete.svg';
import axios from 'axios';
import { useReactFlow } from '@xyflow/react';
import { parseFlowSnapshot, stringifyFlowSnapshot } from '../utils/flowSnapshots';
import useActivityStore from '../stores/activityStore';
import useAutomationStore from '../stores/automationStore';
import { forgetWorkspace } from '../utils/workspaceSession';

const Flow = ({ data, isDrawer, setIsDrawer, flows, setFlowList }) => {
    const pushNode = modalStore((s) => s.pushNode);
    const popNode = modalStore((s) => s.popNode);
    const setFlowId = flowStore((s) => s.setFlow);
    const flow_id = flowStore((s) => s.flow_id);
    const setFlowName = flowStore((s) => s.setFlowName);
    const setFlowType = flowStore((s) => s.setFlowType);
    const setSavedSnapshot = flowStore((s) => s.setSavedSnapshot);
    const setSaveStatus = flowStore((s) => s.setSaveStatus);
    const setActivityEvents = useActivityStore((s) => s.setActivityEvents);
    const recordActivity = useActivityStore((s) => s.recordActivity);
    const setAutomations = useAutomationStore((s) => s.setAutomations);
    const { fitView, setViewport } = useReactFlow();
    const selector = (state) => ({
        trigger: state.trigger,
        setTrigger: state.setTrigger,
        nodes: state.nodes,
        edges: state.edges,
        setNodes: state.setNodes,
        setEdges: state.setEdges,
        setWorkspaceBrief: state.setWorkspaceBrief,
        setViewPort: state.setViewPort
    });

    const {
        trigger,
        setTrigger,
        nodes,
        edges,
        setNodes,
        setEdges,
        setWorkspaceBrief,
        setViewPort
    } = useStore(useShallow(selector));


    const setupFlow = () => {
        pushNode(LoadingModal);
        setFlowId(data.flow_id);
        setFlowName(data.flow_name);
        setFlowType(data.flow_type || 'manual');
        if (data.flow_json?.length > 0) {
            const flow = parseFlowSnapshot(data.flow_json);
            setActivityEvents(flow.activity_events || [], data.flow_id);
            setAutomations(flow.automations || []);
            recordActivity({
                type: 'workspace_opened',
                title: 'Opened workspace',
                summary: `${data.flow_name} was opened.`,
                metadata: {
                    nodes: flow.nodes.length,
                    edges: flow.edges.length
                }
            });
            setSavedSnapshot(
                flow,
                stringifyFlowSnapshot(flow),
                data.flow_name,
                data.flow_type || 'manual'
            );
            if (flow.nodes.length === 0 && flow.edges.length === 0) {
                setNodes([]);
                setEdges([]);
                setWorkspaceBrief(flow.workspace_brief || {});
                setIsDrawer(false);
                setTrigger(!trigger);
                setViewPort(0, 0, 1);
                setViewport({ x: 0, y: 0, zoom: 1 });
                popNode();
                return;
            }
            if (flow) {
                const { x = 0, y = 0, zoom = 1.25 } = flow.viewport;
                setNodes(flow.nodes || []);
                setEdges(flow.edges || []);
                setWorkspaceBrief(flow.workspace_brief || {});
                setViewPort(x, y, zoom);
                setViewport({ x, y, zoom });
                // fitView();
                setIsDrawer(false);
                popNode();
            } else {
                popNode();
            }
        } else {
            const emptySnapshot = parseFlowSnapshot('');
            setActivityEvents(emptySnapshot.activity_events || [], data.flow_id);
            setAutomations(emptySnapshot.automations || []);
            recordActivity({
                type: 'workspace_opened',
                title: 'Opened empty workspace',
                summary: `${data.flow_name} was opened.`
            });
            setSavedSnapshot(
                emptySnapshot,
                stringifyFlowSnapshot(emptySnapshot),
                data.flow_name,
                data.flow_type || 'manual'
            );
            setNodes([]);
            setEdges([]);
            setWorkspaceBrief({});
            setViewPort({});
            setViewport({ x: 0, y: 0, zoom: 1 });
            fitView({ maxZoom: 1 });
            setIsDrawer(false);
            popNode();
        }
        // setTrigger(!trigger);
    };

    const deleteFlow = (e) => {
        const updatedFlowss = flows.filter(
            (ele) => ele.flow_id !== data.flow_id
        );
        axios
            .delete(`http://localhost:8000/delete-flow/${data.flow_id}`)
            .then((res) => {
                forgetWorkspace(data.flow_id);
                setFlowList(updatedFlowss);
                setIsDrawer(true);
            })
            .catch((err) => console.error(err));
    };

    const updateFlowType = async (event) => {
        event.stopPropagation();
        const nextType = event.target.value;
        if (nextType === (data.flow_type || 'manual')) {
            return;
        }

        const updateList = () => {
            setFlowList(
                flows.map((flow) =>
                    flow.flow_id === data.flow_id
                        ? { ...flow, flow_type: nextType }
                        : flow
                )
            );
        };

        if (flow_id === data.flow_id) {
            setFlowType(nextType);
            setSaveStatus('dirty');
            updateList();
            return;
        }

        try {
            await axios.put(
                'http://localhost:8000/flow-update/',
                {
                    flow_id: data.flow_id,
                    flow_name: data.flow_name,
                    flow_json: data.flow_json || '',
                    flow_type: nextType,
                    summary: data.summary || ''
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            updateList();
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div>
            <div className="flow-row-main" onClick={setupFlow}>
                <p>{data.flow_name}</p>
                <select
                    value={data.flow_type || 'manual'}
                    onChange={updateFlowType}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`${data.flow_name} mode`}
                >
                    <option value="manual">Manual</option>
                    <option value="automatic">Auto</option>
                </select>
            </div>
            <img
                src={DELETESvg}
                alt="delete svg"
                onClick={(event) => {
                    event.stopPropagation();
                    deleteFlow(event);
                }}
            />
        </div>
    );
};

export default Flow;
