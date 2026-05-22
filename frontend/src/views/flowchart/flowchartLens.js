export const FLOWCHART_LENSES = {
    PROCESS: 'process',
    DECISIONS: 'decisions',
    HANDOFFS: 'handoffs',
    EXCEPTIONS: 'exceptions',
    EVIDENCE: 'evidence'
};

export const FLOWCHART_LENS_OPTIONS = [
    { id: FLOWCHART_LENSES.PROCESS, label: 'Process' },
    { id: FLOWCHART_LENSES.DECISIONS, label: 'Decisions' },
    { id: FLOWCHART_LENSES.HANDOFFS, label: 'Handoffs' },
    { id: FLOWCHART_LENSES.EXCEPTIONS, label: 'Exceptions' },
    { id: FLOWCHART_LENSES.EVIDENCE, label: 'Evidence' }
];

const HANDOFF_KINDS = new Set(['handoff', 'milestone', 'checkpoint']);
const HANDOFF_RELATIONSHIPS = new Set(['handoff', 'depends_on', 'dependency', 'blocks']);

const normalized = (value) => String(value || '').trim().toLowerCase();

export const flowchartLensLabel = (lens) =>
    FLOWCHART_LENS_OPTIONS.find((option) => option.id === lens)?.label ||
    FLOWCHART_LENS_OPTIONS[0].label;

export const flowchartNodeLensState = (step = {}, lens = FLOWCHART_LENSES.PROCESS) => {
    if (lens === FLOWCHART_LENSES.PROCESS) {
        return 'default';
    }
    if (lens === FLOWCHART_LENSES.EVIDENCE) {
        return step.source_backed ? 'source-backed' : 'needs-evidence';
    }
    if (lens === FLOWCHART_LENSES.DECISIONS) {
        return step.flow_kind === 'decision' || step.shape === 'decision' ? 'focus' : 'muted';
    }
    if (lens === FLOWCHART_LENSES.HANDOFFS) {
        return HANDOFF_KINDS.has(normalized(step.flow_kind)) ? 'focus' : 'muted';
    }
    if (lens === FLOWCHART_LENSES.EXCEPTIONS) {
        return step.flow_kind === 'dependency' || step.status === 'blocked' || step.needs_review
            ? 'focus'
            : 'muted';
    }
    return 'default';
};

export const flowchartConnectorLensState = (
    connector = {},
    lens = FLOWCHART_LENSES.PROCESS
) => {
    if (lens === FLOWCHART_LENSES.PROCESS || lens === FLOWCHART_LENSES.EVIDENCE) {
        return 'default';
    }
    if (lens === FLOWCHART_LENSES.DECISIONS) {
        return connector.source_flow_kind === 'decision' ||
            ['yes', 'no'].includes(normalized(connector.branch_kind))
            ? 'focus'
            : 'muted';
    }
    if (lens === FLOWCHART_LENSES.HANDOFFS) {
        return HANDOFF_KINDS.has(normalized(connector.source_flow_kind)) ||
            HANDOFF_KINDS.has(normalized(connector.target_flow_kind)) ||
            HANDOFF_RELATIONSHIPS.has(normalized(connector.relationship_type))
            ? 'focus'
            : 'muted';
    }
    if (lens === FLOWCHART_LENSES.EXCEPTIONS) {
        return connector.exception_path || normalized(connector.branch_kind) === 'no'
            ? 'focus'
            : 'muted';
    }
    return 'default';
};
