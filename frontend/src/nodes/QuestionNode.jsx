import { Handle, useConnection, useReactFlow } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useState } from 'react';
import useStore from '../stores/store';
import { useShallow } from 'zustand/shallow';
import axios from 'axios';
import STARSvg from '../assets/star.svg';
import modalStore from '../stores/modalStore';
import LoadingModal from '../modals/LoadingModal';
import { useNodeConnections } from '@xyflow/react';
import { getOutgoers } from '@xyflow/react';
import setQuestionApi from '../config/setQuestionApi';
import flowStore from '../stores/flowStore';
import generateHexId from '../utils/setUpHex';
import errorStore from '../stores/errorStore';
import ErrorModal from '../modals/ErrorModal';
import { questionAnswerLoading } from '../config/loadingStates';
import useActivityStore from '../stores/activityStore';
import { isCanceledRequest, requestErrorMessage } from '../utils/requestErrors';
import {
    createOperationSnapshot,
    restoreOperationSnapshot
} from '../utils/operationSnapshots';

const QuestionNode = ({ id, position, data  }) => {
    const { deleteElements, setViewport } = useReactFlow();
    const selector = (state) => ({
        trigger: state.trigger,
        setTrigger: state.setTrigger,
        nodes: state.nodes,
        setNodes: state.setNodes,
        edges: state.edges,
        setEdges: state.setEdges,
        workspaceBrief: state.workspaceBrief,
        viewport: state.viewport,
        setWorkspaceBrief: state.setWorkspaceBrief,
        setViewPort: state.setViewPort
    });
    const connections = useNodeConnections({
        type: 'source'
    });
    const {
        nodes,
        setNodes,
        edges,
        setEdges,
        trigger,
        setTrigger,
        workspaceBrief,
        viewport,
        setWorkspaceBrief,
        setViewPort
    } = useStore(useShallow(selector));
    const currNodeObj = nodes.find((ele) => ele.id === id);
    const [question, setQuestion] = useState(() => {
        const initialValue = '';
        return currNodeObj.data.question
            ? currNodeObj.data.question
            : initialValue;
    });
    const pushNode = modalStore((s) => s.pushNode);
    const popNode = modalStore((s) => s.popNode);
    const addActivity = useActivityStore((s) => s.addActivity);
    const updateActivity = useActivityStore((s) => s.updateActivity);
    const flowId = flowStore((s) => s.flow_id);

    const deleteFollowUpQuestion = (component_id) => {
        const followUpNodes = nodes.filter(
            (ele) =>
                ele.data.component_id === component_id &&
                ele.type === 'followUp'
        );
        const responseNodesAns = nodes
            .filter((item) => item.type === 'response')
            .map((ele) => ele.data.id);
        const followUpIds = followUpNodes.map((ele) => ele.id);
        const commonId = responseNodesAns.filter((id) =>
            followUpIds.includes(id)
        );
        const deleteNodes = followUpNodes.filter(
            (obj) => !commonId.includes(obj.id)
        );
        deleteNodes.forEach(({ id }) => {
            deleteElements({ nodes: [{ id }] });
        });
    };

    const hasBriefContext = () =>
        Boolean(
            workspaceBrief?.configured ||
                workspaceBrief?.goal?.trim() ||
                workspaceBrief?.audience?.trim() ||
                workspaceBrief?.domain_context?.trim() ||
                workspaceBrief?.review_rules?.trim() ||
                workspaceBrief?.desired_outputs?.some((output) => output !== 'mind_map')
        );

    const buildDerivationMetadata = () => {
        if (!hasBriefContext()) {
            return {};
        }

        const sourceMode = workspaceBrief.source_mode || 'source_plus_context';
        const assumption =
            sourceMode === 'context_only' || Boolean(workspaceBrief.assumptions_allowed);

        return {
            derivation_context_id: `brief:${flowId}`,
            source_mode: sourceMode,
            assumption,
            status: assumption ? 'needs_review' : 'ai_generated',
            workspace_brief: workspaceBrief
        };
    };

    const withDerivationMetadata = (responseNode) => ({
        ...responseNode,
        data: {
            ...responseNode.data,
            ...buildDerivationMetadata()
        }
    });

    const setResponse = (resData) => {
        const currNode = nodes.filter((node) => node.id === id);
        if (!currNode) return 'Node not found';
        let node;
        node = {
            id: generateHexId(),
            data: withDerivationMetadata(resData[0]),
            type: 'response',
            position: {
                x: currNode[0].position.x + 500,
                y: currNode[0].position.y
            },
            deletable: true
        };
        const questionNode = {
            id: resData[1].id,
            type: 'question',
            data: {
                question: resData[1].data.question,
                component_type: resData[1].data.component_type,
                component_id: resData[1].data.component_id
            },
            position: {
                x: currNode[0].position.x + 500,
                y: currNode[0].position.y
            },
            deletable: true
        };
        setNodes([node, questionNode, ...nodes]);
        deleteFollowUpQuestion(resData[1].data.component_id);
        const edge = {
            id: generateHexId(),
            source: id,
            target: node.id,
            animated: true
        };
        const edge2 = {
            id: generateHexId(),
            source: resData[1].data.component_id,
            target: resData[1].id,
            animated: true
        };
        setEdges([edge, edge2, ...edges]);
        setTrigger(!trigger);
    };

    const askQuestion = (controller, activityId, undoAnswerDerivation) => {
        const [url, body, config] = setQuestionApi(
            data.component_type,
            flowId,
            data,
            question,
            id,
            'question',
            workspaceBrief
        );
        axios
            .post(`http://localhost:8000/${url}`, body, {
                ...config,
                signal: controller.signal
            })
            .then((res) => {
                updateActivity(activityId, {
                    status: 'completed',
                    context: 'Answer node was added to the workspace.',
                    undo: undoAnswerDerivation
                });
                setResponse(res.data);
                popNode();
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
        // 	const formData = new FormData();
        // 	const dataString = {
        // 		component_id: data.component_id,
        // 		flow_id: data.flow_id,
        // 		question: question
        // 	}

        // 	axios.post("http://localhost:8000/sql-component-qa", dataString, {
        // 		headers: {
        // 			// 'Content-Type': 'multipart/form-data'
        // 			'Content-Type': 'application/json'
        // 		}
        // 	}).then((res) => setResponse(res.data))
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

    const ifPressEnter = (e) => {
        if (question.length === 0) {
            return;
        }
        if (e.key === 'Enter') {
            const currentNode = nodes.find((ele) => ele.id === id);
            currentNode.data.question = question;
            setNodes(nodes);
            const undoSnapshot = createOperationSnapshot({
                nodes,
                edges,
                viewport,
                workspaceBrief
            });
            const controller = new AbortController();
            const activityId = addActivity({
                title: 'Deriving answer',
                detail: question,
                context: workspaceBrief?.goal
                    ? `Workspace goal: ${workspaceBrief.goal}`
                    : 'Using connected source context.'
            });
            pushNode(LoadingModal, {
                ...questionAnswerLoading(workspaceBrief),
                onCancel: () => {
                    controller.abort();
                    updateActivity(activityId, {
                        status: 'canceled',
                        context: 'Question request was canceled.'
                    });
                    popNode();
                }
            });
            const undoAnswerDerivation = () => {
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
                    context: 'Answer derivation was undone.',
                    undo: undefined
                });
            };
            askQuestion(controller, activityId, undoAnswerDerivation);
        }
    };

    const handleInput = (e) => {
        const currentNode = nodes.find((ele) => ele.id === id);
        const textarea = e.target;
        textarea.style.height = '';
        textarea.style.height = `${textarea.scrollHeight}px`;
    };

    return (
        <div
            className="node-question"
            tabIndex={1}
            onKeyDown={(e) => ifPressEnter(e)}
        >
            <img
                src={STARSvg}
                alt="Star svg"
            />
            {currNodeObj ? (
                currNodeObj.data.question ? (
                    <textarea
                        className=".question-textarea"
                        placeholder="Ask a Question"
                        disabled
                        onInput={handleInput}
                        defaultValue={currNodeObj.data.question}
                        onChange={(e) => setQuestion(e.target.value)}
                        style={{
                            overflow: 'hidden',
                        }}
                    />
                ) : (
                    <textarea
                        className=".question-textarea"
                        placeholder="Ask a Question"
                        onInput={handleInput}
                        defaultValue={currNodeObj.data.question}
                        onChange={(e) => setQuestion(e.target.value)}
                        style={{
                            overflow: 'hidden',
                        }}
                    />
                )
            ) : (
                <input
                    type="text"
                    placeholder="Ask Question"
                    onChange={(e) => setQuestion(e.target.value)}
                />
            )}
            <Handle
                type="source"
                position="right"
                style={{ opacity: '0' }}
            />
            <Handle
                type="target"
                position="left"
                style={{ opacity: '0' }}
            />
        </div>
    );
};

export default QuestionNode;
