import { AgGridReact } from 'ag-grid-react'; // React Data Grid Component
import 'ag-grid-community/styles/ag-grid.css';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

const TableComponent = ({ df }) => {
    if (!Array.isArray(df) || df.length === 0) {
        return null;
    }

    const rowData = df.map((row) => ({ ...row }));
    const columnDefs = Object.keys(df[0] || {}).map((field) => ({
        field,
        cellStyle: { textAlign: 'center', color: 'white' },
        flex: 1
    }));

    return (
        <div className="table-block">
            <div
                className="ag-table"
                style={{ height: '392px', width: '100%' }}
            >
                <AgGridReact
                    rowData={rowData}
                    columnDefs={columnDefs}
                    rowClass={'ag-row'}
                    rowHeight={56}
                    rowStyle={{ alignItems: 'center !important' }}
                    headerHeight={56}
                />
            </div>
        </div>
    );
};

export default TableComponent;
