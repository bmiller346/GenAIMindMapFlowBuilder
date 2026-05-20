/* eslint-disable react/prop-types */
import SourceRepairPreview from '../views/SourceRepairPreview';

const SourcesReviewSurface = ({
    nodes,
    edges,
    projection,
    generatedPreview,
    selectedBranchId,
    sourceRepairPreset,
    setNodes,
    setEdges,
    setActiveView,
    onAskAi,
    onRejectGeneratedPreview
}) => (
    <SourceRepairPreview
        nodes={nodes}
        edges={edges}
        projection={projection}
        generatedPreview={generatedPreview}
        onRejectGeneratedPreview={onRejectGeneratedPreview}
        selectedBranchId={selectedBranchId}
        setNodes={setNodes}
        setEdges={setEdges}
        setActiveView={setActiveView}
        onAskAi={(preset) => onAskAi(preset || sourceRepairPreset)}
    />
);

export default SourcesReviewSurface;
