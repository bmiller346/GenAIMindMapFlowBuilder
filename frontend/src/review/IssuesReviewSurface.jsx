/* eslint-disable react/prop-types */
import MissingInfoPreview from '../views/MissingInfoPreview.jsx';
import SmeQuestionsPreview from '../views/SmeQuestionsPreview.jsx';

const IssuesReviewSurface = ({
    mode = 'gaps',
    nodes,
    projection,
    generatedReviewerGapsPreview,
    generatedReviewerSmePreview,
    onRejectGeneratedGapsPreview,
    onRejectGeneratedSmePreview,
    setActiveView,
    setNodes,
    onAskGapsAi,
    onAskSmeAi
}) =>
    mode === 'sme' ? (
        <SmeQuestionsPreview
            nodes={nodes}
            projection={projection}
            generatedPreview={generatedReviewerSmePreview}
            onRejectGeneratedPreview={onRejectGeneratedSmePreview}
            setNodes={setNodes}
            setActiveView={setActiveView}
            onAskAi={onAskSmeAi}
        />
    ) : (
        <MissingInfoPreview
            nodes={nodes}
            projection={projection}
            generatedPreview={generatedReviewerGapsPreview}
            onRejectGeneratedPreview={onRejectGeneratedGapsPreview}
            setNodes={setNodes}
            setActiveView={setActiveView}
            onAskAi={onAskGapsAi}
        />
    );

export default IssuesReviewSurface;
