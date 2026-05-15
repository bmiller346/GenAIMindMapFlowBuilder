import assert from 'node:assert/strict';
import test from 'node:test';
import useAutomationStore, {
    normalizeAutomation,
    normalizeAutomations
} from '../src/stores/automationStore.js';

test('normalizeAutomations falls back to default manual routines', () => {
    const automations = normalizeAutomations([]);

    assert.equal(automations.length, 4);
    assert.equal(automations[0].trigger, 'manual');
    assert.equal(automations[0].scope, 'workspace');
    assert.deepEqual(automations[0].run_history, []);
});

test('normalizeAutomation compacts run history to newest twenty entries', () => {
    const runHistory = Array.from({ length: 25 }, (_, index) => ({
        id: `run-${index}`,
        status: 'completed'
    }));

    const automation = normalizeAutomation({
        id: 'auto-long-history',
        action: { type: 'graph_revalidate', params: {} },
        run_history: runHistory
    });

    assert.equal(automation.run_history.length, 20);
    assert.equal(automation.run_history[0].id, 'run-0');
    assert.equal(automation.run_history.at(-1).id, 'run-19');
});

test('recordAutomationRun prepends run history and updates last run timestamp', () => {
    useAutomationStore.setState({
        automations: [
            normalizeAutomation({
                id: 'auto-review',
                name: 'Review needs_review nodes',
                action: { type: 'needs_review_report', params: {} },
                run_history: [
                    {
                        id: 'run-old',
                        status: 'completed',
                        detail: 'Previous run',
                        started_at: '2026-05-14T14:00:00.000Z',
                        finished_at: '2026-05-14T14:01:00.000Z'
                    }
                ]
            })
        ]
    });

    useAutomationStore.getState().recordAutomationRun('auto-review', {
        id: 'run-new',
        status: 'failed',
        detail: 'Validation unavailable.',
        started_at: '2026-05-14T15:00:00.000Z',
        finished_at: '2026-05-14T15:01:00.000Z'
    });

    const [automation] = useAutomationStore.getState().automations;
    assert.equal(automation.last_run_at, '2026-05-14T15:01:00.000Z');
    assert.equal(automation.run_history[0].id, 'run-new');
    assert.equal(automation.run_history[0].status, 'failed');
    assert.equal(automation.run_history[1].id, 'run-old');
});
