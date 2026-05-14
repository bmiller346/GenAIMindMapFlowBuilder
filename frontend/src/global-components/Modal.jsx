import { useShallow } from 'zustand/shallow';
import modalStore from '../stores/modalStore';
import { useEffect } from 'react';

const Modal = () => {
    const Node = modalStore((s) => s.node)
    const nodeProps = modalStore((s) => s.nodeProps)
    const popNode = modalStore((s) => s.popNode)
    const canClose = Node && Node.name !== 'LoadingModal';

    useEffect(() => {
        if (!Node || !canClose) {
            return undefined;
        }

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                popNode();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [Node, canClose, popNode]);

    const handleBackdropMouseDown = (event) => {
        if (canClose && event.target === event.currentTarget) {
            popNode();
        }
    };

    return (
        <div
            className='modal'
            style={Node ? { display: 'flex' } : { display: 'none' }}
            onMouseDown={handleBackdropMouseDown}
        >
            {Node && <Node {...nodeProps} />}
        </div>
    )

};

export default Modal;
