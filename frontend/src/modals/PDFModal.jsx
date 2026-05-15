import PDFSvg from '../assets/pdf.svg';
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
    createFlowSnapshot,
    stringifyFlowSnapshot
} from '../utils/flowSnapshots';

const parseMindmapJson = (mindmapJson) => {
    if (!mindmapJson) {
        return {};
    }
    if (typeof mindmapJson === 'string') {
        try {
            return JSON.parse(mindmapJson);
        } catch (error) {
            return {};
        }
    }
    return mindmapJson;
};

const hasGraphDraft = (data) => {
    const flow = parseMindmapJson(data?.mindmap_json);
    return (flow.nodes || []).length > 0 || (flow.edges || []).length > 0;
};

const sourceRecordFromUpload = (data, file, flowId) => {
    const flow = parseMindmapJson(data?.mindmap_json);
    const sourceLibrary = Array.isArray(flow.source_library) ? flow.source_library : [];
    const fromGraph =
        sourceLibrary.find((source) => source.component_id === data.component_id) ||
        sourceLibrary.find((source) => source.title === file?.name) ||
        sourceLibrary[0] ||
        {};

    return {
        id:
            fromGraph.id ||
            data.normalized_document_id ||
            data.source_document_id ||
            data.document_id ||
            data.component_id ||
            file?.name ||
            nanoid(),
        title: fromGraph.title || file?.name || data.filename || 'PDF source',
        type: fromGraph.type || data.type || 'pdf',
        type_label: fromGraph.type_label || 'PDF',
        status: fromGraph.status || 'parsed',
        node_id: fromGraph.node_id || '',
        component_id: fromGraph.component_id || data.component_id || '',
        flow_id: fromGraph.flow_id || data.flow_id || flowId || '',
        file_hash: fromGraph.file_hash || data.file_hash || '',
        size: fromGraph.size || file?.size || 0,
        version: fromGraph.version || '',
        metadata: {
            ...(fromGraph.metadata || {}),
            original_filename: file?.name || fromGraph.title || data.filename || ''
        },
        chunks: Array.isArray(fromGraph.chunks) ? fromGraph.chunks : [],
        segments: Array.isArray(fromGraph.segments) ? fromGraph.segments : [],
        normalized_document_id:
            fromGraph.normalized_document_id ||
            data.normalized_document_id ||
            data.source_document_id ||
            ''
    };
};

const upsertSource = (sources = [], source = {}) => {
    if (!source.id) {
        return sources;
    }
    const existingIndex = sources.findIndex((item) => item.id === source.id);
    if (existingIndex < 0) {
        return [...sources, source];
    }
    return sources.map((item, index) => (index === existingIndex ? { ...item, ...source } : item));
};

