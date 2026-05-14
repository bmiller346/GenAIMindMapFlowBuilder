import { useState } from 'react';
import CROSSSvg from '../assets/cross.svg';
import modalStore from '../stores/modalStore';
import {
    getLocalSetting,
    setLocalSetting,
    SETTINGS_KEYS
} from '../config/localSettings';

const SettingsModal = () => {
    const popNode = modalStore((s) => s.popNode);
    const [openaiApiKey, setOpenaiApiKey] = useState(() =>
        getLocalSetting(SETTINGS_KEYS.openaiApiKey)
    );
    const [miroApiToken, setMiroApiToken] = useState(() =>
        getLocalSetting(SETTINGS_KEYS.miroApiToken)
    );
    const [mondayApiToken, setMondayApiToken] = useState(() =>
        getLocalSetting(SETTINGS_KEYS.mondayApiToken)
    );
    const [saved, setSaved] = useState(false);

    const saveSettings = () => {
        setLocalSetting(SETTINGS_KEYS.openaiApiKey, openaiApiKey.trim());
        setLocalSetting(SETTINGS_KEYS.miroApiToken, miroApiToken.trim());
        setLocalSetting(SETTINGS_KEYS.mondayApiToken, mondayApiToken.trim());
        setSaved(true);
    };

    const clearSettings = () => {
        setOpenaiApiKey('');
        setMiroApiToken('');
        setMondayApiToken('');
        setLocalSetting(SETTINGS_KEYS.openaiApiKey, '');
        setLocalSetting(SETTINGS_KEYS.miroApiToken, '');
        setLocalSetting(SETTINGS_KEYS.mondayApiToken, '');
        setSaved(true);
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
                Keys are saved on this device and sent only to the local DocMap backend.
                They are not written to the project `.env` file.
            </p>
            <div className="input-bar">
                <label htmlFor="openai-api-key">OpenAI API key</label>
                <input
                    id="openai-api-key"
                    type="password"
                    autoComplete="off"
                    placeholder="sk-..."
                    value={openaiApiKey}
                    onChange={(event) => setOpenaiApiKey(event.target.value)}
                />
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
            {saved ? <p className="settings-saved">Settings saved for this device.</p> : null}
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
