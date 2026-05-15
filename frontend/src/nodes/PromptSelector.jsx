import { useShallow } from "zustand/shallow";
import PROMPTSvg from "../assets/prompt.svg"
import RIGHTArrow from "../assets/right.svg"
import PromptModal from "../modals/PromptModal";
import modalStore from "../stores/modalStore"
const PromptSelector = ({ id, prompt, modelName }) => {
	const hasPrompt = typeof prompt === 'string' && prompt.trim().length > 0;
	const displayPrompt = hasPrompt ? prompt.trim() : 'Choose AI role';
	const displayModel = modelName || (hasPrompt ? '' : 'No prompt applied');
	const selector = (state) => ({
		pushNode: state.pushNode,
		setSourceId: state.setSourceId
	})
	const { pushNode, setSourceId } = modalStore(useShallow(selector));

	const handlePrompts = (e) => {
		setSourceId(id);
		pushNode(PromptModal, { scope: 'node', nodeId: id });
	}

	return (
		<div className="prompt-selector" onClick={(e) => handlePrompts(e)}>
			<div>
				<img src={PROMPTSvg} alt="Prompt svg" />
				<div>
					<h4>
						AI role
					</h4>
					<p className="values" title={displayPrompt}>{displayPrompt}</p>
					{displayModel ? <p className="prompt-model-name" title={displayModel}>{displayModel}</p> : null}
				</div>
			</div>
			<img src={RIGHTArrow} alt="Prompt svg" />

		</div>
	)
}

export default PromptSelector
