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
    const sourceColumn = preferred.sourceColumn || firstMatchingColumn(columns, SOURCE_KEYS);
    const targetColumn = preferred.targetColumn || firstMatchingColumn(columns, TARGET_KEYS);
    const valueColumn = preferred.valueColumn || firstMatchingColumn(columns, VALUE_KEYS);

    return {
        columns,
        sourceColumn,
        targetColumn,
        valueColumn,
        metricLabel: valueColumn ? labelForColumn(valueColumn) : 'Count'
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
        const source = String(row?.[inferred.sourceColumn] ?? '').trim();
        const target = String(row?.[inferred.targetColumn] ?? '').trim();
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
