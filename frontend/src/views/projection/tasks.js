import {
    TASK_CAPABLE_TYPES,
    checklistProjectionForNode,
    isConfirmedTaskNode,
    isHierarchyEdge,
    normalizeSignal,
    projectedTaskValue,
    structuredEvidenceForTask,
    taskProjectionForNode
} from './packageReady.js';

export const getTaskRows = (projection) =>
    projection.nodes
        .filter((node) => isConfirmedTaskNode(node))
        .map((node) => {
            const taskProjection = taskProjectionForNode(node);
            const structuredEvidence = structuredEvidenceForTask(node);

            return {
                ...node,
                node_type: taskProjection?.preview_type || node.node_type,
                status:
                    (node.status && node.status !== 'ai_generated'
                        ? node.status
                        : '') ||
                    taskProjection?.preview_status ||
                    node.status ||
                    'needs_review',
                priority: projectedTaskValue(node, 'priority'),
                owner_id: projectedTaskValue(node, 'owner_id'),
                due_date: projectedTaskValue(node, 'due_date'),
                source_document: node.source_ref.document_id || '',
                source_page: node.source_ref.page || '',
                source_section: node.source_ref.section || '',
                source_quote: node.source_ref.quote_snippet || '',
                structured_evidence: structuredEvidence,
                evidence_node_id: structuredEvidence?.evidence_node_id || ''
            };
        });

export const KANBAN_COLUMN_DEFINITIONS = [
    { id: 'backlog', label: 'Backlog', status: 'needs_review', statuses: ['ai_generated', 'needs_review'] },
    { id: 'in_progress', label: 'In Progress', status: 'in_progress', statuses: ['in_progress', 'reviewed'] },
    { id: 'blocked', label: 'Blocked', status: 'blocked', statuses: ['blocked'] },
    { id: 'done', label: 'Done', status: 'approved', statuses: ['approved', 'done'] },
    { id: 'archived', label: 'Archived', status: 'rejected', statuses: ['rejected', 'deprecated'] }
];

const kanbanColumnForStatus = (status = '') => {
    const normalized = normalizeSignal(status || 'needs_review');
    return (
        KANBAN_COLUMN_DEFINITIONS.find((column) =>
            column.statuses.map(normalizeSignal).includes(normalized)
        ) || KANBAN_COLUMN_DEFINITIONS[0]
    );
};

const KANBAN_PRIORITY_RANK = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3
};

const kanbanSortValue = (row) => ({
    dueDate: row.due_date ? String(row.due_date) : '9999-12-31',
    priority:
        KANBAN_PRIORITY_RANK[normalizeSignal(row.priority)] ??
        Number.MAX_SAFE_INTEGER,
    title: String(row.title || '').toLowerCase()
});

const compareKanbanRows = (a, b) => {
    const left = kanbanSortValue(a);
    const right = kanbanSortValue(b);
    return (
        left.dueDate.localeCompare(right.dueDate) ||
        left.priority - right.priority ||
        left.title.localeCompare(right.title)
    );
};

export const getKanbanColumns = (projection) => {
    const columns = KANBAN_COLUMN_DEFINITIONS.map((column) => ({
        ...column,
        items: []
    }));
    const columnById = new Map(columns.map((column) => [column.id, column]));

    getTaskRows(projection).forEach((row) => {
        const column = kanbanColumnForStatus(row.status);
        columnById.get(column.id)?.items.push(row);
    });

    columns.forEach((column) => {
        column.items.sort(compareKanbanRows);
    });

    return columns;
};

export const getTaskPreviewRows = (projection) =>
    projection.nodes
        .filter((node) => node.node_type !== 'reference')
        .map((node) => {
            const taskProjection = taskProjectionForNode(node);
            const isAlreadyTask = isConfirmedTaskNode(node);
            return {
                ...node,
                preview_type:
                    taskProjection?.preview_type ||
                    (isAlreadyTask ? node.node_type : 'task'),
                preview_status:
                    taskProjection?.preview_status ||
                    (node.status === 'approved' || node.status === 'reviewed'
                        ? node.status
                        : 'needs_review'),
                priority: projectedTaskValue(node, 'priority'),
                owner_id: projectedTaskValue(node, 'owner_id'),
                due_date: projectedTaskValue(node, 'due_date'),
                included: isAlreadyTask || node.node_type !== 'question'
            };
        });

