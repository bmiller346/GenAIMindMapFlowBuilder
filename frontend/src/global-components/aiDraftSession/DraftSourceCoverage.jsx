/* eslint-disable react/prop-types */
import {
    AI_DRAFT_ACCEPT_MODES,
    getAIDraftAcceptModeDetail
} from '../../utils/aiDraftSessions';
import { formatTokenCount, humanizeId, usageSummary } from './draftPanelFormatters';

const ACCEPT_MODE_LABELS = {
    append: getAIDraftAcceptModeDetail('append').label,
    replace: getAIDraftAcceptModeDetail('replace').label,
    merge: getAIDraftAcceptModeDetail('merge').label,
    selected: getAIDraftAcceptModeDetail('selected').label,
    cited_only: getAIDraftAcceptModeDetail('cited_only').label,
    notes_only: getAIDraftAcceptModeDetail('notes_only').label
};

const DraftSourceCoverage = ({
    modelMeta,
    coverage,
    availableSources,
    sourceToAddId,
    onSourceToAddChange,
    onOpenSourceModal,
    isAddingSource,
    acceptMode,
    onAcceptModeChange,
    acceptModeDetail
}) => (
    <details className="ai-draft-details">
        <summary>Options</summary>
        <div className="ai-draft-meta-grid">
            <div>
                <span>Model</span>
                <strong>{modelMeta.model}</strong>
                {modelMeta.reason ? <small>{modelMeta.reason}</small> : null}
            </div>
            <div>
                <span>Usage</span>
                <strong>{usageSummary(modelMeta)}</strong>
                <small>
                    {modelMeta.inputTokens || modelMeta.outputTokens
                        ? `${formatTokenCount(modelMeta.inputTokens)} in · ${formatTokenCount(modelMeta.outputTokens)} out`
                        : modelMeta.usageCostSource === 'token_usage_only'
                          ? 'Cost estimate needs configured pricing.'
                          : 'Tracked per draft revision.'}
                </small>
            </div>
            <div>
                <span>Sources</span>
                <strong>{coverage.total ? `${coverage.cited}/${coverage.total} cited` : 'No items'}</strong>
                <small>
                    {coverage.uncited
                        ? `${coverage.missingRequired} uncited · ${coverage.inferred} inferred`
                        : coverage.webCited
                          ? `${coverage.webCited} web-cited · ${coverage.sourceBacked} source-backed`
                        : 'Ready for review'}
                </small>
            </div>
        </div>
        <div className="ai-draft-source-tools">
            <label>
                Add source
                <select
                    value={sourceToAddId}
                    onChange={(event) => onSourceToAddChange(event.target.value)}
                >
                    <option value="">Choose loaded source</option>
                    {availableSources.map((source) => (
                        <option key={source.id} value={source.id}>
                            {source.title || source.id}
                        </option>
                    ))}
                </select>
            </label>
            <button
                type="button"
                className="secondary"
                onClick={onOpenSourceModal}
                disabled={isAddingSource || !sourceToAddId}
            >
                {isAddingSource ? 'Reconciling' : 'Reconcile source'}
            </button>
            <label>
                Apply mode
                <select
                    value={acceptMode}
                    onChange={(event) => onAcceptModeChange(event.target.value)}
                >
                    {AI_DRAFT_ACCEPT_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                            {ACCEPT_MODE_LABELS[mode] || humanizeId(mode)}
                        </option>
                    ))}
                </select>
                <small>{acceptModeDetail.help}</small>
            </label>
        </div>
    </details>
);

export default DraftSourceCoverage;
