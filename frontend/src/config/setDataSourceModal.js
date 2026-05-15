import AudioModal from '../modals/AudioModal.jsx';
import CSVModal from '../modals/CSVModal.jsx';
import ImgModal from '../modals/ImgModal.jsx';
import MDModal from '../modals/MDModal.jsx';
import PDFModal from '../modals/PDFModal.jsx';
import SQLModal from '../modals/SQLModal.jsx';
import WEBModal from '../modals/WEBModal.jsx';
import YTModal from '../modals/YTModal.jsx';
import DocxModal from '../modals/DocxModal.jsx';
import PPTXModal from '../modals/PPTXModal.jsx';
import HTMLModal from '../modals/HTMLModal.jsx';
import TextModal from '../modals/TextModal.jsx';
import VideoModal from '../modals/VideoModal.jsx';
import WorkspaceBriefModal from '../modals/WorkspaceBriefModal.jsx';

const setDataSourceModal = (name, pushNode) => {
    switch (name) {
        case 'pdf':
            pushNode(PDFModal);
            break;
        case 'md':
            pushNode(MDModal);
            break;
        case 'docx':
            pushNode(DocxModal);
            break;
        case 'txt':
            pushNode(TextModal);
            break;
        case 'brief':
            pushNode(WorkspaceBriefModal);
            break;
        case 'sql':
            pushNode(SQLModal);
            break;
        case 'csv':
            pushNode(CSVModal);
            break;
        case 'web':
            pushNode(WEBModal);
            break;
        case 'audio':
            pushNode(AudioModal);
            break;
        case 'youtube':
            pushNode(YTModal);
            break;
        case 'img':
            pushNode(ImgModal);
            break;
        case 'pptx':
            pushNode(PPTXModal);
            break;
        case 'html':
            pushNode(HTMLModal);
            break;
        case 'video':
            pushNode(VideoModal);
            break;
        default:
            console.warn(`Unsupported TraceSpace source type: ${name}`);
    }
};

export default setDataSourceModal;
