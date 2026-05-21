import { useMemo, useState } from 'react';
import TrustStateBadges from '../components/TrustStateBadges';

const sourceLabel = (node) => {
    if (node.structured_evidence?.table_name || node.structured_evidence?.query_id) {
        return [node.structured_evidence.table_name, node.structured_evidence.query_id]
            .filter(Boolean)
            .join(' | ');
    }
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
        row.structured_evidence ? '' : sourceLabel(row)
    ].filter(Boolean);

const evidenceChips = (row) => {
    const evidence = row.structured_evidence;
    if (!evidence) {
        return [];
    }
    return [
        evidence.table_name || '',
        evidence.row_count ? `${evidence.row_count} rows` : '',
        evidence.query_id || ''
    ].filter(Boolean);
};

const KanbanBoardView = ({ columns = [], onOpenNode, onMoveTask }) => {
    const [dragTargetId, setDragTargetId] = useState('');
    const [openQueryIds, setOpenQueryIds] = useState(new Set());
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

    const toggleQuery = (rowId) => {
        setOpenQueryIds((current) => {
            const next = new Set(current);
            if (next.has(rowId)) {
                next.delete(rowId);
            } else {
                next.add(rowId);
            }
            return next;
        });
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
                                    {row.structured_evidence ? (
                                        <div className="canvas-kanban-evidence">
                                            <TrustStateBadges
                                                subject={{
                                                    ...row,
                                                    status: row.review_state || row.status,
                                                    structured_evidence: row.structured_evidence
                                                }}
                                            />
                                            <div className="canvas-kanban-evidence-chips">
                                                {evidenceChips(row).map((item) => (
                                                    <span key={item}>{item}</span>
                                                ))}
                                            </div>
                                            {openQueryIds.has(row.id) && row.structured_evidence.query ? (
                                                <pre className="canvas-kanban-query">
                                                    <code>{row.structured_evidence.query}</code>
                                                </pre>
                                            ) : null}
                                        </div>
                                    ) : null}
                                    <div className="canvas-kanban-card-actions" aria-label={`Move ${row.title}`}>
                                        {row.structured_evidence ? (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        onOpenNode?.(row.evidence_node_id || row.id)
                                                    }
                                                >
                                                    Open evidence
                                                </button>
                                                {row.structured_evidence.query ? (
                                                    <button type="button" onClick={() => toggleQuery(row.id)}>
                                                        {openQueryIds.has(row.id) ? 'Hide query' : 'View query'}
                                                    </button>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    onClick={() => onMoveTask?.(row.id, 'reviewed')}
                                                >
                                                    Mark reviewed
                                                </button>
                                            </>
                                        ) : null}
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
