export {
    SOURCE_INTAKE_MODELS,
    SOURCE_INTAKE_PROFILES,
    recommendSourceIntakeRole
} from '../utils/sourceIntakeRoles';

import {
    SOURCE_INTAKE_MODELS,
    SOURCE_INTAKE_PROFILES,
    recommendSourceIntakeRole
} from '../utils/sourceIntakeRoles';

const SourceIntakeRoleControls = ({
    sourceType = 'source',
    fileName = '',
    intakeProfileId,
    setIntakeProfileId,
    intakeModel,
    setIntakeModel,
    intakeBrief,
    setIntakeBrief,
    label = 'Supporting intake role',
    briefPlaceholder = 'Optional: tell AI what to preserve, ignore, or emphasize for this source.'
}) => {
    const selectedProfile =
        SOURCE_INTAKE_PROFILES.find((profile) => profile.id === intakeProfileId) ||
        SOURCE_INTAKE_PROFILES[0];
    const recommendedProfileId = recommendSourceIntakeRole({
        fileName,
        brief: intakeBrief,
        sourceType
    });
    const recommendedProfile =
        SOURCE_INTAKE_PROFILES.find((profile) => profile.id === recommendedProfileId) ||
        SOURCE_INTAKE_PROFILES[0];
    const isSelectedRecommended = selectedProfile.id === recommendedProfile.id;

    return (
        <div className="source-intake-config source-processing-config">
            <label>
                <span className="source-intake-label-row">
                    <span>{label}</span>
                    {isSelectedRecommended ? <small>Recommended</small> : null}
                </span>
                <select
                    value={intakeProfileId}
                    onChange={(event) => setIntakeProfileId(event.target.value)}
                >
                    {SOURCE_INTAKE_PROFILES.map((profile) => (
                        <option
                            key={profile.id || 'none'}
                            value={profile.id}
                            title={profile.description}
                        >
                            {profile.label}
                        </option>
                    ))}
                </select>
                {!isSelectedRecommended ? (
                    <button
                        type="button"
                        className="source-intake-recommendation"
                        onClick={() => setIntakeProfileId(recommendedProfile.id)}
                    >
                        Use recommended: {recommendedProfile.label}
                    </button>
                ) : null}
            </label>
            <label>
                <span className="source-intake-label-row">
                    <span>Model</span>
                </span>
                <select
                    value={intakeModel}
                    onChange={(event) => setIntakeModel(event.target.value)}
                >
                    {SOURCE_INTAKE_MODELS.map((model) => (
                        <option key={model} value={model}>
                            {model === 'auto' ? 'Auto select' : model}
                        </option>
                    ))}
                </select>
            </label>
            <div
                className="source-intake-role-summary"
                title={`Best for: ${selectedProfile.bestFor}. Skip when: ${selectedProfile.avoidWhen}`}
            >
                <span>{selectedProfile.description}</span>
            </div>
            <label>
                Optional brief
                <textarea
                    value={intakeBrief}
                    onChange={(event) => setIntakeBrief(event.target.value)}
                    placeholder={briefPlaceholder}
                />
            </label>
        </div>
    );
};

export default SourceIntakeRoleControls;
