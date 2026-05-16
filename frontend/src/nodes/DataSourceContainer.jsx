import { Handle } from "@xyflow/react"
import DataSource from "./DataSource"
import PromptSelector from "./PromptSelector"
import NodeMetadataBadges from "./NodeMetadataBadges"

const DataSourceContainer = ({ id, data }) => {
	return (
		<div className="data-source-container">
			<NodeMetadataBadges data={data} />
			<PromptSelector id={id} prompt={data.prompt} modelName={data.model_name} name={data.name} />
			<DataSource id={id} data={data} />
			<Handle position="right" type="source" style={{ "marginTop": "2.5rem", "opacity": "0" }} />
		</div>
	)
}

export default DataSourceContainer
