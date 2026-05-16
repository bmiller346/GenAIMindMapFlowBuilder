import {
    SETTINGS_KEYS,
    isDeveloperModeEnabled as isDeveloperModeSettingEnabled,
    saveDeveloperMode
} from './localSettings';

export const DEVELOPER_FEATURE_KEYS = {
    developerMode: SETTINGS_KEYS.developerMode
};

export const isDeveloperModeEnabled = () =>
    isDeveloperModeSettingEnabled();

export const setDeveloperModeEnabled = (enabled) =>
    saveDeveloperMode(enabled);
