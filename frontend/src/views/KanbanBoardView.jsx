import { useMemo, useState } from 'react';

const sourceLabel = (node) => {
    const ref = node.source_ref || {};
    return [ref.document_id, ref.page ? `p. ${ref.page}` : '', ref.section]
        .filter(Boolean)
        .join(' | ') || 'No source';
};

const summaryText = (node) => {
    const value = node.summary || node.query || '';
    return typeof value === 'string' ? value : '';
};

const statusLabel = (status = '') =>
    String(status || 'needs_review')
        .replaceAll('_', ' ')
        .replaceAll('-', ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());

const cardMeta = (row) =>
    [
        row.priority ? statusLabel(row.priority) : '',
        row.owner_id ? `Owner: ${row.owner_id}` : '',
        row.due_date ? `Due: ${row.due_date}` : '',
        sourceLabel(row)
    ].filter(Boolean);

const KanbanBoardView = ({ columns = [], onOpenNode, onMoveTask }) => {
    const [dragTargetId, setDragTargetId] = useState('');
    const columnIndexById = useMemo(
        () => new Map(columns.map((column, index) => [column.id, index])),
        [columns]
    );
    const columnOptions = useMemo(
        () => columns.map((column) => ({ label: column.label, status: column.status })),
        [columns]
    );

    const handleDragStart = (event, row) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', row.id);
    };

    const handleDrop = (event, column) => {
        event.preventDefault();
        setDragTargetId('');
        const nodeId = event.dataTransfer.getData('text/plain');
        if (nodeId) {
            onMoveTask?.(nodeId, column.status);
        }
    };

    const moveRelative = (row, column, direction) => {
        const currentIndex = columnIndexById.get(column.id) ?? 0;
        const target = columns[currentIndex + direction];
        if (target) {
            onMoveTask?.(row.id, target.status);
        }
    };

    return (
        <div className="canvas-kanban-board" aria-label="Kanban task board">
            {columns.map((column) => (
                <section
                    key={column.id}
                    className={[
                        'canvas-kanban-column',
                        dragTargetId === column.id ? 'canvas-kanban-column--drag-over' : ''
                    ]
                        .filter(Boolean)
                        .join(' ')}
                    onDragOver={(event) => event.preventDefault()}
                    onDragEnter={() => setDragTargetId(column.id)}
                    onDragLeave={() => setDragTargetId((current) => (current === column.id ? '' : current))}
                    onDrop={(event) => handleDrop(event, column)}
                    aria-label={`${column.label} column`}
                >
                    <div className="canvas-kanban-column-header">
                        <strong>{column.label}</strong>
                        <span>{column.items.length}</span>
                    </div>
                    <div className="canvas-kanban-cards" role="list">
                        {column.items.length ? (
                            column.items.map((row) => (
                                <article
                                    key={row.id}
                                    className="canvas-kanban-card"
                                    draggable
                                    onDragStart={(event) => handleDragStart(event, row)}
                                    role="listitem"
                                >
                                    <div className="canvas-kanban-card-title-row">
                                        <button type="button" onClick={() => onOpenNode?.(row.id)}>
                                            {row.title}
                                        </button>
                                        <select
                                            value={column.status}
                                            onChange={(event) => onMoveTask?.(row.id, event.target.value)}
                                            aria-label={`Move ${row.title} to column`}
                                        >
                                            {columnOptions.map((option) => (
                                                <option key={option.status} value={option.status}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {summaryText(row) ? <p>{summaryText(row)}</p> : null}
                                    <div className="canvas-kanban-card-meta">
                                        {cardMeta(row).map((item) => (
                                            <span key={item}>{item}</span>
                                        ))}
                                    </div>
                                    <div className="canvas-kanban-card-actions" aria-label={`Move ${row.title}`}>
                                        <button
                                            type="button"
                                            onClick={() => moveRelative(row, column, -1)}
                                            disabled={(columnIndexById.get(column.id) ?? 0) === 0}
                                        >
                                            Back
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => moveRelative(row, column, 1)}
                                            disabled={(columnIndexById.get(column.id) ?? 0) === columns.length - 1}
                                        >
                                            Next
                                        </button>
                                    </div>
                                </article>
                            ))
                        ) : (
                            <div className="canvas-kanban-empty-column">Drop tasks here</div>
                        )}
                    </div>
                </section>
            ))}
        </div>
    );
};

export default KanbanBoardView;
