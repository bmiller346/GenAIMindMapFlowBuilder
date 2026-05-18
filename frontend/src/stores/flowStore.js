import { create } from "zustand";
import { rememberWorkspace } from "../utils/workspaceSession";
const flowStore = create((set, get) => ({
	flow_id: undefined,
	theme: false,
	setTheme: (updTheme) => {
		set({
			theme: updTheme
		})
	},
	setFlow: (id) => {
		rememberWorkspace(id)
		set({
			flow_id: id,
			lastSavedSnapshot: undefined,
			lastSavedFingerprint: '',
			lastSavedFlowName: undefined,
			lastSavedFlowType: undefined,
			lastPersistedSnapshot: undefined,
			lastPersistedFingerprint: '',
			lastPersistedFlowName: undefined,
			lastPersistedFlowType: undefined,
			lastSavedAt: undefined,
			lastSaveError: undefined,
			saveStatus: 'idle'
		})
	},
	rfInstance: undefined,
	setRfInstance: (e) => {
		set({ rfInstance: e })
	},
	flow_name: undefined,
	setFlowName: (name) => {
		set({
			flow_name: name
		})
	},
	flow_summary: undefined,
	setFlowSummary: (summary) => {
		set({
			flow_summary: summary
		})
	},
	flow_type: undefined,
	setFlowType: (type_of_flow) => {
		set({
			flow_type: type_of_flow
		})
	},
	saveStatus: 'idle',
	lastSavedSnapshot: undefined,
	lastSavedFingerprint: '',
	lastSavedFlowName: undefined,
	lastSavedFlowType: undefined,
	lastPersistedSnapshot: undefined,
	lastPersistedFingerprint: '',
	lastPersistedFlowName: undefined,
	lastPersistedFlowType: undefined,
	lastSavedAt: undefined,
	lastSaveError: undefined,
	setSaveStatus: (saveStatus) => {
		set({ saveStatus })
	},
	setSavedSnapshot: (snapshot, fingerprint, flowName, flowType, options = {}) => {
		const nextFlowType = flowType || get().flow_type || 'manual';
		const shouldCheckpoint = options.checkpoint !== false;
		set({
			lastPersistedSnapshot: snapshot,
			lastPersistedFingerprint: fingerprint,
			lastPersistedFlowName: flowName,
			lastPersistedFlowType: nextFlowType,
			...(shouldCheckpoint
				? {
					lastSavedSnapshot: snapshot,
					lastSavedFingerprint: fingerprint,
					lastSavedFlowName: flowName,
					lastSavedFlowType: nextFlowType
				}
				: {}),
			lastSavedAt: new Date().toISOString(),
			lastSaveError: undefined,
			saveStatus: 'saved'
		})
	},
	setSaveError: (error) => {
		set({
			lastSaveError: error,
			saveStatus: 'error'
		})
	}
}));

export default flowStore;
