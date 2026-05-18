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
        id: 'aec-sow-deliverables',
        label: 'AEC SOW Deliverables Planner',
        description: 'Map AEC scopes into disciplines, deliverables, dependencies, risks, and owner decisions.',
        bestFor: 'SOWs, proposals, BIM/VDC plans, deliverable lists, project handoffs, and AEC timelines',
        changes: 'Builds a delivery-oriented structure with missing information, review flags, and Miro or monday.com handoff cues.',
        avoidWhen: 'You only need faithful section structure or generic citation coverage.'
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
const AEC_SOW_PATTERN = /\b(aec|architecture|engineering|construction|sow|scope of work|proposal|deliverables?|bim|vdc|revit|discipline|disciplines|coordination|submittal|rfi|milestone|phase|timeline|dependencies|dependency|owner decision|miro|monday)\b/;

export const recommendSourceIntakeRole = ({ fileName = '', brief = '', sourceType = '' } = {}) => {
    const text = `${sourceType} ${fileName} ${brief}`.toLowerCase();

    if (brief.trim()) {
        return 'custom';
    }
    if (keywordMatches(text, AEC_SOW_PATTERN)) {
        return 'aec-sow-deliverables';
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
