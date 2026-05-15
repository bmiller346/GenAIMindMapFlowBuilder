/* eslint-disable react/prop-types */
import overLayStore from '../stores/modalStore';
import TICKSvg from "../assets/tick.svg";
import { useShallow } from 'zustand/shallow';
import { useState } from 'react';

const Prompts = ({
    agentName,
    activeAgent,
    setActiveAgent,
    id,
    selectedModel
}) => {
    const selector = (s) => ({ popNode: s.popNode });
    const { popNode } = overLayStore(useShallow(selector));
    const [customPrompt, setCustomPrompt] = useState();
    const [legacyMessage, setLegacyMessage] = useState('');

    const getData = () => {
        setActiveAgent?.(agentName);
        setLegacyMessage(
            'Legacy direct generation is disabled. Use Ask AI on a node, branch, or workspace to preview changes before accepting them.'
        );
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
                        <>
                            <p className='agent-name'>{agentName}</p>
                            {legacyMessage ? (
                                <p className="legacy-prompt-inline-note">{legacyMessage}</p>
                            ) : null}
                        </>
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
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            getData();
                        }
                    }}
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
                        {legacyMessage ? (
                            <p className="legacy-prompt-inline-note">{legacyMessage}</p>
                        ) : null}
                    </div>
                </div>
            )}
        </>
    );
};

export default Prompts;
