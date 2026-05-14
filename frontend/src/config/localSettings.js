import axios from 'axios';

export const SETTINGS_KEYS = {
    openaiApiKey: 'docmap.openaiApiKey',
    miroApiToken: 'docmap.miroApiToken',
    mondayApiToken: 'docmap.mondayApiToken',
    theme: 'docmap.theme'
};

export const getLocalSetting = (key) => {
    try {
        return window.localStorage.getItem(key) || '';
    } catch {
        return '';
    }
};

export const setLocalSetting = (key, value) => {
    try {
        if (value) {
            window.localStorage.setItem(key, value);
        } else {
            window.localStorage.removeItem(key);
        }
    } catch {
        // Local settings are a convenience layer; requests still work without them.
    }
};

export const configureLocalCredentialHeaders = () => {
    axios.interceptors.request.use((config) => {
        const openaiApiKey = getLocalSetting(SETTINGS_KEYS.openaiApiKey);
        const miroApiToken = getLocalSetting(SETTINGS_KEYS.miroApiToken);
        const mondayApiToken = getLocalSetting(SETTINGS_KEYS.mondayApiToken);

        config.headers = config.headers || {};
        if (openaiApiKey) {
            config.headers['X-DocMap-OpenAI-API-Key'] = openaiApiKey;
        }
        if (miroApiToken) {
            config.headers['X-DocMap-Miro-API-Token'] = miroApiToken;
        }
        if (mondayApiToken) {
            config.headers['X-DocMap-Monday-API-Token'] = mondayApiToken;
        }

        return config;
    });
};
