import axios from 'axios';

export const SETTINGS_KEYS = {
    openaiApiKey: 'docmap.openaiApiKey',
    miroApiToken: 'docmap.miroApiToken',
    mondayApiToken: 'docmap.mondayApiToken',
    credentialRetentionDays: 'docmap.credentialRetentionDays',
    credentialExpiresAt: 'docmap.credentialExpiresAt',
    theme: 'docmap.theme'
};

const CREDENTIAL_LOCAL_STORAGE_KEYS = [
    SETTINGS_KEYS.openaiApiKey,
    SETTINGS_KEYS.miroApiToken,
    SETTINGS_KEYS.mondayApiToken,
    SETTINGS_KEYS.credentialRetentionDays,
    SETTINGS_KEYS.credentialExpiresAt
];

export const CREDENTIAL_RETENTION_OPTIONS = [
    { value: 0, label: 'This session' },
    { value: 30, label: '30 days' },
    { value: 60, label: '60 days' },
    { value: 90, label: '90 days' }
];

const DEFAULT_CREDENTIAL_RETENTION_DAYS = 30;

let browserSessionCredentials = {
    openaiApiKey: '',
    miroApiToken: '',
    mondayApiToken: '',
    credentialRetentionDays: DEFAULT_CREDENTIAL_RETENTION_DAYS,
    expiresAt: ''
};

const isDesktop = () =>
    typeof window !== 'undefined' && Boolean(window.docmapDesktop?.isDesktop);

export const getCredentialStorageMode = () =>
    isDesktop() ? 'desktop' : 'browser-local';

export const getCredentialStorageInfo = async () => {
    if (!isDesktop()) {
        return { encrypted: false, persistence: 'browser-local' };
    }

    try {
        return await window.docmapDesktop.getCredentialStorageInfo();
    } catch {
        return { encrypted: false, persistence: 'plain-device' };
    }
};

const emptyCredentialSettings = () => ({
    openaiApiKey: '',
    miroApiToken: '',
    mondayApiToken: '',
    credentialRetentionDays: DEFAULT_CREDENTIAL_RETENTION_DAYS,
    expiresAt: ''
});

const normalizeCredentialSettings = (settings = {}) => {
    const retentionDays = Number(settings.credentialRetentionDays);
    const allowedRetentionDays = CREDENTIAL_RETENTION_OPTIONS.map((option) => option.value);
    return {
        openaiApiKey: typeof settings.openaiApiKey === 'string' ? settings.openaiApiKey : '',
        miroApiToken: typeof settings.miroApiToken === 'string' ? settings.miroApiToken : '',
        mondayApiToken: typeof settings.mondayApiToken === 'string' ? settings.mondayApiToken : '',
        credentialRetentionDays: allowedRetentionDays.includes(retentionDays)
            ? retentionDays
            : DEFAULT_CREDENTIAL_RETENTION_DAYS,
        expiresAt: typeof settings.expiresAt === 'string' ? settings.expiresAt : ''
    };
};

const expirationForRetentionDays = (retentionDays) => {
    if (retentionDays === 0) {
        return '';
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + retentionDays);
    return expiresAt.toISOString();
};

const isCredentialSettingsExpired = (settings) =>
    Boolean(settings?.expiresAt) && Date.parse(settings.expiresAt) <= Date.now();

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

const removeRendererCredentialCache = () => {
    try {
        CREDENTIAL_LOCAL_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    } catch {
        // Best-effort cleanup only.
    }
};

const getBrowserCredentialSettings = () => ({
    ...browserSessionCredentials
});

const getStoredBrowserCredentialSettings = () => ({
    openaiApiKey: getLocalSetting(SETTINGS_KEYS.openaiApiKey),
    miroApiToken: getLocalSetting(SETTINGS_KEYS.miroApiToken),
    mondayApiToken: getLocalSetting(SETTINGS_KEYS.mondayApiToken),
    credentialRetentionDays: getLocalSetting(SETTINGS_KEYS.credentialRetentionDays),
    expiresAt: getLocalSetting(SETTINGS_KEYS.credentialExpiresAt)
});

const hasCredentialValues = (settings = {}) =>
    Boolean(settings.openaiApiKey || settings.miroApiToken || settings.mondayApiToken);

