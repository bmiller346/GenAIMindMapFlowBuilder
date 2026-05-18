import CROSSSvg from '../assets/cross.svg';
import RIGHTArrow from '../assets/right.svg';
import DRAWERSvg from '../assets/drawer.svg';
import { useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { useShallow } from 'zustand/shallow';
import axios from 'axios';
import DataSourceSelect from '../global-components/DataSourceSelect';
import ErrorModal from './ErrorModal';
import LoadingModal from './LoadingModal';
import errorStore from '../stores/errorStore';
import flowStore from '../stores/flowStore';
import modalStore from '../stores/modalStore';
import useActivityStore from '../stores/activityStore';
import useStore from '../stores/store';
import { sourceUploadLoading } from '../config/loadingStates';
import setRequestData from '../config/setRequestData';
import {
    createFlowSnapshot,
    stringifyFlowSnapshot
} from '../utils/flowSnapshots';
import { isCanceledRequest, requestErrorMessage } from '../utils/requestErrors';
import {
    stageUploadedSourcesReconciliationPreview,
    upsertSource
} from '../utils/sourceReconciliationPreview';
import {
    appendSourceSetFormData,
    classifySourceSetSelection,
    normalizeSourceSetUploadResult,
    selectedSourceSetFiles,
    skippedSourceSetFilesFromResponse,
    sourceSetNodesFromRecords
} from '../utils/sourceSetUpload';

const SourceSetModal = ({
    sourcePickerMode = 'workspace_intake',
    returnModal,
    returnProps = {}
}) => {
    const fileInputRef = useRef(null);
    const folderInputRef = useRef(null);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const setFlowId = flowStore((s) => s.setFlow);
    const setFlowName = flowStore((s) => s.setFlowName);
    const flowName = flowStore((s) => s.flow_name);
    const flowType = flowStore((s) => s.flow_type);
    const setFlowType = flowStore((s) => s.setFlowType);
    const setSavedSnapshot = flowStore((s) => s.setSavedSnapshot);
    const setSaveStatus = flowStore((s) => s.setSaveStatus);
    const pushNode = modalStore((s) => s.pushNode);
    const popNode = modalStore((s) => s.popNode);
    const addActivity = useActivityStore((s) => s.addActivity);
    const updateActivity = useActivityStore((s) => s.updateActivity);
    const {
        trigger,
        setTrigger,
        nodes,
        edges,
        setNodes,
        workspaceBrief,
        viewport,
        sourceLibrary,
        setSourceLibrary,
        setActiveView
    } = useStore(
        useShallow((state) => ({
            trigger: state.trigger,
            setTrigger: state.setTrigger,
            nodes: state.nodes,
            edges: state.edges,
            setNodes: state.setNodes,
            workspaceBrief: state.workspaceBrief,
            viewport: state.viewport,
            sourceLibrary: state.sourceLibrary,
            setSourceLibrary: state.setSourceLibrary,
            setActiveView: state.setActiveView
        }))
    );
    const { setStatus, setMsg } = errorStore(
        useShallow((state) => ({
            setStatus: state.setStatus,
            setMsg: state.setMsg
        }))
    );
    const isAskAIContextMode = sourcePickerMode === 'ask_ai_context';
    const selectedCount = selectedFiles.length;
    const selectedSize = selectedFiles.reduce(
        (total, entry) => total + Number(entry.file?.size || 0),
        0
    );
    const selectionProfile = classifySourceSetSelection(selectedFiles);
    const samplePaths = selectedFiles.slice(0, 8);

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
                summary: 'Workspace created for source-set review',
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

    const showError = (statusCode, message) => {
        setStatus(statusCode);
        setMsg(message);
        pushNode(ErrorModal);
    };

    const manageErrors = (err) => {
        setStatus(err.response?.status || err.status || 500);
        setMsg(requestErrorMessage(err));
        popNode();
        pushNode(ErrorModal);
    };

    const handleSelection = (event) => {
        setSelectedFiles(selectedSourceSetFiles(event.target.files));
        event.target.value = '';
    };

    const applyUploadedSources = (data, currentFlowId) => {
        const records = normalizeSourceSetUploadResult({
            data,
            selectedFiles,
            flowId: currentFlowId
        });
        const uploadedNodes = sourceSetNodesFromRecords(records, currentFlowId);
        const existingNodeIds = new Set(nodes.map((node) => node.id));
        const nextNodes = [
            ...nodes,
            ...uploadedNodes.filter((node) => !existingNodeIds.has(node.id))
        ];
        const nextLibrary = records.reduce(
            (library, record) => upsertSource(library, record),
            sourceLibrary
        );

        setSourceLibrary(nextLibrary);
        setNodes(nextNodes);
        setTrigger(!trigger);
        setSaveStatus('dirty');

        if (isAskAIContextMode) {
            const pickerReturnProps =
                returnModal === DataSourceSelect && returnProps?.mode === 'ask_ai_context'
                    ? returnProps
                    : {
                          mode: sourcePickerMode,
                          returnModal,
                          returnProps
                      };
            const nextSelectedSourceIds = Array.from(
                new Set([
                    ...(Array.isArray(pickerReturnProps.selectedSourceIds)
                        ? pickerReturnProps.selectedSourceIds
                        : []),
                    ...records.map((record) => record.id)
                ].filter(Boolean))
            );
            pushNode(DataSourceSelect, {
                ...pickerReturnProps,
                mode: 'ask_ai_context',
                selectedSourceIds: nextSelectedSourceIds,
                uploadedSourceId: records[0]?.id || '',
                initialContextSourceIds: nextSelectedSourceIds,
                initialContextSourceId: records[0]?.id || ''
            });
            return records;
        }

        setActiveView('sources');
        popNode();
        return records;
    };

    const uploadSourceSet = async () => {
        if (!selectedFiles.length) {
            showError(400, 'Choose a folder or select multiple files before uploading.');
            return;
        }
        if (!selectionProfile.supportedCount) {
            showError(400, 'This folder has no source-traceable files. Add PDF, DOCX, Markdown, or TXT files.');
            return;
        }

        let currentFlowId;
        try {
            currentFlowId = await ensureWorkspace();
        } catch (err) {
            showError(err.response?.status || err.status || 500, requestErrorMessage(err));
            return;
        }

        const operationId = nanoid();
        const controller = new AbortController();
        const activityId = addActivity({
            type: 'source_set_upload_started',
            title: 'Adding source set',
            detail: `${selectedFiles.length} files`,
            context: 'Uploading files and preserving folder-relative paths for review.'
        });
        const [url] = setRequestData('source_set', currentFlowId, {
            operationId,
            sourceIntent: isAskAIContextMode ? 'context' : 'source_set_review'
        });
        const body = appendSourceSetFormData(new FormData(), {
            files: selectedFiles,
            flowId: currentFlowId,
            operationId,
            sourceIntent: isAskAIContextMode ? 'context' : 'source_set_review'
        });

        pushNode(LoadingModal, {
            ...sourceUploadLoading('source set', `${selectedFiles.length} files`),
            operationId,
            onCancel: () => {
                controller.abort();
                updateActivity(activityId, {
                    type: 'source_set_upload_canceled',
                    status: 'canceled',
                    context: 'Source-set upload request was canceled.'
                });
                popNode();
            }
        });

        axios
            .post(`http://localhost:8000/${url}`, body, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                signal: controller.signal
            })
            .then(async (res) => {
                const records = applyUploadedSources(res.data, currentFlowId);
                if (!isAskAIContextMode) {
                    await stageUploadedSourcesReconciliationPreview({
                        sources: records,
                        flowId: currentFlowId,
                        nodes
                    });
                }
                const skippedSources = skippedSourceSetFilesFromResponse(res.data);
                updateActivity(activityId, {
                    type: 'source_set_upload_completed',
                    status: 'completed',
                    source_ids: records.map((record) => record.id),
                    context: `${records.length} source-set files were added for review${
                        skippedSources.length ? `; ${skippedSources.length} unsupported or unreadable files were skipped.` : '.'
                    }`
                });
            })
            .catch((err) => {
                if (isCanceledRequest(err)) {
                    return;
                }
                updateActivity(activityId, {
                    type: 'source_set_upload_failed',
                    status: 'failed',
                    context: requestErrorMessage(err)
                });
                manageErrors(err);
            });
    };

    return (
        <div className="modal-container source-set-modal">
            <div className="title">
                <div>
                    <img src={DRAWERSvg} alt="" />
                    <p>Review folder / file set</p>
                </div>
                <img src={CROSSSvg} alt="Cross Svg" onClick={() => popNode()} />
            </div>

            <div className="source-set-picker-actions">
                <button
                    type="button"
                    className="data-source-set"
                    onClick={() => folderInputRef.current?.click()}
                >
                    <div>
                        <img src={DRAWERSvg} alt="" />
                        <span className="data-source-set-copy">
                            <p>Select folder</p>
                            <small>Batch upload supported source files and keep folder paths.</small>
                        </span>
                    </div>
                    <img src={RIGHTArrow} alt="" />
                </button>
                <button
                    type="button"
                    className="data-source-set"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div>
                        <img src={DRAWERSvg} alt="" />
                        <span className="data-source-set-copy">
                            <p>Select files</p>
                            <small>Pick multiple PDF, DOCX, Markdown, or TXT files at once.</small>
                        </span>
                    </div>
                    <img src={RIGHTArrow} alt="" />
                </button>
            </div>

            <input
                ref={folderInputRef}
                type="file"
                multiple
                webkitdirectory=""
                className="file-input-hidden"
                onChange={handleSelection}
            />
            <input
                ref={fileInputRef}
                type="file"
                multiple
                className="file-input-hidden"
                onChange={handleSelection}
            />

            <div className="source-set-selection">
                <div className="source-set-selection-summary">
                    <span>{selectedCount ? `${selectedCount} files selected` : 'No files selected'}</span>
                    <small
                        title="Folder/file-set upload may use AI extraction depending on file type and downstream review action. Code intelligence scans are deterministic and should remain a separate developer-only path."
                    >
                        {selectedSize
                            ? `${Math.ceil(selectedSize / 1024)} KB total. Review actions may use AI depending on file type.`
                            : 'Choose a folder or file set to review. Review actions may use AI depending on file type.'}
                    </small>
                </div>
                {selectedCount ? (
                    <div className="source-set-intake-profile">
                        <span
                            title="These files enter the source-traceable pipeline and preserve document chunks/source references."
                        >
                            {selectionProfile.supportedCount} source-traceable
                        </span>
                        <span
                            title="Unsupported files are skipped instead of failing the whole folder. Current folder review supports PDF, DOCX, Markdown, and TXT."
                        >
                            {selectionProfile.unsupportedCount} skipped
                        </span>
                    </div>
                ) : null}
                <div className="source-set-help-panel">
                    <strong>
                        {isAskAIContextMode
                            ? 'Adds multiple source documents to Ask AI context'
                            : 'Builds a source-traceable review set'}
                    </strong>
                    <span>
                        This is the multi-source upload path. It supports PDF, DOCX, Markdown,
                        and TXT; folder paths are preserved so related files stay recognizable
                        after upload.
                    </span>
                    <small>
                        {selectionProfile.unsupportedCount
                            ? `${selectionProfile.unsupportedCount} unsupported file${selectionProfile.unsupportedCount === 1 ? '' : 's'} will be skipped.`
                            : 'AI-draft formats such as PPTX, HTML, media, and web links stay single-source for clearer review.'}
                    </small>
                </div>
                {samplePaths.length ? (
                    <div className="source-set-path-list" aria-label="Selected relative paths">
                        {samplePaths.map((entry) => (
                            <code key={entry.relativePath}>{entry.relativePath}</code>
                        ))}
                        {selectedFiles.length > samplePaths.length ? (
                            <span>+{selectedFiles.length - samplePaths.length} more</span>
                        ) : null}
                    </div>
                ) : null}
            </div>

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
                <button
                    id="add"
                    style={{ opacity: selectionProfile.supportedCount ? '100%' : '40%' }}
                    disabled={!selectionProfile.supportedCount}
                    onClick={uploadSourceSet}
                >
                    Add
                </button>
            </div>
        </div>
    );
};

export default SourceSetModal;
