import PDFSvg from '../assets/text.svg';
import CROSSSvg from '../assets/cross.svg';
import RIGHTArrow from '../assets/right.svg';
import { useState } from 'react';
import InputBar from '../helpful-components/InputBar';
import { nanoid } from 'nanoid';
import useStore from '../stores/store';
import { useShallow } from 'zustand/shallow';
import modalStore from '../stores/modalStore';
import axios from 'axios';
import LoadingModal from './LoadingModal';
import setRequestData from '../config/setRequestData';
import flowStore from '../stores/flowStore';
import DataSourceSet from '../nodes/DataSourceSet';
import DataSourceSelect from '../global-components/DataSourceSelect';
import ErrorModal from './ErrorModal';
import errorStore from '../stores/errorStore';
import DELETESvg from '../assets/delete.svg';
import { useReactFlow } from '@xyflow/react';
import { sourceUploadLoading } from '../config/loadingStates';
import useActivityStore from '../stores/activityStore';
import { isCanceledRequest, requestErrorMessage } from '../utils/requestErrors';
import {
    createOperationSnapshot,
    restoreOperationSnapshot
} from '../utils/operationSnapshots';
import {
    sourceRecordFromUpload,
    stageUploadedSourceReconciliationPreview
} from '../utils/sourceReconciliationPreview';

