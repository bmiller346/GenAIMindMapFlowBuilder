import axios from 'axios';

export const SETTINGS_KEYS = {
    openaiApiKey: 'docmap.openaiApiKey',
    miroApiToken: 'docmap.miroApiToken',
    mondayApiToken: 'docmap.mondayApiToken',
    credentialRetentionDays: 'docmap.credentialRetentionDays',
    credentialExpiresAt: 'docmap.credentialExpiresAt',
    theme: 'docmap.theme',
    nudgePreferences: 'docmap.nudgePreferences',
    dismissedNudges: 'docmap.dismissedNudges',
    lastUsedGraphFilters: 'docmap.lastUsedGraphFilters',
    lastCanvasView: 'docmap.lastCanvasView',
    lastKgRelationshipMode: 'docmap.lastKgRelationshipMode',
    savedTableViews: 'docmap.savedTableViews',
    developerMode: 'docmap:developerMode'
};

export const NUDGE_CATEGORY_KEYS = [
    'canvas',
    'review',
    'sources',
    'tasks',
    'ai_outputs',
    'integrations',
    'knowledge_graph'
];

export const NUDGE_DENSITY_OPTIONS = ['quiet', 'normal', 'assertive'];

export const DEFAULT_NUDGE_PREFERENCES = {
    enabled: true,
    density: 'normal',
    categories: Object.fromEntries(
        NUDGE_CATEGORY_KEYS.map((category) => [category, true])
    )
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

export const isDeveloperModeEnabled = () =>
    getLocalSetting(SETTINGS_KEYS.developerMode) === 'true';

export const saveDeveloperMode = (enabled) => {
    setLocalSetting(SETTINGS_KEYS.developerMode, enabled ? 'true' : '');
    return Boolean(enabled);
};

const getJsonLocalSetting = (key, fallback) => {
    const rawValue = getLocalSetting(key);
    if (!rawValue) {
        return fallback;
    }

    try {
        return JSON.parse(rawValue);
    } catch {
        return fallback;
    }
};

const setJsonLocalSetting = (key, value) => {
    setLocalSetting(key, JSON.stringify(value));
};

export const normalizeNudgePreferences = (preferences = {}) => {
    const legacyCategoryValues = Object.fromEntries(
        NUDGE_CATEGORY_KEYS.map((category) => [category, preferences[category]])
    );
    const categoryValues =
        preferences.categories && typeof preferences.categories === 'object'
            ? preferences.categories
            : legacyCategoryValues;
    const categories = Object.fromEntries(
        NUDGE_CATEGORY_KEYS.map((category) => [
            category,
            categoryValues[category] === undefined
                ? DEFAULT_NUDGE_PREFERENCES.categories[category]
                : Boolean(categoryValues[category])
        ])
    );
    const density = NUDGE_DENSITY_OPTIONS.includes(preferences.density)
        ? preferences.density
        : DEFAULT_NUDGE_PREFERENCES.density;

    return {
        enabled:
            preferences.enabled === undefined
                ? DEFAULT_NUDGE_PREFERENCES.enabled
                : Boolean(preferences.enabled),
        density,
        categories
    };
};

export const getNudgePreferences = () =>
    normalizeNudgePreferences(
        getJsonLocalSetting(
            SETTINGS_KEYS.nudgePreferences,
            DEFAULT_NUDGE_PREFERENCES
        )
    );

export const saveNudgePreferences = (preferences) => {
    const normalized = normalizeNudgePreferences(preferences);
    setJsonLocalSetting(SETTINGS_KEYS.nudgePreferences, normalized);
    return normalized;
};

export const isNudgeCategoryEnabled = (preferences, category) => {
    const normalized = normalizeNudgePreferences(preferences);
    return Boolean(normalized.enabled && normalized.categories[category]);
};

const normalizeDismissedNudges = (dismissed = []) => {
    if (!Array.isArray(dismissed)) {
        return [];
    }

    return Array.from(
        new Set(dismissed.map((key) => String(key || '').trim()).filter(Boolean))
    );
};

export const getDismissedNudges = () =>
    normalizeDismissedNudges(getJsonLocalSetting(SETTINGS_KEYS.dismissedNudges, []));

export const saveDismissedNudges = (dismissed = []) => {
    const normalized = normalizeDismissedNudges(dismissed);
    setJsonLocalSetting(SETTINGS_KEYS.dismissedNudges, normalized);
    return normalized;
};

export const dismissNudge = (dismissKey) => {
    const normalizedKey = String(dismissKey || '').trim();
    if (!normalizedKey) {
        return getDismissedNudges();
    }

    return saveDismissedNudges([...getDismissedNudges(), normalizedKey]);
};

const normalizeGraphFilters = (filters = []) => {
    if (Array.isArray(filters)) {
        return filters.filter(Boolean).map(String);
    }
    if (filters && typeof filters === 'object') {
        return Object.entries(filters)
            .filter(([, enabled]) => Boolean(enabled))
            .map(([id]) => id);
    }
    return [];
};

export const getLastUsedGraphFilters = () =>
    normalizeGraphFilters(
        getJsonLocalSetting(SETTINGS_KEYS.lastUsedGraphFilters, [])
    );

export const saveLastUsedGraphFilters = (filters) => {
    const normalized = normalizeGraphFilters(filters);
    setJsonLocalSetting(SETTINGS_KEYS.lastUsedGraphFilters, normalized);
    return normalized;
};

const CANVAS_VIEW_IDS = new Set([
    'mindmap',
    'knowledgeGraph',
    'flowchart',
    'outline',
    'executive',
    'tasks',
    'kanban',
    'table'
]);

export const normalizeCanvasView = (view = '') =>
    CANVAS_VIEW_IDS.has(view) ? view : 'mindmap';

export const getLastCanvasView = () =>
    normalizeCanvasView(getLocalSetting(SETTINGS_KEYS.lastCanvasView));

export const saveLastCanvasView = (view) => {
    const normalized = normalizeCanvasView(view);
    setLocalSetting(SETTINGS_KEYS.lastCanvasView, normalized);
    return normalized;
};

const KG_RELATIONSHIP_MODE_IDS = new Set([
    'insights',
    'execution',
    'risks',
    'dependencies',
    'ownership',
    'metrics',
    'approvals',
    'evidence',
    'related',
    'all'
]);

export const normalizeKgRelationshipMode = (mode = '') =>
    KG_RELATIONSHIP_MODE_IDS.has(mode) ? mode : 'insights';

export const getLastKgRelationshipMode = () =>
    normalizeKgRelationshipMode(getLocalSetting(SETTINGS_KEYS.lastKgRelationshipMode));

export const saveLastKgRelationshipMode = (mode) => {
    const normalized = normalizeKgRelationshipMode(mode);
    setLocalSetting(SETTINGS_KEYS.lastKgRelationshipMode, normalized);
    return normalized;
};

const normalizeSavedTableView = (view = {}) => {
    if (!view || typeof view !== 'object') {
        return null;
    }
    const name = String(view.name || '').trim();
    if (!name) {
        return null;
    }
    return {
        id: String(view.id || `table-view-${Date.now()}`),
        name,
        mode: String(view.mode || 'breakdown'),
        branchId: String(view.branchId || ''),
        filters: normalizeGraphFilters(view.filters || []),
        createdAt: String(view.createdAt || new Date().toISOString())
    };
};

const normalizeSavedTableViews = (views = []) => {
    if (!Array.isArray(views)) {
        return [];
    }
    return views
        .map(normalizeSavedTableView)
        .filter(Boolean)
        .slice(0, 12);
};

export const getSavedTableViews = () =>
    normalizeSavedTableViews(getJsonLocalSetting(SETTINGS_KEYS.savedTableViews, []));

export const saveSavedTableViews = (views = []) => {
    const normalized = normalizeSavedTableViews(views);
    setJsonLocalSetting(SETTINGS_KEYS.savedTableViews, normalized);
    return normalized;
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
