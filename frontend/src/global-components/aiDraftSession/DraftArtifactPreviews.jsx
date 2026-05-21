/* eslint-disable react/prop-types */
import TrustStateBadges from '../../components/TrustStateBadges';
import { humanizeId } from './draftPanelFormatters';

const DraftArtifactPreviews = ({ artifacts, copiedArtifactId, onCopy }) => (
    <section className="ai-draft-artifact-previews" aria-label="Draft artifact previews">
        {artifacts.map((artifact) => {
            const hasMeta =
                artifact.audience ||
                artifact.publishTarget ||
                artifact.reviewState ||
                artifact.provenance?.evidenceLabel ||
                artifact.provenance?.citationLabel;
            const provenanceTone = artifact.provenance?.tone || 'neutral';
            const trustSubject = {
                ...artifact,
                source_refs: artifact.sourceRefs,
                status: artifact.reviewState,
                metadata: {
                    evidence_mode: artifact.provenance?.evidenceMode,
                    citation_policy: artifact.provenance?.citationPolicy
                }
            };
            return (
                <article key={`artifact-preview-${artifact.id}`} className="ai-draft-artifact-preview">
                    <div className="ai-draft-artifact-header">
                        <div>
                            <span>{artifact.label}</span>
                            <strong>{artifact.title}</strong>
                            {artifact.dek ? <p>{artifact.dek}</p> : null}
                        </div>
                        <button type="button" className="secondary" onClick={() => onCopy(artifact)}>
                            {copiedArtifactId === artifact.id ? 'Copied' : 'Copy Markdown'}
                        </button>
                    </div>
                    {hasMeta ? (
                        <div className="ai-draft-artifact-meta">
                            {artifact.audience ? <span>{artifact.audience}</span> : null}
                            {artifact.publishTarget ? <span>{artifact.publishTarget}</span> : null}
                            {artifact.reviewState ? <span>{humanizeId(artifact.reviewState)}</span> : null}
                            {artifact.provenance?.evidenceLabel ? (
                                <span>{artifact.provenance.evidenceLabel}</span>
                            ) : null}
                            {artifact.provenance?.citationLabel ? (
                                <span>{artifact.provenance.citationLabel}</span>
                            ) : null}
                            {artifact.provenance?.sourceRefCount ? (
                                <span>
                                    {artifact.provenance.sourceRefCount} source{' '}
                                    {artifact.provenance.sourceRefCount === 1 ? 'reference' : 'references'}
                                </span>
                            ) : null}
                            <TrustStateBadges subject={trustSubject} />
                        </div>
                    ) : null}
                    {artifact.provenance?.summary ? (
                        <p
                            className={`ai-draft-artifact-evidence ai-draft-artifact-evidence-${provenanceTone}`}
                        >
                            <strong>Evidence</strong>
                            <span>{artifact.provenance.summary}</span>
                        </p>
                    ) : null}
                    {artifact.keyPoints.length ? (
                        <ul className="ai-draft-artifact-key-points">
                            {artifact.keyPoints.slice(0, 5).map((point) => (
                                <li key={point}>{point}</li>
                            ))}
                        </ul>
                    ) : null}
                    {artifact.body ? <p className="ai-draft-artifact-body">{artifact.body}</p> : null}
                    {artifact.recommendedActions?.length ? (
                        <div className="ai-draft-artifact-sections">
                            <section>
                                <strong>Recommended actions</strong>
                                <ul>
                                    {artifact.recommendedActions.slice(0, 4).map((point) => (
                                        <li key={point}>{point}</li>
                                    ))}
                                </ul>
                            </section>
                        </div>
                    ) : null}
                    {artifact.risks?.length ? (
                        <div className="ai-draft-artifact-sections">
                            <section>
                                <strong>Risks</strong>
                                <ul>
                                    {artifact.risks.slice(0, 4).map((point) => (
                                        <li key={point}>{point}</li>
                                    ))}
                                </ul>
                            </section>
                        </div>
                    ) : null}
                    {artifact.sections.length ? (
                        <div className="ai-draft-artifact-sections">
                            {artifact.sections.slice(0, 4).map((section) => (
                                <section key={section.id}>
                                    <strong>{section.title}</strong>
                                    {section.body ? <p>{section.body}</p> : null}
                                    {section.bullets.length ? (
                                        <ul>
                                            {section.bullets.slice(0, 4).map((point) => (
                                                <li key={point}>{point}</li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </section>
                            ))}
                        </div>
                    ) : null}
                    {artifact.assumptions?.length ? (
                        <p className="ai-draft-artifact-body">
                            <strong>Assumptions: </strong>
                            {artifact.assumptions.slice(0, 3).join('; ')}
                        </p>
                    ) : null}
                </article>
            );
        })}
    </section>
);

export default DraftArtifactPreviews;