const setBrowserCredentialSettings = (settings) => {
    const normalized = normalizeCredentialSettings({
        ...settings,
        expiresAt:
            settings.credentialRetentionDays === 0
                ? ''
                : settings.expiresAt || expirationForRetentionDays(settings.credentialRetentionDays)
    });
    browserSessionCredentials = normalized;
    removeRendererCredentialCache();
    if (hasCredentialValues(normalized) && normalized.credentialRetentionDays !== 0) {
        setLocalSetting(SETTINGS_KEYS.openaiApiKey, normalized.openaiApiKey);
        setLocalSetting(SETTINGS_KEYS.miroApiToken, normalized.miroApiToken);
        setLocalSetting(SETTINGS_KEYS.mondayApiToken, normalized.mondayApiToken);
        setLocalSetting(
            SETTINGS_KEYS.credentialRetentionDays,
            String(normalized.credentialRetentionDays)
        );
        setLocalSetting(SETTINGS_KEYS.credentialExpiresAt, normalized.expiresAt);
    }
    return normalized;
};

const setRendererCredentialBackup = (settings) => {
    const normalized = normalizeCredentialSettings({
        ...settings,
        expiresAt:
            settings.credentialRetentionDays === 0
                ? ''
                : settings.expiresAt || expirationForRetentionDays(settings.credentialRetentionDays)
    });
    browserSessionCredentials = normalized;
    removeRendererCredentialCache();
    if (hasCredentialValues(normalized) && normalized.credentialRetentionDays !== 0) {
        setLocalSetting(SETTINGS_KEYS.openaiApiKey, normalized.openaiApiKey);
        setLocalSetting(SETTINGS_KEYS.miroApiToken, normalized.miroApiToken);
        setLocalSetting(SETTINGS_KEYS.mondayApiToken, normalized.mondayApiToken);
        setLocalSetting(
            SETTINGS_KEYS.credentialRetentionDays,
            String(normalized.credentialRetentionDays)
        );
        setLocalSetting(SETTINGS_KEYS.credentialExpiresAt, normalized.expiresAt);
    }
    return normalized;
};

export const migrateRendererCredentialsToBrowserSession = () => {
    if (isDesktop()) {
        return emptyCredentialSettings();
    }

    const rendererCredentials = getStoredBrowserCredentialSettings();
    if (isCredentialSettingsExpired(rendererCredentials)) {
        browserSessionCredentials = emptyCredentialSettings();
        removeRendererCredentialCache();
    } else if (hasCredentialValues(rendererCredentials)) {
        browserSessionCredentials = normalizeCredentialSettings(rendererCredentials);
    }

    return getBrowserCredentialSettings();
};

export const migrateRendererCredentialsToDesktop = async () => {
    if (!isDesktop()) {
        return emptyCredentialSettings();
    }

    const storedRendererCredentials = getStoredBrowserCredentialSettings();
    if (isCredentialSettingsExpired(storedRendererCredentials)) {
        removeRendererCredentialCache();
        return getDesktopCredentialSettings();
    }

    const rendererCredentials = hasCredentialValues(storedRendererCredentials)
        ? normalizeCredentialSettings(storedRendererCredentials)
        : getBrowserCredentialSettings();
    if (!hasCredentialValues(rendererCredentials)) {
        return getDesktopCredentialSettings();
    }

    const existingCredentials = await getDesktopCredentialSettings();
    const mergedCredentials = normalizeCredentialSettings({
        ...rendererCredentials,
        ...Object.fromEntries(
            Object.entries(existingCredentials).filter(([, value]) => Boolean(value))
        )
    });
    const savedCredentials =
        await window.docmapDesktop.saveCredentialSettings(mergedCredentials);
    removeRendererCredentialCache();
    return normalizeCredentialSettings(savedCredentials);
};

export const getDesktopCredentialSettings = async () => {
    if (!isDesktop()) {
        return emptyCredentialSettings();
    }

    try {
        return normalizeCredentialSettings(
            await window.docmapDesktop.getCredentialSettings()
        );
    } catch {
        return emptyCredentialSettings();
    }
};

