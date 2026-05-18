import PDFSvg from '../assets/docx.svg';
import CROSSSvg from '../assets/cross.svg';
import RIGHTArrow from '../assets/right.svg';
import { useRef, useState } from 'react';
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
import { ASK_AI_GENERATION_PROGRESS_EVENT } from '../utils/askAiGenerationProgress';

const DOCX_INTAKE_PROFILES = [
    {
        id: '',
        label: 'No intake role',
        description: 'Import the source with the default parser. Best when you only need the document saved and summarized without a specialized lens.',
        bestFor: 'Fast neutral intake',
        changes: 'Keeps extraction general and avoids adding a role-specific interpretation layer.',
        avoidWhen: 'You need citation repair, structural mapping, or decision-oriented synthesis.'
    },
    {
        id: 'document-structure-extractor',
        label: 'Document Structure Extractor',
        description: 'Pull out headings, sections, tables, lists, and hierarchy so the source keeps its document structure.',
        bestFor: 'Policies, SOPs, specs, manuals, and documents with important headings or tables',
        changes: 'Preserves the document outline and favors section-by-section organization over broad synthesis.',
        avoidWhen: 'The document is mostly notes or you care more about recommendations than structure.'
    },
    {
        id: 'source-librarian',
        label: 'Source Librarian',
        description: 'Prioritize citations, evidence snippets, source refs, and coverage signals for later reconciliation.',
        bestFor: 'Evidence review, reconciliation, audit prep, and source-backed Ask AI context',
        changes: 'Emphasizes source refs, quote snippets, coverage gaps, and traceability.',
        avoidWhen: 'You mainly want a strategy memo or a loose brainstorm from the document.'
    },
    {
        id: 'strategic-advisor',
        label: 'Strategic Advisor',
        description: 'Synthesize the source into decisions, risks, recommendations, tradeoffs, and action-oriented themes.',
        bestFor: 'Business cases, planning docs, discovery notes, strategy, and executive review',
        changes: 'Highlights implications, risks, decisions, tradeoffs, owners, and next steps.',
        avoidWhen: 'You need faithful section structure or strict citation coverage first.'
    },
    {
        id: 'custom',
        label: 'Custom Intake Prompt',
        description: 'Use your optional brief as the intake instructions when none of the preset roles quite fit.',
        bestFor: 'Specialized source handling with your own instructions',
        changes: 'Uses the optional brief as the primary lens for intake.',
        avoidWhen: 'The preset roles already describe the job; presets are easier to validate later.'
    }
];

