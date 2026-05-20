/* eslint-disable react/prop-types */
import AiDraftSessionPanel from '../global-components/AiDraftSessionPanel.jsx';

export const REVIEW_TABS = [
    { id: 'drafts', label: 'Drafts' },
    { id: 'connections', label: 'Connections' },
    { id: 'issues', label: 'Issues' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'sources', label: 'Sources' },
    { id: 'activity', label: 'Activity' }
];

const ReviewTray = ({
    activeTab = 'drafts',
    onTabChange,
    onClose,
    activeDraftSession,
    onDraftAccepted,
    children
}) => {
    const normalizedTab = REVIEW_TABS.some((tab) => tab.id === activeTab)
        ? activeTab
        : 'drafts';

    return (
        <section className="review-tray" aria-label="Review tray">
            <header className="review-tray__header">
                <div className="review-tray__tabs" role="tablist" aria-label="Review workflows">
                    {REVIEW_TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={normalizedTab === tab.id}
                            className={normalizedTab === tab.id ? 'active' : ''}
                            onClick={() => onTabChange?.(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                {onClose ? (
                    <button
                        type="button"
                        className="review-tray__close"
                        onClick={onClose}
                        aria-label="Close review tray"
                    >
                        x
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
                        <p className="review-tray__empty">
                            AI draft previews will appear here before they change the canvas.
                        </p>
                    )
                ) : (
                    <p className="review-tray__empty">
                        {REVIEW_TABS.find((tab) => tab.id === normalizedTab)?.label} review will move here next.
                    </p>
                )}
            </div>
        </section>
    );
};

export default ReviewTray;
