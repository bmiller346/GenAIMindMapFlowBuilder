/* eslint-disable react/prop-types */
import { PreviewDiffSummary } from '../views/previewDiffSummary';
import {
    OutputStatePill,
    outputState,
    rowTypeLabel,
    sourceLabel,
    tableShapeLabel
} from '../views/localViews/ReviewExplanationContent';

export const AcceptedTasksSurface = ({
    taskRows,
    showTaskNudges,
    flowId,
    onOpenNode,
    onSetActiveView,
    onOpenAiPreset
}) => (
    <div className="local-table-wrap">
        <table className="local-projection-table">
            <thead>
                <tr>
                    <th>Task</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Owner</th>
                    <th>Due</th>
                    <th>Table</th>
                    <th>Review state</th>
                    <th>Source</th>
                </tr>
            </thead>
            <tbody>
                {taskRows.map((row) => (
                    <tr key={row.id}>
                        <td>
                            <button type="button" className="local-row-link" onClick={() => onOpenNode(row.id)}>
                                {row.title}
                            </button>
                        </td>
                        <td>{rowTypeLabel(row)}</td>
                        <td>{row.status}</td>
                        <td>{row.priority || '-'}</td>
                        <td>{row.owner_id || '-'}</td>
                        <td>{row.due_date || '-'}</td>
                        <td>{tableShapeLabel(row)}</td>
                        <td>
                            <OutputStatePill state={outputState(row)} />
                        </td>
                        <td>{sourceLabel(row)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
        {taskRows.length === 0 && showTaskNudges ? (
            <div className="local-table-empty local-empty-actions">
                <strong>No accepted task fields in this scope.</strong>
                <span>The workspace data exists, but this view needs task metadata.</span>
                <button type="button" onClick={() => onSetActiveView('preview')}>
                    Generate task preview
                </button>
                <button type="button" onClick={() => onSetActiveView('gaps')}>
                    Review missing fields
                </button>
                <button type="button" onClick={() => onOpenAiPreset('tasks')} disabled={!flowId}>
                    Ask AI to generate tasks
                </button>
            </div>
        ) : null}
    </div>
);

export const TaskPreviewSurface = ({
    generatedTaskPreview,
    previewRows,
    activePreviewIds,
    taskPreviewDiffSummary,
    flowId,
    onAcceptTaskPreview,
    onOpenAiPreset,
    onRejectGenerated,
    onSetActiveView,
    onTogglePreviewRow
}) => (
    <div className="local-task-preview">
        <div className="local-task-preview-header">
            <div>
                <strong>Generate task preview</strong>
                <span>
                    {generatedTaskPreview ? 'AI-generated task preview' : 'Current workspace tasks'} |{' '}
                    {previewRows.length} candidate nodes
                </span>
            </div>
            <OutputStatePill state={generatedTaskPreview ? 'AI-generated' : 'Locally projected'} />
            <button type="button" onClick={onAcceptTaskPreview}>
                Accept selected
            </button>
            {!generatedTaskPreview ? (
                <button type="button" onClick={() => onOpenAiPreset('tasks')} disabled={!flowId}>
                    Ask AI to generate tasks
                </button>
            ) : null}
            {generatedTaskPreview ? (
                <button type="button" onClick={onRejectGenerated}>
                    Reject generated
                </button>
            ) : null}
        </div>
        <PreviewDiffSummary changes={taskPreviewDiffSummary} />
        <div className="local-table-wrap">
            <table className="local-projection-table">
                <thead>
                    <tr>
                        <th>Use</th>
                        <th>Task</th>
                        <th>Current type</th>
                        <th>Preview status</th>
                        <th>Priority</th>
                        <th>Owner</th>
                        <th>Due</th>
                        <th>Review state</th>
                        <th>Source</th>
                    </tr>
                </thead>
                <tbody>
                    {previewRows.map((row) => (
                        <tr key={row.id}>
                            <td>
                                <input
                                    type="checkbox"
                                    checked={activePreviewIds.has(row.id)}
                                    onChange={() => onTogglePreviewRow(row.id)}
                                    aria-label={`Include ${row.title}`}
                                />
                            </td>
                            <td>{row.title}</td>
                            <td>{row.node_type}</td>
                            <td>{row.preview_status}</td>
                            <td>{row.priority || '-'}</td>
                            <td>{row.owner_id || '-'}</td>
                            <td>{row.due_date || '-'}</td>
                            <td>
                                <OutputStatePill state={outputState(row)} />
                            </td>
                            <td>{sourceLabel(row)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        {previewRows.length === 0 ? (
            <div className="local-table-empty local-empty-actions">
                <strong>No task preview candidates in this scope.</strong>
                <span>
                    This scope has no task-like rows yet. Ask AI to infer task
                    candidates, or add a non-reference node first.
                </span>
                <button type="button" onClick={() => onOpenAiPreset('tasks')} disabled={!flowId}>
                    Ask AI to generate tasks
                </button>
                <button type="button" onClick={() => onSetActiveView('gaps')}>
                    Review missing fields
                </button>
            </div>
        ) : null}
    </div>
);

const TasksReviewSurface = ({ mode = 'preview', ...props }) =>
    mode === 'accepted' ? (
        <AcceptedTasksSurface {...props} />
    ) : (
        <TaskPreviewSurface {...props} />
    );

export default TasksReviewSurface;
