import CSVSvg from "../assets/csv.svg"
import CROSSSvg from "../assets/cross.svg"
import RIGHTArrow from "../assets/right.svg"
import { useState } from "react"
import InputBar from "../helpful-components/InputBar"
import { nanoid } from "nanoid"
import useStore from "../stores/store"
import { useShallow } from "zustand/shallow"
import modalStore from "../stores/modalStore"
import { useReactFlow } from "@xyflow/react"
import axios from "axios"
import LoadingModal from "./LoadingModal"
import setRequestData from "../config/setRequestData"
import flowStore from "../stores/flowStore"
import DataSourceSet from "../nodes/DataSourceSet"
import DataSourceSelect from "../global-components/DataSourceSelect"
import ErrorModal from "./ErrorModal"
import errorStore from "../stores/errorStore"
import { sourceUploadLoading } from "../config/loadingStates"
import useActivityStore from "../stores/activityStore"
import { isCanceledRequest, requestErrorMessage } from "../utils/requestErrors"
import {
	createSourceUndoHandler,
	createSourceUndoSnapshot
} from "../utils/sourceOperationActivity"
import {
	sourceRecordFromUpload,
	stageUploadedSourceReconciliationPreview
} from "../utils/sourceReconciliationPreview"

const CSVModal = () => {
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
	})
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
	const [header_row, setHeaderRow] = useState()
	const [file, setFile] = useState();
	const pushNode = modalStore((s) => s.pushNode);
	const popNode = modalStore((s) => s.popNode);
	const { setViewport } = useReactFlow();
	const addActivity = useActivityStore((s) => s.addActivity);
	const updateActivity = useActivityStore((s) => s.updateActivity);
	const csvAccept = ".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"

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
			title: "Adding CSV source",
			detail: file?.name,
			context: "Uploading the table, reading columns, and preparing query context."
		});
		const data = {
			file: file,
			header_row: header_row,
			operationId
		}
		pushNode(LoadingModal, {
			...sourceUploadLoading("CSV", file?.name),
			operationId,
			onCancel: () => {
				controller.abort();
				updateActivity(activityId, {
					status: "canceled",
					context: "CSV upload request was canceled."
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
			context: "CSV source add was undone."
		});
		const [url, body, headerConfig] = setRequestData("csv", flowId, data);
		axios.post(`http://localhost:8000/${url}`, body, {
			headers: {
				'Content-Type': headerConfig
			},
			signal: controller.signal
		}).then((res) => {
			updateActivity(activityId, {
				status: "completed",
				context: "CSV source was added to the workspace.",
				undo: undoSourceAdd
			});
			manageNodes(res.data)
		})
			.catch((err) => {
				if (isCanceledRequest(err)) {
					return;
				}
				updateActivity(activityId, {
					status: "failed",
					context: requestErrorMessage(err)
				});
				manageErrors(err)
			})

	}

	const selector2 = (state) => ({
		status: state.status,
		message: state.message,
		setStatus: state.setStatus,
		setMsg: state.setMsg
	})
	const { status, message, setStatus, setMsg } = errorStore(useShallow(selector2))

	const manageErrors = (err) => {
		setStatus(err.status)
		setMsg(requestErrorMessage(err))
		popNode()
		pushNode(ErrorModal)
	}

	const manageNodes = (data) => {
		const sourceRecord = sourceRecordFromUpload(data, file, flowId, {
			fallbackType: "csv",
			fallbackTypeLabel: "CSV"
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
                header_row: header_row,
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


	const handleFileUpload = (e) => {
		setFile(e.target.files[0])
	}

	return (
		<div className="modal-container">
			<div className="title">
				<div>
					<img src={CSVSvg} alt="SQL SVG" />
					<p>Load A CSV</p>
				</div>
				<img src={CROSSSvg} alt="Cross Svg" onClick={(e) => popNode()} />
			</div>
			<div className="data-source-input">
				<label htmlFor="filesUp" className="data-source-set" >
					<div>
						<img src={CSVSvg} alt="image will be here" />
						{/* <p>Upload a CSV</p> */}
						{file ? <p>{file.name}</p> : <p>Upload a CSV</p>}
					</div>
					<img src={RIGHTArrow} alt={"RIght arrow"} />
				</label>
				<input id="filesUp" type="file" accept={csvAccept} style={{ "display": "none" }} onChange={(e) => handleFileUpload(e)} />
			</div>
			<InputBar data={{ type: "number", label: "Enter Column Row", placeholder: "eg: 1", setTableName: setHeaderRow }} />
			<div className="buttons">
				<button id="cancel" onClick={(e) => pushNode(DataSourceSelect)}>Back</button>
				{/* <button id="add" onClick={(e) => addDataSource(e)}>Add</button> */}

				{(file && header_row) ?
					<button id="add" style={{ opacity: '100%' }} onClick={(e) => addDataSource(e)}>Add</button>
					:
					<button id="add" style={{ opacity: '40%' }} disabled>Add</button>
				}
			</div>
		</div>
	)
}

export default CSVModal
