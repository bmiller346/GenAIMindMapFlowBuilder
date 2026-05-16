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
import SourceSetModal from '../modals/SourceSetModal.jsx';
import CodeIntelligenceModal from '../modals/CodeIntelligenceModal.jsx';

const setDataSourceModal = (name, pushNode, props = {}) => {
    switch (name) {
        case 'pdf':
            pushNode(PDFModal, props);
            break;
        case 'md':
            pushNode(MDModal, props);
            break;
        case 'docx':
            pushNode(DocxModal, props);
            break;
        case 'txt':
            pushNode(TextModal, props);
            break;
        case 'brief':
            pushNode(WorkspaceBriefModal, props);
            break;
        case 'source_set':
            pushNode(SourceSetModal, props);
            break;
        case 'code_intelligence':
            pushNode(CodeIntelligenceModal, props);
            break;
        case 'sql':
            pushNode(SQLModal, props);
            break;
        case 'csv':
            pushNode(CSVModal, props);
            break;
        case 'web':
            pushNode(WEBModal, props);
            break;
        case 'audio':
            pushNode(AudioModal, props);
            break;
        case 'youtube':
            pushNode(YTModal, props);
            break;
        case 'img':
            pushNode(ImgModal, props);
            break;
        case 'pptx':
            pushNode(PPTXModal, props);
            break;
        case 'html':
            pushNode(HTMLModal, props);
            break;
        case 'video':
            pushNode(VideoModal, props);
            break;
        default:
            console.warn(`Unsupported TraceSpace source type: ${name}`);
    }
};

export default setDataSourceModal;
