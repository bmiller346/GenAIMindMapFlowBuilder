/* eslint-disable react/prop-types */
import { PreviewDiffSummary } from '../../views/previewDiffSummary';
import { asArray, humanizeId } from './draftPanelFormatters';

const CHANGE_INTENT_LABELS = {
    update: 'Update existing graph context',
    supplement: 'Supplement current workspace',
    compare: 'Compare and keep both'
};

const GRAPH_FILTER_LABELS = {
    'source-backed': 'Source-backed',
    'ai-assumption': 'AI assumption',
    'needs-review': 'Needs review',
    manual: 'Manual',
    'ai-generated': 'AI-generated',
    'tasks-only': 'Tasks only',
    unassigned: 'Unassigned',
    'missing-due-date': 'Missing due',
    'missing-source': 'Missing citation',
    'low-confidence': 'Low confidence',
    'hidden-from-export': 'Hidden export'
};

const CANVAS_LABELS = {
    mindmap: 'TraceSpace Map',
    knowledgeGraph: 'Knowledge Graph',
    executive: 'Executive',
    outline: 'Outline',
    tasks: 'Tasks',
    table: 'Table'
};

const modeNoun = (mode = 'append') => {
    if (mode === 'replace') {
        return 'Replacement';
    }
    if (mode === 'merge') {
        return 'Update';
    }
    if (mode === 'selected') {
        return 'Selection';
    }
    if (mode === 'cited_only') {
        return 'Cited items';
    }
    if (mode === 'notes_only') {
        return 'Preview';
    }
    return 'Supplement';
};

const DraftAcceptControls = ({
    sessionChangeIntent,
    acceptMode,
    acceptModeDetail,
    acceptImpact,
    selectedItemIds,
    isAccepting,
    primaryAcceptText,
    itemCount,
    readinessGate,
    onDiscard,
    onAccept
}) => {
    const bulkBlocked = Boolean(readinessGate?.bulk_accept_blocked);
    const blockCount = Number(readinessGate?.blocker_count || 0);
    return (
    <>
        <div className="ai-draft-apply-mode" aria-label="Draft apply mode">
            <span>{CHANGE_INTENT_LABELS[sessionChangeIntent] || 'Supplement current workspace'}</span>
            <strong>{acceptModeDetail.label}</strong>
            <p>{acceptModeDetail.help}</p>
        </div>

        <div className="ai-draft-impact" aria-label="Before accept">
            <span>Before accept</span>
            <PreviewDiffSummary title={modeNoun(acceptMode)} changes={acceptImpact.changes} />
            <div>
                <strong>
                    {acceptImpact.diff.metadata?.accept_mode_label || acceptModeDetail.label}
                </strong>
                {asArray(acceptImpact.diff.preview_lines).map((line) => (
                    <p key={line}>{line}</p>
                ))}
            </div>
            <div>
                <strong>Canvas</strong>
                <p>
                    {acceptImpact.canvasChanged ? 'Switch to ' : 'Stay on '}
                    {CANVAS_LABELS[acceptImpact.nextCanvas] || humanizeId(acceptImpact.nextCanvas)}
                </p>
            </div>
            <div>
                <strong>Filters</strong>
                <p>
                    Unchanged
                    {acceptImpact.activeFilters.length
                        ? ` (${acceptImpact.activeFilters
                              .map((filterId) => GRAPH_FILTER_LABELS[filterId] || humanizeId(filterId))
                              .join(', ')})`
                        : ' (none active)'}
                </p>
            </div>
        </div>

        {bulkBlocked ? (
            <div className="ai-draft-readiness-gate" role="status">
                <strong>Package bulk accept blocked</strong>
                <p>
                    {blockCount} readiness blocker{blockCount === 1 ? '' : 's'} need repair.
                    Selected package items can still be accepted after review.
                </p>
            </div>
        ) : null}

        <div className="ai-draft-accept">
            <button type="button" className="secondary" onClick={onDiscard}>
                Discard
            </button>
            {selectedItemIds.length ? (
                <button type="button" onClick={() => onAccept('selected')} disabled={isAccepting}>
                Accept selected
                </button>
            ) : null}
            <button type="button" onClick={() => onAccept()} disabled={isAccepting || itemCount === 0 || bulkBlocked}>
                {isAccepting ? 'Accepting' : primaryAcceptText}
            </button>
        </div>
    </>
    );
};

export default DraftAcceptControls;
