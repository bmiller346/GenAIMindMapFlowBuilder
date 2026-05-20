/* eslint-disable react/prop-types */
import { FiX } from 'react-icons/fi';
import AiDraftSessionPanel from '../global-components/AiDraftSessionPanel.jsx';

export const REVIEW_TABS = [
    { id: 'drafts', label: 'Drafts' },
    { id: 'connections', label: 'Connections' },
    { id: 'issues', label: 'Issues' },
    { id: 'tasks', label: 'Task Preview' },
    { id: 'sources', label: 'Sources' },
    { id: 'activity', label: 'Activity' }
];

const DEFAULT_EMPTY_STATES = {
    drafts: {
        title: 'No draft is open.',
        detail: 'AI draft previews appear here before they change the canvas.'
    },
    connections: {
        title: 'No connection review is open.',
        detail: 'Use Review / Connections to preview relationship candidates in the tray.'
    },
    issues: {
        title: 'No issue review is open.',
        detail: 'Workspace health, missing information, and SME question reviews open here.'
    },
    tasks: {
        title: 'No task preview is open.',
        detail: 'Task and checklist previews appear here before accepted task data changes.'
    },
    sources: {
        title: 'No source review is open.',
        detail: 'Source draft and source repair reviews appear here before they update the workspace.'
    },
    activity: {
        title: 'No review activity is open.',
        detail: 'Review activity will appear here when there is a tray workflow to inspect.'
    }
};

const emptyStateFor = (tabId, emptyStates = {}) => ({
    ...(DEFAULT_EMPTY_STATES[tabId] || DEFAULT_EMPTY_STATES.drafts),
    ...(emptyStates[tabId] || {})
});

const ReviewTray = ({
    activeTab = 'drafts',
    availableTabs,
    description,
    emptyStates,
    onTabChange,
    onClose,
    activeDraftSession,
    onDraftAccepted,
    tabLabels = {},
    title = 'Review tray',
    children
}) => {
    const visibleTabs = Array.isArray(availableTabs) && availableTabs.length
        ? REVIEW_TABS.filter((tab) => availableTabs.includes(tab.id))
        : REVIEW_TABS;
    const normalizedTab = visibleTabs.some((tab) => tab.id === activeTab)
        ? activeTab
        : visibleTabs[0]?.id || 'drafts';
    const activeEmptyState = emptyStateFor(normalizedTab, emptyStates);

    return (
        <section className="review-tray" aria-label="Review tray">
            <header className="review-tray__header">
                <div className="review-tray__heading">
                    <div>
                        <strong>{title}</strong>
                        {description ? <span>{description}</span> : null}
                    </div>
                    <div className="review-tray__tabs" role="tablist" aria-label="Review workflows">
                        {visibleTabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={normalizedTab === tab.id}
                                className={normalizedTab === tab.id ? 'active' : ''}
                                onClick={() => onTabChange?.(tab.id)}
                            >
                                {tabLabels[tab.id] || tab.label}
                            </button>
                        ))}
                    </div>
                </div>
                {onClose ? (
                    <button
                        type="button"
                        className="review-tray__close"
                        onClick={onClose}
                        aria-label="Close review tray"
                        title="Close review tray"
                    >
                        <FiX aria-hidden="true" />
                    </button>
                ) : null}
            </header>
            <div className="review-tray__body">
                {children ? (
                    children
                ) : normalizedTab === 'drafts' ? (
                    activeDraftSession ? (
                        <AiDraftSessionPanel
                            session={activeDraftSession}
                            onClose={onClose}
                            onAccepted={onDraftAccepted}
                        />
                    ) : (
                        <div className="review-tray__empty">
                            <strong>{activeEmptyState.title}</strong>
                            <span>{activeEmptyState.detail}</span>
                        </div>
                    )
                ) : (
                    <div className="review-tray__empty">
                        <strong>{activeEmptyState.title}</strong>
                        <span>{activeEmptyState.detail}</span>
                    </div>
                )}
            </div>
        </section>
    );
};

export default ReviewTray;
