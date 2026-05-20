import Plot from './PlotlyBasic.jsx';

const Graph = ({ data }) => {
    const jsonGraph = typeof data === 'string' ? JSON.parse(data) : data;
    return (
        <>
            <Plot
                data={jsonGraph.data}
                layout={jsonGraph.layout}
                config={{ displaylogo: false, responsive: true }}
                style={{ width: '100%' }}
            />
        </>
    );
};

export default Graph;
