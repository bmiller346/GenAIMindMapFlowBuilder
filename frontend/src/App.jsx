import {
    Panel,
    ReactFlow,
    useNodesInitialized,
    useOnSelectionChange,
    useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { nodeTypes } from './nodes/nodeTypes.js';
import { useShallow } from 'zustand/shallow';
import useStore from './stores/store.js';
import Modal from './global-components/Modal.jsx';
import Prompts from './global-components/Prompts.jsx';
import AddDataSource from './global-components/AddDataSource.jsx';
import getLayoutedElements from './utils/setLayout.js';
import modalStore from './stores/modalStore';
import AskMultiple from './global-components/AskMultiple.jsx';
import Header from './global-components/Header.jsx';
import Drawer from './global-components/Drawer.jsx';
import flowStore from './stores/flowStore.js';
import NodeInspector from './global-components/NodeInspector.jsx';
import GraphValidationPanel from './global-components/GraphValidationPanel.jsx';
import LocalViewsPanel from './views/LocalViewsPanel.jsx';
import WorkspaceBriefPanel from './global-components/WorkspaceBriefPanel.jsx';
import ActivityPanel from './global-components/ActivityPanel.jsx';
import SourcesPanel from './global-components/SourcesPanel.jsx';
import IntegrationsPanel from './global-components/IntegrationsPanel.jsx';
import AutomationsPanel from './global-components/AutomationsPanel.jsx';
import ManualNodeControls from './global-components/ManualNodeControls.jsx';
import AiHelpersPanel from './global-components/AiHelpersPanel.jsx';
import { getLocalSetting, setLocalSetting, SETTINGS_KEYS } from './config/localSettings';
const App = () => {
    const nodeType = useMemo(() => nodeTypes, []);
    const selector = (state) => ({
        trigger: state.trigger,
        nodes: state.nodes,
        edges: state.edges,
        onNodesChange: state.onNodesChange,
        onEdgesChange: state.onEdgesChange,
        setNodes: state.setNodes,
        setEdges: state.setEdges,
        activeView: state.activeView,
        setSelectedBranchId: state.setSelectedBranchId,
        inspectorNodeId: state.inspectorNodeId,
        setInspectorNodeId: state.setInspectorNodeId,
        setViewPort: state.setViewPort
    });
    const {
        trigger,
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        setNodes,
        setEdges,
        activeView,
        setSelectedBranchId,
        inspectorNodeId,
        setInspectorNodeId,
        setViewPort
    } = useStore(useShallow(selector));
    const areNodesIntialised = useNodesInitialized();
    const [askMultipleClass, setAskMultipleClass] = useState();
    const [isDrawer, setIsDrawer] = useState(false);
    const setRfInstance = flowStore((s) => s.setRfInstance);
    const [selectedNodes, setSelectedNodes] = useState();
    const [validationReport, setValidationReport] = useState();
    const reactFlow = useReactFlow();
    const { fitView } = useReactFlow();
    const popNode = modalStore((s) => s.popNode);
    const [flowList, setFlowList] = useState([]);
    const [isSourcesOpen, setIsSourcesOpen] = useState(false);
    const [isAiHelpersOpen, setIsAiHelpersOpen] = useState(false);
    const [lightMode, setLightMode] = useState(
        () => getLocalSetting(SETTINGS_KEYS.theme) === 'light'
    );
    const flow_id = flowStore((s) => s.flow_id);
    const selectedNodeIssues = useMemo(() => {
        if (!inspectorNodeId || !validationReport?.issues) {
            return [];
        }

        return validationReport.issues.filter(
            (issue) => issue.nodeId === inspectorNodeId
        );
    }, [inspectorNodeId, validationReport]);
    const closeNodeInspector = useCallback(() => {
        setInspectorNodeId(undefined);
        setNodes(
            nodes.map((node) =>
                node.selected ? { ...node, selected: false } : node
            )
        );
    }, [nodes, setInspectorNodeId, setNodes]);
    const focusNodeForReview = useCallback(
        (nodeId) => {
            if (!nodeId) {
                return;
            }

            const node = nodes.find((item) => item.id === nodeId);
            setInspectorNodeId(nodeId);

            if (!node) {
                return;
            }

            setNodes(
                nodes.map((item) => ({
                    ...item,
                    selected: item.id === nodeId
                }))
            );

            const nodeWidth = node.measured?.width || node.width || 260;
            const nodeHeight = node.measured?.height || node.height || 140;
            reactFlow.setCenter(
                (node.position?.x || 0) + nodeWidth / 2,
                (node.position?.y || 0) + nodeHeight / 2,
                { duration: 420, zoom: 1 }
            );
        },
        [nodes, reactFlow, setInspectorNodeId, setNodes]
    );

    const onChange = useCallback(
        ({ nodes }) => {
            setSelectedBranchId(nodes.length === 1 ? nodes[0].id : undefined);
            const responseNodes = nodes.filter(
                (ele) => ele.type === 'response'
            );
            if (responseNodes.length === 0) {
                setSelectedNodes(undefined);
                setAskMultipleClass('deanimate');
                return;
            }
            if (responseNodes.length !== nodes.length) {
                setSelectedNodes(undefined);
                setAskMultipleClass('deanimate');
                return;
            }
            if (responseNodes.length > 1 && responseNodes.length <= 4) {
                setSelectedNodes(responseNodes);
                setAskMultipleClass('animate');
            } else if (
                responseNodes.length > 4 &&
                askMultipleClass === 'animate'
            ) {
                setAskMultipleClass('deanimate');
            }
        },
        [askMultipleClass, setSelectedBranchId]
    );

    useOnSelectionChange({
        onChange
    });

    // const setFlowId = flowStore((s) => s.setFlow);
    // const flow_id = flowStore((s) => s.flow_id);
    // const setFlowName = flowStore((s) => s.setFlowName);

    // useEffect(() => {
    //     axios
    //         .get(`http://localhost:8000/flows`)
    //         .then((res) => {
    //             if (res.data.length > 0 && Array.isArray(res.data)) {
    //                 setFlowId(res.data.flow_id)
    //                 setFlowName(res.data.flow_name);
    //             } else if (!Array.isArray(res.data)) {
    //                 pushNode(ErrorModal);
    //             } else {
    //                 pushNode(DataSourceSelect);
    //             }
    //         })
    //         .catch((err) => pushNode(LoadingModal));
    // }, []);

    useEffect(() => {
        // if (nodes.length > 0) {
        //     setTimeout(() => {
        //         const data = reactFlow.getNodes()
        //         const { nodes: newNodes, edges: newEdges } = getLayoutedElements(data, edges)
        //         setNodes(newNodes)
        //         setEdges(newEdges)
        //     }, 90)
        //     setTimeout(() => {
        //         popNode();
        //         reactFlow.fitView()
        //     }, 95)

        // }
        if (areNodesIntialised) {
            setTimeout(() => {
                const data = reactFlow.getNodes();
                console.log('Problem can be here', data);
                const { nodes: newNodes, edges: newEdges } =
                    getLayoutedElements(data, edges);
                setNodes(newNodes);
                setEdges(newEdges);
                fitView({ nodes, maxZoom: 1 });
                popNode();
            }, 1000);
        }
    }, [areNodesIntialised, trigger]);

    useEffect(() => {
        fitView({ maxZoom: 1 });
    }, [trigger]);

    useEffect(() => {
        setLocalSetting(SETTINGS_KEYS.theme, lightMode ? 'light' : 'dark');
    }, [lightMode]);

    return (
        <div className={lightMode ? 'app light' : 'app dark'}>
            <Modal ChildProp={Prompts} />
            <Header
                isDrawer={isDrawer}
                setIsDrawer={setIsDrawer}
                flowList={flowList}
                setFlowList={setFlowList}
                lightMode={lightMode}
                setLightMode={setLightMode}
            />
            <Drawer
                isDrawer={isDrawer}
                setIsDrawer={setIsDrawer}
                flowList={flowList}
                setFlowList={setFlowList}
                onOpenSources={() => setIsSourcesOpen(true)}
                onToggleAiHelpers={() =>
                    setIsAiHelpersOpen((current) => !current)
                }
            />
            <ActivityPanel />
            <SourcesPanel
                isOpen={isSourcesOpen}
                onClose={() => setIsSourcesOpen(false)}
                onSelectNode={setInspectorNodeId}
            />
            <IntegrationsPanel validationReport={validationReport} />
            <AutomationsPanel validationReport={validationReport} />
            <ReactFlow
                nodeTypes={nodeType}
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onMoveEnd={(event, viewport) => setViewPort(viewport)}
                colorMode={lightMode ? 'light' : 'dark'}
                fitView={true}
                fitViewOptions={{ maxZoom: 1 }}
                proOptions={{ hideAttribution: true }}
                onInit={setRfInstance}
                minZoom={-1}
                maxZoom={100}
            >
                <Panel
                    position="bottom-left"
                    style={isDrawer ? { display: 'none' } : { display: 'flex' }}
                >
                    <div className="workspace-flow-controls">
                        <WorkspaceBriefPanel />
                        <ManualNodeControls />
                        <AddDataSource />
                    </div>
                </Panel>
                <Panel position="bottom">
                    <AskMultiple
                        data={askMultipleClass}
                        selectedNodes={selectedNodes}
                    />
                </Panel>
                <Panel
                    position="top-left"
                    style={isDrawer ? { display: 'none' } : { display: 'block' }}
                >
                    <GraphValidationPanel
                        flowId={flow_id}
                        nodes={nodes}
                        edges={edges}
                        onSelectNode={focusNodeForReview}
                        onReportChange={setValidationReport}
                    />
                </Panel>
                <Panel
                    position="top-center"
                    style={isDrawer ? { display: 'none' } : { display: 'block' }}
                >
                    <LocalViewsPanel
                        hidden={false}
                        onSelectNode={focusNodeForReview}
                    />
                </Panel>
                <Panel
                    position="bottom-right"
                    style={isDrawer ? { display: 'none' } : { display: 'block' }}
                >
                    <AiHelpersPanel hidden={!isAiHelpersOpen} />
                </Panel>
                <Panel
                    position="top-right"
                    style={isDrawer ? { display: 'none' } : { display: 'block' }}
                >
                    <NodeInspector
                        selectedNodeId={inspectorNodeId}
                        validationIssues={selectedNodeIssues}
                        onClose={closeNodeInspector}
                    />
                </Panel>
            </ReactFlow>
        </div>
    );
};

export default App;
