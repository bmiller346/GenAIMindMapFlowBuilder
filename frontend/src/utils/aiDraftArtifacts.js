import {
    aiDraftCitationPolicyLabel,
    aiDraftEvidenceModeLabel,
    normalizeAIDraftCitationPolicy,
    normalizeAIDraftEvidenceMode
} from './aiDraftSessions.js';
import { asArray, firstText, mergeSourceRefs } from './aiDraftSessionCommon.js';

const softwareOverlapArtifactTypes = new Set([
    'software_overlap_report',
    'software_overlap_candidate',
    'overlap_candidate',
    'tool_overlap',
    'duplicate_tool',
    'software_rationalization'
]);

const normalizeSoftwareFactor = (factor = {}, index = 0) => {
    if (typeof factor === 'string') {
        return {
            id: `factor-${index + 1}`,
            label: factor,
            value: ''
        };
    }
    return {
        id: firstText(factor.id, factor.key, factor.name, `factor-${index + 1}`),
        label: firstText(factor.label, factor.name, factor.key, factor.factor, `Factor ${index + 1}`),
        value: firstText(factor.value, factor.score, factor.weight, factor.detail, factor.summary)
    };
};

const normalizeSoftwareEvidence = (evidence = {}, index = 0) => {
    if (typeof evidence === 'string') {
        return {
            id: `evidence-${index + 1}`,
            label: evidence,
            source: ''
        };
    }
    return {
        id: firstText(evidence.id, evidence.source_id, evidence.document_id, `evidence-${index + 1}`),
        label: firstText(
            evidence.label,
            evidence.quote_snippet,
            evidence.snippet,
            evidence.text,
            evidence.summary,
            evidence.title,
            `Evidence ${index + 1}`
        ),
        source: [
            firstText(evidence.document_id, evidence.source_id, evidence.source),
            evidence.page ? `p. ${evidence.page}` : '',
            firstText(evidence.section)
        ]
            .filter(Boolean)
            .join(' | ')
    };
};

const collectSoftwareOverlapCandidates = (artifact = {}) =>
    [
        artifact.candidates,
        artifact.overlap_candidates,
        artifact.software_overlap_candidates,
        artifact.items,
        artifact.findings,
        artifact.matches,
        artifact.metadata?.candidates,
        artifact.metadata?.overlap_candidates,
        artifact.metadata?.software_overlap_candidates
    ].find((value) => Array.isArray(value) && value.length) || [];

const artifactType = (item = {}) =>
    firstText(
        item.artifact_type,
        item.candidate_type,
        item.item_type,
        item.type,
        item.metadata?.artifact_type,
        item.metadata?.candidate_type,
        item.metadata?.type
    ).toLowerCase();

export const isSoftwareOverlapArtifact = (item = {}) => {
    const type = artifactType(item);
    const title = firstText(item.title, item.label).toLowerCase();
    return (
        softwareOverlapArtifactTypes.has(type) ||
        type.includes('software_overlap') ||
        type.includes('tool_overlap') ||
        (type.includes('overlap') && /\b(software|tool|application|app|system)\b/.test(title))
    );
};

const publishableArtifactTypes = new Set([
    'executive_summary',
    'executive_output',
    'news_article',
    'newsletter'
]);

const artifactPayload = (artifact = {}) =>
    artifact.data && typeof artifact.data === 'object'
        ? { ...artifact.data, ...artifact }
        : artifact;

const collectTextList = (...values) =>
    [
        ...new Set(
            values
                .flatMap((value) => asArray(value))
                .map((value) =>
                    typeof value === 'string'
                        ? value.trim()
                        : firstText(value?.text, value?.content, value?.summary, value?.title, value?.label)
                )
                .filter(Boolean)
        )
    ];

const normalizeArtifactSection = (section = {}, index = 0) => {
    if (typeof section === 'string') {
        return {
            id: `section-${index + 1}`,
            title: `Section ${index + 1}`,
            body: section.trim(),
            bullets: []
        };
    }
    return {
        id: firstText(section.id, section.section_id, section.title, `section-${index + 1}`),
        title: firstText(section.title, section.heading, section.label, `Section ${index + 1}`),
        body: firstText(section.body, section.content, section.text, section.summary),
        bullets: collectTextList(section.bullets, section.points, section.key_points)
    };
};

