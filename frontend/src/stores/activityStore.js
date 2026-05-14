import { create } from 'zustand';
import {
    createActivityEvent,
    normalizeActivityEvents
} from '../utils/activityEvents';

const MAX_ACTIVITY_EVENTS = 250;

const useActivityStore = create((set, get) => ({
    activities: [],
    isActivityOpen: false,
    workspaceId: '',
    toggleActivity: () =>
        set((state) => ({ isActivityOpen: !state.isActivityOpen })),
    setActivityOpen: (isActivityOpen) => set({ isActivityOpen }),
    setActivityWorkspace: (workspaceId = '') =>
        set((state) => ({
            workspaceId,
            activities: state.activities.map((activity) => ({
                ...activity,
                workspace_id: activity.workspace_id || workspaceId
            }))
        })),
    setActivityEvents: (events = [], workspaceId = get().workspaceId) =>
        set({
            workspaceId,
            activities: normalizeActivityEvents(events, workspaceId)
        }),
    recordActivity: (activity) => {
        const event = createActivityEvent({
            workspace_id: get().workspaceId,
            actor: 'user',
            ...activity
        });
        set((state) => ({
            activities: [event, ...state.activities].slice(0, MAX_ACTIVITY_EVENTS)
        }));
        return event.id;
    },
    addActivity: (activity) => {
        const event = createActivityEvent({
            workspace_id: get().workspaceId,
            type: activity?.type || 'system_operation',
            status: activity?.status || 'running',
            actor: activity?.actor || 'system',
            ...activity
        });
        set((state) => ({
            activities: [event, ...state.activities].slice(0, MAX_ACTIVITY_EVENTS)
        }));
        return event.id;
    },
    updateActivity: (id, updates) =>
        set((state) => ({
            activities: state.activities.map((activity) =>
                activity.id === id
                    ? createActivityEvent({
                          ...activity,
                          ...updates,
                          id: activity.id,
                          workspace_id: activity.workspace_id || get().workspaceId,
                          created_at: activity.created_at,
                          updated_at: new Date().toISOString()
                      })
                    : activity
            )
        })),
    clearActivities: () => set({ activities: [] })
}));

export default useActivityStore;
