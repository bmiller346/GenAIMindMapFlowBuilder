/* eslint-disable react/prop-types */
const selectedRows = (rows = [], activeIds = new Set(), idKey = 'id') =>
    rows.filter((row) => activeIds.has(row[idKey]));

const sourcedItemCount = (rows) =>
    rows.filter(
        (row) =>
            row.source_ref?.document_id ||
            row.source_refs?.some((sourceRef) => sourceRef?.document_id)
    ).length;

const generatedItemCount = (rows) =>
    rows.filter((row) => row.generated_preview_item).length;

const unsourcedItemCount = (rows) => rows.length - sourcedItemCount(rows);

const countFromDiff = (diff = {}, keys = []) => {
    for (const key of keys) {
        const value = Number(diff[key]);
        if (Number.isFinite(value) && value > 0) {
            return value;
        }
    }
    return 0;
};

export const previewDiffToChanges = (diff = {}, { acceptLabel = 'will be accepted' } = {}) => {
    const addedNodes = countFromDiff(diff, ['added_nodes', 'nodes']);
    const addedEdges = countFromDiff(diff, ['added_edges', 'edges']);
    const relationshipEdges = countFromDiff(diff, ['relationship_edges']);
    const reviewOutputs = countFromDiff(diff, ['review_outputs', 'artifacts']);
    const updatedNodes = countFromDiff(diff, ['updated_nodes', 'updates']);
    const removedNodes = countFromDiff(diff, ['removed_nodes', 'removals']);
    const removedEdges = countFromDiff(diff, ['removed_edges']);
    const needsReview = countFromDiff(diff, ['needs_review_repairs', 'needs_review_items']);
    const changes = [];

    if (addedNodes > 0) {
        changes.push({
            tone: 'add',
            label: `${addedNodes} new node${addedNodes === 1 ? '' : 's'} ${acceptLabel}`
        });
    }
    if (addedEdges > 0) {
        changes.push({
            tone: 'add',
            label: `${addedEdges} graph edge${addedEdges === 1 ? '' : 's'} ${acceptLabel}`
        });
    }
    if (relationshipEdges > 0) {
        changes.push({
            tone: 'add',
            label: `${relationshipEdges} relationship edge${
                relationshipEdges === 1 ? '' : 's'
            } ${acceptLabel}`
        });
    }
    if (reviewOutputs > 0) {
        changes.push({
            tone: 'ai',
            label: `${reviewOutputs} artifact${reviewOutputs === 1 ? '' : 's'} ${acceptLabel}`
        });
    }
    if (updatedNodes > 0) {
        changes.push({
            tone: 'update',
            label: `${updatedNodes} node${updatedNodes === 1 ? '' : 's'} updated`
        });
    }
    if (removedNodes > 0) {
        changes.push({
            tone: 'remove',
            label: `${removedNodes} scoped node${removedNodes === 1 ? '' : 's'} removed`
        });
    }
    if (removedEdges > 0) {
        changes.push({
            tone: 'remove',
            label: `${removedEdges} connected edge${removedEdges === 1 ? '' : 's'} removed`
        });
    }
    if (needsReview > 0) {
        changes.push({
            tone: 'warn',
            label: `${needsReview} item${needsReview === 1 ? '' : 's'} marked needs_review`
        });
    }

    return changes.length ? changes : [{ tone: 'none', label: 'No changes selected yet' }];
};

export const makePreviewDiffSummary = ({
    rows = [],
    activeIds = new Set(),
    idKey = 'id',
    artifactLabel = 'preview item',
    updatedFields = [],
    relationshipEdges = 0,
    mode = 'local',
    acceptLabel = 'will be accepted'
}) => {
    const selected = selectedRows(rows, activeIds, idKey);
    const selectedCount = selected.length;
    const generatedCount = generatedItemCount(selected);
    const unsourcedCount = unsourcedItemCount(selected);
    const changes = [];

    if (selectedCount > 0) {
        changes.push({
            tone: 'add',
            label: `${selectedCount} ${artifactLabel}${selectedCount === 1 ? '' : 's'} ${acceptLabel}`
        });
    }
    if (relationshipEdges > 0) {
        changes.push({
            tone: 'add',
            label: `${relationshipEdges} relationship edge${
                relationshipEdges === 1 ? '' : 's'
            } in scope`
        });
    }
    if (updatedFields.length > 0 && selectedCount > 0) {
        changes.push({
            tone: 'update',
            label: `${selectedCount} node${selectedCount === 1 ? '' : 's'} updated with ${updatedFields.join('/')}`
        });
    }
    if (generatedCount > 0) {
        changes.push({
            tone: 'ai',
            label: `${generatedCount} AI-generated item${generatedCount === 1 ? '' : 's'}`
        });
    }
    if (unsourcedCount > 0) {
        changes.push({
            tone: 'warn',
            label: `${unsourcedCount} unsourced item${unsourcedCount === 1 ? '' : 's'} marked needs_review`
        });
    }

    if (changes.length === 0) {
        changes.push({
            tone: 'none',
            label:
                mode === 'generated'
                    ? 'No generated changes selected yet'
                    : 'No local workspace changes selected yet'
        });
    }

    return changes;
};

export const PreviewDiffSummary = ({ title = 'Before accept', changes = [] }) => (
    <div className="preview-diff-summary" aria-label={title}>
        <strong>{title}</strong>
        <div>
            {changes.map((change) => (
                <span key={`${change.tone}-${change.label}`} className={`preview-diff-${change.tone}`}>
                    {change.tone === 'add'
                        ? '+'
                        : change.tone === 'update'
                          ? '~'
                          : change.tone === 'remove'
                            ? '-'
                            : change.tone === 'warn'
                              ? '!'
                              : change.tone === 'ai'
                                ? '*'
                                : '-'}{' '}
                    {change.label}
                </span>
            ))}
        </div>
    </div>
);
