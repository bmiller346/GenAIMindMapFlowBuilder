import { useMemo, useState } from 'react';
import useActivityStore from '../stores/activityStore';
import useStore from '../stores/store';
import { ACTIVITY_FILTERS, activityTimeLabel } from '../utils/activityEvents';

const STATUS_LABELS = {
    running: 'Running',
    completed: 'Done',
    failed: 'Failed',
    canceled: 'Canceled'
};

const DETAIL_KEYS = ['actor', 'integration', 'node_ids', 'source_ids'];
const CATEGORY_FILTERS = ACTIVITY_FILTERS.filter((filter) => filter.id !== 'all');

const ActivityPanel = ({ embedded = false }) => {
    const activities = useActivityStore((s) => s.activities);
    const isActivityOpen = useActivityStore((s) => s.isActivityOpen);
    const setActivityOpen = useActivityStore((s) => s.setActivityOpen);
    const clearActivities = useActivityStore((s) => s.clearActivities);
    const setInspectorNodeId = useStore((s) => s.setInspectorNodeId);
    const [activeFilter, setActiveFilter] = useState('all');
    const [expandedId, setExpandedId] = useState('');
    const visibleFilters = useMemo(() => {
        const activeCategories = new Set(activities.map((activity) => activity.category).filter(Boolean));
        return [
            ACTIVITY_FILTERS.find((filter) => filter.id === 'all'),
            ...CATEGORY_FILTERS.filter((filter) => activeCategories.has(filter.id))
        ].filter(Boolean);
    }, [activities]);
    const effectiveFilter = useMemo(
        () =>
            activeFilter === 'all' || visibleFilters.some((filter) => filter.id === activeFilter)
                ? activeFilter
                : 'all',
        [activeFilter, visibleFilters]
    );
    const filteredActivities = useMemo(
        () =>
            effectiveFilter === 'all'
                ? activities
                : activities.filter((activity) => activity.category === effectiveFilter),
        [effectiveFilter, activities]
    );
    const emptyMessage =
        activities.length === 0
            ? 'No workspace activity yet. Add sources, ask AI, create nodes, or run a review to start the timeline.'
            : 'No matching activity yet.';

    if (!embedded && !isActivityOpen) {
        return null;
    }

    return (
        <aside className={`activity-panel ${embedded ? 'activity-panel--embedded' : ''}`}>
            <div className="activity-panel-header">
                <div>
                    <p>Activity</p>
                    <span>{activities.length} workspace events</span>
                </div>
                <div>
                    <button type="button" onClick={clearActivities}>
                        Clear
                    </button>
                    {!embedded ? (
                        <button type="button" onClick={() => setActivityOpen(false)}>
                            Close
                        </button>
                    ) : null}
                </div>
            </div>
            <div className="activity-panel-filters">
                {visibleFilters.map((filter) => (
                    <button
                        key={filter.id}
                        type="button"
                        className={
                            effectiveFilter === filter.id
                                ? 'activity-panel-filter-active'
                                : ''
                        }
                        onClick={() => setActiveFilter(filter.id)}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>
            <div className="activity-panel-list">
                {filteredActivities.length === 0 ? (
                    <div className="activity-panel-empty">
                        <strong>{activities.length === 0 ? 'No events yet' : 'Nothing in this filter'}</strong>
                        <p>{emptyMessage}</p>
                    </div>
                ) : (
                    filteredActivities.map((activity) => {
                        const isExpanded = expandedId === activity.id;
                        const nodeIds = activity.node_ids || [];
                        const metadataEntries = Object.entries(
                            activity.metadata || {}
                        ).filter(([, value]) => value !== undefined && value !== '');

                        return (
                            <article
                                key={activity.id}
                                className={`activity-item activity-item-${
                                    activity.status || 'event'
                                }`}
                            >
                                <button
                                    type="button"
                                    className="activity-item-main"
                                    onClick={() =>
                                        setExpandedId(isExpanded ? '' : activity.id)
                                    }
                                    aria-expanded={isExpanded}
                                >
                                    <span className="activity-item-meta">
                                        <span>
                                            {STATUS_LABELS[activity.status] ||
                                                activity.category ||
                                                'Event'}
                                        </span>
                                        <time>{activityTimeLabel(activity.updated_at)}</time>
                                    </span>
                                    <strong>{activity.title}</strong>
                                    {activity.summary ? <p>{activity.summary}</p> : null}
                                    {nodeIds.length ? (
                                        <small>{nodeIds.length} linked node(s)</small>
                                    ) : activity.context ? (
                                        <small>{activity.context}</small>
                                    ) : null}
                                </button>
                                {isExpanded ? (
                                    <div className="activity-item-detail">
                                        {DETAIL_KEYS.map((key) => {
                                            const value = activity[key];
                                            if (
                                                value === undefined ||
                                                value === '' ||
                                                (Array.isArray(value) && value.length === 0)
                                            ) {
                                                return null;
                                            }

                                            return (
                                                <p key={key}>
                                                    <span>{key.replace(/_/g, ' ')}</span>
                                                    <strong>
                                                        {Array.isArray(value)
                                                            ? value.join(', ')
                                                            : value}
                                                    </strong>
                                                </p>
                                            );
                                        })}
                                        {nodeIds.length ? (
                                            <div className="activity-node-links">
                                                {nodeIds.slice(0, 6).map((nodeId) => (
                                                    <button
                                                        key={nodeId}
                                                        type="button"
                                                        onClick={() =>
                                                            setInspectorNodeId(nodeId)
                                                        }
                                                    >
                                                        {nodeId}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null}
                                        {metadataEntries.length ? (
                                            <div className="activity-metadata">
                                                {metadataEntries.map(([key, value]) => (
                                                    <p key={key}>
                                                        <span>{key.replace(/_/g, ' ')}</span>
                                                        <strong>
                                                            {typeof value === 'object'
                                                                ? JSON.stringify(value)
                                                                : String(value)}
                                                        </strong>
                                                    </p>
                                                ))}
                                            </div>
                                        ) : null}
                                        {activity.undo ? (
                                            <button
                                                type="button"
                                                className="activity-item-undo"
                                                onClick={activity.undo}
                                            >
                                                Undo
                                            </button>
                                        ) : null}
                                    </div>
                                ) : null}
                            </article>
                        );
                    })
                )}
            </div>
        </aside>
    );
};

export default ActivityPanel;