export const getTaskCandidateRows = (projection) => {
    const confirmedIds = new Set(getTaskRows(projection).map((node) => node.id));
    return getTaskPreviewRows(projection).filter(
        (node) => node.included && !confirmedIds.has(node.id)
    );
};

export const getChecklistPreviewRows = (projection) => {
    const childCountByNode = projection.edges
        .filter(isHierarchyEdge)
        .reduce((counts, edge) => {
            counts.set(edge.source, (counts.get(edge.source) || 0) + 1);
            return counts;
        }, new Map());

    return projection.nodes
        .filter((node) => node.node_type !== 'reference')
        .map((node, index) => {
            const hasChildren = childCountByNode.has(node.id);
            const isReviewItem =
                node.status === 'needs_review' || node.node_type === 'needs_review';
            const checklistProjection = checklistProjectionForNode(node);

            return {
                ...node,
                checklist_order: checklistProjection?.order || index + 1,
                checklist_label: checklistProjection?.label || node.title,
                checklist_note:
                    checklistProjection?.note ||
                    node.summary ||
                    (hasChildren
                        ? 'Parent item with nested follow-up work.'
                        : 'Leaf item ready for checklist review.'),
                included: Boolean(checklistProjection) || !hasChildren || isReviewItem,
                review_required:
                    checklistProjection?.review_required ??
                    (isReviewItem || !node.source_ref?.document_id || !node.confidence),
                priority: projectedTaskValue(node, 'priority'),
                owner_id: projectedTaskValue(node, 'owner_id'),
                due_date: projectedTaskValue(node, 'due_date')
            };
        });
};

const missingInfoReasons = (node) => {
    const reasons = [];
    const isTaskCapable = TASK_CAPABLE_TYPES.has(node.node_type);

    if (!node.source_ref?.document_id) {
        reasons.push('Missing source document');
    }
    if (!node.confidence) {
        reasons.push('Missing confidence');
    }
    if (!node.summary && node.node_type !== 'reference') {
        reasons.push('Missing summary');
    }
    if (node.status === 'needs_review' || node.node_type === 'needs_review') {
        reasons.push('Marked for review');
    }
    if (isTaskCapable && !node.owner_id) {
        reasons.push('Missing owner');
    }
    if (isTaskCapable && !node.due_date) {
        reasons.push('Missing due date');
    }
    if (isTaskCapable && !node.priority) {
        reasons.push('Missing priority');
    }

    return reasons;
};

export const getMissingInfoPreviewRows = (projection) =>
    projection.nodes
        .map((node) => {
            const reasons = missingInfoReasons(node);
            const severity =
                reasons.some((reason) => reason.includes('source')) ||
                reasons.some((reason) => reason.includes('review'))
                    ? 'high'
                    : reasons.length >= 3
                      ? 'medium'
                      : 'low';

            return {
                ...node,
                reasons,
                severity,
                included: reasons.length > 0
            };
        })
        .filter((node) => node.reasons.length > 0);

const questionForReason = (node, reason) => {
    if (reason === 'Missing source document') {
        return `Which source document, page, or section verifies "${node.title}"?`;
    }
    if (reason === 'Missing confidence') {
        return `How confident should reviewers be in "${node.title}", and why?`;
    }
    if (reason === 'Missing summary') {
        return `What is the concise business meaning or requirement behind "${node.title}"?`;
    }
    if (reason === 'Marked for review') {
        return `What decision is needed before "${node.title}" can be approved?`;
    }
    if (reason === 'Missing owner') {
        return `Who should own follow-up for "${node.title}"?`;
    }
    if (reason === 'Missing due date') {
        return `When should "${node.title}" be completed or reviewed?`;
    }
    if (reason === 'Missing priority') {
        return `What priority should "${node.title}" have for execution?`;
    }

    return `What information is needed to finalize "${node.title}"?`;
};

export const getSmeQuestionPreviewRows = (projection) =>
    getMissingInfoPreviewRows(projection).flatMap((node) =>
        node.reasons.map((reason, index) => ({
            ...node,
            question_id: `${node.id}-${reason.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            question_order: index + 1,
            reason,
            question: questionForReason(node, reason),
            included: true
        }))
    );

