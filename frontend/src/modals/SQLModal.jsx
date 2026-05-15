import SQLSvg from '../assets/sql.svg';
import CROSSSvg from '../assets/cross.svg';
import InputBar from '../helpful-components/InputBar';
import { nanoid } from 'nanoid';
import { useState } from 'react';
import useStore from '../stores/store';
import { useShallow } from 'zustand/shallow';
import modalStore from '../stores/modalStore';
import { useReactFlow } from '@xyflow/react';
import LoadingModal from './LoadingModal';
import setRequestData from '../config/setRequestData';
import axios from 'axios';
import flowStore from '../stores/flowStore';
import DataSourceSelect from '../global-components/DataSourceSelect';
import errorStore from '../stores/errorStore';
import ErrorModal from './ErrorModal';
import { structuredSourceLoading } from '../config/loadingStates';
import useActivityStore from '../stores/activityStore';
import { isCanceledRequest, requestErrorMessage } from '../utils/requestErrors';
import {
    createSourceUndoHandler,
    createSourceUndoSnapshot
} from '../utils/sourceOperationActivity';
import {
    sourceRecordFromUpload,
    stageUploadedSourceReconciliationPreview
} from '../utils/sourceReconciliationPreview';
const SQLModal = () => {
    const selector = (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        setNodes: state.setNodes,
        setEdges: state.setEdges,
        trigger: state.trigger,
        setTrigger: state.setTrigger,
        setViewPort: state.setViewPort,
        workspaceBrief: state.workspaceBrief,
        setWorkspaceBrief: state.setWorkspaceBrief,
        viewport: state.viewport
    });
    const {
        nodes,
        edges,
        setNodes,
        setEdges,
        trigger,
        setTrigger,
        setViewPort,
        workspaceBrief,
        setWorkspaceBrief,
        viewport
    } = useStore(
        useShallow(selector)
    );
    const [tableName, setTableName] = useState('');
    const pushNode = modalStore((s) => s.pushNode);
    const popNode = modalStore((s) => s.popNode);
    const flowId = flowStore((s) => s.flow_id);
    const { setViewport } = useReactFlow();
    const addActivity = useActivityStore((s) => s.addActivity);
    const updateActivity = useActivityStore((s) => s.updateActivity);
    const addDataSource = (e) => {
        const operationId = nanoid();
        const controller = new AbortController();
        const undoSnapshot = createSourceUndoSnapshot({
            nodes,
            edges,
            viewport,
            workspaceBrief
        });
        const activityId = addActivity({
            title: 'Connecting SQL source',
            detail: tableName,
            context: 'Reading schema, training query context, and adding a source node.'
        });
        const data = {
            content: tableName,
            operationId
        };
        pushNode(LoadingModal, {
            ...structuredSourceLoading('SQL', tableName),
            operationId,
            onCancel: () => {
                controller.abort();
                updateActivity(activityId, {
                    status: 'canceled',
                    context: 'SQL source connection request was canceled.'
                });
                popNode();
            }
        });
        const undoSourceAdd = createSourceUndoHandler({
            activityId,
            snapshot: undoSnapshot,
            updateActivity,
            setNodes,
            setEdges,
            setWorkspaceBrief,
            setViewPort,
            setViewport,
            context: 'SQL source add was undone.'
        });
        const [url, body, headerConfig] = setRequestData('sql', flowId, data);
        console.log('Testtttttt', url, body, headerConfig);
        axios
            .post(`http://localhost:8000/${url}`, body, {
                headers: {
                    'Content-Type': headerConfig
                },
                signal: controller.signal
            })
            .then((res) => {
                updateActivity(activityId, {
                    status: 'completed',
                    context: 'SQL source was added to the workspace.',
                    undo: undoSourceAdd
                });
                manageNodes(res.data);
            })
            .catch((err) => {
                if (isCanceledRequest(err)) {
                    return;
                }
                updateActivity(activityId, {
                    status: 'failed',
                    context: requestErrorMessage(err)
                });
                manageErrors(err);
            });
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
        setStatus(err.status);
        setMsg(requestErrorMessage(err));
        popNode();
        pushNode(ErrorModal);
    };

    const manageNodes = (data) => {
        console.log('Problem is here', nodes);
        const sourceRecord = sourceRecordFromUpload(data, { content: tableName }, flowId, {
            fallbackType: 'sql',
            fallbackTypeLabel: 'SQL',
            fallbackTitle: tableName
        });
        const node = {
            id: data.component_id,
            position: { x: 0, y: 0 },
            type: 'dataSource',
            data: {
                name: data.type,
                content: tableName,
                flow_id: flowId,
                prompt: 'Research Assistant',
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
        console.log('Managing nodes finished');
    };

    return (
        <div className="modal-container">
            <div className="title">
                <div>
                    <img
                        src={SQLSvg}
                        alt="SQL SVG"
                    />
                    <p>Connect SQL</p>
                </div>
                <img
                    src={CROSSSvg}
                    alt="Cross Svg"
                    onClick={(e) => popNode()}
                />
            </div>
            <InputBar
                data={{
                    type: 'text',
                    label: 'Enter Table Name*',
                    placeholder: 'Positions',
                    setTableName: setTableName
                }}
            />
            <div className="buttons">
                <button
                    id="cancel"
                    onClick={(e) => pushNode(DataSourceSelect)}
                >
                    Back
                </button>
                {tableName ? (
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

export default SQLModal;
