export const SOURCE_INTAKE_MODELS = ['auto', 'gpt-5.5', 'gpt-5.4'];

export const SOURCE_INTAKE_PROFILES = [
    {
        id: '',
        label: 'No intake role',
        description: 'Keep intake neutral and let the source speak for itself.',
        bestFor: 'Simple uploads, quick capture, or sources that already have clean structure',
        changes: 'Uses the default source intake behavior without an extra interpretation lens.',
        avoidWhen: 'You want stronger structure, citation coverage, or decision-oriented synthesis.'
    },
    {
        id: 'document-structure-extractor',
        label: 'Document Structure Extractor',
        description: 'Preserve headings, sections, lists, and hierarchy.',
        bestFor: 'Policies, procedures, docs, specs, guides, slide outlines, and structured notes',
        changes: 'Favors faithful organization and section boundaries over broad interpretation.',
        avoidWhen: 'You mainly need risks, recommendations, or evidence coverage.'
    },
    {
        id: 'source-librarian',
        label: 'Source Librarian',
        description: 'Prioritize citations, evidence, source refs, and traceability.',
        bestFor: 'Ask AI context, audits, evidence review, references, and reconciliation workflows',
        changes: 'Emphasizes what came from where and highlights useful source coverage signals.',
        avoidWhen: 'You mainly want strategic synthesis or a cleaned-up outline.'
    },
    {
        id: 'strategic-advisor',
        label: 'Strategic Advisor',
        description: 'Extract decisions, risks, recommendations, and action themes.',
        bestFor: 'Decks, business cases, planning docs, risk reviews, and executive summaries',
        changes: 'Highlights implications, tradeoffs, owners, risks, and useful next steps.',
        avoidWhen: 'You need faithful section structure or citation coverage first.'
    },
    {
        id: 'custom',
        label: 'Custom Intake Prompt',
        description: 'Use your optional brief as the intake instructions.',
        bestFor: 'Specialized handling where the preset roles are close but not quite right',
        changes: 'Uses the optional brief as the primary lens for interpreting this source.',
        avoidWhen: 'A preset already describes the job clearly.'
    }
];

const keywordMatches = (text, pattern) => pattern.test(text);

export const recommendSourceIntakeRole = ({ fileName = '', brief = '', sourceType = '' } = {}) => {
    const text = `${sourceType} ${fileName} ${brief}`.toLowerCase();

    if (brief.trim()) {
        return 'custom';
    }
    if (
        keywordMatches(
            text,
            /\b(audit|citation|cite|evidence|reference|source|reconcile|traceability|library)\b/
        )
    ) {
        return 'source-librarian';
    }
    if (
        keywordMatches(
            text,
            /\b(policy|procedure|manual|standard|spec|sop|requirement|docs?|guide|handbook|markdown|readme|html)\b/
        )
    ) {
        return 'document-structure-extractor';
    }
    if (
        keywordMatches(
            text,
            /\b(deck|ppt|pptx|strategy|business case|roadmap|risk|decision|recommendation|planning|executive|board)\b/
        )
    ) {
        return 'strategic-advisor';
    }
    return '';
};

const SourceIntakeRoleControls = ({
    sourceType = 'source',
    fileName = '',
    intakeProfileId,
    setIntakeProfileId,
    intakeModel,
    setIntakeModel,
    intakeBrief,
    setIntakeBrief,
    label = 'Supporting intake role',
    briefPlaceholder = 'Optional: tell AI what to preserve, ignore, or emphasize for this source.'
}) => {
    const selectedProfile =
        SOURCE_INTAKE_PROFILES.find((profile) => profile.id === intakeProfileId) ||
        SOURCE_INTAKE_PROFILES[0];
    const recommendedProfileId = recommendSourceIntakeRole({
        fileName,
        brief: intakeBrief,
        sourceType
    });
    const recommendedProfile =
        SOURCE_INTAKE_PROFILES.find((profile) => profile.id === recommendedProfileId) ||
        SOURCE_INTAKE_PROFILES[0];
    const isSelectedRecommended = selectedProfile.id === recommendedProfile.id;

    return (
        <div className="source-intake-config source-processing-config">
            <label>
                <span className="source-intake-label-row">
                    <span>{label}</span>
                    {isSelectedRecommended ? <small>Recommended</small> : null}
                </span>
                <select
                    value={intakeProfileId}
                    onChange={(event) => setIntakeProfileId(event.target.value)}
                >
                    {SOURCE_INTAKE_PROFILES.map((profile) => (
                        <option
                            key={profile.id || 'none'}
                            value={profile.id}
                            title={profile.description}
                        >
                            {profile.label}
                        </option>
                    ))}
                </select>
                {!isSelectedRecommended ? (
                    <button
                        type="button"
                        className="source-intake-recommendation"
                        onClick={() => setIntakeProfileId(recommendedProfile.id)}
                    >
                        Use recommended: {recommendedProfile.label}
                    </button>
                ) : null}
            </label>
            <label>
                <span className="source-intake-label-row">
                    <span>Model</span>
                </span>
                <select
                    value={intakeModel}
                    onChange={(event) => setIntakeModel(event.target.value)}
                >
                    {SOURCE_INTAKE_MODELS.map((model) => (
                        <option key={model} value={model}>
                            {model === 'auto' ? 'Auto select' : model}
                        </option>
                    ))}
                </select>
            </label>
            <div
                className="source-intake-role-summary"
                title={`Best for: ${selectedProfile.bestFor}. Skip when: ${selectedProfile.avoidWhen}`}
            >
                <span>{selectedProfile.description}</span>
            </div>
            <label>
                Optional brief
                <textarea
                    value={intakeBrief}
                    onChange={(event) => setIntakeBrief(event.target.value)}
                    placeholder={briefPlaceholder}
                />
            </label>
        </div>
    );
};

export default SourceIntakeRoleControls;