const recommendDocxIntakeProfile = ({
    isAskAIContextMode = false,
    fileName = '',
    brief = ''
}) => {
    const text = `${fileName} ${brief}`.toLowerCase();
    if (brief.trim()) {
        return 'custom';
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

const DOCX_INTAKE_MODELS = ['auto', 'gpt-5.5', 'gpt-5.4'];

const DocxModal = ({
    sourcePickerMode = 'workspace_intake',
    returnModal,
    returnProps = {}
}) => {
    const selector = (state) => ({
        trigger: state.trigger,
        setTrigger: state.setTrigger,
        nodes: state.nodes,
        edges: state.edges,
        setNodes: state.setNodes,
        setEdges: state.setEdges,
        setViewPort: state.setViewPort,
        workspaceBrief: state.workspaceBrief,
        viewport: state.viewport,
        setPendingSourceDraft: state.setPendingSourceDraft,
        sourceLibrary: state.sourceLibrary,
        setSourceLibrary: state.setSourceLibrary
    });
    const flowId = flowStore((s) => s.flow_id);
    const setFlowId = flowStore((s) => s.setFlow);
    const setFlowName = flowStore((s) => s.setFlowName);
    const flowName = flowStore((s) => s.flow_name);
    const flowType = flowStore((s) => s.flow_type);
    const setFlowType = flowStore((s) => s.setFlowType);
    const setSavedSnapshot = flowStore((s) => s.setSavedSnapshot);
    const setSaveStatus = flowStore((s) => s.setSaveStatus);
    const { fitView } = useReactFlow();
    const [file, setFile] = useState();
    const [intakeProfileId, setIntakeProfileId] = useState('');
    const [intakeModel, setIntakeModel] = useState(DOCX_INTAKE_MODELS[0]);
    const [intakeBrief, setIntakeBrief] = useState('');
    const fileInputRef = useRef(null);
    const sourceProgressRef = useRef(null);
    const sourceProgressEventCounter = useRef(0);
    const pushNode = modalStore((s) => s.pushNode);
    const popNode = modalStore((s) => s.popNode);
    const addActivity = useActivityStore((s) => s.addActivity);
    const updateActivity = useActivityStore((s) => s.updateActivity);
    // const csvAccept = ".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
    const docxAccept = '.docx';

    const {
        trigger,
        setTrigger,
        nodes,
        edges,
        setNodes,
        setEdges,
        setViewPort,
        workspaceBrief,
        viewport,
        setPendingSourceDraft,
        sourceLibrary,
        setSourceLibrary
    } = useStore(useShallow(selector));
    const isAskAIContextMode = sourcePickerMode === 'ask_ai_context';

    const showError = (statusCode, message) => {
        setStatus(statusCode);
        setMsg(message);
        pushNode(ErrorModal);
    };

    const selectedIntakeProfile =
        DOCX_INTAKE_PROFILES.find((profile) => profile.id === intakeProfileId) ||
        DOCX_INTAKE_PROFILES[0];
    const recommendedIntakeProfileId = recommendDocxIntakeProfile({
        isAskAIContextMode,
        fileName: file?.name || '',
        brief: intakeBrief
    });
    const recommendedIntakeProfile =
        DOCX_INTAKE_PROFILES.find((profile) => profile.id === recommendedIntakeProfileId) ||
        DOCX_INTAKE_PROFILES[0];
    const isSelectedRoleRecommended = selectedIntakeProfile.id === recommendedIntakeProfile.id;

    const sourcePromptLabel = () => {
        const brief = intakeBrief.trim();
        if (!selectedIntakeProfile?.id && !brief) {
            return '';
        }
        if (!brief) {
            return selectedIntakeProfile.label;
        }
        return `${selectedIntakeProfile?.label || 'Custom intake brief'}: ${brief}`;
    };

    const emitSourceProgress = (requestId, updates = {}) => {
        if (!requestId || typeof window === 'undefined') {
            return;
        }
        const previous =
            sourceProgressRef.current?.requestId === requestId
                ? sourceProgressRef.current
                : {};
        const nextSnapshot = {
            ...previous,
            ...updates,
            requestId,
            updatedAt: new Date().toISOString()
        };
        sourceProgressRef.current = nextSnapshot;
        window.dispatchEvent(
            new CustomEvent(ASK_AI_GENERATION_PROGRESS_EVENT, {
                detail: nextSnapshot
            })
        );
    };

    const progressStageFromOperation = (progress = {}) => {
        if (progress.status === 'failed') {
            return 'Validating draft';
        }
        if (progress.status === 'completed' || progress.phase === 'complete') {
            return 'Building preview';
        }
        if (['ai_reading', 'ai_deriving', 'uploading_to_ai'].includes(progress.phase)) {
            return 'Calling AI model';
        }
        if (progress.phase === 'extracting') {
            return 'Selecting source context';
        }
        if (progress.phase === 'checking_settings') {
            return 'Choosing model';
        }
        return 'Preparing request';
    };

    const publishSourceProgressEvent = (requestId, stage, detail, updates = {}) => {
        sourceProgressEventCounter.current += 1;
        const previousEvents =
            sourceProgressRef.current?.requestId === requestId
                ? sourceProgressRef.current.events || []
                : [];
        const events = [
            {
                id: `${sourceProgressEventCounter.current}-${stage}`,
                stage,
                detail,
                updatedAt: new Date().toISOString()
            },
            ...previousEvents
        ].slice(0, 5);
        emitSourceProgress(requestId, {
            ...updates,
            stage,
            detail,
            events
        });
    };

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
            showError(400, 'Choose a DOCX file before uploading.');
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
        const progressRequestId = `docx-source-${operationId}`;
        const data = {
            file: file,
            operationId,
            sourceIntent: isAskAIContextMode ? 'context' : 'mindmap',
            intakeRole: intakeProfileId,
            intakeModel: intakeModel === 'auto' ? '' : intakeModel,
            intakePrompt: intakeBrief.trim()
        };
        const controller = new AbortController();
        const activityId = addActivity({
            type: 'source_upload_started',
            title: 'Adding DOCX source',
            detail: file?.name,
            context: 'Uploading, extracting text, and deriving workspace structure.'
        });
        publishSourceProgressEvent(
            progressRequestId,
            'Preparing request',
            'Preparing DOCX source upload.',
            {
                status: 'running',
                role: { label: 'Source upload' },
                action: {
                    label: isAskAIContextMode
                        ? 'Attach DOCX to Ask AI'
                        : 'Create DOCX source map'
                },
                scope: { type: 'source' },
                previewMode: 'source_upload',
                message: 'DOCX source upload is running.',
                context: [
                    { label: 'Source', value: file?.name || 'DOCX' },
                    {
                        label: 'Mode',
                        value: isAskAIContextMode ? 'Ask AI context' : 'Mind map draft'
                    },
                    { label: 'Model', value: intakeModel || 'auto' }
                ]
            }
        );
        pushNode(LoadingModal, {
            ...sourceUploadLoading('DOCX', file?.name),
            operationId,
            onProgress: (progress) => {
                const stage = progressStageFromOperation(progress);
                publishSourceProgressEvent(
                    progressRequestId,
                    stage,
                    progress?.detail || progress?.message || 'Processing DOCX source.',
                    {
                        status:
                            progress?.status === 'failed'
                                ? 'failed'
                                : progress?.status === 'completed'
                                  ? 'completed'
                                  : 'running',
                        message: progress?.message || 'DOCX source upload is running.'
                    }
                );
            },
            onCancel: () => {
                controller.abort();
                updateActivity(activityId, {
                    type: 'source_upload_canceled',
                    status: 'canceled',
                    context: 'Upload request was canceled.'
                });
                publishSourceProgressEvent(
                    progressRequestId,
                    'Validating draft',
                    'DOCX source upload was canceled.',
                    {
                        status: 'canceled',
                        message: 'DOCX source upload was canceled.'
                    }
                );
                popNode();
            }
        });
        const [url, body, headerConfig] = setRequestData('docx', currentFlowId, data);
        axios
            .post(`http://localhost:8000/${url}`, body, {
                headers: {
                    'Content-Type': headerConfig
                },
                signal: controller.signal
            })
            .then((res) => {
                publishSourceProgressEvent(
                    progressRequestId,
                    'Building preview',
                    isAskAIContextMode
                        ? 'DOCX source is available to Ask AI.'
                        : 'DOCX source draft is ready for review.',
                    {
                        status: 'completed',
                        message: 'DOCX source upload completed.'
                    }
                );
                updateActivity(activityId, {
                    type: 'source_upload_completed',
                    status: 'completed',
                    source_ids: [file?.name],
                    context: isAskAIContextMode
                        ? 'DOCX source was attached to Ask AI context.'
                        : 'DOCX source draft is ready for review.'
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
                publishSourceProgressEvent(
                    progressRequestId,
                    'Validating draft',
                    requestErrorMessage(err),
                    {
                        status: 'failed',
                        message: 'DOCX source upload failed.'
                    }
                );
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
        const parsedFlow = parseMindmapJson(data.mindmap_json);
        if (Object.keys(parsedFlow || {}).length > 0) {
            const flow = applySourceIntakeMetadata(parsedFlow, data);
            if ((flow.nodes || []).length === 0 && (flow.edges || []).length === 0) {
                setTrigger(!trigger);
                setViewPort(0, 0, 1);
                popNode();
                return;
            }
            if (flow) {
                handleGeneratedSourceGraph({
                    uploadData: { ...data, mindmap_json: flow },
                    sourceInput: file,
                    fallbackType: 'docx',
                    fallbackTypeLabel: 'DOCX',
                    popNode,
                    fitView,
                    draftMeta: {
                        intakeRole: intakeProfileId,
                        intakeRoleLabel: sourcePromptLabel() || 'No intake role',
                        intakeModel,
                        intakePrompt: intakeBrief.trim()
                    }
                });
            }
        } else {
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
        const statusCode = err.response?.status || err.status || 500;
        const message = requestErrorMessage(err);
        setStatus(statusCode);
        setMsg(message);
        popNode();
        pushNode(ErrorModal);
    };

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
                prompt: sourcePromptLabel(),
                model_name: sourcePromptLabel() && intakeModel !== 'auto' ? intakeModel : '',
                intake_model: intakeModel,
                intake_prompt: intakeBrief.trim(),
                file: file,
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
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) {
            setFile(undefined);
            return;
        }

        if (!selectedFile.name.toLowerCase().endsWith('.docx')) {
            setFile(undefined);
            e.target.value = '';
            showError(400, 'Choose a DOCX file. PDFs should be uploaded from the PDF source option.');
            return;
        }

        setFile(selectedFile);
    };

    const applySourceIntakeMetadata = (flow, data) => ({
        ...flow,
        nodes: Array.isArray(flow?.nodes)
            ? flow.nodes.map((node) => {
                  if (node.type !== 'dataSource') {
                      return node;
                  }
                  return {
                      ...node,
                      data: {
                          ...(node.data || {}),
                          name: node.data?.name || data.type || 'docx',
                          content: node.data?.content || file?.name || 'DOCX source',
                          flow_id: data.flow_id || flowStore.getState().flow_id || flowId,
                          prompt: sourcePromptLabel(),
                          model_name: sourcePromptLabel() && intakeModel !== 'auto' ? intakeModel : '',
                          intake_model: intakeModel,
                          intake_prompt: intakeBrief.trim()
                      }
                  };
              })
            : []
    });

    const openFilePicker = () => {
        fileInputRef.current?.click();
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
                    <p>Load A Docx</p>
                </div>
                <img
                    src={CROSSSvg}
                    alt="Cross Svg"
                    onClick={(e) => popNode()}
                />
            </div>
            <div className="data-source-input">
                <button
                    type="button"
                    className="data-source-set"
                    onClick={openFilePicker}
                >
                    <div>
                        <img
                            src={PDFSvg}
                            alt="image will be here"
                        />
                        {/* <p>Upload a CSV</p> */}
                        {file ? <p>{file.name}</p> : <p>Upload a DOCX</p>}
                    </div>
                    <img
                        src={RIGHTArrow}
                        alt={'RIght arrow'}
                    />
                </button>
                <input
                    ref={fileInputRef}
                    id="docxFileUpload"
                    type="file"
                    accept={docxAccept}
                    className="file-input-hidden"
                    onChange={(e) => handleFileUpload(e)}
                />
            </div>
            <div className="source-intake-config">
                <label>
                    <span className="source-intake-label-row">
                        Optional intake role
                        {isSelectedRoleRecommended ? (
                            <small>Recommended</small>
                        ) : null}
                    </span>
                    <select
                        value={intakeProfileId}
                        onChange={(event) => setIntakeProfileId(event.target.value)}
                        title={selectedIntakeProfile.description}
                        aria-describedby="docx-intake-role-help"
                    >
                        {DOCX_INTAKE_PROFILES.map((profile) => (
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
                    <div
                        id="docx-intake-role-help"
                        className="source-intake-role-help-panel"
                    >
                        <div>
                            <strong>{selectedIntakeProfile.label}</strong>
                            <span>{selectedIntakeProfile.description}</span>
                        </div>
                        <dl>
                            <div>
                                <dt>Best for</dt>
                                <dd>{selectedIntakeProfile.bestFor}</dd>
                            </div>
                            <div>
                                <dt>What changes</dt>
                                <dd>{selectedIntakeProfile.changes}</dd>
                            </div>
                            <div>
                                <dt>Skip when</dt>
                                <dd>{selectedIntakeProfile.avoidWhen}</dd>
                            </div>
                        </dl>
                    </div>
                </label>
                <label>
                    DOCX intake model
                    <select
                        value={intakeModel}
                        onChange={(event) => setIntakeModel(event.target.value)}
                    >
                        {DOCX_INTAKE_MODELS.map((modelName) => (
                            <option key={modelName} value={modelName}>
                                {modelName}
                            </option>
                        ))}
                    </select>
                </label>
                <textarea
                    value={intakeBrief}
                    onChange={(event) => setIntakeBrief(event.target.value)}
                    placeholder="Optional brief for this source"
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

export default DocxModal;
