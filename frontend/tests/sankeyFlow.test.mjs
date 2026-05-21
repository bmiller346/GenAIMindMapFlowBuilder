import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildSankeyFlowRows,
    buildSankeyPlotlySpec,
    inferSankeyColumns
} from '../src/utils/sankeyFlow.js';

const rows = [
    { source_system: 'CRM', target_process: 'Sales reporting', monthly_cost: '$12,000' },
    { source_system: 'CRM', target_process: 'Sales reporting', monthly_cost: '3000' },
    { source_system: 'ERP', target_process: 'Finance close', monthly_cost: 22000 },
    { source_system: 'Manual spreadsheet', target_process: 'Forecasting', monthly_cost: 8000 }
];

test('inferSankeyColumns finds source target and preferred value columns', () => {
    const inferred = inferSankeyColumns(rows, { valueColumn: 'monthly_cost' });

    assert.equal(inferred.sourceColumn, 'source_system');
    assert.equal(inferred.targetColumn, 'target_process');
    assert.equal(inferred.valueColumn, 'monthly_cost');
    assert.equal(inferred.metricLabel, 'Monthly Cost');
});

test('buildSankeyFlowRows aggregates positive source to target values', () => {
    const flow = buildSankeyFlowRows(rows, { valueColumn: 'monthly_cost' });

    assert.equal(flow.eligible, true);
    assert.equal(flow.rows.length, 3);
    assert.deepEqual(flow.rows[1], {
        source: 'CRM',
        target: 'Sales reporting',
        value: 15000,
        pathType: 'source_to_target',
        pathLabel: 'Source to Target',
        rowIndexes: [0, 1],
        rows: [rows[0], rows[1]]
    });
});

test('buildSankeyFlowRows falls back to count when no value column exists', () => {
    const flow = buildSankeyFlowRows([
        { source: 'Policy', target: 'Finding' },
        { source: 'Policy', target: 'Finding' },
        { source: 'Interview', target: 'Finding' }
    ]);

    assert.equal(flow.eligible, true);
    assert.equal(flow.metricLabel, 'Count');
    assert.equal(flow.rows[0].value, 2);
});

test('buildSankeyFlowRows infers connected picture package path presets', () => {
    const cases = [
        {
            expectedType: 'source_to_claim',
            rows: [
                {
                    source_refs: [{ document_id: 'doc-code', title: 'Code excerpt' }],
                    claim: 'Smoke detector coverage is required'
                }
            ],
            expectedSourceColumn: 'source_refs',
            expectedTargetColumn: 'claim',
            expectedSource: 'Code excerpt'
        },
        {
            expectedType: 'source_to_node',
            rows: [{ source_document: 'SOW', node_title: 'Commissioning checklist' }],
            expectedSourceColumn: 'source_document',
            expectedTargetColumn: 'node_title',
            expectedSource: 'SOW'
        },
        {
            expectedType: 'node_to_output',
            rows: [{ node_title: 'Risk review', output_title: 'Handoff package' }],
            expectedSourceColumn: 'node_title',
            expectedTargetColumn: 'output_title',
            expectedSource: 'Risk review'
        },
        {
            expectedType: 'handoff',
            rows: [{ handoff_from: 'Design', handoff_to: 'Field QA' }],
            expectedSourceColumn: 'handoff_from',
            expectedTargetColumn: 'handoff_to',
            expectedSource: 'Design'
        },
        {
            expectedType: 'owner_status',
            rows: [{ owner: 'Ops lead', review_state: 'blocked' }],
            expectedSourceColumn: 'owner',
            expectedTargetColumn: 'review_state',
            expectedSource: 'Ops lead'
        },
        {
            expectedType: 'risk_mitigation',
            rows: [{ risk: 'Late AHJ review', mitigation: 'Schedule pre-review' }],
            expectedSourceColumn: 'risk',
            expectedTargetColumn: 'mitigation',
            expectedSource: 'Late AHJ review'
        },
        {
            expectedType: 'evidence_flow',
            rows: [{ evidence_item_id: 'ev-1', package_output: 'Executive summary' }],
            expectedSourceColumn: 'evidence_item_id',
            expectedTargetColumn: 'package_output',
            expectedSource: 'ev-1'
        }
    ];

    cases.forEach(({ rows: caseRows, expectedType, expectedSourceColumn, expectedTargetColumn, expectedSource }) => {
        const flow = buildSankeyFlowRows(caseRows);

        assert.equal(flow.eligible, true);
        assert.equal(flow.pathType, expectedType);
        assert.equal(flow.sourceColumn, expectedSourceColumn);
        assert.equal(flow.targetColumn, expectedTargetColumn);
        assert.equal(flow.metricLabel, 'Count');
        assert.equal(flow.rows[0].pathType, expectedType);
        assert.equal(flow.rows[0].source, expectedSource);
        assert.equal(flow.rows[0].value, 1);
    });
});

test('buildSankeyFlowRows supports explicit dependency mappings and numeric weights', () => {
    const flow = buildSankeyFlowRows(
        [
            {
                relationship_type: 'dependency',
                source: 'Mechanical design',
                target: 'Fire alarm matrix',
                dependency_count: 3
            },
            {
                relationship_type: 'dependency',
                source: 'Mechanical design',
                target: 'Fire alarm matrix',
                dependency_count: 2
            },
            {
                relationship_type: 'dependency',
                source: 'Electrical design',
                target: 'Fire alarm matrix',
                dependency_count: 'not sourced'
            }
        ],
        { valueColumn: 'dependency_count' }
    );

    assert.equal(flow.eligible, true);
    assert.equal(flow.pathType, 'dependency');
    assert.equal(flow.metricLabel, 'Dependency Count');
    assert.equal(flow.rows.length, 1);
    assert.equal(flow.rows[0].source, 'Mechanical design');
    assert.equal(flow.rows[0].value, 5);
});

test('buildSankeyFlowRows does not mutate source rows', () => {
    const sourceRows = [{ owner: 'PM', status: 'ready' }];
    const before = structuredClone(sourceRows);

    buildSankeyFlowRows(sourceRows);

    assert.deepEqual(sourceRows, before);
});

test('buildSankeyPlotlySpec emits plotly sankey node and link arrays', () => {
    const { flow, spec } = buildSankeyPlotlySpec(rows, {
        valueColumn: 'monthly_cost',
        title: 'System to process cost flow'
    });

    assert.equal(flow.eligible, true);
    assert.equal(spec.data[0].type, 'sankey');
    assert.deepEqual(spec.data[0].node.label, [
        'ERP',
        'Finance close',
        'CRM',
        'Sales reporting',
        'Manual spreadsheet',
        'Forecasting'
    ]);
    assert.deepEqual(spec.data[0].link.value, [22000, 15000, 8000]);
    assert.equal(spec.layout.title, 'System to process cost flow');
});

test('buildSankeyFlowRows reports missing source or target columns', () => {
    const flow = buildSankeyFlowRows([{ category: 'A', notes: 'Blocked' }]);

    assert.equal(flow.eligible, false);
    assert.equal(flow.reason, 'Sankey needs source and target columns.');
});
