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
    aiContext = '',
    operationId,
    onProgress,
    onCancel,
    cancelLabel = 'Cancel request',
    onRetry,
    retryLabel = 'Retry',
    onDismiss,
    status,
    statusMessage
}) => {
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [backendProgress, setBackendProgress] = useState();
    const progressStatus = status || backendProgress?.status;
    const isFailed = progressStatus === 'failed';
    const isCompleted = progressStatus === 'completed';
    const currentStepIndex = useMemo(() => {
        if (backendProgress?.progress !== undefined) {
            return Math.min(
                Math.floor((backendProgress.progress / 100) * steps.length),
                steps.length - 1
            );
        }
        const index = Math.min(
            Math.floor(elapsedSeconds / 7),
            steps.length - 1
        );
        return index;
    }, [backendProgress, elapsedSeconds, steps]);
    const currentStep =
        statusMessage || backendProgress?.message || steps[currentStepIndex] || DEFAULT_STEPS[0];
    const progressPercent =
        backendProgress?.progress !== undefined
            ? backendProgress.progress
            : Math.min(
                  94,
                  Math.max(
                      8,
                      Math.round(
                          ((currentStepIndex + 1) / Math.max(steps.length, 1)) * 82 +
                              Math.min(elapsedSeconds * 1.5, 12)
                      )
                  )
              );
    const detailText = backendProgress?.detail || detail;

    useEffect(() => {
        if (!operationId) {
            return undefined;
        }

        let canceled = false;
        const loadProgress = async () => {
            try {
                const response = await fetch(
                    `http://localhost:8000/operations/${operationId}`
                );
                if (!response.ok || canceled) {
                    return;
                }
                const nextProgress = await response.json();
                if (!canceled) {
                    setBackendProgress(nextProgress);
                    onProgress?.(nextProgress);
                }
            } catch (error) {
                console.warn('Unable to load operation progress', error);
            }
        };

        const initialTimeout = window.setTimeout(loadProgress, 600);
        const interval = window.setInterval(loadProgress, 900);

        return () => {
            canceled = true;
            window.clearTimeout(initialTimeout);
            window.clearInterval(interval);
        };
    }, [onProgress, operationId]);

    const stepIsActive = (index) => {
        if (backendProgress?.progress !== undefined) {
            return (
                index <=
                Math.floor((backendProgress.progress / 100) * Math.max(steps.length - 1, 1))
            );
        }
        return index <= currentStepIndex;
    };

    const statusLabel = progressStatus
        ? progressStatus.charAt(0).toUpperCase() + progressStatus.slice(1)
        : '';

    useEffect(() => {
        const interval = window.setInterval(() => {
            setElapsedSeconds((seconds) => seconds + 1);
        }, 1000);

        return () => window.clearInterval(interval);
    }, []);

    return (
        <div
            className={[
                'loading-modal-card',
                progressStatus ? `loading-modal-card--${progressStatus}` : ''
            ].filter(Boolean).join(' ')}
        >
            <img src={LOGOSvg} alt="Loading" id="logo" />
            <div className="loading-modal-copy">
                <h2>{title}</h2>
                <p>{currentStep}</p>
                <span>{detailText}</span>
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
                        className={stepIsActive(index) ? 'active' : ''}
                    />
                ))}
            </div>
            <p className="loading-modal-elapsed">
                {statusLabel ? `${statusLabel} · ` : ''}
                {elapsedSeconds < 3 ? 'Starting now' : `${elapsedSeconds}s elapsed`}
            </p>
            <div className="loading-modal-actions">
                {isFailed && onRetry ? (
                    <button
                        className="loading-modal-retry"
                        type="button"
                        onClick={onRetry}
                    >
                        {retryLabel}
                    </button>
                ) : null}
                {(isFailed || isCompleted) && onDismiss ? (
                    <button
                        className="loading-modal-cancel"
                        type="button"
                        onClick={onDismiss}
                    >
                        Dismiss
                    </button>
                ) : null}
                {!isFailed && !isCompleted && onCancel ? (
                    <button
                        className="loading-modal-cancel"
                        type="button"
                        onClick={onCancel}
                    >
                        {cancelLabel}
                    </button>
                ) : null}
            </div>
        </div>
    );
};

export default LoadingModal;
