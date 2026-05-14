import { useEffect, useState } from 'react';
import CROSSSvg from '../assets/cross.svg';
import modalStore from '../stores/modalStore';
import {
    CREDENTIAL_RETENTION_OPTIONS,
    clearCredentialSettings,
    getCredentialStorageInfo,
    getCredentialStorageMode,
    getCredentialSettings,
    saveCredentialSettings
} from '../config/localSettings';

const SettingsModal = () => {
    const popNode = modalStore((s) => s.popNode);
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
    const credentialStorageMode = getCredentialStorageMode();

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
                    ? 'Keys are saved as Electron app data for your selected retention window and sent only to the DocMap backend. They are not written to the project `.env` file.'
                    : 'For browser testing, keys use your selected retention window and are sent only to the configured DocMap backend. Hosted production should use server-side credentials or an authenticated vault.'}
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