const publishableArtifactType = (artifact = {}) => {
    const type = artifactType(artifact);
    if (publishableArtifactTypes.has(type)) {
        return type;
    }
    if (type.includes('executive')) {
        return 'executive_summary';
    }
    if (type.includes('news') || type.includes('article')) {
        return 'news_article';
    }
    if (type.includes('newsletter') || type.includes('update_brief')) {
        return 'newsletter';
    }
    return '';
};

const artifactSourceRefs = (payload = {}) =>
    mergeSourceRefs(
        mergeSourceRefs(asArray(payload.source_refs), asArray(payload.sourceRefs)),
        mergeSourceRefs(
            asArray(payload.data?.source_refs),
            mergeSourceRefs(
                asArray(payload.provenance?.input_source_refs),
                asArray(payload.metadata?.source_refs)
            )
        )
    );

const artifactAssumptions = (payload = {}) =>
    collectTextList(
        payload.assumptions,
        payload.data?.assumptions,
        payload.provenance?.assumptions,
        payload.metadata?.assumptions
    );

const normalizeSourceNote = (note = {}, index = 0) => {
    if (typeof note === 'string') {
        return note.trim();
    }
    const sourceLabel = firstText(note.source, note.document_id, note.documentId, note.source_id);
    const detail = firstText(note.note, note.text, note.content, note.summary, note.quote_snippet, note.snippet);
    return [sourceLabel, detail].filter(Boolean).join(': ') || `Source note ${index + 1}`;
};

const normalizeFactCheckNote = (note = {}, index = 0) => {
    if (typeof note === 'string') {
        return note.trim();
    }
    const claim = firstText(note.claim, note.title, note.label, `Check ${index + 1}`);
    const status = firstText(note.status, note.review_state, note.reviewState);
    const detail = firstText(note.note, note.result, note.finding, note.text, note.content, note.summary);
    return [claim, status, detail].filter(Boolean).join(' - ');
};

const normalizeSourceRefLabel = (ref = {}, index = 0) => {
    if (typeof ref === 'string') {
        return ref.trim();
    }
    const source = firstText(ref.document_id, ref.documentId, ref.source_id, ref.sourceId, ref.title, ref.label);
    const locator = [
        ref.page || ref.page_number ? `p. ${ref.page || ref.page_number}` : '',
        firstText(ref.section, ref.heading),
        firstText(ref.chunk_id, ref.chunkId)
    ].filter(Boolean).join(' | ');
    const quote = firstText(ref.quote_snippet, ref.snippet, ref.text);
    const prefix = [source || `Source ${index + 1}`, locator].filter(Boolean).join(' | ');
    return quote ? `${prefix}: ${quote}` : prefix;
};

const normalizePublishableArtifactProvenance = (payload = {}, revision = {}) => {
    const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
    const revisionMetadata =
        revision.metadata && typeof revision.metadata === 'object' ? revision.metadata : {};
    const provenance =
        payload.provenance && typeof payload.provenance === 'object' ? payload.provenance : {};
    const evidenceMode = normalizeAIDraftEvidenceMode(
        firstText(
            metadata.evidence_mode,
            metadata.evidenceMode,
            provenance.evidence_mode,
            provenance.evidenceMode,
            revisionMetadata.evidence_mode,
            revisionMetadata.evidenceMode
        )
    );
    const citationPolicy = normalizeAIDraftCitationPolicy(
        firstText(
            metadata.citation_policy,
            metadata.citationPolicy,
            provenance.citation_policy,
            provenance.citationPolicy,
            revisionMetadata.citation_policy,
            revisionMetadata.citationPolicy
        )
    );
    const sourceRefs = artifactSourceRefs(payload);
    const assumptions = artifactAssumptions(payload);
    const confidence = firstText(
        provenance.confidence_summary,
        metadata.confidence_summary,
        payload.review_state,
        payload.review_status,
        payload.status
    );
    const parts = [
        aiDraftEvidenceModeLabel(evidenceMode),
        aiDraftCitationPolicyLabel(citationPolicy),
        sourceRefs.length
            ? `${sourceRefs.length} source ${sourceRefs.length === 1 ? 'reference' : 'references'}`
            : 'No source references yet',
        assumptions.length
            ? `${assumptions.length} ${assumptions.length === 1 ? 'assumption' : 'assumptions'}`
            : ''
    ].filter(Boolean);

    return {
        evidenceMode,
        evidenceLabel: aiDraftEvidenceModeLabel(evidenceMode),
        citationPolicy,
        citationLabel: aiDraftCitationPolicyLabel(citationPolicy),
        sourceRefCount: sourceRefs.length,
        assumptionCount: assumptions.length,
        confidence,
        tone:
            citationPolicy === 'required' && !sourceRefs.length
                ? 'warn'
                : sourceRefs.length
                  ? 'good'
                  : 'neutral',
        summary: parts.join(', ')
    };
};

