/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import {
    FiActivity,
    FiCheck,
    FiChevronDown,
    FiChevronRight,
    FiClock,
    FiList,
    FiMinimize2,
    FiRefreshCw,
    FiShield,
    FiX
} from 'react-icons/fi';

const DEFAULT_AI_GENERATION_STAGES = [
    {
        id: 'preparing_request',
        label: 'Preparing request',
        detail: 'Packaging your prompt and selected options.'
    },
    {
        id: 'gathering_context',
        label: 'Gathering context',
        detail: 'Reading the visible workspace context for this request.'
    },
    {
        id: 'choosing_model',
        label: 'Choosing model',
        detail: 'Selecting the configured AI model for this draft.'
    },
    {
        id: 'calling_model',
        label: 'Calling AI model',
        detail: 'Waiting for the model response.'
    },
    {
        id: 'validating_draft',
        label: 'Validating draft',
        detail: 'Checking the returned draft before preview.'
    },
    {
        id: 'opening_preview',
        label: 'Opening preview',
        detail: 'Preparing a review surface for the generated draft.'
    }
];

const STATUS_LABELS = {
    running: 'Running',
    completed: 'Ready for review',
    failed: 'Needs attention',
    canceled: 'Canceled'
};

const clampProgress = (value) => {
    if (!Number.isFinite(value)) {
        return undefined;
    }

    return Math.min(100, Math.max(0, value));
};

const eventKey = (event, index) =>
    event.id || `${event.stageId || event.stage || 'event'}-${event.time || index}`;

