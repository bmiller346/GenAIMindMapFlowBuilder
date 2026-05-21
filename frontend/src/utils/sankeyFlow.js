const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const normalizeKey = (value) =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

const SOURCE_KEYS = [
    'source',
    'from',
    'origin',
    'upstream',
    'source_node',
    'source_system',
    'source_document',
    'source_owner',
    'sender'
];

const TARGET_KEYS = [
    'target',
    'to',
    'destination',
    'downstream',
    'target_node',
    'target_process',
    'output',
    'receiver'
];

const PATH_TYPE_ALIASES = {
    source_to_claim: ['source_to_claim', 'source_claim', 'source-claim', 'source to claim'],
    source_to_node: ['source_to_node', 'source_node', 'source-node', 'source to node'],
    node_to_output: ['node_to_output', 'node_output', 'node-output', 'node to output'],
    dependency: ['dependency', 'dependencies', 'dependency_flow', 'dependency-flow'],
    handoff: ['handoff', 'handoffs', 'handoff_flow', 'handoff-flow'],
    owner_status: ['owner_status', 'owner/status', 'owner_to_status', 'owner status', 'status_owner'],
    risk_mitigation: ['risk_mitigation', 'risk/mitigation', 'risk_to_mitigation', 'risk control', 'risk_to_control'],
    evidence_flow: ['evidence_flow', 'evidence-flow', 'evidence to output', 'source_to_output']
};

const PATH_PRESETS = [
    {
        type: 'source_to_claim',
        label: 'Source to Claim',
        sourceKeys: [
            'source',
            'source_ref',
            'source_refs',
            'source_reference',
            'source_document',
            'document',
            'document_id',
            'citation',
            'citation_source',
            'evidence_source',
            'reference'
        ],
        targetKeys: [
            'claim',
            'claim_text',
            'finding',
            'finding_title',
            'assertion',
            'recommendation',
            'evidence_claim',
            'supported_claim'
        ]
    },
    {
        type: 'source_to_node',
        label: 'Source to Node',
        sourceKeys: [
            'source',
            'source_ref',
            'source_refs',
            'source_reference',
            'source_document',
            'document',
            'document_id',
            'citation',
            'evidence_source',
            'reference'
        ],
        targetKeys: [
            'node',
            'node_id',
            'node_title',
            'evidence_node',
            'evidence_node_id',
            'accepted_node',
            'accepted_node_id',
            'target_node',
            'target_node_id'
        ]
    },
    {
        type: 'node_to_output',
        label: 'Node to Output',
        sourceKeys: [
            'node',
            'node_id',
            'node_title',
            'evidence_node',
            'evidence_node_id',
            'accepted_node',
            'accepted_node_id',
            'source_node',
            'source_node_id'
        ],
        targetKeys: [
            'output',
            'output_id',
            'output_title',
            'artifact',
            'artifact_id',
            'artifact_title',
            'deliverable',
            'view',
            'view_lens',
            'package_output'
        ]
    },
    {
        type: 'dependency',
        label: 'Dependency',
        sourceKeys: [
            'dependency',
            'depends_on',
            'prerequisite',
            'required_input',
            'required_source',
            'upstream',
            'source',
            'source_node',
            'triggering_code',
            'triggering_section'
        ],
        targetKeys: [
            'dependent',
            'blocked_item',
            'downstream',
            'target',
            'target_node',
            'dependency_target',
            'dependent_node',
            'dependency_code',
            'dependency_section'
        ]
    },
    {
        type: 'handoff',
        label: 'Handoff',
        sourceKeys: [
            'handoff_from',
            'from_owner',
            'from_team',
            'sender',
            'source_owner',
            'source_team',
            'upstream_owner',
            'from'
        ],
        targetKeys: [
            'handoff_to',
            'to_owner',
            'to_team',
            'receiver',
            'target_owner',
            'target_team',
            'downstream_owner',
            'to'
        ]
    },
    {
        type: 'owner_status',
        label: 'Owner Status',
        sourceKeys: ['owner', 'owner_id', 'assignee', 'assignee_id', 'accountable', 'team', 'team_owner'],
        targetKeys: [
            'status',
            'state',
            'review_state',
            'task_status',
            'workflow_status',
            'approval_status',
            'blocked_status'
        ]
    },
    {
        type: 'risk_mitigation',
        label: 'Risk Mitigation',
        sourceKeys: ['risk', 'risk_id', 'risk_title', 'issue', 'threat', 'blocker', 'gap'],
        targetKeys: [
            'mitigation',
            'mitigation_id',
            'mitigation_title',
            'control',
            'control_id',
            'countermeasure',
            'response',
            'recommended_action'
        ]
    },
    {
        type: 'evidence_flow',
        label: 'Evidence Flow',
        sourceKeys: [
            'evidence',
            'evidence_item',
            'evidence_item_id',
            'source',
            'source_ref',
            'source_refs',
            'source_document',
            'document',
            'document_id',
            'query_id'
        ],
        targetKeys: [
            'claim',
            'finding',
            'node',
            'node_id',
            'output',
            'output_id',
            'artifact',
            'artifact_id',
            'accepted_output',
            'package_output'
        ]
    }
];