export const normalizePublishableDraftArtifacts = (revision = {}) => {
    const artifacts = [
        ...asArray(revision.generated_artifacts),
        ...asArray(revision.artifacts),
        ...asArray(revision.draft_items)
    ];

    return artifacts
        .map((artifact, index) => {
            const payload = artifactPayload(artifact);
            const type = publishableArtifactType(payload);
            if (!type) {
                return null;
            }
            const provenance = normalizePublishableArtifactProvenance(payload, revision);
            const sections = [
                ...asArray(payload.sections),
                ...asArray(payload.body_sections),
                ...asArray(payload.article_sections),
                ...asArray(payload.issue_sections)
            ].map(normalizeArtifactSection);
            const newsletterHighlights = asArray(payload.highlights).map(normalizeArtifactSection);
            const newsletterUpcoming = asArray(payload.upcoming).map(normalizeArtifactSection);
            const newsletterRisks = asArray(payload.risks).map(normalizeArtifactSection);
            const newsletterDecisions = asArray(payload.decisions_needed || payload.required_decisions).map(normalizeArtifactSection);
            const visualBlocks = asArray(payload.visual_blocks || payload.visualBlocks).map(normalizeArtifactSection);
            const keyPoints = collectTextList(
                payload.key_points,
                payload.key_takeaways,
                payload.takeaways,
                payload.highlights,
                payload.recommendations
            );
            const recommendedActions = collectTextList(
                payload.recommended_actions,
                payload.actions,
                payload.next_actions,
                payload.recommended_next_actions
            );
            const risks = collectTextList(payload.risks, payload.risk_items);
            const sourceBackedAppendix = collectTextList(
                payload.source_backed_appendix,
                payload.source_appendix,
                payload.appendix,
                payload.source_backed_facts,
                payload.verified_facts
            );
            const assumptions = artifactAssumptions(payload);
            const sourceRefs = artifactSourceRefs(payload);
            const factChecks = [
                ...asArray(payload.fact_checks),
                ...asArray(payload.fact_check_notes),
                ...asArray(payload.factcheck_notes),
                ...asArray(payload.metadata?.fact_checks)
            ]
                .map(normalizeFactCheckNote)
                .filter(Boolean);
            const sourceNotes = [
                ...asArray(payload.source_notes),
                ...asArray(payload.sourceNotes),
                ...asArray(payload.quote_notes),
                ...asArray(payload.quotes),
                ...asArray(payload.attribution_notes),
                ...asArray(payload.metadata?.source_notes)
            ]
                .map(normalizeSourceNote)
                .filter(Boolean);
            return {
                id: firstText(payload.id, payload.artifact_id, `draft-artifact-${index + 1}`),
                artifactType: type,
                label: type === 'newsletter' ? 'Newsletter' : type === 'news_article' ? 'News article' : 'Executive summary',
                title: firstText(
                    payload.headline,
                    payload.title,
                    payload.label,
                    type === 'newsletter' ? 'Draft newsletter' : '',
                    type === 'news_article' ? 'Draft news article' : 'Draft executive summary'
                ),
                dek: firstText(payload.dek, payload.subhead, payload.subtitle, payload.summary),
                lede: firstText(payload.lede, payload.lead, payload.intro, payload.opening),
                issueLabel: firstText(payload.issue_label, payload.issueLabel, payload.issue, payload.date_label),
                cadence: firstText(payload.cadence, payload.frequency),
                openingNote: firstText(payload.opening_note, payload.openingNote, payload.editor_note, payload.intro),
                body: firstText(payload.body, payload.content, payload.text, payload.narrative),
                keyPoints,
                sections,
                audience: firstText(payload.audience, payload.metadata?.audience),
                publishTarget: firstText(
                    payload.publish_target,
                    payload.channel,
                    payload.metadata?.publish_target,
                    payload.metadata?.channel
                ),
                summary: firstText(payload.summary, payload.abstract),
                reviewState: firstText(
                    payload.review_state,
                    payload.reviewState,
                    payload.review_status,
                    payload.status,
                    payload.metadata?.reviewState,
                    payload.metadata?.review_state,
                    'needs_review'
                ),
                confidence: firstText(
                    payload.confidence,
                    payload.confidence_summary,
                    payload.metadata?.confidence,
                    payload.provenance?.confidence
                ),
                recommendedActions,
                risks,
                sourceBackedAppendix,
                factChecks,
                sourceNotes,
                sourceRefs,
                newsletterHighlights,
                newsletterUpcoming,
                newsletterRisks,
                newsletterDecisions,
                visualBlocks,
                assumptions,
                provenance
            };
        })
        .filter(Boolean);
};

