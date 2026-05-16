import Plot from './PlotlyBasic.jsx';

const Graph = ({ data }) => {
    const graph = data;
    const jsonGraph = JSON.parse(graph);
    return (
        <>
            <Plot
                data={jsonGraph.data}
                layout={jsonGraph.layout}
            />
        </>
    );
};

export default Graph;