const formatEventTime = (value) => {
    if (!value) {
        return '';
    }

    if (value instanceof Date) {
        return value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    return String(value);
};

const AiGenerationProgress = ({
    isVisible = true,
    title = 'Ask AI is drafting',
    subtitle = 'Working in a draft layer',
    ariaLabel = 'AI generation progress',
    status = 'running',
    stageId = 'preparing_request',
    stages = DEFAULT_AI_GENERATION_STAGES,
    progress,
    latestStatus = '',
    contextItems = [],
    events = [],
    showEventFeed = false,
    defaultEventFeedOpen = false,
    eventFeedOpen,
    onEventFeedOpenChange,
    maxEvents = 4,
    scopeLabel = 'Canvas draft',
    scopeDescription = 'No canvas changes are applied until you review and accept the draft.',
    draftStateLabel = 'Pending review',
    collapsed,
    defaultCollapsed = false,
    onCollapsedChange,
    onRetry,
    retryLabel = 'Retry',
    onDismiss,
    dismissLabel = 'Dismiss progress',
    dismissWhileRunning = false,
    className = ''
}) => {
    const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
    const [internalFeedOpen, setInternalFeedOpen] = useState(defaultEventFeedOpen);
    const isCollapsed = collapsed ?? internalCollapsed;
    const isFeedOpen = eventFeedOpen ?? internalFeedOpen;
    const normalizedStages =
        Array.isArray(stages) && stages.length ? stages : DEFAULT_AI_GENERATION_STAGES;
    const matchingStageIndex = normalizedStages.findIndex((stage) => stage.id === stageId);
    const stageIndex =
        matchingStageIndex >= 0
            ? matchingStageIndex
            : status === 'completed'
              ? normalizedStages.length - 1
              : 0;
    const activeStage = normalizedStages[stageIndex] || normalizedStages[0];
    const derivedProgress =
        status === 'completed'
            ? 100
            : ((stageIndex + 1) / normalizedStages.length) * 100;
    const progressValue = Math.round(clampProgress(progress) ?? derivedProgress);
    const visibleEvents = useMemo(
        () =>
            events
                .filter((event) => event && (event.message || event.label || event.title))
                .slice(-Math.max(1, maxEvents)),
        [events, maxEvents]
    );
    const visibleContextItems = useMemo(
        () =>
            (Array.isArray(contextItems) ? contextItems : [])
                .filter((item) => item?.label && item?.value !== undefined && item?.value !== null)
                .slice(0, 3),
        [contextItems]
    );
    const latestEvent = visibleEvents[visibleEvents.length - 1];
    const statusText =
        latestStatus ||
        latestEvent?.message ||
        latestEvent?.label ||
        latestEvent?.title ||
        activeStage?.detail ||
        'Preparing a draft for review.';
    const statusLabel = STATUS_LABELS[status] || STATUS_LABELS.running;
    const canShowFeed = showEventFeed && visibleEvents.length > 0;
    const canDismiss =
        typeof onDismiss === 'function' &&
        (dismissWhileRunning || ['completed', 'failed', 'canceled'].includes(status));
    const canRetry = typeof onRetry === 'function' && status === 'failed';

    const setCollapsed = (nextCollapsed) => {
        setInternalCollapsed(nextCollapsed);
        onCollapsedChange?.(nextCollapsed);
    };

    const setFeedOpen = (nextOpen) => {
        setInternalFeedOpen(nextOpen);
        onEventFeedOpenChange?.(nextOpen);
    };

    if (!isVisible) {
        return null;
    }

    const classes = [
        'ai-generation-progress',
        `ai-generation-progress--${status}`,
        isCollapsed ? 'ai-generation-progress--collapsed' : '',
        className
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <section className={classes} role="region" aria-label={ariaLabel}>
            <header className="ai-generation-progress__header">
                <div className="ai-generation-progress__mark" aria-hidden="true">
                    {status === 'completed' ? <FiCheck /> : <FiActivity />}
                </div>
                <div className="ai-generation-progress__title">
                    <span>{statusLabel}</span>
                    <strong>{title}</strong>
                    {!isCollapsed ? <small>{subtitle}</small> : null}
                </div>
                <div className="ai-generation-progress__actions">
                    {canShowFeed && !isCollapsed ? (
                        <button
                            type="button"
                            onClick={() => setFeedOpen(!isFeedOpen)}
                            aria-expanded={isFeedOpen}
                            title={isFeedOpen ? 'Hide event feed' : 'Show event feed'}
                        >
                            <FiList />
                            <span>{isFeedOpen ? 'Hide updates' : 'Updates'}</span>
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => setCollapsed(!isCollapsed)}
                        aria-expanded={!isCollapsed}
                        title={isCollapsed ? 'Expand progress' : 'Minimize progress'}
                    >
                        {isCollapsed ? <FiChevronRight /> : <FiMinimize2 />}
                        <span>{isCollapsed ? 'Expand' : 'Minimize'}</span>
                    </button>
                    {canRetry ? (
                        <button
                            type="button"
                            className="ai-generation-progress__retry"
                            onClick={onRetry}
                            title="Retry this request"
                            aria-label="Retry AI request"
                        >
                            <FiRefreshCw />
                            <span>{retryLabel}</span>
                        </button>
                    ) : null}
                    {canDismiss ? (
                        <button
                            type="button"
                            className="ai-generation-progress__dismiss"
                            onClick={onDismiss}
                            title={dismissLabel}
                            aria-label="Dismiss AI progress"
                        >
                            <FiX />
                            <span>{dismissLabel}</span>
                        </button>
                    ) : null}
                </div>
            </header>

            {isCollapsed ? (
                <div className="ai-generation-progress__mini">
                    <span>{activeStage?.label || 'Working'}</span>
                    <strong>{progressValue}%</strong>
                </div>
            ) : (
                <>
                    <div className="ai-generation-progress__meter" aria-hidden="true">
                        <span style={{ width: `${progressValue}%` }} />
                    </div>

                    <div className="ai-generation-progress__now">
                        <div>
                            <span>Now</span>
                            <strong>{activeStage?.label || 'Working'}</strong>
                        </div>
                        <p aria-live="polite">{statusText}</p>
                    </div>

                    {visibleContextItems.length ? (
                        <div className="ai-generation-progress__context">
                            {visibleContextItems.map((item) => (
                                <div key={`${item.label}-${item.value}`}>
                                    <span>{item.label}</span>
                                    <strong>{Array.isArray(item.value) ? item.value.join(', ') : String(item.value)}</strong>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    <ol className="ai-generation-progress__stages">
                        {normalizedStages.map((stage, index) => {
                            const isComplete =
                                status === 'completed' || index < stageIndex;
                            const isActive = index === stageIndex && status !== 'completed';
                            const isFailed = isActive && status === 'failed';
                            const stageClass = [
                                isComplete ? 'is-complete' : '',
                                isActive ? 'is-active' : '',
                                isFailed ? 'is-failed' : ''
                            ]
                                .filter(Boolean)
                                .join(' ');

                            return (
                                <li key={stage.id} className={stageClass}>
                                    <span aria-hidden="true">
                                        {isComplete ? <FiCheck /> : index + 1}
                                    </span>
                                    <strong>{stage.label}</strong>
                                </li>
                            );
                        })}
                    </ol>

                    <div className="ai-generation-progress__scope">
                        <FiShield aria-hidden="true" />
                        <div>
                            <span>{scopeLabel}</span>
                            <strong>{draftStateLabel}</strong>
                            <p>{scopeDescription}</p>
                        </div>
                    </div>

                    {canShowFeed ? (
                        <div className="ai-generation-progress__feed">
                            <button
                                type="button"
                                onClick={() => setFeedOpen(!isFeedOpen)}
                                aria-expanded={isFeedOpen}
                            >
                                <span>Latest updates</span>
                                {isFeedOpen ? <FiChevronDown /> : <FiChevronRight />}
                            </button>
                            {isFeedOpen ? (
                                <ol>
                                    {visibleEvents.map((event, index) => (
                                        <li key={eventKey(event, index)}>
                                            <FiClock aria-hidden="true" />
                                            <div>
                                                {event.time ? (
                                                    <span>{formatEventTime(event.time)}</span>
                                                ) : null}
                                                <strong>
                                                    {event.message ||
                                                        event.label ||
                                                        event.title}
                                                </strong>
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            ) : null}
                        </div>
                    ) : null}
                </>
            )}
        </section>
    );
};

export default AiGenerationProgress;