const selectedArtifactIds = ({ revision = {}, selectedItemIds = [] } = {}) => {
    const selectedIds = new Set(asArray(selectedItemIds));
    asArray(selectedItemIds).forEach((itemId) => {
        if (typeof itemId === 'string' && itemId.startsWith('item_')) {
            selectedIds.add(itemId.slice(5));
        }
    });
    asArray(revision.draft_items).forEach((item) => {
        if (!selectedIds.has(item?.id)) {
            return;
        }
        const artifactId = firstText(item.metadata?.artifact_id, item.metadata?.package_id);
        if (artifactId) {
            selectedIds.add(artifactId);
            selectedIds.add(`item_${artifactId}`);
        }
    });
    return selectedIds;
};

export const normalizeAcceptedDraftArtifacts = (
    revision = {},
    {
        session = {},
        mode = 'append',
        selectedItemIds = [],
        acceptedAt = new Date().toISOString(),
        acceptedBy = 'user'
    } = {}
) => {
    const selectedIds = selectedArtifactIds({ revision, selectedItemIds });
    const artifacts = [
        ...asArray(revision.generated_artifacts),
        ...asArray(revision.artifacts)
    ].filter((artifact) => artifact && typeof artifact === 'object');
    const filteredArtifacts =
        mode === 'selected' && selectedIds.size
            ? artifacts.filter((artifact) => {
                  const artifactId = firstText(artifact.id, artifact.artifact_id, artifact.data?.package_id);
                  return selectedIds.has(artifactId) || selectedIds.has(`item_${artifactId}`);
              })
            : mode === 'notes_only'
              ? []
              : artifacts;

    return filteredArtifacts.map((artifact, index) => {
        const type = artifactType(artifact) || firstText(artifact.artifact_type, artifact.type, 'artifact');
        const id = firstText(artifact.id, artifact.artifact_id, artifact.data?.package_id, `${type}-${index + 1}`);
        const metadata = artifact.metadata && typeof artifact.metadata === 'object' ? artifact.metadata : {};
        const provenance = artifact.provenance && typeof artifact.provenance === 'object' ? artifact.provenance : {};
        return {
            ...structuredClone(artifact),
            id,
            artifact_type: type,
            metadata: {
                ...metadata,
                ai_draft_session_id: firstText(metadata.ai_draft_session_id, session.session_id),
                ai_draft_revision_id: firstText(metadata.ai_draft_revision_id, revision.revision_id),
                ai_draft_intent: firstText(metadata.ai_draft_intent, session.intent),
                ai_draft_role: firstText(metadata.ai_draft_role, session.role),
                accepted_at: firstText(metadata.accepted_at, acceptedAt),
                accepted_by: firstText(metadata.accepted_by, acceptedBy)
            },
            provenance: {
                ...provenance,
                ai_draft_session_id: firstText(provenance.ai_draft_session_id, session.session_id),
                ai_draft_revision_id: firstText(provenance.ai_draft_revision_id, revision.revision_id),
                accepted_at: firstText(provenance.accepted_at, acceptedAt),
                accepted_by: firstText(provenance.accepted_by, acceptedBy)
            }
        };
    });
};

