const withBrief = (body, workspaceBrief) => ({
	...body,
	workspace_brief: workspaceBrief || {}
});

const setQuestionApi = (component_name, flow_id, data, question, node_id, queryType, workspaceBrief = {}) => {
	switch (component_name) {
		case "sql":
			return ["sql-component-qa", withBrief({
				"flow_id": flow_id,
				"question": question,
				"component_id": data.component_id,
				"node_id": node_id,
				"request_type": queryType
			}, workspaceBrief), "application/json"]
			break;
		case "csv":
			return ["csv-component-qa", withBrief({
				"flow_id": flow_id,
				"query": question,
				"component_id": data.component_id,
				"node_id": node_id,
				"request_type": queryType
			}, workspaceBrief), "application/json"]
			break;
		case "pdf":
			return ["pdf-component-qa", withBrief({
				"flow_id": flow_id,
				"query": question,
				"component_id": data.component_id,
				"node_id": node_id,
				"request_type": queryType
			}, workspaceBrief), "application/json"]
			break;
		case "web":
			return ["web-component-qa", withBrief({
				"flow_id": flow_id,
				"query": question,
				"component_id": data.component_id,
				"node_id": node_id,
				"request_type": queryType
			}, workspaceBrief), "application/json"]
			break;
		case "audio":
			return ["audio-component-qa", withBrief({
				"flow_id": flow_id,
				"query": question,
				"component_id": data.component_id,
				"node_id": node_id,
				"request_type": queryType
			}, workspaceBrief), "application/json"]
		case "md":
			return ["md-component-qa", withBrief({
				"flow_id": flow_id,
				"query": question,
				"component_id": data.component_id,
				"node_id": node_id,
				"request_type": queryType
			}, workspaceBrief), "application/json"]
		case "youtube":
			return ["youtube-component-qa", withBrief({
				"flow_id": flow_id,
				"query": question,
				"component_id": data.component_id,
				"node_id": node_id,
				"request_type": queryType
			}, workspaceBrief), "application/json"]
		case "image":
			return ["img-component-qa", withBrief({
				"flow_id": flow_id,
				"query": question,
				"component_id": data.component_id,
				"node_id": node_id,
				"request_type": queryType
			}, workspaceBrief), "application/json"]
			break;
		case "docx":
			return ["docx-component-qa", withBrief({
				"flow_id": flow_id,
				"query": question,
				"component_id": data.component_id,
				"node_id": node_id,
				"request_type": queryType
			}, workspaceBrief), "application/json"]
			break;
		case "pptx":
			return ["pptx-component-qa", withBrief({
				"flow_id": flow_id,
				"query": question,
				"component_id": data.component_id,
				"node_id": node_id,
				"request_type": queryType
			}, workspaceBrief), "application/json"]
			break;
		case "html":
			return ["html-component-qa", withBrief({
				"flow_id": flow_id,
				"query": question,
				"component_id": data.component_id,
				"node_id": node_id,
				"request_type": queryType
			}, workspaceBrief), "application/json"]
			break;
		case "txt":
			return ["txt-component-qa", withBrief({
				"flow_id": flow_id,
				"query": question,
				"component_id": data.component_id,
				"node_id": node_id,
				"request_type": queryType
			}, workspaceBrief), "application/json"]
			break;
		case "video":
			return ["video-component-qa", withBrief({
				"flow_id": flow_id,
				"query": question,
				"component_id": data.component_id,
				"node_id": node_id,
				"request_type": queryType
			}, workspaceBrief), "application/json"]
			break;
	}

}

export default setQuestionApi
