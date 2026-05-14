import { create } from 'zustand';
import DataSourceSelect from '../global-components/DataSourceSelect';
const modalStore = create((set) => ({
    node: undefined,
    nodeProps: {},
    pushNode: (nd, props = {}) => {
        set({
            node: nd,
            nodeProps: props
        });
    },
    popNode: () =>
        set({
            node: undefined,
            nodeProps: {}
        }),
    sourceId: undefined,
    setSourceId: (id) => {
        set({
            sourceId: id
        })
    },
    removeSourceId: () => {
        set({
            sourceId: undefined
        })
    }

}));

export default modalStore;
