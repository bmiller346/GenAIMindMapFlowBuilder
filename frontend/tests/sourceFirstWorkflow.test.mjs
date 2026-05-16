import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceFirstActionPresets } from '../src/prompts/promptsModel.js';
import { buildAIDraftSessionRequestPayload } from '../src/utils/aiDraftSessions.js';

test('source-first presets declare accept intent for draft diff preview', () => {
    const intentByPreset = Object.fromEntries(
        sourceFirstActionPresets.map((preset) => [preset.id, preset.changeIntent])
    );

    assert.equal(intentByPreset.source_to_mind_map, 'supplement');
    assert.equal(intentByPreset.source_to_table, 'supplement');
    assert.equal(intentByPreset.source_entities_connections, 'supplement');
    assert.equal(intentByPreset.source_to_tasks, 'supplement');
    assert.equal(intentByPreset.source_summary, 'compare');
    assert.equal(intentByPreset.source_compare_workspace, 'compare');
    assert.equal(intentByPreset.source_supplement_workspace, 'supplement');
    assert.equal(intentByPreset.source_reconcile_workspace, 'update');
});

test('source-first prompts require supplied refs instead of fabricated citations', () => {
    assert.ok(
        sourceFirstActionPresets.every((preset) =>
            /\bsupplied\b|\bonly\b/i.test(preset.prompt)
        )
    );
});

test('source-first change intent reaches draft request payload metadata', () => {
    const request = buildAIDraftSessionRequestPayload({
        role: { id: 'source-ref-repair', label: 'Source Ref Repair' },
        action: { id: 'find_missing_source_support', label: 'Review source coverage' },
        scope: { type: 'source', source_id: 'doc-1' },
        prompt: 'Reconcile this source with the workspace.',
        changeIntent: 'update',
        selectedSourcePayload: {
            source_chunks: [{ id: 'chunk-1', source_ref: { document_id: 'doc-1' } }],
            source_refs: [{ document_id: 'doc-1' }],
            metadata: {
                selected_source_id: 'doc-1',
                source_context_mode: 'bounded_multi_source'
            }
        }
    });

    assert.equal(request.change_intent, 'update');
    assert.equal(request.metadata.change_intent, 'update');
    assert.equal(request.metadata.source_context.selected_source_id, 'doc-1');
});
