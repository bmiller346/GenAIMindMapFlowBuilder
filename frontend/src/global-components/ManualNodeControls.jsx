import axios from 'axios';
import { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import useStore from '../stores/store';
import flowStore from '../stores/flowStore';
import {
    EMPTY_FLOW_SNAPSHOT,
    parseFlowSnapshot,
    stringifyFlowSnapshot
} from '../utils/flowSnapshots';
import {
    createWorkspaceNode,
    getRootPosition,
    getViewportRootPosition
} from '../utils/manualNodes';
import useActivityStore from '../stores/activityStore';
import useAutomationStore from '../stores/automationStore';

const ManualNodeControls = () => {
    const [isPreparingWorkspace, setIsPreparingWorkspace] = useState(false);
    const [workspaceMessage, setWorkspaceMessage] = useState('');
    const { screenToFlowPosition } = useReactFlow();
    const nodes = useStore((state) => state.nodes);
    const edges = useStore((state) => state.edges);
    const setNodes = useStore((state) => state.setNodes);
    const setEdges = useStore((state) => state.setEdges);
    const setWorkspaceBrief = useStore((state) => state.setWorkspaceBrief);
    const setViewPort = useStore((state) => state.setViewPort);
    const flowId = flowStore((state) => state.flow_id);
    const setFlow = flowStore((state) => state.setFlow);
    const setFlowName = flowStore((state) => state.setFlowName);
    const setFlowType = flowStore((state) => state.setFlowType);
    const setSavedSnapshot = flowStore((state) => state.setSavedSnapshot);
    const setSaveStatus = flowStore((state) => state.setSaveStatus);
    const setActivityEvents = useActivityStore((state) => state.setActivityEvents);
    const recordActivity = useActivityStore((state) => state.recordActivity);
    const setAutomations = useAutomationStore((state) => state.setAutomations);

    const createBlankWorkspace = async () => {
        setWorkspaceMessage('Creating a blank workspace...');
        const response = await axios.post(
            'http://localhost:8000/create-flow',
            {
                flow_name: 'New Flow',
                summary: 'Flow is empty',
                flow_json: '',
                flow_type: 'manual'
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        setFlow(response.data.flow_id);
        setActivityEvents([], response.data.flow_id);
        setAutomations(EMPTY_FLOW_SNAPSHOT.automations || []);
        setFlowName(response.data.flow_name || 'New Flow');
        setFlowType(response.data.flow_type || 'manual');
        setEdges([]);
        setWorkspaceBrief({});
        setViewPort({});
        setSavedSnapshot(
            EMPTY_FLOW_SNAPSHOT,
            stringifyFlowSnapshot(EMPTY_FLOW_SNAPSHOT),
            response.data.flow_name || 'New Flow',
            response.data.flow_type || 'manual'
        );
        setWorkspaceMessage('Blank workspace ready.');
        recordActivity({
            type: 'workspace_created',
            title: 'Created blank workspace',
            summary: 'Created a workspace for manual editing.'
        });

        return { nodes: [], edges: [] };
    };

    const loadOnlyWorkspace = async () => {
        setWorkspaceMessage('Checking workspaces...');
        const response = await axios.get('http://localhost:8000/flows');
        const flows = Array.isArray(response.data) ? response.data : [];

        if (flows.length === 1) {
            setWorkspaceMessage('Loading your workspace...');
            const [workspace] = flows;
            const snapshot = parseFlowSnapshot(workspace.flow_json);
            setFlow(workspace.flow_id);
            setActivityEvents(snapshot.activity_events || [], workspace.flow_id);
            setAutomations(snapshot.automations || []);
            setFlowName(workspace.flow_name);
            setFlowType(workspace.flow_type || 'manual');
            setEdges(snapshot.edges);
            setWorkspaceBrief(snapshot.workspace_brief || {});
            setViewPort(snapshot.viewport || {});
            setSavedSnapshot(
                snapshot,
                stringifyFlowSnapshot(snapshot),
                workspace.flow_name,
                workspace.flow_type || 'manual'
            );
            setWorkspaceMessage(`Loaded ${workspace.flow_name}.`);
            recordActivity({
                type: 'workspace_opened',
                title: 'Opened workspace',
                summary: `${workspace.flow_name} was opened for manual editing.`
            });
            return snapshot;
        }

        const shouldCreateBlankWorkspace =
            flows.length === 0 ||
            window.confirm(
                'No workspace is selected. Create a blank workspace for this manual node?'
            );

        if (!shouldCreateBlankWorkspace) {
            setWorkspaceMessage('Select a workspace before adding manual nodes.');
            return null;
        }

        return createBlankWorkspace();
    };

    const ensureWorkspace = async () => {
        if (flowId) {
            return { nodes, edges };
        }

        return loadOnlyWorkspace();
    };

    const getVisibleRootPosition = (baseNodes) => {
        if (!screenToFlowPosition || typeof window === 'undefined') {
            return getRootPosition(baseNodes);
        }

        const anchor = screenToFlowPosition({
            x: Math.min(window.innerWidth - 280, Math.max(360, window.innerWidth * 0.52)),
            y: Math.min(window.innerHeight - 220, Math.max(160, window.innerHeight * 0.42))
        });

        return getViewportRootPosition({
            nodes: baseNodes,
            position: anchor
        });
    };

    const appendManualNode = (baseNodes, manualNode) => {
        setNodes([...baseNodes, manualNode]);
        setSaveStatus('dirty');
    };

    const addManualNode = async ({ title, nodeType, df = [] }) => {
        if (isPreparingWorkspace) {
            return;
        }

        setIsPreparingWorkspace(true);
        setWorkspaceMessage('');
        try {
            const workspace = await ensureWorkspace();
            if (!workspace) {
                return;
            }

            const baseNodes = workspace.nodes || [];
            const manualNode = createWorkspaceNode({
                title,
                nodeType,
                position: getVisibleRootPosition(baseNodes),
                df
            });
            appendManualNode(baseNodes, manualNode);
            recordActivity({
                type: df.length ? 'manual_table_created' : 'manual_node_created',
                title: df.length ? 'Manual table added' : 'Manual node added',
                summary: `Added ${title}.`,
                node_ids: [manualNode.id],
                metadata: {
                    node_type: nodeType
                }
            });
            setWorkspaceMessage('Root node added. Use a node plus button to grow the map.');
        } catch (error) {
            console.error('Could not prepare workspace for manual node', error);
            setWorkspaceMessage(
                'Could not prepare a workspace. Check that the backend is running and try again.'
            );
        } finally {
            setIsPreparingWorkspace(false);
        }
    };

    const addNode = () => {
        addManualNode({
            title: 'New manual node',
            nodeType: 'concept'
        });
    };

    const addTable = () => {
        addManualNode({
            title: 'Manual table',
            nodeType: 'reference',
            df: [{ Column: 'Value' }]
        });
    };

    return (
        <div className="manual-node-controls">
            <button type="button" onClick={addNode} disabled={isPreparingWorkspace}>
                {isPreparingWorkspace ? 'Preparing...' : 'Add node'}
            </button>
            <details className="manual-node-more">
                <summary>More</summary>
                <button type="button" onClick={addTable} disabled={isPreparingWorkspace}>
                    Add table root
                </button>
            </details>
            {workspaceMessage ? (
                <span className="manual-node-status" aria-live="polite">
                    {workspaceMessage}
                </span>
            ) : null}
        </div>
    );
};

export default ManualNodeControls;