const VALUE_KEYS = [
    'value',
    'weight',
    'count',
    'amount',
    'cost',
    'effort',
    'score',
    'risk_score',
    'confidence',
    'licenses',
    'total'
];

const SANKEY_LENS_COLUMN_PRESETS = {
    source_to_claim: {
        source: ['source', 'source_document', 'document', 'citation', 'source_ref', 'source_id'],
        target: ['claim', 'finding', 'assertion', 'insight', 'node_title', 'target_claim'],
        value: ['weight', 'confidence', 'claim_count', 'count']
    },
    source_to_node: {
        source: ['source', 'source_document', 'document', 'source_id', 'source_node'],
        target: ['node', 'node_title', 'target_node', 'evidence_node', 'concept'],
        value: ['weight', 'confidence', 'count']
    },
    node_to_output: {
        source: ['node', 'node_title', 'source_node', 'concept', 'input'],
        target: ['output', 'artifact', 'deliverable', 'target_output', 'section'],
        value: ['weight', 'count', 'effort']
    },
    dependency: {
        source: ['dependency', 'source', 'upstream', 'prerequisite', 'blocked_by', 'from'],
        target: ['dependent', 'target', 'downstream', 'blocks', 'to'],
        value: ['weight', 'impact', 'risk_score', 'count']
    },
    handoff: {
        source: ['sender', 'from', 'source_owner', 'owner', 'source_team'],
        target: ['receiver', 'to', 'target_owner', 'handoff_to', 'target_team'],
        value: ['weight', 'handoff_count', 'count', 'effort']
    },
    owner_status: {
        source: ['owner', 'assignee', 'source_owner', 'team'],
        target: ['status', 'review_state', 'state', 'target_status'],
        value: ['count', 'work_items', 'effort']
    },
    risk_mitigation: {
        source: ['risk', 'issue', 'blocker', 'source_risk'],
        target: ['mitigation', 'control', 'response', 'action', 'target_mitigation'],
        value: ['risk_score', 'severity', 'impact', 'count']
    },
    evidence_flow: {
        source: ['source', 'source_document', 'document', 'evidence_source'],
        target: ['evidence_item', 'claim', 'finding', 'node', 'output'],
        value: ['weight', 'confidence', 'count']
    }
};

const labelForColumn = (column = '') =>
    String(column)
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());

const firstMatchingColumn = (columns = [], candidates = []) => {
    const byNormalized = new Map(columns.map((column) => [normalizeKey(column), column]));
    return candidates.map(normalizeKey).map((key) => byNormalized.get(key)).find(Boolean) || '';
};

const normalizePathType = (value = '') => {
    const key = normalizeKey(value);
    if (!key) {
        return '';
    }
    return (
        Object.entries(PATH_TYPE_ALIASES).find(([type, aliases]) =>
            [type, ...aliases].map(normalizeKey).includes(key)
        )?.[0] || key
    );
};

const pathPresetByType = (pathType = '') =>
    PATH_PRESETS.find((preset) => preset.type === normalizePathType(pathType)) || null;

const nonEmptyCountForColumns = (rows = [], columns = []) =>
    asArray(rows).reduce(
        (count, row) =>
            count +
            columns.filter((column) => {
                const value = row?.[column];
                if (Array.isArray(value)) {
                    return value.filter(Boolean).length > 0;
                }
                return value !== undefined && value !== null && String(value).trim() !== '';
            }).length,
        0
    );

