import PROMPTSvg from "../assets/prompt.svg"
import CROSSSvg from "../assets/cross.svg"
import Prompts from "../global-components/Prompts"
import { useState } from "react"
import modalStore from "../stores/modalStore"
import { useShallow } from "zustand/shallow"
import {
    defaultOpenAIModel,
    supportedOpenAIModels
} from "../prompts/promptsModel"

const PromptModal = () => {
	const selector = (state) => ({
		popNode: state.popNode,
		sourceId: state.sourceId
	})
	const { popNode, sourceId } = modalStore(useShallow(selector));
	console.log("impo +", sourceId)
	const [activeAgent, setActiveAgent] = useState('Strategic Advisor');
    const [selectedModel, setSelectedModel] = useState(defaultOpenAIModel);

	return (
        <div className="modal-container prompts-selection">
            <div className="title">
                <div>
                    <img
                        src={PROMPTSvg}
                        alt="Prompts Svg"
                    />
                    <p>Choose Agent</p>
                </div>
                <img
                    src={CROSSSvg}
                    alt="Cross Svg"
                    onClick={(e) => popNode()}
                />
            </div>
            <div className="prompt-model-selector">
                <label htmlFor="model-select">OpenAI model</label>
                <select
                    id="model-select"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                >
                    {supportedOpenAIModels.map((modelName) => (
                        <option key={modelName} value={modelName}>
                            {modelName}
                        </option>
                    ))}
                </select>
            </div>
            <div className="prompts">
                <Prompts
                    agentName={'Strategic Advisor'}
                    activeAgent={activeAgent}
                    setActiveAgent={setActiveAgent}
                    id={sourceId}
                    selectedModel={selectedModel}
                />
                <Prompts
                    agentName={'Research Assistant'}
                    activeAgent={activeAgent}
                    setActiveAgent={setActiveAgent}
                    id={sourceId}
                    selectedModel={selectedModel}
                />
                <Prompts
                    agentName={'Productivity Coach'}
                    activeAgent={activeAgent}
                    setActiveAgent={setActiveAgent}
                    id={sourceId}
                    selectedModel={selectedModel}
                />
                <Prompts
                    agentName={'Data Interpreter'}
                    activeAgent={activeAgent}
                    setActiveAgent={setActiveAgent}
                    id={sourceId}
                    selectedModel={selectedModel}
                />
                <Prompts
                    agentName={'Custom Prompts'}
                    activeAgent={activeAgent}
                    setActiveAgent={setActiveAgent}
                    id={sourceId}
                    selectedModel={selectedModel}
                />
            </div>
        </div>
    );
}

export default PromptModal