export const draftArtifactPreviewToMarkdown = (artifact = {}) => {
    const lines = [];
    if (artifact.title) {
        lines.push(`# ${artifact.title}`);
    }
    if (artifact.dek) {
        lines.push('', `_${artifact.dek}_`);
    }
    if (artifact.artifactType === 'news_article') {
        if (artifact.lede) {
            lines.push('', artifact.lede);
        }
        if (artifact.body) {
            lines.push('', artifact.body);
        }
        asArray(artifact.sections).forEach((section) => {
            lines.push('', `## ${section.title}`);
            if (section.body) {
                lines.push('', section.body);
            }
            if (section.bullets?.length) {
                lines.push('', ...section.bullets.map((point) => `- ${point}`));
            }
        });
        if (artifact.audience || artifact.publishTarget || artifact.provenance?.summary) {
            lines.push('', '## Editorial notes');
            if (artifact.audience || artifact.publishTarget) {
                lines.push(
                    [artifact.audience ? `Audience: ${artifact.audience}` : '', artifact.publishTarget ? `Channel: ${artifact.publishTarget}` : '']
                        .filter(Boolean)
                        .join(' | ')
                );
            }
            if (artifact.provenance?.summary) {
                lines.push(`Evidence: ${artifact.provenance.summary}`);
            }
        }
        if (artifact.factChecks?.length) {
            lines.push('', '## Fact-check notes', ...artifact.factChecks.map((point) => `- ${point}`));
        }
        if (artifact.sourceNotes?.length) {
            lines.push('', '## Source notes', ...artifact.sourceNotes.map((point) => `- ${point}`));
        }
        const appendix = artifact.sourceBackedAppendix?.length
            ? artifact.sourceBackedAppendix
            : asArray(artifact.sourceRefs).map(normalizeSourceRefLabel).filter(Boolean);
        if (appendix.length) {
            lines.push('', '## Source-backed appendix', ...appendix.map((point) => `- ${point}`));
        }
        if (artifact.assumptions?.length) {
            lines.push('', '## Assumptions', ...artifact.assumptions.map((point) => `- ${point}`));
        }
        return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    if (artifact.artifactType === 'newsletter') {
        if (artifact.issueLabel || artifact.cadence || artifact.audience) {
            lines.push(
                '',
                [
                    artifact.issueLabel ? `Issue: ${artifact.issueLabel}` : '',
                    artifact.cadence ? `Cadence: ${artifact.cadence}` : '',
                    artifact.audience ? `Audience: ${artifact.audience}` : ''
                ]
                    .filter(Boolean)
                    .join(' | ')
            );
        }
        if (artifact.openingNote || artifact.lede || artifact.body) {
            lines.push('', artifact.openingNote || artifact.lede || artifact.body);
        }
        const renderSections = (heading, sections) => {
            if (!sections?.length) {
                return;
            }
            lines.push('', `## ${heading}`);
            sections.forEach((section) => {
                lines.push('', `### ${section.title}`);
                if (section.body) {
                    lines.push(section.body);
                }
                if (section.bullets?.length) {
                    lines.push(...section.bullets.map((point) => `- ${point}`));
                }
            });
        };
        renderSections('Top highlights', artifact.newsletterHighlights);
        renderSections('In this issue', artifact.sections);
        renderSections('Upcoming', artifact.newsletterUpcoming);
        renderSections('Risks and watch items', artifact.newsletterRisks);
        renderSections('Decisions needed', artifact.newsletterDecisions);
        renderSections('Visual blocks', artifact.visualBlocks);
        if (artifact.provenance?.summary) {
            lines.push('', '## Editor notes', `Evidence: ${artifact.provenance.summary}`);
        }
        const appendix = artifact.sourceBackedAppendix?.length
            ? artifact.sourceBackedAppendix
            : asArray(artifact.sourceRefs).map(normalizeSourceRefLabel).filter(Boolean);
        if (appendix.length) {
            lines.push('', '## Source-backed appendix', ...appendix.map((point) => `- ${point}`));
        }
        if (artifact.assumptions?.length) {
            lines.push('', '## Assumptions', ...artifact.assumptions.map((point) => `- ${point}`));
        }
        return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    if (artifact.audience || artifact.publishTarget) {
        lines.push(
            '',
            [artifact.audience ? `Audience: ${artifact.audience}` : '', artifact.publishTarget ? `Channel: ${artifact.publishTarget}` : '']
                .filter(Boolean)
                .join(' | ')
        );
    }
    if (artifact.provenance?.summary) {
        lines.push('', `Evidence: ${artifact.provenance.summary}`);
    }
    if (artifact.summary) {
        lines.push('', '## Summary', '', artifact.summary);
    }
    if (artifact.keyPoints?.length) {
        lines.push('', '## Key points', ...artifact.keyPoints.map((point) => `- ${point}`));
    }
    if (artifact.recommendedActions?.length) {
        lines.push('', '## Recommended actions', ...artifact.recommendedActions.map((point) => `- ${point}`));
    }
    if (artifact.risks?.length) {
        lines.push('', '## Risks', ...artifact.risks.map((point) => `- ${point}`));
    }
    if (artifact.body) {
        lines.push('', artifact.body);
    }
    asArray(artifact.sections).forEach((section) => {
        lines.push('', `## ${section.title}`);
        if (section.body) {
            lines.push('', section.body);
        }
        if (section.bullets?.length) {
            lines.push('', ...section.bullets.map((point) => `- ${point}`));
        }
    });
    if (artifact.sourceBackedAppendix?.length) {
        lines.push('', '## Source-backed appendix', ...artifact.sourceBackedAppendix.map((point) => `- ${point}`));
    }
    if (artifact.assumptions?.length) {
        lines.push('', '## Assumptions', ...artifact.assumptions.map((point) => `- ${point}`));
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const normalizeSoftwareOverlapCandidate = (candidate = {}, index = 0) => {
    const metadata = candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata : {};
    const applications = [
        ...asArray(candidate.applications),
        ...asArray(candidate.tools),
        ...asArray(candidate.systems),
        candidate.source_application,
        candidate.target_application,
        candidate.source_tool,
        candidate.target_tool
    ]
        .map((value) =>
            typeof value === 'string'
                ? value
                : firstText(value?.name, value?.title, value?.label, value?.id)
        )
        .filter(Boolean);
    const evidence = [
        ...asArray(candidate.evidence),
        ...asArray(candidate.evidence_refs),
        ...asArray(candidate.source_refs),
        ...asArray(metadata.evidence)
    ].map(normalizeSoftwareEvidence);
    const factors = [
        ...asArray(candidate.factors),
        ...asArray(candidate.scoring_factors),
        ...asArray(metadata.factors)
    ].map(normalizeSoftwareFactor);

    return {
        id: firstText(candidate.id, candidate.candidate_id, `software-overlap-${index + 1}`),
        title: firstText(candidate.title, candidate.label, applications.join(' / '), `Potential overlap ${index + 1}`),
        applications,
        score: candidate.score ?? candidate.overlap_score ?? candidate.similarity_score ?? metadata.score ?? '',
        confidence: firstText(candidate.confidence, metadata.confidence),
        reviewState: firstText(
            candidate.review_state,
            candidate.review_status,
            candidate.status,
            metadata.review_state,
            'needs_review'
        ),
        recommendation: firstText(
            candidate.recommendation,
            candidate.recommended_action,
            candidate.owner_review,
            metadata.recommendation
        ),
        rationale: firstText(candidate.rationale, candidate.reason, candidate.summary, candidate.content),
        factors,
        evidence
    };
};

export const normalizeSoftwareOverlapReports = (revision = {}) => {
    const artifacts = [
        ...asArray(revision.generated_artifacts),
        ...asArray(revision.artifacts),
        ...asArray(revision.draft_items),
        ...asArray(revision.draft_annotations)
    ].filter(isSoftwareOverlapArtifact);

    return artifacts.map((artifact, artifactIndex) => {
        const candidates = collectSoftwareOverlapCandidates(artifact);
        const fallbackCandidate =
            candidates.length === 0 && isSoftwareOverlapArtifact(artifact)
                ? [artifact]
                : candidates;
        return {
            id: firstText(artifact.id, artifact.artifact_id, `software-overlap-report-${artifactIndex + 1}`),
            title: firstText(artifact.title, artifact.label, 'Software overlap report'),
            summary: firstText(artifact.summary, artifact.content, artifact.body, artifact.description),
            reviewState: firstText(
                artifact.review_state,
                artifact.review_status,
                artifact.status,
                artifact.metadata?.review_state,
                'needs_review'
            ),
            candidates: fallbackCandidate.map(normalizeSoftwareOverlapCandidate)
        };
    });
};
