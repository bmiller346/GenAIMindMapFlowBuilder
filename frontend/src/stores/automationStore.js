import { create } from 'zustand';

export const DEFAULT_AUTOMATIONS = [
    {
        id: 'auto_revalidate_graph',
        name: 'Revalidate graph',
        trigger: 'manual',
        scope: 'workspace',
        status: 'active',
        action: { type: 'graph_revalidate', params: {} }
    },
    {
        id: 'auto_watch_monday_status',
        name: 'Watch monday status',
        trigger: 'manual',
        scope: 'workspace',
        status: 'paused',
        action: { type: 'monday_status_preview', params: {} }
    },
    {
        id: 'auto_review_reminder',
        name: 'Review needs_review nodes',
        trigger: 'manual',
        scope: 'workspace',
        status: 'active',
        action: { type: 'needs_review_report', params: {} }
    },
    {
        id: 'auto_source_coverage',
        name: 'Regenerate source coverage',
        trigger: 'manual',
        scope: 'workspace',
        status: 'active',
        action: { type: 'source_coverage_report', params: {} }
    }
];

export const normalizeAutomation = (automation = {}) => ({
    id: automation.id || `auto_${Date.now()}`,
    name: automation.name || 'Workspace automation',
    trigger: automation.trigger || 'manual',
    scope: automation.scope || 'workspace',
    status: automation.status === 'paused' ? 'paused' : 'active',
    last_run_at: automation.last_run_at || '',
    next_run_at: automation.next_run_at || '',
    action: automation.action || { type: 'needs_review_report', params: {} },
    run_history: Array.isArray(automation.run_history)
        ? automation.run_history.slice(0, 20)
        : []
});

export const normalizeAutomations = (automations) =>
    (Array.isArray(automations) && automations.length
        ? automations
        : DEFAULT_AUTOMATIONS
    ).map(normalizeAutomation);

const useAutomationStore = create((set) => ({
    automations: normalizeAutomations(DEFAULT_AUTOMATIONS),
    setAutomations: (automations) =>
        set({ automations: normalizeAutomations(automations) }),
    resetAutomations: () =>
        set({ automations: normalizeAutomations(DEFAULT_AUTOMATIONS) }),
    addAutomation: (automation) =>
        set((state) => ({
            automations: [
                ...state.automations,
                normalizeAutomation({
                    id: `auto_${Date.now()}`,
                    trigger: 'manual',
                    scope: 'workspace',
                    status: 'active',
                    ...automation
                })
            ]
        })),
    updateAutomation: (automationId, updater) =>
        set((state) => ({
            automations: state.automations.map((automation) =>
                automation.id === automationId
                    ? normalizeAutomation(updater(automation))
                    : automation
            )
        })),
    deleteAutomation: (automationId) =>
        set((state) => ({
            automations: state.automations.filter(
                (automation) => automation.id !== automationId
            )
        })),
    recordAutomationRun: (automationId, run) =>
        set((state) => ({
            automations: state.automations.map((automation) => {
                if (automation.id !== automationId) {
                    return automation;
                }

                return normalizeAutomation({
                    ...automation,
                    last_run_at: run.finished_at || run.started_at,
                    run_history: [
                        {
                            id: run.id || `run_${Date.now()}`,
                            status: run.status || 'completed',
                            detail: run.detail || '',
                            started_at: run.started_at || new Date().toISOString(),
                            finished_at: run.finished_at || new Date().toISOString()
                        },
                        ...(automation.run_history || [])
                    ].slice(0, 20)
                });
            })
        }))
}));

export default useAutomationStore;
