/* eslint-disable react/prop-types */
import { asArray, formatScore } from './draftPanelFormatters';

const SoftwareOverlapReports = ({ reports = [] }) => (
    <details className="ai-draft-details ai-draft-overlap-review" open>
        <summary>
            {reports.reduce((count, report) => count + asArray(report.candidates).length, 0)} potential overlap{' '}
            {reports.reduce((count, report) => count + asArray(report.candidates).length, 0) === 1
                ? 'candidate'
                : 'candidates'}
        </summary>
        <div className="ai-draft-overlap-list">
            {reports.map((report) => (
                <section key={report.id} className="ai-draft-overlap-report">
                    <div className="ai-draft-overlap-report-header">
                        <span>Potential overlap</span>
                        <strong>{report.title}</strong>
                        {report.summary ? <p>{report.summary}</p> : null}
                    </div>
                    {asArray(report.candidates).map((candidate) => (
                        <article key={`${report.id}-${candidate.id}`} className="ai-draft-overlap-candidate">
                            <div className="ai-draft-overlap-title">
                                <strong>{candidate.title}</strong>
                                <span>{candidate.reviewState || report.reviewState || 'needs_review'}</span>
                            </div>
                            <div className="ai-draft-overlap-metrics">
                                <span>Score: {formatScore(candidate.score)}</span>
                                <span>Confidence: {candidate.confidence || 'Not set'}</span>
                            </div>
                            {candidate.rationale ? <p>{candidate.rationale}</p> : null}
                            {candidate.recommendation ? <small>{candidate.recommendation}</small> : null}
                            {candidate.factors.length ? (
                                <div className="ai-draft-overlap-chips" aria-label="Overlap scoring factors">
                                    {candidate.factors.slice(0, 4).map((factor) => (
                                        <span key={`${candidate.id}-${factor.id}`}>
                                            {factor.label}
                                            {factor.value ? `: ${factor.value}` : ''}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                            {candidate.evidence.length ? (
                                <ul className="ai-draft-overlap-evidence">
                                    {candidate.evidence.slice(0, 3).map((evidence) => (
                                        <li key={`${candidate.id}-${evidence.id}`}>
                                            <span>{evidence.label}</span>
                                            {evidence.source ? <small>{evidence.source}</small> : null}
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </article>
                    ))}
                </section>
            ))}
        </div>
    </details>
);

export default SoftwareOverlapReports;
