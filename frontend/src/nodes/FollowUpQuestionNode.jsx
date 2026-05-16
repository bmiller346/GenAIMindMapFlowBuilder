import { Handle, useReactFlow } from '@xyflow/react';
import FOLLOWUp from '../assets/follow.svg';
import setQuestionApi from '../config/setQuestionApi';
import flowStore from '../stores/flowStore';
import axios from 'axios';
import useStore from '../stores/store';
import { useShallow } from 'zustand/shallow';
import generateHexId from '../utils/setUpHex';
import modalStore from '../stores/modalStore';
import LoadingModal from '../modals/LoadingModal';
import errorStore from '../stores/errorStore';
import ErrorModal from '../modals/ErrorModal';
const FollowUpQuestionNode = ({ id, data }) => {
    const selector = (state) => ({
        trigger: state.trigger,
        setTrigger: state.setTrigger,
        nodes: state.nodes,
        setNodes: state.setNodes,
        edges: state.edges,
        setEdges: state.setEdges
    });

    const { nodes, setNodes, edges, setEdges, trigger, setTrigger } = useStore(
        useShallow(selector)
    );
    const pushNode = modalStore((s) => s.pushNode);
    const popNode = modalStore((s) => s.popNode);
    const flowId = flowStore((s) => s.flow_id);
    const { deleteElements } = useReactFlow();
    const deleteSiblingFolloUp = (component_id) => {
        const followUpNodes = nodes.filter(
            (ele) =>
                ele.data.component_id === component_id &&
                ele.type === 'followUp' &&
                ele.id !== id
        );
        followUpNodes.forEach(({ id }) => {
            deleteElements({ nodes: [{ id }] });
        });
    };
    const setResponse = (resData) => {
        const currNode = nodes.filter((node) => node.id === id);
        if (!currNode) return 'Node not found';
        let node;
        node = {
            id: generateHexId(),
            data: resData[0],
            type: 'response',
            position: {
                x: currNode[0].position.x + 500,
                y: currNode[0].position.y
            }
        };
        setNodes([node, ...nodes]);
        deleteSiblingFolloUp(resData[0].data.component_id)
        const edge = {
            id: generateHexId(),
            source: id,
            target: node.id,
            animated: true
        };
        setEdges([edge, ...edges]);
        setTrigger(!trigger);
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
        setStatus(err.status);
        setMsg(err.response.statusText);
        popNode();
        pushNode(ErrorModal);
    };

    const askQuestion = () => {
        const [url, body, config] = setQuestionApi(
            data.component_type,
            flowId,
            data,
            data.question,
            id,
            'followUp'
        );
        axios
            .post(`http://localhost:8000/${url}`, body, config)
            .then((res) => setResponse(res.data))
            .catch((err) => manageErrors(err));
    };

    const ifPressEnter = (e) => {
        if (e.key === 'Enter') {
            pushNode(LoadingModal);
            askQuestion();
        }
    };
    return (
        <div
            className="node-follow-up"
            tabIndex={1}
            onKeyDown={(e) => ifPressEnter(e)}
        >
            <img
                src={FOLLOWUp}
                alt="prompt svg"
            />
            <p className="follow-up-question">{data.question}</p>
            <Handle
                type="target"
                position="left"
                style={{ opacity: '0' }}
            />
            <Handle
                type="source"
                position="right"
                className="sourceHandle"
                style={{ opacity: '0' }}
            />
        </div>
    );
};

export default FollowUpQuestionNode;
