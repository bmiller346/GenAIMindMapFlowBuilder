/* eslint-disable react/prop-types */
import ChecklistPreview from './ChecklistPreview';
import MissingInfoPreview from './MissingInfoPreview';
import MondaySelectionInput from './MondaySelectionInput';
import MondayStatusBackPreview from './MondayStatusBackPreview';
import SmeQuestionsPreview from './SmeQuestionsPreview';
import ConnectionsReviewSurface from '../review/ConnectionsReviewSurface';
import SourcesReviewSurface from '../review/SourcesReviewSurface';
import TasksReviewSurface from '../review/TasksReviewSurface';
import {
    ConnectionsReadinessSummary,
    EmptyState,
    ExecutiveOutputSection,
    OutlineNode,
    OutputStatePill,
    WorkspaceHealthSummary,
    outputState,
    rowTypeLabel,
    sourceLabel,
    tableShapeLabel
} from './localViews/ReviewExplanationContent';

const OutputPanel = ({
    activeView,
    nodes,
    edges,
    projection,
    graphConfidence,
    flowId,
    showCanvasNudges,
    showTaskNudges,
    knowledgeGraphRows,
    connectionRows,
    crossLinkRows,
    relationshipReviewGroups,
    relationshipReviewRows,
    relationshipExportStatus,
    executiveOutput,
    taskRows,
    generatedTaskPreview,
    generatedChecklistPreview,
    generatedSourceRepairPreview,
    generatedReviewerGapsPreview,
    generatedReviewerSmePreview,
    generatedIntegrationHandoffPreview,
    generatedIntegrationSyncPreview,
    previewRows,
    activePreviewIds,
    taskPreviewDiffSummary,
    selectedBranchId,
    sourceRepairPreset,
    setNodes,
    setEdges,
    setActiveView,
    clearGeneratedHelperPreview,
    onAddRoot,
    onAddSource,
    onOpenBrief,
    onAskAi,
    onOpenAiPreset,
    onOpenWorkspaceAskAi,
    onOpenNode,
    onSelectBranch,
    onSelectEdge,
    onCopyRelationshipReview,
    onDownloadRelationshipReview,
    onAcceptTaskPreview,
    onTogglePreviewRow
}) => (
    <div className="local-view-content-surface">
        <WorkspaceHealthSummary
            nodes={nodes}
            graphConfidence={graphConfidence}
            onAction={(action) => {
                if (/connection/i.test(action)) {
                    onOpenAiPreset('connections');
                } else if (/source/i.test(action)) {
                    setActiveView('sources');
                } else {
                    setActiveView('gaps');
                }
            }}
        />
        {nodes.length === 0 ? (
            <EmptyState
                activeView={activeView}
                canUseWorkspace={Boolean(flowId)}
                onAddRoot={onAddRoot}
                onAddSource={onAddSource}
                onOpenBrief={onOpenBrief}
                onAskAi={onAskAi}
                showCanvasNudges={showCanvasNudges}
            />
        ) : null}

        {activeView === 'knowledgeGraph' && nodes.length > 0 ? (
            <div className="local-table-wrap">
                <ConnectionsReadinessSummary
                    graphConfidence={graphConfidence}
                    connectionRows={connectionRows}
                    OutputStatePill={OutputStatePill}
                    flowId={flowId}
                    onOpenAiPreset={onOpenAiPreset}
                    onSetActiveView={setActiveView}
                />
                <table className="local-projection-table">
                    <thead>
                        <tr>
                            <th>Entity</th>
                            <th>Type</th>
                            <th>Relationships</th>
                            <th>Status</th>
                            <th>Review state</th>
                            <th>Source</th>
                        </tr>
                    </thead>
                    <tbody>
                        {knowledgeGraphRows.map((row) => (
                            <tr key={row.id}>
                                <td>
                                    <button type="button" className="local-row-link" onClick={() => onOpenNode(row.id)}>
                                        {row.title}
                                    </button>
                                </td>
                                <td>{rowTypeLabel(row)}</td>
                                <td>{row.relationship_count}</td>
                                <td>{row.status}</td>
                                <td>
                                    <OutputStatePill state={outputState(row)} />
                                </td>
                                <td>{sourceLabel(row)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ) : null}

        {activeView === 'connections' && nodes.length > 0 ? (
            <ConnectionsReviewSurface
                connectionRows={connectionRows}
                crossLinkRows={crossLinkRows}
                relationshipReviewGroups={relationshipReviewGroups}
                relationshipReviewRows={relationshipReviewRows}
                graphConfidence={graphConfidence}
                relationshipExportStatus={relationshipExportStatus}
                flowId={flowId}
                onOpenAiPreset={onOpenAiPreset}
                onSelectEdge={onSelectEdge}
                onCopyReview={onCopyRelationshipReview}
                onDownloadReview={onDownloadRelationshipReview}
            />
        ) : null}

        {activeView === 'chartData' && nodes.length > 0 ? (
            <div className="local-view-empty">
                <span className="local-view-empty-kicker">Needs AI preview</span>
                <strong>Create structured table</strong>
                <span>
                    This view needs AI help. Generate a preview first, then review
                    the proposed structure before accepting anything into the graph.
                </span>
                <div className="local-view-empty-actions">
                    <button type="button" onClick={() => onOpenAiPreset(activeView)} disabled={!flowId}>
                        Ask AI to create table
                    </button>
                    <button type="button" onClick={() => setActiveView('gaps')}>
                        Review missing fields
                    </button>
                    <button type="button" onClick={() => setActiveView('knowledgeGraph')}>
                        View connections
                    </button>
                </div>
            </div>
        ) : null}

        {activeView === 'outline' && nodes.length > 0 ? (
            <ol className="local-outline">
                {projection.roots.map((root) => (
                    <OutlineNode
                        key={root.id}
                        node={root}
                        childrenByParent={projection.childrenByParent}
                        nodeLookup={projection.nodeLookup}
                        depth={0}
                        onSelectBranch={onSelectBranch}
                        onOpenNode={onOpenNode}
                    />
                ))}
            </ol>
        ) : null}

        {activeView === 'executive' && nodes.length > 0 ? (
            <div className="local-executive-output">
                <section className="local-executive-summary">
                    <div>
                        <strong>Executive output</strong>
                        <span>Reusable preview and export contract v{executiveOutput.contract_version}</span>
                    </div>
                    <p>{executiveOutput.summary}</p>
                    <div className="local-executive-metrics">
                        <span>{executiveOutput.metadata.source_backed_node_count} sourced</span>
                        <span>{executiveOutput.metadata.task_count} actions</span>
                        <span>{executiveOutput.metadata.needs_review_count} review</span>
                    </div>
                </section>
                <ExecutiveOutputSection title="Key findings" items={executiveOutput.key_findings} />
                <ExecutiveOutputSection title="Recommended actions" items={executiveOutput.recommended_actions} />
                <ExecutiveOutputSection title="Risks" items={executiveOutput.risks} />
                <ExecutiveOutputSection title="Required decisions" items={executiveOutput.required_decisions} />
                <ExecutiveOutputSection title="Source-backed appendix" items={executiveOutput.source_backed_appendix} />
            </div>
        ) : null}

        {activeView === 'tasks' && nodes.length > 0 ? (
            <TasksReviewSurface
                mode="accepted"
                taskRows={taskRows}
                showTaskNudges={showTaskNudges}
                flowId={flowId}
                onOpenNode={onOpenNode}
                onSetActiveView={setActiveView}
                onOpenAiPreset={onOpenAiPreset}
            />
        ) : null}

        {activeView === 'table' && nodes.length > 0 ? (
            <div className="local-table-wrap">
                <table className="local-projection-table">
                    <thead>
                        <tr>
                            <th>Title</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Confidence</th>
                            <th>Table</th>
                            <th>Review state</th>
                            <th>Source</th>
                        </tr>
                    </thead>
                    <tbody>
                        {projection.nodes.map((row) => (
                            <tr key={row.id}>
                                <td>
                                    <button type="button" className="local-row-link" onClick={() => onOpenNode(row.id)}>
                                        {row.title}
                                    </button>
                                </td>
                                <td>{rowTypeLabel(row)}</td>
                                <td>{row.status}</td>
                                <td>{row.confidence || '-'}</td>
                                <td>{tableShapeLabel(row)}</td>
                                <td>
                                    <OutputStatePill state={outputState(row)} />
                                </td>
                                <td>{sourceLabel(row)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ) : null}

        {activeView === 'preview' && nodes.length > 0 ? (
            <TasksReviewSurface
                mode="preview"
                generatedTaskPreview={generatedTaskPreview}
                previewRows={previewRows}
                activePreviewIds={activePreviewIds}
                taskPreviewDiffSummary={taskPreviewDiffSummary}
                flowId={flowId}
                onAcceptTaskPreview={onAcceptTaskPreview}
                onOpenAiPreset={onOpenAiPreset}
                onRejectGenerated={() => clearGeneratedHelperPreview('projectPlannerTasks')}
                onSetActiveView={setActiveView}
                onTogglePreviewRow={onTogglePreviewRow}
            />
        ) : null}

        {activeView === 'checklist' && nodes.length > 0 ? (
            <ChecklistPreview
                nodes={nodes}
                projection={projection}
                setNodes={setNodes}
                setActiveView={setActiveView}
                generatedPreview={generatedChecklistPreview}
                onRejectGeneratedPreview={() => clearGeneratedHelperPreview('projectPlannerChecklist')}
                onAskAi={() => onOpenAiPreset('checklist')}
            />
        ) : null}

        {activeView === 'gaps' && nodes.length > 0 ? (
            <MissingInfoPreview
                nodes={nodes}
                projection={projection}
                generatedPreview={generatedReviewerGapsPreview}
                onRejectGeneratedPreview={() => clearGeneratedHelperPreview('reviewerGaps')}
                setNodes={setNodes}
                setActiveView={setActiveView}
                onAskAi={() => onOpenAiPreset('gaps')}
            />
        ) : null}

        {activeView === 'sme' && nodes.length > 0 ? (
            <SmeQuestionsPreview
                nodes={nodes}
                projection={projection}
                generatedPreview={generatedReviewerSmePreview}
                onRejectGeneratedPreview={() => clearGeneratedHelperPreview('reviewerSmeQuestions')}
                setNodes={setNodes}
                setActiveView={setActiveView}
                onAskAi={() => onOpenAiPreset('sme')}
            />
        ) : null}

        {activeView === 'sources' && (nodes.length > 0 || projection.sources?.length > 0) ? (
            <SourcesReviewSurface
                nodes={nodes}
                edges={edges}
                projection={projection}
                generatedPreview={generatedSourceRepairPreview}
                onRejectGeneratedPreview={() => clearGeneratedHelperPreview('sourceLibrarianSources')}
                selectedBranchId={selectedBranchId}
                setNodes={setNodes}
                setEdges={setEdges}
                setActiveView={setActiveView}
                sourceRepairPreset={sourceRepairPreset}
                onAskAi={onOpenWorkspaceAskAi}
            />
        ) : null}

        {activeView === 'mondayInput' && nodes.length > 0 ? (
            <MondaySelectionInput
                nodes={nodes}
                projection={projection}
                selectedBranchId={selectedBranchId}
                setNodes={setNodes}
                setActiveView={setActiveView}
                generatedPreview={generatedIntegrationHandoffPreview}
                onRejectGeneratedPreview={() => clearGeneratedHelperPreview('integrationOperatorHandoff')}
            />
        ) : null}

        {activeView === 'mondayStatus' && nodes.length > 0 ? (
            <MondayStatusBackPreview
                nodes={nodes}
                projection={projection}
                setNodes={setNodes}
                setActiveView={setActiveView}
                generatedPreview={generatedIntegrationSyncPreview}
                onRejectGeneratedPreview={() => clearGeneratedHelperPreview('integrationOperatorSync')}
            />
        ) : null}
    </div>
);

export default OutputPanel;
