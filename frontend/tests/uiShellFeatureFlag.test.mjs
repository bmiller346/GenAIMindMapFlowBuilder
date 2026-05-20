import assert from 'node:assert/strict';
import test from 'node:test';
import {
    UI_SHELL_RIBBON_LOCAL_STORAGE_KEY,
    isUiShellRibbonEnabled
} from '../src/config/uiShellFeatureFlag.js';

const previousWindow = globalThis.window;

const withLocalStorageValue = (value, callback) => {
    globalThis.window = {
        localStorage: {
            getItem: (key) => (key === UI_SHELL_RIBBON_LOCAL_STORAGE_KEY ? value : null)
        }
    };
    try {
        callback();
    } finally {
        if (previousWindow === undefined) {
            delete globalThis.window;
        } else {
            globalThis.window = previousWindow;
        }
    }
};

test('UI shell feature flag is enabled by default without browser storage or env flag', () => {
    delete globalThis.window;

    assert.equal(isUiShellRibbonEnabled(), true);
});

test('UI shell feature flag accepts documented localStorage truthy values', () => {
    for (const value of ['1', 'true', 'yes', 'on', 'enabled', ' TRUE ']) {
        withLocalStorageValue(value, () => {
            assert.equal(isUiShellRibbonEnabled(), true);
        });
    }
});

test('UI shell feature flag uses default for missing storage and accepts falsey localStorage rollback values', () => {
    for (const value of [null, '']) {
        withLocalStorageValue(value, () => {
            assert.equal(isUiShellRibbonEnabled(), true);
        });
    }
    for (const value of ['0', 'false', 'disabled', 'no', 'off', 'legacy']) {
        withLocalStorageValue(value, () => {
            assert.equal(isUiShellRibbonEnabled(), false);
        });
    }
});
