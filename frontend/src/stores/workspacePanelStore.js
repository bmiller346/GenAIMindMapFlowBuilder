import { create } from 'zustand';

const useWorkspacePanelStore = create((set) => ({
    activePanel: '',
    openPanel: (activePanel) => set({ activePanel }),
    closePanel: () => set({ activePanel: '' }),
    togglePanel: (panelId) =>
        set((state) => ({
            activePanel: state.activePanel === panelId ? '' : panelId
        }))
}));

export default useWorkspacePanelStore;
