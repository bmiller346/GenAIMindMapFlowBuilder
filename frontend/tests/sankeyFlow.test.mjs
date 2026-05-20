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
    const flow = buildSankeyFlowRows([{ owner: 'A', status: 'Blocked' }]);

    assert.equal(flow.eligible, false);
    assert.equal(flow.reason, 'Sankey needs source and target columns.');
});
