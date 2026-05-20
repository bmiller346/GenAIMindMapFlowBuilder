/* eslint-disable react/prop-types */
import {
    AcceptedConnectionsSummary,
    OutputStatePill
} from '../views/localViews/ReviewExplanationContent';

const ConnectionsReviewSurface = ({
    connectionRows,
    crossLinkRows,
    relationshipReviewGroups,
    relationshipReviewRows,
    graphConfidence,
    relationshipExportStatus,
    flowId,
    onOpenAiPreset,
    onSelectEdge,
    onCopyReview,
    onDownloadReview
}) => (
    <div className="local-table-wrap">
        <AcceptedConnectionsSummary
            connectionRows={connectionRows}
            crossLinkRows={crossLinkRows}
            relationshipReviewRows={relationshipReviewRows}
            graphConfidence={graphConfidence}
            relationshipExportStatus={relationshipExportStatus}
            OutputStatePill={OutputStatePill}
            flowId={flowId}
            onOpenAiPreset={onOpenAiPreset}
            onCopyReview={onCopyReview}
            onDownloadReview={onDownloadReview}
        />
        {relationshipReviewGroups.length > 0 ? (
            <div className="local-relationship-groups" aria-label="Relationship groups">
                {relationshipReviewGroups.map((group) => (
                    <section key={group.id} className="local-relationship-group">
                        <div>
                            <strong>{group.label}</strong>
                            <span>
                                {group.rows.length} relationship
                                {group.rows.length === 1 ? '' : 's'}
                            </span>
                        </div>
                        <ol>
                            {group.rows.slice(0, 3).map((row) => (
                                <li key={row.id}>
                                    <button type="button" onClick={() => onSelectEdge?.(row.id)}>
                                        {row.source.title}
                                        <span>{row.relationship}</span>
                                        {row.target.title}
                                    </button>
                                </li>
                            ))}
                        </ol>
                    </section>
                ))}
            </div>
        ) : null}
        <table className="local-projection-table">
            <thead>
                <tr>
                    <th>From</th>
                    <th>Relationship</th>
                    <th>To</th>
                    <th>Family</th>
                    <th>Confidence</th>
                    <th>Review state</th>
                    <th>Signal</th>
                    <th>Details</th>
                </tr>
            </thead>
            <tbody>
                {relationshipReviewRows.map((row) => (
                    <tr key={row.id}>
                        <td>{row.source.title}</td>
                        <td>{row.relationship}</td>
                        <td>{row.target.title}</td>
                        <td>{row.family_label}</td>
                        <td>{row.confidence || 'Not set'}</td>
                        <td>
                            <OutputStatePill state={row.review_state || 'Locally projected'} />
                        </td>
                        <td title={row.rationale || row.source_signal}>{row.source_signal || 'Not set'}</td>
                        <td>
                            <button type="button" onClick={() => onSelectEdge?.(row.id)}>
                                Open
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
        {relationshipReviewRows.length === 0 ? (
            <div className="local-table-empty local-empty-actions">
                <strong>No relationship edges in this scope.</strong>
                <span>
                    This is not broken. Find connections will propose cross-branch
                    relationship candidates with confidence and rationale for review.
                </span>
                <button type="button" onClick={() => onOpenAiPreset('connections')} disabled={!flowId}>
                    Find connections
                </button>
            </div>
        ) : null}
    </div>
);

export default ConnectionsReviewSurface;