const PDFModal = ({
    sourcePickerMode = 'workspace_intake',
    returnModal,
    returnProps = {}
}) => {
    const flowId = flowStore((s) => s.flow_id);
    const [file, setFile] = useState();
    const pushNode = modalStore((s) => s.pushNode);
    const popNode = modalStore((s) => s.popNode);
    const addActivity = useActivityStore((s) => s.addActivity);
    const updateActivity = useActivityStore((s) => s.updateActivity);
    // const csvAccept = ".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
    const markdownAccept = 'text/markdown';
    const setFlowId = flowStore((s) => s.setFlow);
    const flow_id = flowStore((s) => s.flow_id);
    const setFlowName = flowStore((s) => s.setFlowName);
    const flowName = flowStore((s) => s.flow_name);
    const flowType = flowStore((s) => s.flow_type);
    const setFlowType = flowStore((s) => s.setFlowType);
    const setSavedSnapshot = flowStore((s) => s.setSavedSnapshot);
    const setSaveStatus = flowStore((s) => s.setSaveStatus);
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
        viewport: state.viewport,
        sourceLibrary: state.sourceLibrary,
        setSourceLibrary: state.setSourceLibrary
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
        viewport,
        sourceLibrary,
        setSourceLibrary
    } = useStore(useShallow(selector));
    const pdfAccept = '.pdf,application/pdf';
    const [processingType, setProcessingType] = useState('gpt');
    const isAskAIContextMode = sourcePickerMode === 'ask_ai_context';

    const ensureWorkspace = async () => {
        const currentFlow = flowStore.getState();
        if (currentFlow.flow_id && currentFlow.flow_id !== 'undefined') {
            return currentFlow.flow_id;
        }

        const snapshot = createFlowSnapshot({
            nodes,
            edges,
            viewport,
            workspaceBrief
        });
        const nextFlowName = currentFlow.flow_name || flowName || 'Untitled workspace';
        const nextFlowType = currentFlow.flow_type || flowType || 'manual';
        const response = await axios.post(
            'http://localhost:8000/create-flow',
            {
                flow_name: nextFlowName,
                summary: 'Workspace created for source upload',
                flow_json: stringifyFlowSnapshot(snapshot),
                flow_type: nextFlowType
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        setFlowId(response.data.flow_id);
        setFlowName(response.data.flow_name || nextFlowName);
        setFlowType(response.data.flow_type || nextFlowType);
        setSavedSnapshot(
            snapshot,
            stringifyFlowSnapshot(snapshot),
            response.data.flow_name || nextFlowName,
            response.data.flow_type || nextFlowType
        );

        return response.data.flow_id;
    };

    const addDataSource = async (e) => {
        if (!file) {
            showError(400, 'Choose a PDF file before uploading.');
            return;
        }

        let currentFlowId;
        try {
            currentFlowId = await ensureWorkspace();
        } catch (err) {
            showError(
                err.response?.status || err.status || 500,
                requestErrorMessage(err)
            );
            return;
        }

        const operationId = nanoid();
        const data = {
            file: file,
            processing_type: processingType,
            sourceIntent: isAskAIContextMode ? 'context' : 'mindmap',
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
            title: 'Adding PDF source',
            detail: file?.name,
            context: 'Uploading, extracting text, and deriving workspace structure.'
        });
        pushNode(LoadingModal, {
            ...sourceUploadLoading('PDF', file?.name),
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
                context: 'PDF source add was undone.',
                undo: undefined
            });
        };
        const [url, body, headerConfig] = setRequestData('pdf', currentFlowId, data);
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
                    context: isAskAIContextMode
                        ? 'PDF source was attached to Ask AI context.'
                        : 'PDF source was added to the workspace.',
                    source_ids: [file?.name],
                    undo: isAskAIContextMode ? undefined : undoSourceAdd
                });
                if (isAskAIContextMode) {
                    attachSourceToAskAI(res.data, currentFlowId);
                } else {
                    setupNodes(res.data);
                }
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
        if (hasGraphDraft(data) || data.flow_type === 'automatic') {
            manageAutomaticNode(data)
        } else {
            manageNodes(data)
        }
    }

    const attachSourceToAskAI = (data, currentFlowId) => {
        const uploadedSource = sourceRecordFromUpload(data, file, currentFlowId);
        const nextSelectedSourceIds = Array.from(
            new Set([
                ...(Array.isArray(returnProps.selectedSourceIds)
                    ? returnProps.selectedSourceIds
                    : []),
                uploadedSource.id
            ].filter(Boolean))
        );
        setSourceLibrary(upsertSource(sourceLibrary, uploadedSource));
        setSaveStatus('dirty');
        pushNode(returnModal || DataSourceSelect, returnModal
            ? {
                  ...returnProps,
                  selectedSourceIds: nextSelectedSourceIds,
                  uploadedSourceId: uploadedSource.id,
                  initialContextSourceIds: nextSelectedSourceIds,
                  initialContextSourceId: uploadedSource.id
              }
            : {});
    };

    const manageAutomaticNode = (data) => {
        setupFlow(data)
    }
    const setupFlow = (data) => {
        console.log("SETUUUUUUUUUUUUUUUUUUP new flow")
        setFlowId(data.flow_id);
        console.log('DEDEDE', data);
        setFlowName(data.flow_name);
        const flow = parseMindmapJson(data.mindmap_json);
        const jsonString = JSON.stringify(flow)
        console.log(jsonString, "JSON STRINGGGGGGGGGGGGGG")
        if (Object.keys(flow || {}).length > 0) {
            console.log('NODEEEEEEEEEE', flow.nodes);
            if ((flow.nodes || []).length === 0 && (flow.edges || []).length === 0) {
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

    function showError(statusCode, message) {
        setStatus(statusCode);
        setMsg(message);
        pushNode(ErrorModal);
    }

    const manageNodes = (data) => {
        const sourceRecord = sourceRecordFromUpload(data, file, flowStore.getState().flow_id || flowId);
        const node = {
            id: data.component_id,
            position: { x: 0, y: 0 },
            type: 'dataSource',
            data: {
                name: data.type,
                content: file.name,
                flow_id: flowStore.getState().flow_id || flowId,
                prompt: 'Research Assistant',
                file: file,
                processing_type: processingType,
                component_id: data.component_id,
                source_document_id: sourceRecord.id,
                source_document: sourceRecord.metadata,
                document_chunks: sourceRecord.chunks,
                source_segments: sourceRecord.segments
            }
        };
        setSourceLibrary(upsertSource(sourceLibrary, sourceRecord));
        if (nodes.length === 0) {
            setNodes([node]);
        } else {
            const newArr = [...nodes, node];
            setNodes(newArr);
        }

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
                    <p>Load A Pdf</p>
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
                        {file ? <p>{file.name}</p> : <p>Upload a PDF</p>}
                    </div>
                    <img
                        src={RIGHTArrow}
                        alt={'RIght arrow'}
                    />
                </label>
                <input
                    id="filesUp"
                    type="file"
                    accept={pdfAccept}
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileUpload(e)}
                />
            </div>
            {/* <InputBar data={{ type: "number", label: "Enter Column Row", placeholder: "eg: 1", setTableName: setHeaderRow }} /> */}
            <select
                value={processingType}
                onChange={handleChange}
            >
                <option value="">Select...</option>
                <option value="gpt">OpenAI</option>
                <option value="aws">AWS Textract</option>
                <option value="custom">Custom RAG</option>
            </select>
            <div className="buttons">
                <button
                    id="cancel"
                    onClick={() =>
                        pushNode(DataSourceSelect, {
                            mode: sourcePickerMode,
                            returnModal,
                            returnProps
                        })
                    }
                >
                    Back
                </button>
                {/* <button id="add" onClick={(e) => addDataSource(e)}>Add</button> */}

                {file && processingType ? (
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

export default PDFModal;
