import { useEffect, useState } from 'react';
import CROSSSvg from '../assets/cross.svg';
import modalStore from '../stores/modalStore';
import {
    CREDENTIAL_RETENTION_OPTIONS,
    NUDGE_CATEGORY_KEYS,
    NUDGE_DENSITY_OPTIONS,
    clearCredentialSettings,
    getCredentialStorageInfo,
    getCredentialStorageMode,
    getCredentialSettings,
    saveCredentialSettings
} from '../config/localSettings';
import useStore from '../stores/store';

const NUDGE_CATEGORY_LABELS = {
    canvas: 'Canvas',
    review: 'Review',
    sources: 'Sources',
    tasks: 'Tasks',
    ai_outputs: 'AI outputs',
    integrations: 'Integrations',
    knowledge_graph: 'Knowledge graph'
};

const DENSITY_LABELS = {
    quiet: 'Quiet',
    normal: 'Normal',
    assertive: 'Assertive'
};

const SettingsModal = () => {
    const popNode = modalStore((s) => s.popNode);
    const nudgePreferences = useStore((s) => s.nudgePreferences);
    const setNudgePreferences = useStore((s) => s.setNudgePreferences);
    const [openaiApiKey, setOpenaiApiKey] = useState('');
    const [miroApiToken, setMiroApiToken] = useState('');
    const [mondayApiToken, setMondayApiToken] = useState('');
    const [credentialRetentionDays, setCredentialRetentionDays] = useState(30);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [showOpenaiApiKey, setShowOpenaiApiKey] = useState(false);
    const [storageInfo, setStorageInfo] = useState({
        encrypted: false,
        persistence: 'browser-local'
    });
    const [draftNudgePreferences, setDraftNudgePreferences] =
        useState(nudgePreferences);
    const credentialStorageMode = getCredentialStorageMode();

    useEffect(() => {
        setDraftNudgePreferences(nudgePreferences);
    }, [nudgePreferences]);

    useEffect(() => {
        let mounted = true;
        getCredentialStorageInfo().then((info) => {
            if (mounted) {
                setStorageInfo(info);
            }
        });
        getCredentialSettings().then((settings) => {
            if (!mounted) {
                return;
            }

            setOpenaiApiKey(settings.openaiApiKey);
            setMiroApiToken(settings.miroApiToken);
            setMondayApiToken(settings.mondayApiToken);
            setCredentialRetentionDays(settings.credentialRetentionDays || 30);
        }).catch(() => {
            if (mounted) {
                setError('Could not load saved settings.');
            }
        });

        return () => {
            mounted = false;
        };
    }, []);

    const saveSettings = async () => {
        setError('');
        const nextSettings = {
            openaiApiKey: openaiApiKey.trim(),
            miroApiToken: miroApiToken.trim(),
            mondayApiToken: mondayApiToken.trim(),
            credentialRetentionDays
        };

        try {
            const persistedSettings = await saveCredentialSettings(nextSettings);
            setNudgePreferences(draftNudgePreferences);
            setOpenaiApiKey(persistedSettings.openaiApiKey);
            setMiroApiToken(persistedSettings.miroApiToken);
            setMondayApiToken(persistedSettings.mondayApiToken);
            setCredentialRetentionDays(
                persistedSettings.credentialRetentionDays || credentialRetentionDays
            );
            if (
                nextSettings.openaiApiKey &&
                persistedSettings.openaiApiKey !== nextSettings.openaiApiKey
            ) {
                throw new Error('OpenAI API key was not available after save.');
            }
            setSaved(true);
            popNode();
        } catch (saveError) {
            setSaved(false);
            setError(saveError.message || 'Settings could not be saved.');
        }
    };

    const toggleNudges = (enabled) => {
        setDraftNudgePreferences((current) => ({
            ...current,
            enabled
        }));
    };

    const toggleNudgeCategory = (category, enabled) => {
        setDraftNudgePreferences((current) => ({
            ...current,
            categories: {
                ...current.categories,
                [category]: enabled
            }
        }));
    };

    const setNudgeDensity = (density) => {
        setDraftNudgePreferences((current) => ({
            ...current,
            density
        }));
    };

    const clearSettings = async () => {
        setError('');
        setOpenaiApiKey('');
        setMiroApiToken('');
        setMondayApiToken('');
        setCredentialRetentionDays(30);
        try {
            await clearCredentialSettings();
            setSaved(true);
        } catch {
            setSaved(false);
            setError('Settings could not be cleared.');
        }
    };

    return (
        <div className="modal-container settings-modal">
            <div className="title">
                <div>
                    <p>Settings</p>
                </div>
                <img
                    src={CROSSSvg}
                    alt="Close settings"
                    onClick={() => popNode()}
                />
            </div>
            <p className="settings-note">
                {credentialStorageMode === 'desktop'
                    ? 'Keys are saved as Electron app data for your selected retention window and sent only to the TraceSpace backend. They are not written to the project `.env` file.'
                    : 'For browser testing, keys use your selected retention window and are sent only to the configured TraceSpace backend. Hosted production should use server-side credentials or an authenticated vault.'}
            </p>
            {credentialStorageMode === 'desktop' && !storageInfo.encrypted ? (
                <p className="settings-warning">
                    Secure desktop storage is unavailable right now. Keys will be
                    saved locally without OS encryption for testing convenience.
                </p>
            ) : null}
            <div className="input-bar">
                <label htmlFor="openai-api-key">OpenAI API key</label>
                <div className="settings-secret-row">
                    <input
                        id="openai-api-key"
                        type={showOpenaiApiKey ? 'text' : 'password'}
                        autoComplete="off"
                        placeholder="sk-..."
                        value={openaiApiKey}
                        onChange={(event) => setOpenaiApiKey(event.target.value)}
                    />
                    <button
                        type="button"
                        className="settings-secret-toggle"
                        onClick={() => setShowOpenaiApiKey((visible) => !visible)}
                    >
                        {showOpenaiApiKey ? 'Hide' : 'Preview'}
                    </button>
                </div>
            </div>
            <div className="input-bar">
                <label htmlFor="miro-api-token">Miro token optional</label>
                <input
                    id="miro-api-token"
                    type="password"
                    autoComplete="off"
                    value={miroApiToken}
                    onChange={(event) => setMiroApiToken(event.target.value)}
                />
            </div>
            <div className="input-bar">
                <label htmlFor="monday-api-token">monday.com token optional</label>
                <input
                    id="monday-api-token"
                    type="password"
                    autoComplete="off"
                    value={mondayApiToken}
                    onChange={(event) => setMondayApiToken(event.target.value)}
                />
            </div>
            <div className="input-bar">
                <label htmlFor="credential-retention">Remember keys for</label>
                <select
                    id="credential-retention"
                    value={credentialRetentionDays}
                    onChange={(event) =>
                        setCredentialRetentionDays(Number(event.target.value))
                    }
                >
                    {CREDENTIAL_RETENTION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>
            <section className="settings-section">
                <div className="settings-section-title">
                    <div>
                        <strong>Workspace guidance</strong>
                        <span>Local preferences only. Graph data and validation state stay unchanged.</span>
                    </div>
                </div>
                <label className="settings-toggle-row" htmlFor="show-nudges">
                    <span>
                        <strong>Show nudges</strong>
                        <small>Hide lightweight suggestions without hiding validation errors.</small>
                    </span>
                    <input
                        id="show-nudges"
                        type="checkbox"
                        checked={draftNudgePreferences.enabled}
                        onChange={(event) => toggleNudges(event.target.checked)}
                    />
                </label>
                <div className="input-bar">
                    <label htmlFor="nudge-density">Nudge density</label>
                    <select
                        id="nudge-density"
                        value={draftNudgePreferences.density}
                        onChange={(event) => setNudgeDensity(event.target.value)}
                        disabled={!draftNudgePreferences.enabled}
                    >
                        {NUDGE_DENSITY_OPTIONS.map((density) => (
                            <option key={density} value={density}>
                                {DENSITY_LABELS[density]}
                            </option>
                        ))}
                    </select>
                </div>
                <details className="settings-advanced">
                    <summary>Advanced nudge categories</summary>
                    <div className="settings-category-grid">
                        {NUDGE_CATEGORY_KEYS.map((category) => (
                            <label
                                key={category}
                                className="settings-toggle-row settings-category-row"
                                htmlFor={`nudge-category-${category}`}
                            >
                                <span>{NUDGE_CATEGORY_LABELS[category]}</span>
                                <input
                                    id={`nudge-category-${category}`}
                                    type="checkbox"
                                    checked={draftNudgePreferences.categories[category]}
                                    disabled={!draftNudgePreferences.enabled}
                                    onChange={(event) =>
                                        toggleNudgeCategory(category, event.target.checked)
                                    }
                                />
                            </label>
                        ))}
                    </div>
                </details>
            </section>
            {saved ? (
                <p className="settings-saved">
                    {credentialRetentionDays === 0
                        ? 'Settings saved for this app session.'
                        : `Settings saved for ${credentialRetentionDays} days.`}
                </p>
            ) : null}
            {error ? <p className="settings-warning">{error}</p> : null}
            <div className="buttons">
                <button
                    id="cancel"
                    type="button"
                    onClick={clearSettings}
                >
                    Clear
                </button>
                <button
                    id="add"
                    type="button"
                    onClick={saveSettings}
                >
                    Save
                </button>
            </div>
        </div>
    );
};

export default SettingsModal;