const inferPathTypeFromRows = (rows = [], columns = []) => {
    const explicitPathColumn = firstMatchingColumn(columns, [
        'path_type',
        'path_kind',
        'flow_type',
        'flow_kind',
        'lens_type',
        'relationship_type',
        'relationship'
    ]);
    const explicitPathType = asArray(rows)
        .map((row) => normalizePathType(row?.[explicitPathColumn]))
        .find((type) => pathPresetByType(type));
    if (explicitPathType) {
        return explicitPathType;
    }
    if (firstMatchingColumn(columns, SOURCE_KEYS) && firstMatchingColumn(columns, TARGET_KEYS)) {
        return '';
    }

    const candidates = PATH_PRESETS.map((preset, index) => {
        const sourceKeys = preset.sourceKeys.map(normalizeKey);
        const targetKeys = preset.targetKeys.map(normalizeKey);
        const sourceColumns = columns.filter((column) => sourceKeys.includes(normalizeKey(column)));
        const targetColumns = columns.filter((column) => targetKeys.includes(normalizeKey(column)));
        return {
            type: preset.type,
            index,
            score:
                sourceColumns.length && targetColumns.length
                    ? nonEmptyCountForColumns(rows, sourceColumns) +
                      nonEmptyCountForColumns(rows, targetColumns)
                    : 0
        };
    }).filter((candidate) => candidate.score > 0);

    return candidates.sort((a, b) => b.score - a.score || a.index - b.index)[0]?.type || '';
};

const sourceRefLabel = (ref = {}) =>
    [
        ref.title,
        ref.document_title,
        ref.source_title,
        ref.label,
        ref.document_id,
        ref.source_id,
        ref.url,
        ref.chunk_id,
        ref.id
    ]
        .map((value) => String(value || '').trim())
        .find(Boolean) || '';

const displayValue = (value) => {
    if (Array.isArray(value)) {
        const labels = value
            .map((item) => (item && typeof item === 'object' ? sourceRefLabel(item) : String(item || '').trim()))
            .filter(Boolean);
        if (!labels.length) {
            return '';
        }
        return labels.length === 1
            ? labels[0]
            : `${labels[0]} + ${labels.length - 1} source${labels.length === 2 ? '' : 's'}`;
    }
    if (value && typeof value === 'object') {
        return sourceRefLabel(value) || JSON.stringify(value);
    }
    return String(value ?? '').trim();
};

const numericValue = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value.replace(/[$,%\s,]/g, ''));
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

export const inferSankeyColumns = (rows = [], preferred = {}) => {
    const columns = Array.from(
        asArray(rows).reduce((seen, row) => {
            Object.keys(row || {}).forEach((key) => seen.add(key));
            return seen;
        }, new Set())
    );
    const preferredPathType = normalizePathType(preferred.pathType || preferred.path_type);
    const inferredPathType = preferredPathType || inferPathTypeFromRows(rows, columns);
    const pathPreset = pathPresetByType(inferredPathType);
    const sourceColumn =
        preferred.sourceColumn ||
        preferred.source_column ||
        firstMatchingColumn(columns, pathPreset?.sourceKeys || []) ||
        firstMatchingColumn(columns, SOURCE_KEYS);
    const targetColumn =
        preferred.targetColumn ||
        preferred.target_column ||
        firstMatchingColumn(columns, pathPreset?.targetKeys || []) ||
        firstMatchingColumn(columns, TARGET_KEYS);
    const valueColumn = preferred.valueColumn || preferred.value_column || firstMatchingColumn(columns, VALUE_KEYS);

    return {
        columns,
        sourceColumn,
        targetColumn,
        valueColumn,
        pathType: pathPreset?.type || (sourceColumn && targetColumn ? 'source_to_target' : ''),
        pathLabel: pathPreset?.label || 'Source to Target',
        metricLabel: valueColumn ? labelForColumn(valueColumn) : 'Count'
    };
};

export const inferSankeyLensColumns = (rows = [], lens = '', preferred = {}) => {
    const preset = SANKEY_LENS_COLUMN_PRESETS[normalizeKey(lens)] || {};
    return inferSankeyColumns(rows, {
        ...preferred,
        sourceColumn:
            preferred.sourceColumn ||
            firstMatchingColumn(
                Array.from(
                    asArray(rows).reduce((seen, row) => {
                        Object.keys(row || {}).forEach((key) => seen.add(key));
                        return seen;
                    }, new Set())
                ),
                preset.source || []
            ),
        targetColumn:
            preferred.targetColumn ||
            firstMatchingColumn(
                Array.from(
                    asArray(rows).reduce((seen, row) => {
                        Object.keys(row || {}).forEach((key) => seen.add(key));
                        return seen;
                    }, new Set())
                ),
                preset.target || []
            ),
        valueColumn:
            preferred.valueColumn ||
            firstMatchingColumn(
                Array.from(
                    asArray(rows).reduce((seen, row) => {
                        Object.keys(row || {}).forEach((key) => seen.add(key));
                        return seen;
                    }, new Set())
                ),
                preset.value || []
            )
    });
};

