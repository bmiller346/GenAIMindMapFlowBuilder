import flowStore from '../stores/flowStore.js';
import useStore from '../stores/store.js';
import {
    parseMindmapJson,
    uploadHasGraphDraft
} from './sourceUploadRecords.js';
import { buildGeneratedSourceDraft } from './generatedSourceDraft.js';

export const handleGeneratedSourceGraph = ({
    uploadData,
    sourceInput,
    fallbackType = '',
    fallbackTypeLabel = '',
    fallbackTitle = '',
    popNode,
    draftMeta = {}
}) => {
    const graph = parseMindmapJson(uploadData?.mindmap_json);
    if (!uploadHasGraphDraft(uploadData)) {
        return false;
    }

    const state = useStore.getState();
    const flowState = flowStore.getState();
    state.setPendingSourceDraft(buildGeneratedSourceDraft({
        graph,
        uploadData,
        sourceInput,
        fallbackType,
        fallbackTypeLabel,
        fallbackTitle,
        currentState: state,
        flowState,
        draftMeta
    }));
    popNode?.();
    return true;
};
