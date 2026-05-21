import test from 'node:test';
import assert from 'node:assert/strict';

import {
    desiredOutputsForPrompt,
    inferOutputShape
} from '../src/utils/promptRouting.js';
import {
    sortStarterRecipes,
    starterGroupId,
    starterSurfaceLabel,
    VISUAL_OPTIONS,
    visualLabel
} from '../src/utils/promptStarterRecipes.js';

test('messy multi-view prompts start as a general draft instead of a single lens', () => {
    assert.equal(
        inferOutputShape('Turn this messy context into the best TraceSpace output with graph, table, tasks, and review notes.'),
        'graph_draft'
    );
    assert.equal(
        inferOutputShape('Create a multi-view workspace output and choose the best view for each part.'),
        'graph_draft'
    );
    assert.deepEqual(
        desiredOutputsForPrompt({
            inferredShape: 'graph_draft',
            prompt: 'Turn this messy context into the most useful reviewable TraceSpace output.'
        }),
        ['connected_picture_package']
    );
});

test('code dependency prompts route to connected package capable graph drafts', () => {
    const prompt =
        'I am trying to understand how fire alarm design requirements connect across NJ rehab code, NFPA 72, NFPA 70, IBC, AHJ review, devices, power, permitting, and acceptance testing. Turn this into something I can review and build from.';

    assert.equal(inferOutputShape(prompt), 'graph_draft');
    assert.deepEqual(
        desiredOutputsForPrompt({
            inferredShape: 'graph_draft',
            prompt
        }),
        ['connected_picture_package']
    );
});

test('connected package can be selected as an explicit output mode', () => {
    assert.equal(visualLabel('connected_picture_package'), 'Connected Package');
    assert.ok(VISUAL_OPTIONS.some((option) => option.id === 'connected_picture_package'));
    assert.deepEqual(
        desiredOutputsForPrompt({
            inferredShape: 'connected_picture_package',
            prompt: 'Build the full review package.'
        }),
        ['connected_picture_package']
    );
});

test('AEC lifecycle starters stay specialized and package capable', () => {
    const starters = [
        { id: 'sankey_flow_lens', label: 'Sankey flow lens', visual: 'chart' },
        { id: 'aec_code_lifecycle_package', label: 'Code lifecycle map', visual: 'auto' },
        { id: 'messy_context_to_best_view', label: 'Messy context to view', visual: 'auto' }
    ];
    const sorted = sortStarterRecipes(starters);

    assert.equal(starterGroupId(starters[1]), 'specialized_work');
    assert.equal(starterSurfaceLabel(starters[1]), 'Specialized');
    assert.equal(sorted[0].id, 'messy_context_to_best_view');
    assert.equal(sorted[1].id, 'aec_code_lifecycle_package');

    const prompt =
        'Map SD, DD, CD, permit, CA, acceptance testing, and closeout dependencies for fire alarm code review.';
    assert.equal(inferOutputShape(prompt), 'graph_draft');
    assert.deepEqual(
        desiredOutputsForPrompt({
            inferredShape: 'graph_draft',
            prompt
        }),
        ['connected_picture_package']
    );
});

test('sankey remains an explicit chart recipe or lens request', () => {
    assert.equal(
        inferOutputShape('Create a Sankey flow lens from owner to status counts.'),
        'chart'
    );
    assert.equal(
        inferOutputShape('Build source target value rows from this query.'),
        'chart'
    );
    assert.equal(
        inferOutputShape('Turn this messy context into a flow lens and best workspace view.'),
        'graph_draft'
    );
});

test('starter recipes keep messy context first and mark Sankey as a lens', () => {
    const sorted = sortStarterRecipes([
        { id: 'sankey_flow_lens', label: 'Sankey flow lens', visual: 'chart' },
        { id: 'process_to_flowchart', label: 'Process to flowchart', visual: 'flow_chart' },
        { id: 'messy_context_to_best_view', label: 'Messy context to view', visual: 'auto' }
    ]);

    assert.equal(sorted[0].id, 'messy_context_to_best_view');
    assert.equal(starterGroupId(sorted[0]), 'workspace_views');
    assert.equal(starterSurfaceLabel(sorted[0]), 'Start');
    assert.equal(starterGroupId(sorted.find((starter) => starter.id === 'sankey_flow_lens')), 'charts_data');
    assert.equal(starterSurfaceLabel(sorted.find((starter) => starter.id === 'sankey_flow_lens')), 'Lens');
});
