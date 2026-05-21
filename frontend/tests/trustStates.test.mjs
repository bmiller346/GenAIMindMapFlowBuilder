import assert from 'node:assert/strict';
import test from 'node:test';
import {
    primaryTrustStateForSubject,
    trustStateLabel,
    trustStatesForSubject
} from '../src/utils/trustStates.js';

const ids = (subject) => trustStatesForSubject(subject).map((state) => state.id);

test('trustStatesForSubject normalizes cited, web-cited, and source-backed states', () => {
    assert.deepEqual(ids({ source_refs: [{ document_id: 'doc-1', page: 4 }] }), ['cited']);
    assert.deepEqual(ids({ source_refs: [{ url: 'https://example.com/reference' }] }), ['web-cited']);
    assert.deepEqual(
        ids({
            review_state: 'source_backed',
            source_refs: [{ document_id: 'doc-2' }]
        }),
        ['source-backed']
    );
});

test('trustStatesForSubject separates uncited, inferred, and needs_review states', () => {
    assert.deepEqual(ids({ title: 'Prompt-only claim' }), ['uncited']);
    assert.deepEqual(ids({ assumptions: ['Owner inferred from branch context.'] }), ['inferred']);
    assert.deepEqual(ids({ status: 'needs_review', source_refs: [] }), ['uncited', 'needs_review']);
    assert.deepEqual(
        ids({
            status: 'needs_review',
            assumptions: ['Timing inferred from the prompt.']
        }),
        ['inferred', 'needs_review']
    );
});

test('trust state labels are stable display text for shared badges', () => {
    assert.equal(primaryTrustStateForSubject({ source_backed: true }).label, 'Source-backed');
    assert.equal(trustStateLabel('needs_review'), 'Needs review');
});
