import KanbanBoardView from '../KanbanBoardView.jsx';

export const ReadinessCallout = ({ title, detail, issues = [], actionLabel, onAction }) => (
    <section className="canvas-structured-readiness-callout" aria-label={title}>
        <div>
            <strong>{title}</strong>
            <span>{detail}</span>
        </div>
        {issues.length ? (
            <div className="canvas-structured-readiness-issues">
                {issues.slice(0, 4).map((issue) => (
                    <span key={issue}>{issue}</span>
                ))}
            </div>
        ) : null}
        {onAction ? (
            <button type="button" onClick={onAction}>
                {actionLabel}
            </button>
        ) : null}
    </section>
);

const ExecutiveList = ({ title, items = [], empty = 'No items projected.' }) => (
    <section className="canvas-structured-executive-section">
        <div className="canvas-structured-section-header">
            <strong>{title}</strong>
            <span>{items.length}</span>
        </div>
        {items.length ? (
            <div className="canvas-structured-executive-list">
                {items.map((item) => (
                    <article key={item.id} className="canvas-structured-executive-item">
                        <strong>{item.title}</strong>
                        {item.description ? <p>{item.description}</p> : null}
                        <small>
                            {[
                                item.status,
                                item.priority ? `priority: ${item.priority}` : '',
                                item.owner_id ? `owner: ${item.owner_id}` : '',
                                item.due_date ? `due: ${item.due_date}` : '',
                                item.source_backed ? 'source-backed' : 'needs review'
                            ]
                                .filter(Boolean)
                                .join(' | ')}
                        </small>
                    </article>
                ))}
            </div>
        ) : (
            <div className="canvas-structured-empty inline">
                <strong>{empty}</strong>
            </div>
        )}
    </section>
);

export const ExecutiveViewSection = ({
    executiveOutput,
    executiveReadyState,
    onCreateExecutiveOutput
}) => (
    <div className="canvas-structured-executive">
        {!executiveReadyState.ready ? (
            <ReadinessCallout
                title="Executive reconciliation needed"
                detail="This view is projected from the graph, but it needs stronger executive fields before it should be treated as final."
                issues={executiveReadyState.issues}
                actionLabel="Make executive-ready"
                onAction={onCreateExecutiveOutput}
            />
        ) : null}
        <section className="canvas-structured-executive-summary">
            <strong>Summary</strong>
            <p>{executiveOutput.summary}</p>
            <div>
                <span>{executiveOutput.metadata.source_backed_node_count} sourced</span>
                <span>{executiveOutput.metadata.task_count} actions</span>
                <span>{executiveOutput.metadata.needs_review_count} review</span>
            </div>
        </section>
        <ExecutiveList title="Key Findings" items={executiveOutput.key_findings} />
        <ExecutiveList title="Recommended Actions" items={executiveOutput.recommended_actions} />
        <ExecutiveList title="Risks" items={executiveOutput.risks} />
        <ExecutiveList title="Required Decisions" items={executiveOutput.required_decisions} />
        <ExecutiveList
            title="Source-backed Appendix"
            items={executiveOutput.source_backed_appendix}
        />
    </div>
);

