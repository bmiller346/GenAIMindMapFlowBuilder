import MDSvg from '../assets/md.svg';
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
    uploadHasGraphDraft,
    stageUploadedSourceReconciliationPreview
} from '../utils/sourceReconciliationPreview';
import { handleGeneratedSourceGraph } from '../utils/generatedSourceGraph';

const MDModal = () => {
    const flowId = flowStore((s) => s.flow_id);
    const [file, setFile] = useState();
    const pushNode = modalStore((s) => s.pushNode);
    const popNode = modalStore((s) => s.popNode);
    const addActivity = useActivityStore((s) => s.addActivity);
    const updateActivity = useActivityStore((s) => s.updateActivity);
    // const csvAccept = ".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
    const markdownAccept = '.md,.markdown,text/markdown,text/x-markdown';
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
            title: 'Adding Markdown source',
            detail: file?.name,
            context: 'Uploading, extracting text, and deriving workspace structure.'
        });
        pushNode(LoadingModal, {
            ...sourceUploadLoading('Markdown', file?.name),
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
                context: 'Markdown source add was undone.',
                undo: undefined
            });
        };
        const [url, body, headerConfig] = setRequestData('md', flowId, data);
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
                    context: 'Markdown source was added to the workspace.',
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
        if (uploadHasGraphDraft(data) || data.flow_type === 'automatic') {
            manageAutomaticNode(data)
        } else {
            manageNodes(data)
        }
    }

    const manageAutomaticNode = (data) => {
        setupFlow(data)
    }
    const setupFlow = (data) => {
        const handled = handleGeneratedSourceGraph({
            uploadData: data,
            sourceInput: file,
            fallbackType: 'md',
            fallbackTypeLabel: 'Markdown',
            popNode,
            fitView
        });
        if (!handled) {
            fitView();
            popNode();
        }
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
            fallbackType: 'md',
            fallbackTypeLabel: 'Markdown'
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
                        src={MDSvg}
                        alt="SQL SVG"
                    />
                    <p>Load A Markdown</p>
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
                            src={MDSvg}
                            alt="image will be here"
                        />
                        {/* <p>Upload a CSV</p> */}
                        {file ? <p>{file.name}</p> : <p>Upload a Markdown File</p>}
                    </div>
                    <img
                        src={RIGHTArrow}
                        alt={'RIght arrow'}
                    />
                </label>
                <input
                    id="filesUp"
                    type="file"
                    accept={markdownAccept}
                    className="file-input-hidden"
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

export default MDModal;
