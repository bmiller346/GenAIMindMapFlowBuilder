import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js/lib/index-basic';
import Sankey from 'plotly.js/lib/sankey';

Plotly.register([Sankey]);

const Plot = createPlotlyComponent(Plotly);

export default Plot;
