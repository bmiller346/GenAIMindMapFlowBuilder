/* eslint-disable react/prop-types */
import { trustStatesForSubject } from '../utils/trustStates';

const TrustStateBadges = ({ subject, states, className = '' }) => {
    const trustStates = states || trustStatesForSubject(subject || {});

    if (!trustStates.length) {
        return null;
    }

    return (
        <span className={['trust-state-badges', className].filter(Boolean).join(' ')}>
            {trustStates.map((state) => (
                <span
                    key={state.id}
                    className={`trust-state-badge trust-state-${state.id} trust-state-tone-${state.tone}`}
                >
                    {state.label}
                </span>
            ))}
        </span>
    );
};

export default TrustStateBadges;