export const TasksViewSection = ({
    taskRows,
    potentialTaskRows,
    statusOptions,
    priorityOptions,
    rowTypeLabel,
    summaryText,
    sourceLabel,
    updateTaskField,
    confirmTaskCandidate,
    onOpenNode,
    onGenerateTaskCandidates
}) => (
    <div className="canvas-structured-task-surface">
        <section className="canvas-structured-task-section">
            <div className="canvas-structured-section-header">
                <strong>Confirmed tasks</strong>
                <span>{taskRows.length}</span>
            </div>
            {taskRows.length > 0 ? (
                <div className="canvas-structured-table-wrap">
                    <table className="canvas-structured-table">
                        <thead>
                            <tr>
                                <th>Task</th>
                                <th>Type</th>
                                <th>Status</th>
                                <th>Priority</th>
                                <th>Owner</th>
                                <th>Due</th>
                                <th>Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {taskRows.map((row) => (
                                <tr key={row.id}>
                                    <td>
                                        <button type="button" onClick={() => onOpenNode?.(row.id)}>
                                            {row.title}
                                        </button>
                                        {summaryText(row) ? <p>{summaryText(row)}</p> : null}
                                    </td>
                                    <td>{rowTypeLabel(row)}</td>
                                    <td>
                                        <select
                                            className="canvas-structured-task-control"
                                            value={row.status || 'needs_review'}
                                            onChange={(event) =>
                                                updateTaskField(row.id, 'status', event.target.value)
                                            }
                                            aria-label={`Status for ${row.title}`}
                                        >
                                            {statusOptions.map((status) => (
                                                <option key={status} value={status}>
                                                    {status}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>
                                        <select
                                            className="canvas-structured-task-control"
                                            value={row.priority || ''}
                                            onChange={(event) =>
                                                updateTaskField(row.id, 'priority', event.target.value)
                                            }
                                            aria-label={`Priority for ${row.title}`}
                                        >
                                            {priorityOptions.map((priority) => (
                                                <option key={priority || 'none'} value={priority}>
                                                    {priority || 'None'}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>
                                        <input
                                            className="canvas-structured-task-control"
                                            value={row.owner_id || ''}
                                            placeholder="Owner"
                                            onChange={(event) =>
                                                updateTaskField(row.id, 'owner_id', event.target.value, {
                                                    record: false
                                                })
                                            }
                                            onBlur={(event) =>
                                                updateTaskField(row.id, 'owner_id', event.target.value)
                                            }
                                            aria-label={`Owner for ${row.title}`}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            className="canvas-structured-task-control"
                                            value={row.due_date || ''}
                                            placeholder="Due"
                                            onChange={(event) =>
                                                updateTaskField(row.id, 'due_date', event.target.value, {
                                                    record: false
                                                })
                                            }
                                            onBlur={(event) =>
                                                updateTaskField(row.id, 'due_date', event.target.value)
                                            }
                                            aria-label={`Due date for ${row.title}`}
                                        />
                                    </td>
                                    <td>{sourceLabel(row)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="canvas-structured-empty inline">
                    <strong>No tasks yet</strong>
                    <span>Create task candidates from the graph, then accept the ones that should become canonical.</span>
                    <button type="button" onClick={onGenerateTaskCandidates}>
                        Generate task candidates
                    </button>
                </div>
            )}
        </section>
        {potentialTaskRows.length > 0 ? (
            <section className="canvas-structured-task-section">
                <div className="canvas-structured-section-header">
                    <strong>Potential tasks</strong>
                    <span>{potentialTaskRows.length}</span>
                </div>
                <div className="canvas-structured-potential-list">
                    {potentialTaskRows.map((row) => (
                        <article
                            key={row.id}
                            className="canvas-structured-potential-item"
                        >
                            <button
                                type="button"
                                onClick={() => onOpenNode?.(row.id)}
                            >
                                <strong>{row.title}</strong>
                                <span>{rowTypeLabel(row)} · candidate</span>
                            </button>
                            <button
                                type="button"
                                className="canvas-structured-confirm-task"
                                onClick={() => confirmTaskCandidate(row)}
                            >
                                Confirm
                            </button>
                        </article>
                    ))}
                </div>
            </section>
        ) : null}
    </div>
);

export const KanbanViewSection = ({
    taskRows,
    kanbanColumns,
    onOpenNode,
    onMoveTask,
    onPrepareKanbanBoard,
    onGenerateTaskCandidates
}) => (
    taskRows.length > 0 ? (
        <KanbanBoardView
            columns={kanbanColumns}
            onOpenNode={onOpenNode}
            onMoveTask={onMoveTask}
        />
    ) : (
        <div className="canvas-structured-empty inline">
            <strong>No tasks on the board yet</strong>
            <span>Kanban needs task metadata first. Ask AI to supplement this workspace with board-ready cards, then review and accept them.</span>
            <button type="button" onClick={onPrepareKanbanBoard || onGenerateTaskCandidates}>
                Prepare Kanban board
            </button>
        </div>
    )
);
