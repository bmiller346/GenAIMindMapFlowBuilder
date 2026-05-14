import CROSSSvg from '../assets/cross.svg';
import useStore from '../stores/store';
import { useShallow } from 'zustand/shallow';
import modalStore from '../stores/modalStore';
import axios from 'axios';
import flowStore from '../stores/flowStore';
import DataSourceSelect from '../global-components/DataSourceSelect';
import ErrorModal from './ErrorModal';
import errorStore from '../stores/errorStore';

const FlowModal = ({ setIsDrawer, setIsViewFlowModal }) => {
   const selector = (state) => ({
        trigger: state.trigger,
        setTrigger: state.setTrigger,
        setNodes: state.setNodes,
        setEdges: state.setEdges,
        setViewPort: state.setViewPort
    });

    const {
        trigger,
        setTrigger,
        setNodes,
        setEdges,
        setViewPort
    } = useStore(useShallow(selector));
    const setFlow = flowStore((s) => s.setFlow);
    const setFlowName = flowStore((s) => s.setFlowName);
    const setFlowType = flowStore((s) => s.setFlowType);
    const popNode = modalStore((s) => s.popNode);
    const pushNode = modalStore((s) => s.pushNode);

    const createNewFlow = () => {
        setIsDrawer(false)
        setIsViewFlowModal(false)
        const data = {
            flow_name: 'New Flow',
            summary: 'Flow is empty',
            flow_json: '',
            flow_type: 'manual'
        };
        axios
            .post(`http://localhost:8000/create-flow`, data, {
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then((res) => setupNewFlow(res, { openSourcePicker: false }))
            .catch((err) => manageErrors(err));
    };

    const createAutomaticFlow = () => {
        setIsDrawer(false)
        setIsViewFlowModal(false)
        const data = {
            flow_name: 'New Flow',
            summary: 'Flow is empty',
            flow_json: '',
            flow_type: 'automatic'
        };
        axios
            .post(`http://localhost:8000/create-flow`, data, {
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then((res) => setupNewFlow(res, { openSourcePicker: true }))
            .catch((err) => manageErrors(err));
    };


    const setupNewFlow = (res, { openSourcePicker = false } = {}) => {
        console.log("SERVER RESPONSE", res.data)
        setFlow(res.data.flow_id);
        setFlowType(res.data.flow_type)
        setIsDrawer(false);
        setNodes([]);
        setEdges([]);
        setViewPort({});
        setFlowName('New Flow');
        setTrigger(!trigger);
        if (openSourcePicker) {
            pushNode(DataSourceSelect);
        }
    };

    const selector2 = (state) => ({
        status: state.status,
        message: state.message,
        setStatus: state.setStatus,
        setMsg: state.setMsg
    });
    const { setStatus, setMsg } = errorStore(
        useShallow(selector2)
    );

    const manageErrors = (err) => {
        console.log(err);
        console.log('Errroro', err.status);
        console.log('Errroross', err.response?.statusText);
        setStatus(err.response?.status || err.status || 500);
        setMsg(err.response?.data?.detail || err.response?.statusText || err.message || 'Request failed');
        popNode();
        pushNode(ErrorModal);
    };
    return (
        <div className='container'>
            <div className="modal-container">
                <div className="title">
                    <div>
                        <p>Start a workspace</p>
                    </div>
                    <img
                        src={CROSSSvg}
                        alt="Cross Svg"
                        onClick={() => setIsViewFlowModal(false)}
                    />
                </div>
                <div className="flow-choice-list">
                    <button
                        className="flow-choice-card"
                        onClick={createAutomaticFlow}
                    >
                        <strong>Auto-generate from document</strong>
                        <span>Next you will choose a PDF, DOCX, Markdown, TXT, or brief so DocMap can draft the first map.</span>
                    </button>
                    <button
                        className="flow-choice-card flow-choice-primary"
                        onClick={createNewFlow}
                    >
                        <strong>Blank workspace</strong>
                        <span>Start empty and add sources, nodes, and review details yourself.</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FlowModal;
