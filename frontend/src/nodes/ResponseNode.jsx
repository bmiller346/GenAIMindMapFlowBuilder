import { Handle } from '@xyflow/react';
import { lazy, Suspense } from 'react';
import SQLSvg from '../assets/sql.svg';
import STARSvg from '../assets/star.svg';
import NodeMetadataBadges from './NodeMetadataBadges';

const Graph = lazy(() => import('../global-components/Graph'));
const TableComponent = lazy(() => import('../global-components/TableComponent'));

const ResponseNode = ({ data }) => {
    console.log('EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE', data);
    const summaryBlock = () => {
        return (
            <div className="summary-block">
                <img
                    src={STARSvg}
                    alt="prompt svg"
                />
                <div>
                    <h3 id="reponse-title">Summary</h3>
                    <div>{data.data.summ}</div>
                </div>
            </div>
        );
    };

    if (data.data.summ.length > 0) {
        console.log(data.data.summ);
    }

    return (
        <div className="node-response">
            <NodeMetadataBadges data={data} />
            {data.data.summ.length > 0 && summaryBlock()}
            {data.data.query && data.data.query.length > 0 && (
                <div className="query-block">
                    <img
                        src={SQLSvg}
                        alt="Sql svg"
                    />
                    <div>
                        <h3 id="response-title">SQL QUERY</h3>
                        <div className="code-block">
                            <pre>
                                <code>{data.data.query}</code>
                            </pre>
                        </div>
                    </div>
                </div>
            )}
            {data.data.df.length > 0 && (
                <Suspense fallback={<div className="lazy-block">Loading table...</div>}>
                    <TableComponent df={data.data.df} />
                </Suspense>
            )}
            {Object.keys(data.data.graph).length !== 0 && (
                <Suspense fallback={<div className="lazy-block">Loading chart...</div>}>
                    <Graph data={data.data.graph} />
                </Suspense>
            )}
            {/* <Handle type="target" position={Position.Left} />
			<Handle type="source" position={Position.Right} /> */}

            <Handle
                type="target"
                position="left"
                style={{ opacity: '0' }}
            />
            <Handle
                type="source"
                position="right"
                className="sourceHandle"
                style={{ opacity: '0' }}
            />
        </div>
    );
};

export default ResponseNode;
