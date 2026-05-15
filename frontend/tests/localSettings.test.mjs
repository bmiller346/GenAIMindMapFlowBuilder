import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DEFAULT_NUDGE_PREFERENCES,
    NUDGE_CATEGORY_KEYS,
    getLastUsedGraphFilters,
    getNudgePreferences,
    isNudgeCategoryEnabled,
    normalizeNudgePreferences,
    saveLastUsedGraphFilters,
    saveNudgePreferences
} from '../src/config/localSettings.js';

const installLocalStorage = () => {
    const storage = new Map();
    global.window = {
        localStorage: {
            getItem: (key) => storage.get(key) || '',
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: (key) => storage.delete(key)
        }
    };
    return storage;
};

test('nudge preferences default to every category enabled', () => {
    installLocalStorage();

    const preferences = getNudgePreferences();

    assert.equal(preferences.enabled, true);
    assert.equal(preferences.density, 'normal');
    assert.deepEqual(Object.keys(preferences.categories), NUDGE_CATEGORY_KEYS);
    assert.equal(isNudgeCategoryEnabled(preferences, 'canvas'), true);
});

test('nudge preferences persist local reversible category choices', () => {
    installLocalStorage();

    const saved = saveNudgePreferences({
        enabled: true,
        density: 'assertive',
        categories: {
            ...DEFAULT_NUDGE_PREFERENCES.categories,
            canvas: false,
            ai_outputs: false
        }
    });
    const restored = getNudgePreferences();

    assert.deepEqual(restored, saved);
    assert.equal(isNudgeCategoryEnabled(restored, 'canvas'), false);
    assert.equal(isNudgeCategoryEnabled(restored, 'sources'), true);
    assert.equal(isNudgeCategoryEnabled(restored, 'review'), true);
    assert.equal(isNudgeCategoryEnabled(restored, 'ai_outputs'), false);
});

test('master nudge disable suppresses categories without deleting choices', () => {
    installLocalStorage();

    const preferences = normalizeNudgePreferences({
        enabled: false,
        categories: {
            ...DEFAULT_NUDGE_PREFERENCES.categories,
            canvas: false,
            review: true
        }
    });

    assert.equal(preferences.categories.canvas, false);
    assert.equal(preferences.categories.review, true);
    assert.equal(isNudgeCategoryEnabled(preferences, 'review'), false);
});

test('last-used graph filters persist locally', () => {
    installLocalStorage();

    const saved = saveLastUsedGraphFilters({
        'needs-review': true,
        manual: false,
        'missing-source': true
    });

    assert.deepEqual(saved, ['needs-review', 'missing-source']);
    assert.deepEqual(getLastUsedGraphFilters(), ['needs-review', 'missing-source']);
});
