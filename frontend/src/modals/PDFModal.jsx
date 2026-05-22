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
import {
    parseMindmapJson,
    sourceRecordFromUpload,
    stageUploadedSourceReconciliationPreview,
    uploadHasGraphDraft,
    upsertSource
} from '../utils/sourceReconciliationPreview';
import { handleGeneratedSourceGraph } from '../utils/generatedSourceGraph';

const PDF_PROCESSING_PROFILES = [
    {
        id: 'gpt',
        label: 'OpenAI',
        description: 'Best default for readable PDFs when you want semantic extraction and a reviewable source-backed draft.',
        bestFor: 'Digital PDFs, reports, policies, notes, and mixed narrative documents',
        changes: 'Extracts text and derives source-aware structure using the AI intake pipeline.',
        avoidWhen: 'The PDF is mostly scanned images or needs OCR-grade table/form extraction.'
    },
    {
        id: 'aws',
        label: 'AWS Textract',
        description: 'Use OCR-first extraction for scanned PDFs, forms, tables, and image-heavy pages.',
        bestFor: 'Scanned PDFs, forms, invoices, tables, and documents with weak embedded text',
        changes: 'Prioritizes OCR and layout extraction before the workspace receives source content.',
        avoidWhen: 'The document is already text-readable and you want semantic structure quickly.'
    },
    {
        id: 'custom',
        label: 'Custom RAG',
        description: 'Use the custom retrieval path when you need the document staged for targeted Q&A over broad map generation.',
        bestFor: 'Large reference documents, lookup-heavy use cases, and targeted question answering',
        changes: 'Favors retrieval context over a full generated workspace draft.',
        avoidWhen: 'You want a normal source-backed map or citation reconciliation workflow.'
    }
];

const PDF_INTAKE_PROFILES = [
    {
        id: '',
        label: 'No intake role',
        description: 'Use the selected PDF processor without a specialized interpretation role.',
        bestFor: 'General PDF intake',
        changes: 'Keeps the extraction neutral after the processing engine reads the PDF.',
        avoidWhen: 'You need citations emphasized, strict structure, or decision-oriented synthesis.'
    },
    {
        id: 'document-structure-extractor',
        label: 'Document Structure Extractor',
        description: 'Preserve headings, sections, tables, and hierarchy after PDF extraction.',
        bestFor: 'Policies, procedures, standards, specs, and table-heavy PDFs',
        changes: 'Favors section structure and document organization over broad interpretation.',
        avoidWhen: 'You mainly need recommendations or source coverage signals.'
    },
    {
        id: 'source-librarian',
        label: 'Source Librarian',
        description: 'Prioritize citations, evidence snippets, source refs, and coverage signals.',
        bestFor: 'Ask AI context, reconciliation, audits, evidence review, and citation repair',
        changes: 'Emphasizes traceability and source coverage after the PDF is parsed.',
        avoidWhen: 'You mainly want strategic synthesis from the PDF.'
    },
    {
        id: 'strategic-advisor',
        label: 'Strategic Advisor',
        description: 'Synthesize the PDF into decisions, risks, recommendations, and action themes.',
        bestFor: 'Business cases, reports, planning docs, and leadership review PDFs',
        changes: 'Highlights implications, tradeoffs, risks, owners, and next steps.',
        avoidWhen: 'You need faithful section structure or citation coverage first.'
    },
    {
        id: 'aec-sow-deliverables',
        label: 'AEC SOW Deliverables Planner',
        description: 'Extract disciplines, deliverables, dependencies, timeline cues, risks, missing info, and owner decisions.',
        bestFor: 'AEC SOWs, proposals, BIM/VDC plans, deliverable PDFs, project timelines, and handoff packages',
        changes: 'Builds a delivery-oriented structure with handoff-ready tasks and review flags for monday.com or Miro.',
        avoidWhen: 'You only need faithful document hierarchy or generic citation coverage.'
    },
    {
        id: 'custom',
        label: 'Custom Intake Prompt',
        description: 'Use your optional brief as the intake instructions for this PDF.',
        bestFor: 'Specialized PDF handling with your own instructions',
        changes: 'Uses the optional brief as the primary lens after extraction.',
        avoidWhen: 'A preset already describes the job clearly.'
    }
];

const PDF_INTAKE_MODELS = ['auto', 'gpt-5.4-mini', 'gpt-5.4', 'gpt-5.5'];

const recommendPdfProcessingType = ({ isAskAIContextMode = false, fileName = '' }) => {
    const text = String(fileName || '').toLowerCase();
    if (/\b(scan|scanned|image|ocr|form|invoice|table)\b/.test(text)) {
        return 'aws';
    }
    if (isAskAIContextMode || /\b(reference|rag|lookup|qa|q&a)\b/.test(text)) {
        return 'custom';
    }
    return 'gpt';
};