export const buildSankeyLensFlowRows = (rows = [], options = {}) => {
    const lens = normalizeKey(options.lens || options.pathType || options.flowType);
    const inferred = inferSankeyLensColumns(rows, lens, options);
    const flow = buildSankeyFlowRows(rows, {
        ...options,
        sourceColumn: inferred.sourceColumn,
        targetColumn: inferred.targetColumn,
        valueColumn: inferred.valueColumn,
        pathType: inferred.pathType || lens
    });

    return {
        ...flow,
        lens: lens || 'source_target',
        metricLabel: flow.metricLabel
    };
};

export const buildSankeyFlowRows = (rows = [], options = {}) => {
    const sourceRows = asArray(rows);
    const inferred = inferSankeyColumns(sourceRows, options);
    if (!sourceRows.length) {
        return {
            eligible: false,
            reason: 'Sankey needs rows with source and target values.',
            ...inferred,
            rows: []
        };
    }
    if (!inferred.sourceColumn || !inferred.targetColumn) {
        return {
            eligible: false,
            reason: 'Sankey needs source and target columns.',
            ...inferred,
            rows: []
        };
    }

    const grouped = new Map();
    sourceRows.forEach((row, rowIndex) => {
        const source = displayValue(row?.[inferred.sourceColumn]);
        const target = displayValue(row?.[inferred.targetColumn]);
        if (!source || !target || source === target) {
            return;
        }
        const rawValue = inferred.valueColumn ? numericValue(row?.[inferred.valueColumn]) : 1;
        const value = rawValue !== null && rawValue > 0 ? rawValue : inferred.valueColumn ? 0 : 1;
        if (value <= 0) {
            return;
        }
        const key = `${source}\u0000${target}`;
        const existing = grouped.get(key) || {
            source,
            target,
            value: 0,
            pathType: inferred.pathType,
            pathLabel: inferred.pathLabel,
            rowIndexes: [],
            rows: []
        };
        existing.value += value;
        existing.rowIndexes.push(rowIndex);
        existing.rows.push(row);
        grouped.set(key, existing);
    });

    const flowRows = Array.from(grouped.values()).sort(
        (a, b) => b.value - a.value || a.source.localeCompare(b.source) || a.target.localeCompare(b.target)
    );
    return {
        eligible: flowRows.length > 0,
        reason: flowRows.length ? '' : 'Sankey needs at least one positive source-to-target flow.',
        ...inferred,
        rows: flowRows
    };
};

export const buildSankeyPlotlySpec = (rows = [], options = {}) => {
    const flow = buildSankeyFlowRows(rows, options);
    if (!flow.eligible) {
        return { flow, spec: null };
    }
    const labels = [];
    const labelIndexes = new Map();
    const indexForLabel = (label) => {
        if (!labelIndexes.has(label)) {
            labelIndexes.set(label, labels.length);
            labels.push(label);
        }
        return labelIndexes.get(label);
    };

    const linkSources = [];
    const linkTargets = [];
    const values = [];
    const customdata = [];
    flow.rows.forEach((row) => {
        linkSources.push(indexForLabel(row.source));
        linkTargets.push(indexForLabel(row.target));
        values.push(row.value);
        customdata.push({
            source: row.source,
            target: row.target,
            value: row.value,
            pathType: row.pathType,
            pathLabel: row.pathLabel,
            rowIndexes: row.rowIndexes
        });
    });

    return {
        flow,
        spec: {
            data: [
                {
                    type: 'sankey',
                    arrangement: 'snap',
                    node: {
                        pad: 14,
                        thickness: 16,
                        line: { color: 'rgba(31, 41, 55, 0.25)', width: 0.5 },
                        label: labels
                    },
                    link: {
                        source: linkSources,
                        target: linkTargets,
                        value: values,
                        customdata,
                        hovertemplate: `%{customdata.source} -> %{customdata.target}<br>${flow.metricLabel}: %{value}<extra></extra>`
                    }
                }
            ],
            layout: {
                title: options.title || `${flow.metricLabel} flow`,
                autosize: true,
                height: options.height || 320,
                margin: { l: 8, r: 8, t: 36, b: 8 },
                font: { size: 11 }
            }
        }
    };
};
