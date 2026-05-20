export const UI_SHELL_RIBBON_ENV_FLAG = 'VITE_ENABLE_UI_SHELL_RIBBON';
export const UI_SHELL_RIBBON_LOCAL_STORAGE_KEY = 'docmap.uiShellRibbon.enabled';

const truthyValues = new Set(['1', 'true', 'yes', 'on', 'enabled']);

const isTruthyFlagValue = (value) =>
    truthyValues.has(String(value || '').trim().toLowerCase());

export const isUiShellRibbonEnabled = () => {
    const envValue = import.meta.env?.[UI_SHELL_RIBBON_ENV_FLAG];
    if (isTruthyFlagValue(envValue)) {
        return true;
    }
    if (typeof window === 'undefined') {
        return false;
    }
    return isTruthyFlagValue(window.localStorage?.getItem(UI_SHELL_RIBBON_LOCAL_STORAGE_KEY));
};