export const getCredentialSettings = async () => {
    if (!isDesktop()) {
        migrateRendererCredentialsToBrowserSession();
        return getBrowserCredentialSettings();
    }

    const desktopCredentials = await getDesktopCredentialSettings();
    if (hasCredentialValues(desktopCredentials)) {
        browserSessionCredentials = desktopCredentials;
        return desktopCredentials;
    }

    const rendererCredentials = getStoredBrowserCredentialSettings();
    if (isCredentialSettingsExpired(rendererCredentials)) {
        removeRendererCredentialCache();
        browserSessionCredentials = emptyCredentialSettings();
        return browserSessionCredentials;
    }

    if (hasCredentialValues(rendererCredentials)) {
        browserSessionCredentials = normalizeCredentialSettings(rendererCredentials);
        return browserSessionCredentials;
    }

    return desktopCredentials;
};

export const saveCredentialSettings = async (settings) => {
    const normalized = normalizeCredentialSettings(settings);
    if (!isDesktop()) {
        return setBrowserCredentialSettings(normalized);
    }

    const savedCredentials =
        await window.docmapDesktop.saveCredentialSettings(normalized);
    browserSessionCredentials = setRendererCredentialBackup(
        hasCredentialValues(savedCredentials) ? savedCredentials : normalized
    );
    return browserSessionCredentials;
};

export const clearCredentialSettings = async () => {
    if (!isDesktop()) {
        return setBrowserCredentialSettings(emptyCredentialSettings());
    }

    const clearedCredentials = await window.docmapDesktop.clearCredentialSettings();
    removeRendererCredentialCache();
    return normalizeCredentialSettings(clearedCredentials);
};

const DOCMAP_BACKEND_HOSTS = new Set(['localhost:8000', '127.0.0.1:8000']);
const DOCMAP_LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);
const DOCMAP_API_BASE_URL = (import.meta.env?.VITE_DOCMAP_API_BASE_URL || '').trim();

const isLocalBrowserHost = () => {
    try {
        return DOCMAP_LOCAL_HOSTNAMES.has(window.location.hostname);
    } catch {
        return false;
    }
};

const configuredApiOrigin = () => {
    if (!DOCMAP_API_BASE_URL) {
        return '';
    }

    try {
        return new URL(DOCMAP_API_BASE_URL, window.location.origin).origin;
    } catch {
        return '';
    }
};

const rewriteHostedBackendRequest = (config) => {
    if (isDesktop() || isLocalBrowserHost()) {
        return config;
    }

    const requestUrl = new URL(config.url || '', window.location.origin);
    if (!DOCMAP_BACKEND_HOSTS.has(requestUrl.host)) {
        return config;
    }

    const apiBaseUrl = DOCMAP_API_BASE_URL || window.location.origin;
    const rewrittenUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, apiBaseUrl);
    return {
        ...config,
        url: rewrittenUrl.toString()
    };
};

const isDocMapBackendRequest = (config) => {
    try {
        const requestUrl = new URL(config.url || '', window.location.origin);
        const allowedApiOrigin = configuredApiOrigin();
        return (
            DOCMAP_BACKEND_HOSTS.has(requestUrl.host) ||
            requestUrl.origin === window.location.origin ||
            (allowedApiOrigin && requestUrl.origin === allowedApiOrigin)
        );
    } catch {
        return false;
    }
};

export const configureLocalCredentialHeaders = () => {
    axios.interceptors.request.use(async (config) => {
        const rewrittenConfig = rewriteHostedBackendRequest(config);
        if (!isDocMapBackendRequest(rewrittenConfig)) {
            return rewrittenConfig;
        }

        const { openaiApiKey, miroApiToken, mondayApiToken } =
            await getCredentialSettings();

        rewrittenConfig.headers = rewrittenConfig.headers || {};
        if (openaiApiKey) {
            rewrittenConfig.headers['X-DocMap-OpenAI-API-Key'] = openaiApiKey;
        }
        if (miroApiToken) {
            rewrittenConfig.headers['X-DocMap-Miro-API-Token'] = miroApiToken;
        }
        if (mondayApiToken) {
            rewrittenConfig.headers['X-DocMap-Monday-API-Token'] = mondayApiToken;
        }

        return rewrittenConfig;
    });
};