const recommendPdfIntakeRole = ({ isAskAIContextMode = false, fileName = '', brief = '' }) => {
    const text = `${fileName} ${brief}`.toLowerCase();
    if (brief.trim()) {
        return 'custom';
    }
    if (/\b(aec|architecture|engineering|construction|sow|scope of work|proposal|deliverables?|bim|vdc|revit|discipline|disciplines|coordination|submittal|rfi|milestone|phase|timeline|dependencies|dependency|owner decision|miro|monday)\b/.test(text)) {
        return 'aec-sow-deliverables';
    }
    if (
        isAskAIContextMode ||
        /\b(audit|citation|cite|evidence|reconcile|reference|source|traceability)\b/.test(text)
    ) {
        return 'source-librarian';
    }
    if (/\b(policy|procedure|manual|standard|spec|sop|requirement|table|matrix)\b/.test(text)) {
        return 'document-structure-extractor';
    }
    if (/\b(strategy|business case|roadmap|risk|decision|recommendation|planning|executive)\b/.test(text)) {
        return 'strategic-advisor';
    }
    return '';
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
    const [intakeProfileId, setIntakeProfileId] = useState('');
    const [intakeModel, setIntakeModel] = useState(PDF_INTAKE_MODELS[0]);
    const [intakeBrief, setIntakeBrief] = useState('');
    const isAskAIContextMode = sourcePickerMode === 'ask_ai_context';
    const recommendedProcessingType = recommendPdfProcessingType({
        isAskAIContextMode,
        fileName: file?.name || ''
    });
    const selectedProcessingProfile =
        PDF_PROCESSING_PROFILES.find((profile) => profile.id === processingType) ||
        PDF_PROCESSING_PROFILES[0];
    const recommendedProcessingProfile =
        PDF_PROCESSING_PROFILES.find((profile) => profile.id === recommendedProcessingType) ||
        PDF_PROCESSING_PROFILES[0];
    const isSelectedProcessingRecommended = processingType === recommendedProcessingType;
    const selectedIntakeProfile =
        PDF_INTAKE_PROFILES.find((profile) => profile.id === intakeProfileId) ||
        PDF_INTAKE_PROFILES[0];
    const recommendedIntakeProfileId = recommendPdfIntakeRole({
        isAskAIContextMode,
        fileName: file?.name || '',
        brief: intakeBrief
    });
    const recommendedIntakeProfile =
        PDF_INTAKE_PROFILES.find((profile) => profile.id === recommendedIntakeProfileId) ||
        PDF_INTAKE_PROFILES[0];
    const isSelectedRoleRecommended = selectedIntakeProfile.id === recommendedIntakeProfile.id;

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

        const operationId = nanoid();
        const undoSnapshot = createOperationSnapshot({
            nodes,
            edges,
            viewport,
            workspaceBrief
        });
        const controller = new AbortController();
        let requestCanceled = false;
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
                requestCanceled = true;
                controller.abort();
                updateActivity(activityId, {
                    type: 'source_upload_canceled',
                    status: 'canceled',
                    context: 'Upload request was canceled.'
                });
                popNode();
            }
        });
        let currentFlowId;
        try {
            currentFlowId = await ensureWorkspace();
        } catch (err) {
            updateActivity(activityId, {
                type: 'source_upload_failed',
                status: 'failed',
                context: requestErrorMessage(err)
            });
            showError(
                err.response?.status || err.status || 500,
                requestErrorMessage(err)
            );
            return;
        }
        if (requestCanceled) {
            return;
        }

        const data = {
            file: file,
            processing_type: processingType,
            sourceIntent: isAskAIContextMode ? 'context' : 'mindmap',
            operationId,
            intakeRole: intakeProfileId,
            intakeModel: intakeModel === 'auto' ? '' : intakeModel,
            intakePrompt: intakeBrief.trim()
        };
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
        if (uploadHasGraphDraft(data) || data.flow_type === 'automatic') {
            manageAutomaticNode(data)
        } else {
            manageNodes(data)
        }
    }

    const attachSourceToAskAI = (data, currentFlowId) => {
        const uploadedSource = sourceRecordFromUpload(data, file, currentFlowId);
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
                uploadedSource.id
            ].filter(Boolean))
        );
        setSourceLibrary(upsertSource(sourceLibrary, uploadedSource));
        setSaveStatus('dirty');
        pushNode(DataSourceSelect, {
            ...pickerReturnProps,
            mode: 'ask_ai_context',
            selectedSourceIds: nextSelectedSourceIds,
            uploadedSourceId: uploadedSource.id,
            initialContextSourceIds: nextSelectedSourceIds,
            initialContextSourceId: uploadedSource.id
        });
    };

    const manageAutomaticNode = (data) => {
        setupFlow(data)
    }
    const setupFlow = (data) => {
        const handled = handleGeneratedSourceGraph({
            uploadData: data,
            sourceInput: file,
            fallbackType: 'pdf',
            fallbackTypeLabel: 'PDF',
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
        const nextNodes = nodes.length === 0 ? [node] : [...nodes, node];
        if (nodes.length === 0) {
            setNodes([node]);
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
                    className="file-input-hidden"
                    onChange={(e) => handleFileUpload(e)}
                />
            </div>
            {/* <InputBar data={{ type: "number", label: "Enter Column Row", placeholder: "eg: 1", setTableName: setHeaderRow }} /> */}
            <div className="source-intake-config source-processing-config">
                <label>
                    <span className="source-intake-label-row">
                        PDF processing
                        {isSelectedProcessingRecommended ? (
                            <small>Recommended</small>
                        ) : null}
                    </span>
                    <select
                        value={processingType}
                        onChange={handleChange}
                        title={selectedProcessingProfile.description}
                        aria-describedby="pdf-processing-help"
                    >
                        {PDF_PROCESSING_PROFILES.map((profile) => (
                            <option
                                key={profile.id}
                                value={profile.id}
                                title={profile.description}
                            >
                                {profile.id === recommendedProcessingType
                                    ? `${profile.label} (recommended)`
                                    : profile.label}
                            </option>
                        ))}
                    </select>
                    {!isSelectedProcessingRecommended ? (
                        <button
                            type="button"
                            className="source-intake-recommendation"
                            onClick={() => setProcessingType(recommendedProcessingType)}
                        >
                            Use recommended: {recommendedProcessingProfile.label}
                        </button>
                    ) : null}
                    <div
                        id="pdf-processing-help"
                        className="source-intake-role-help-panel"
                    >
                        <div>
                            <strong>{selectedProcessingProfile.label}</strong>
                            <span>{selectedProcessingProfile.description}</span>
                        </div>
                        <dl>
                            <div>
                                <dt>Best for</dt>
                                <dd>{selectedProcessingProfile.bestFor}</dd>
                            </div>
                            <div>
                                <dt>What changes</dt>
                                <dd>{selectedProcessingProfile.changes}</dd>
                            </div>
                            <div>
                                <dt>Skip when</dt>
                                <dd>{selectedProcessingProfile.avoidWhen}</dd>
                            </div>
                        </dl>
                    </div>
                </label>
                <label>
                    <span className="source-intake-label-row">
                        Supporting intake role
                        {isSelectedRoleRecommended ? (
                            <small>Recommended</small>
                        ) : null}
                    </span>
                    <select
                        value={intakeProfileId}
                        onChange={(event) => setIntakeProfileId(event.target.value)}
                        title={selectedIntakeProfile.description}
                        aria-describedby="pdf-intake-role-help"
                    >
                        {PDF_INTAKE_PROFILES.map((profile) => (
                            <option
                                key={profile.id}
                                value={profile.id}
                                title={profile.description}
                            >
                                {profile.id === recommendedIntakeProfile.id
                                    ? `${profile.label} (recommended)`
                                    : profile.label}
                            </option>
                        ))}
                    </select>
                    {!isSelectedRoleRecommended ? (
                        <button
                            type="button"
                            className="source-intake-recommendation"
                            onClick={() => setIntakeProfileId(recommendedIntakeProfile.id)}
                        >
                            Use recommended: {recommendedIntakeProfile.label}
                        </button>
                    ) : null}
                </label>
                <label>
                    PDF intake model
                    <select
                        value={intakeModel}
                        onChange={(event) => setIntakeModel(event.target.value)}
                    >
                        {PDF_INTAKE_MODELS.map((modelName) => (
                            <option key={modelName} value={modelName}>
                                {modelName}
                            </option>
                        ))}
                    </select>
                </label>
                <div
                    id="pdf-intake-role-help"
                    className="source-intake-role-summary"
                    title={`Best for: ${selectedIntakeProfile.bestFor}. Skip when: ${selectedIntakeProfile.avoidWhen}`}
                >
                    <span>{selectedIntakeProfile.description}</span>
                </div>
                <textarea
                    value={intakeBrief}
                    onChange={(event) => setIntakeBrief(event.target.value)}
                    placeholder="Optional brief for this PDF"
                />
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
