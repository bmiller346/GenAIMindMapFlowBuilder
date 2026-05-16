import WEBSvg from "../assets/web.svg";
import { useState } from "react";
import useStore from "../stores/store";
import { useShallow } from "zustand/shallow";
import modalStore from "../stores/modalStore";
import { nanoid } from "nanoid";
import CROSSSvg from "../assets/cross.svg";
import InputBar from "../helpful-components/InputBar";
import flowStore from "../stores/flowStore";
import generateHexId from "../utils/setUpHex";
import LoadingModal from "./LoadingModal";
import setRequestData from "../config/setRequestData";
import axios from "axios";
import DataSourceSelect from "../global-components/DataSourceSelect";
import errorStore from "../stores/errorStore";
import ErrorModal from "./ErrorModal";
import DELETESvg from '../assets/delete.svg';
import { useReactFlow } from '@xyflow/react';
import { sourceUploadLoading } from '../config/loadingStates';
import useActivityStore from '../stores/activityStore';
import { isCanceledRequest, requestErrorMessage } from '../utils/requestErrors';
import {
    createSourceUndoHandler,
    createSourceUndoSnapshot
} from '../utils/sourceOperationActivity';
import {
    sourceRecordFromUpload,
    uploadHasGraphDraft,
    stageUploadedSourceReconciliationPreview
} from '../utils/sourceReconciliationPreview';
import { handleGeneratedSourceGraph } from '../utils/generatedSourceGraph';
const WEBModal = () => {
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
	const pushNode = modalStore((s) => s.pushNode)
	const flowId = flowStore((s) => s.flow_id)
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
	const [url, setUrl] = useState("");
	const popNode = modalStore((s) => s.popNode);

	const setFlowId = flowStore((s) => s.setFlow);
    const flow_id = flowStore((s) => s.flow_id);
    const setFlowName = flowStore((s) => s.setFlowName);
    const { fitView, setViewport } = useReactFlow();
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
			title: 'Adding web source',
			detail: url,
			context: 'Reading a web page and deriving workspace structure.'
		});
		const data = {
			content: url,
			operationId
		}
		pushNode(LoadingModal, {
			...sourceUploadLoading('web page', url),
			operationId,
			onCancel: () => {
				controller.abort();
				updateActivity(activityId, {
					status: 'canceled',
					context: 'Web source request was canceled.'
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
			context: 'Web source add was undone.'
		});
		const [url_hit, body, headerConfig] = setRequestData("web", flowId, data);
		axios.post(`http://localhost:8000/${url_hit}`, body, {
			headers: {
				'Content-Type': headerConfig
			},
			signal: controller.signal
		}).then((res) => {
			updateActivity(activityId, {
				status: 'completed',
				context: 'Web source was added to the workspace.',
				undo: undoSourceAdd
			});
			setupNodes(res.data)
		})
			.catch((err) => {
				if (isCanceledRequest(err)) {
					return;
				}
				updateActivity(activityId, {
					status: 'failed',
					context: requestErrorMessage(err)
				});
				manageErrors(err)
			})
	}

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
            sourceInput: { content: url },
            fallbackType: 'web',
            fallbackTypeLabel: 'Web',
            fallbackTitle: url,
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
	})
	const { status, message, setStatus, setMsg } = errorStore(useShallow(selector2))

	const manageErrors = (err) => {
		setStatus(err.response?.status || err.status || 500)
		setMsg(requestErrorMessage(err))
		popNode()
		pushNode(ErrorModal)
	}

	const manageNodes = (data) => {
		const sourceRecord = sourceRecordFromUpload(data, { content: url }, flowId, {
			fallbackType: 'web',
			fallbackTypeLabel: 'Web',
			fallbackTitle: url
		});
		const node = {
            id: data.component_id,
            position: { x: 0, y: 0 },
            type: 'dataSource',
            data: {
                name: data.type,
                content: url,
                flow_id: flowId,
                prompt: 'Research Assistant',
                component_id: data.component_id,
                source_document_id: sourceRecord.id,
                source_document: sourceRecord.metadata,
                document_chunks: sourceRecord.chunks,
                source_segments: sourceRecord.segments
            }
        };
		const nextNodes = nodes.length === 0 ? [node] : [...nodes, node]
		if (nodes.length === 0) {
			setNodes(nextNodes);
		} else {
			setNodes(nextNodes)
		}
		void stageUploadedSourceReconciliationPreview({
			sourceRecord,
			nodes: nextNodes
		});
		setTrigger(!trigger)
		popNode()
	}
	return (
        <div className="modal-container">
            <div className="title">
                <div>
                    <img
                        src={WEBSvg}
                        alt="SQL SVG"
                    />
                    <p>Connect Web</p>
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
                    label: 'Enter URL',
                    placeholder: 'https://en.wikipedia.org/wiki/Main_Page',
                    setTableName: setUrl
                }}
            />
            <div className="buttons">
                <button
                    id="cancel"
                    onClick={(e) => pushNode(DataSourceSelect)}
                >
                    Back
                </button>
                {/* <button id="add" style={url ? {opacity: '100%'} : {opacity: '40%'}} onClick={(e) => addDataSource(e)}>Add</button> */}

                {url ? (
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

}

export default WEBModal
