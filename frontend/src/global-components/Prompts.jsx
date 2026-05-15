/* eslint-disable react/prop-types */
import overLayStore from '../stores/modalStore';
import TICKSvg from "../assets/tick.svg";
import { useShallow } from 'zustand/shallow';
import LoadingModal from '../modals/LoadingModal';
import useStore from '../stores/store';
import useCreateEdges from '../hooks/useCreateEdges';
import axios from 'axios';
import setFollowUp from '../config/setFollowUp';
import flowStore from '../stores/flowStore';
import getPrompts from '../prompts/promptsModel';
import { useState } from 'react';
import ErrorModal from '../modals/ErrorModal';
import errorStore from '../stores/errorStore';

const Prompts = ({
    agentName,
    activeAgent,
    setActiveAgent,
    id,
    selectedModel
}) => {
    const selector = (s) => ({ pushNode: s.pushNode, popNode: s.popNode });
    const selector2 = (state) => ({
        trigger: state.trigger,
        setTrigger: state.setTrigger,
        nodes: state.nodes,
        edges: state.edges,
        setNodes: state.setNodes,
        setEdges: state.setEdges
    });
    const flowId = flowStore((s) => s.flow_id);
    const { pushNode, popNode } = overLayStore(useShallow(selector));
    const { trigger, setTrigger, nodes, edges, setNodes, setEdges } = useStore(
        useShallow(selector2)
    );
    const [customPrompt, setCustomPrompt] = useState();

    const makeApiRequest = (data) => {
        const prompts = getPrompts(agentName, customPrompt, selectedModel);
        const dataWithNode = {
            component_id: id,
            component_type: data.name,
            flow_id: data.flow_id,
            ...prompts
        };

        const [url, body, headerConfig] = setFollowUp(
            data.name,
            flowId,
            dataWithNode
        );

        axios
            .post(`http://localhost:8000/${url}`, body, {
                headers: {
                    'Content-Type': headerConfig
                }
            })
            .then((res) => manageNodes(res.data))
            .catch((err) => manageErrors(err));
    };

    const selector3 = (state) => ({
        setStatus: state.setStatus,
        setMsg: state.setMsg
    });
    const { setStatus, setMsg } = errorStore(useShallow(selector3));

    const manageErrors = (err) => {
        console.log(err);
        console.log("Errroro", err.status);
        console.log("Errroross", err.response.statusText);
        setStatus(err.status);
        setMsg(err.response.statusText);
        popNode();
        pushNode(ErrorModal);
    };

    const getData = () => {
        setActiveAgent?.(agentName);
        pushNode(LoadingModal);
        const currNode = nodes.filter((node) => node.id === id);
        const editNode = nodes.find((node) => node.id === id);

        editNode.data.prompt = agentName;
        editNode.data.model_name = selectedModel;

        makeApiRequest(currNode[0].data);
    };

    const manageNodes = (data) => {
        const currentNode = nodes.find((node) => node.id === id);
        currentNode.data = {
            prompt: agentName,
            model_name: selectedModel,
            ...currentNode.data
        };

        setNodes([...nodes, ...data]);

        const newEdges = [];
        data.forEach((element) => {
            const edge = useCreateEdges(id, element.id);
            newEdges.push(edge);
        });

        const updEdges = edges.concat(newEdges);
        setEdges(updEdges);
        setTrigger(!trigger);
    };

    const handleInput = (e) => {
        const textarea = e.target;
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight}px`;
    };

    const ifPressEnter = (e) => {
        if (e.key === "Enter") {
            getData();
        }
    };

    return (
        <>
            {agentName === "Custom Prompts" ? (
                <div
                    className={
                        agentName === activeAgent
                            ? 'prompt-container selected-prompt'
                            : 'prompt-container'
                    }
                    onClick={() => setActiveAgent(agentName)}
                    tabIndex={1}
                    onKeyDown={(e) => ifPressEnter(e)}
                >
                    <img
                        src={TICKSvg}
                        alt="tick svg"
                        style={
                            activeAgent === agentName
                                ? { opacity: '100%' }
                                : { opacity: '0' }
                        }
                    />
                    {activeAgent === "Custom Prompts" ? (
                        <div className='custom-prompts'>
                            <p className='agent-name'>{agentName}</p>
                            <textarea
                                onChange={(e) => setCustomPrompt(e.target.value)}
                                onInput={handleInput}
                                style={{
                                    minHeight: '50px',
                                    resize: 'none',
                                    overflow: "hidden"
                                }}
                            />
                        </div>
                    ) : (
                        <p className='agent-name'>{agentName}</p>
                    )}
                </div>
            ) : (
                <div
                    className={
                        agentName === activeAgent
                            ? 'prompt-container selected-prompt'
                            : 'prompt-container'
                    }
                    onClick={() => getData()}
                >
                    <img
                        src={TICKSvg}
                        alt="tick svg"
                        style={
                            activeAgent === agentName
                                ? { opacity: '100%' }
                                : { opacity: '0' }
                        }
                    />
                    <div className="prompt-card-copy">
                        <p className='agent-name'>{agentName}</p>
                        <p className="prompt-card-model">{selectedModel}</p>
                    </div>
                </div>
            )}
        </>
    );
};

export default Prompts;
