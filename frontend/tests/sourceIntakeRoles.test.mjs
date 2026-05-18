import assert from 'node:assert/strict';
import test from 'node:test';
import { recommendSourceIntakeRole, SOURCE_INTAKE_PROFILES } from '../src/utils/sourceIntakeRoles.js';

test('source intake roles include and recommend AEC SOW deliverables before generic document handling', () => {
    const profile = SOURCE_INTAKE_PROFILES.find(
        (candidate) => candidate.id === 'aec-sow-deliverables'
    );

    assert.equal(profile.label, 'AEC SOW Deliverables Planner');
    assert.match(profile.bestFor, /SOWs/i);
    assert.equal(
        recommendSourceIntakeRole({
            sourceType: 'docx',
            fileName: 'Clinic renovation SOW requirements.docx'
        }),
        'aec-sow-deliverables'
    );
    assert.equal(
        recommendSourceIntakeRole({
            sourceType: 'pdf',
            fileName: 'BIM VDC milestone handoff.pdf'
        }),
        'aec-sow-deliverables'
    );
});