const TextModal = () => {
const flowId = flowStore((s) => s.flow_id);
    const [file, setFile] = useState();
    const pushNode = modalStore((s) => s.pushNode);
    const popNode = modalStore((s) => s.popNode);
    const addActivity = useActivityStore((s) => s.addActivity);
    const updateActivity = useActivityStore((s) => s.updateActivity);
    // const csvAccept = ".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
    const setFlowId = flowStore((s) => s.setFlow);
    const flow_id = flowStore((s) => s.flow_id);
    const setFlowName = flowStore((s) => s.setFlowName);
    const { fitView, setViewport } = useReactFlow();
    const selector = (state) => ({
        trigger: state.trigger,
        setTrigger: state.setTrigger,
        nodes: state.nodes,
        edges: state.edges,
        setNodes: state.setNodes,
        setEdges: state.setEdges,
        setViewPort: state.setViewPort,
        workspaceBrief: state.workspaceBrief,
        setWorkspaceBrief: state.setWorkspaceBrief,
        viewport: state.viewport
    });

    const {
        trigger,
        setTrigger,
        nodes,
        edges,
        setNodes,
        setEdges,
        setViewPort,
        workspaceBrief,
        setWorkspaceBrief,
        viewport
    } = useStore(useShallow(selector));
    const textAccept = '.txt,text/plain';



    const addDataSource = (e) => {
        const operationId = nanoid();
        const data = {
            file: file,
            operationId
        };
        const undoSnapshot = createOperationSnapshot({
            nodes,
            edges,
            viewport,
            workspaceBrief
        });
        const controller = new AbortController();
        const activityId = addActivity({
            type: 'source_upload_started',
            title: 'Adding text source',
            detail: file?.name,
            context: 'Uploading, extracting text, and deriving workspace structure.'
        });
        pushNode(LoadingModal, {
            ...sourceUploadLoading('text', file?.name),
            operationId,
            onCancel: () => {
                controller.abort();
                updateActivity(activityId, {
                    type: 'source_upload_canceled',
                    status: 'canceled',
                    context: 'Upload request was canceled.'
                });
                popNode();
            }
        });
        const undoSourceAdd = () => {
            restoreOperationSnapshot({
                snapshot: undoSnapshot,
                setNodes,
                setEdges,
                setWorkspaceBrief,
                setViewPort,
                setViewport
            });
            updateActivity(activityId, {
                status: 'completed',
                context: 'Text source add was undone.',
                undo: undefined
            });
        };
        const [url, body, headerConfig] = setRequestData('txt', flowId, data);
        axios
            .post(`http://localhost:8000/${url}`, body, {
                headers: {
                    'Content-Type': headerConfig
                },
                signal: controller.signal
            })
            .then((res) => {
                updateActivity(activityId, {
                    type: 'source_upload_completed',
                    status: 'completed',
                    source_ids: [file?.name],
                    context: 'Text source was added to the workspace.',
                    undo: undoSourceAdd
                });
                setupNodes(res.data);
            })
            .catch((err) => {
                if (isCanceledRequest(err)) {
                    return;
                }
                updateActivity(activityId, {
                    type: 'source_upload_failed',
                    status: 'failed',
                    context: requestErrorMessage(err)
                });
                manageErrors(err);
            });
    };

    const setupNodes = (data) => {
        if (data.flow_type === 'automatic') {
            manageAutomaticNode(data)
        } else {
            manageNodes(data)
        }
    }

    const manageAutomaticNode = (data) => {
        setupFlow(data)
    }
    const setupFlow = (data) => {
        console.log("SETUUUUUUUUUUUUUUUUUUP new flow")
        setFlowId(data.flow_id);
        console.log('DEDEDE', data);
        setFlowName(data.flow_name);
        const jsonString = JSON.stringify(data.mindmap_json)
        console.log(jsonString, "JSON STRINGGGGGGGGGGGGGG")
        if (jsonString.length > 0) {
            const flow = JSON.parse(jsonString);
            console.log('NODEEEEEEEEEE', flow.nodes);
            if (flow.nodes.length === 0 && flow.edges.length === 0) {
                console.log('not clled');
                setTrigger(!trigger);
                setViewPort(0, 0, 1);
                popNode();
            }
            if (flow) {
                const { x = 0, y = 0, zoom = 1.25 } = flow.viewport;
                setNodes(flow.nodes || []);
                setEdges(flow.edges || []);
                setViewPort(x, y, zoom);
                // fitView();
                console.log(
                    'FLow selecteed sadassssssssssssssssssssss',
                    flow_id,
                    data.flow_id,
                    nodes
                );
                popNode();
            } else {
                console.log('Flow error');
            }
        } else {
            setNodes([]);
            setEdges([]);
            // setViewPort({});
            fitView();
            popNode();
        }
        // setTrigger(!trigger);
    };

    const selector2 = (state) => ({
        status: state.status,
        message: state.message,
        setStatus: state.setStatus,
        setMsg: state.setMsg
    });
    const { status, message, setStatus, setMsg } = errorStore(
        useShallow(selector2)
    );

    const manageErrors = (err) => {
        console.log(err);
        console.log('Errroro', err.status);
        console.log('Errroross', err.response?.statusText);
        setStatus(err.response?.status || err.status || 500);
        setMsg(requestErrorMessage(err));
        popNode();
        pushNode(ErrorModal);
    };

    const manageNodes = (data) => {
        const sourceRecord = sourceRecordFromUpload(data, file, flowId, {
            fallbackType: 'txt',
            fallbackTypeLabel: 'Text'
        });
        const node = {
            id: data.component_id,
            position: { x: 0, y: 0 },
            type: 'dataSource',
            data: {
                name: data.type,
                content: file.name,
                flow_id: flowId,
                prompt: 'Research Assistant',
                file: file,
                component_id: data.component_id,
                source_document_id: sourceRecord.id,
                source_document: sourceRecord.metadata,
                document_chunks: sourceRecord.chunks,
                source_segments: sourceRecord.segments
            }
        };
        const nextNodes = nodes.length === 0 ? [node] : [...nodes, node];
        if (nodes.length === 0) {
            setNodes(nextNodes);
        } else {
            setNodes(nextNodes);
        }
        void stageUploadedSourceReconciliationPreview({
            sourceRecord,
            nodes: nextNodes
        });

        setTrigger(!trigger);
        popNode();
    };

    const handleFileUpload = (e) => {
        setFile(e.target.files[0]);
    };

    const handleChange = (e) => {
        setProcessingType(e.target.value);
    };

    return (
        <div className="modal-container">
            <div className="title">
                <div>
                    <img
                        src={PDFSvg}
                        alt="SQL SVG"
                    />
                    <p>Load A Text File</p>
                </div>
                <img
                    src={CROSSSvg}
                    alt="Cross Svg"
                    onClick={(e) => popNode()}
                />
            </div>
            <div className="data-source-input">
                <label
                    htmlFor="filesUp"
                    className="data-source-set"
                >
                    <div>
                        <img
                            src={PDFSvg}
                            alt="image will be here"
                        />
                        {/* <p>Upload a CSV</p> */}
                        {file ? <p>{file.name}</p> : <p>Upload a Text File</p>}
                    </div>
                    <img
                        src={RIGHTArrow}
                        alt={'RIght arrow'}
                    />
                </label>
                <input
                    id="filesUp"
                    type="file"
                    accept={textAccept}
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileUpload(e)}
                />
            </div>
            <div className="buttons">
                <button
                    id="cancel"
                    onClick={(e) => pushNode(DataSourceSelect)}
                >
                    Back
                </button>
                {/* <button id="add" onClick={(e) => addDataSource(e)}>Add</button> */}

                {file ? (
                    <button
                        id="add"
                        style={{ opacity: '100%' }}
                        onClick={(e) => addDataSource(e)}
                    >
                        Add
                    </button>
                ) : (
                    <button
                        id="add"
                        style={{ opacity: '40%' }}
                        disabled
                    >
                        Add
                    </button>
                )}
            </div>
        </div>
    );
};

export default TextModal;
