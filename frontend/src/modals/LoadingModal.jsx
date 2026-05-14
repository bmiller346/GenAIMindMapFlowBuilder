import { useEffect, useMemo, useState } from 'react';
import LOGOSvg from "../assets/logo.svg";

const DEFAULT_STEPS = [
    'Preparing request',
    'Waiting for the local backend',
    'Processing response',
    'Updating workspace'
];

const LoadingModal = ({
    title = 'Working on it',
    detail = 'This can take a moment for larger files or AI-generated workspaces.',
    steps = DEFAULT_STEPS,
    context = '',
    aiContext = ''
}) => {
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const currentStepIndex = useMemo(() => {
        const index = Math.min(
            Math.floor(elapsedSeconds / 7),
            steps.length - 1
        );
        return index;
    }, [elapsedSeconds, steps]);
    const currentStep = steps[currentStepIndex] || DEFAULT_STEPS[0];
    const progressPercent = Math.min(
        94,
        Math.max(
            8,
            Math.round(
                ((currentStepIndex + 1) / Math.max(steps.length, 1)) * 82 +
                    Math.min(elapsedSeconds * 1.5, 12)
            )
        )
    );

    useEffect(() => {
        const interval = window.setInterval(() => {
            setElapsedSeconds((seconds) => seconds + 1);
        }, 1000);

        return () => window.clearInterval(interval);
    }, []);

    return (
        <div className="loading-modal-card">
            <img src={LOGOSvg} alt="Loading" id="logo" />
            <div className="loading-modal-copy">
                <h2>{title}</h2>
                <p>{currentStep}</p>
                <span>{detail}</span>
            </div>
            {context || aiContext ? (
                <div className="loading-modal-context">
                    {context ? <p>{context}</p> : null}
                    {aiContext ? <strong>{aiContext}</strong> : null}
                </div>
            ) : null}
            <div
                className="loading-modal-bar"
                role="progressbar"
                aria-label={currentStep}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
            >
                <span style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="loading-modal-progress" aria-hidden="true">
                {steps.map((step, index) => (
                    <span
                        key={step}
                        className={index <= currentStepIndex ? 'active' : ''}
                    />
                ))}
            </div>
            <p className="loading-modal-elapsed">
                {elapsedSeconds < 3
                    ? 'Starting now'
                    : `${elapsedSeconds}s elapsed`}
            </p>
        </div>
    );
};

export default LoadingModal;
