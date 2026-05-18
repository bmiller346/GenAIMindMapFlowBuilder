const createFormData = (entries) => {
	const formData = new FormData();
	entries.forEach(([key, value]) => {
		if (value !== undefined && value !== null) {
			formData.append(key, value);
		}
	});
	return formData;
};

const setRequestData = (component_name, flow_id, data) => {
	switch (component_name) {
		case "sql":
			return ["create_sql_component/", {
				"flow_id": flow_id,
				"table_name": data.content,
				"operation_id": data.operationId
			}, "application/json"];
		case "csv":
			return ["component-create-csv", createFormData([
				["file", data.file],
				["flow_id", flow_id],
				["header_row", data.header_row],
				["operation_id", data.operationId]
			]), "multipart/form-data"];
		case "pdf":
			return ["component-create-pdf", createFormData([
				["file", data.file],
				["flow_id", flow_id],
				["processing_type", data.processing_type],
				["source_intent", data.sourceIntent],
				["operation_id", data.operationId],
				["intake_role", data.intakeRole],
				["intake_model", data.intakeModel],
				["intake_prompt", data.intakePrompt]
			]), "multipart/form-data"];
		case "web":
			return ["component-create-crawl", createFormData([
				["flow_id", flow_id],
				["web_url", data.content],
				["operation_id", data.operationId]
			]), "multipart/form-data"];
		case "audio":
			return ["component-create-audio", createFormData([
				["file", data.file],
				["flow_id", flow_id],
				["operation_id", data.operationId],
				["intake_role", data.intakeRole],
				["intake_model", data.intakeModel],
				["intake_prompt", data.intakePrompt]
			]), "multipart/form-data"];
		case "md":
			return ["component-create-md", createFormData([
				["file", data.file],
				["flow_id", flow_id],
				["operation_id", data.operationId],
				["intake_role", data.intakeRole],
				["intake_model", data.intakeModel],
				["intake_prompt", data.intakePrompt]
			]), "multipart/form-data"];
		case "youtube":
			return ["component-create-youtube", createFormData([
				["flow_id", flow_id],
				["youtube_url", data.content],
				["operation_id", data.operationId]
			]), "multipart/form-data"];
		case "img":
			return ["component-create-img", createFormData([
				["file", data.file],
				["flow_id", flow_id],
				["operation_id", data.operationId],
				["intake_role", data.intakeRole],
				["intake_model", data.intakeModel],
				["intake_prompt", data.intakePrompt]
			]), "multipart/form-data"];
		case "docx":
			return ["component-create-docx", createFormData([
				["file", data.file],
				["flow_id", flow_id],
				["operation_id", data.operationId],
				["source_intent", data.sourceIntent],
				["intake_role", data.intakeRole],
				["intake_model", data.intakeModel],
				["intake_prompt", data.intakePrompt]
			]), "multipart/form-data"];
		case "source_set":
			return [`api/workspaces/${flow_id}/sources/source-set`, createFormData([
				["flow_id", flow_id],
				["source_intent", data.sourceIntent],
				["operation_id", data.operationId]
			]), "multipart/form-data"];
		case "pptx":
			return ["component-create-pptx", createFormData([
				["file", data.file],
				["flow_id", flow_id],
				["operation_id", data.operationId],
				["intake_role", data.intakeRole],
				["intake_model", data.intakeModel],
				["intake_prompt", data.intakePrompt]
			]), "multipart/form-data"];
		case "html":
			return ["component-create-html", createFormData([
				["file", data.file],
				["flow_id", flow_id],
				["operation_id", data.operationId],
				["intake_role", data.intakeRole],
				["intake_model", data.intakeModel],
				["intake_prompt", data.intakePrompt]
			]), "multipart/form-data"];
		case "txt":
			return ["component-create-txt", createFormData([
				["file", data.file],
				["flow_id", flow_id],
				["operation_id", data.operationId],
				["intake_role", data.intakeRole],
				["intake_model", data.intakeModel],
				["intake_prompt", data.intakePrompt]
			]), "multipart/form-data"];
		case "video":
			return ["component-create-video", createFormData([
				["file", data.file],
				["flow_id", flow_id],
				["operation_id", data.operationId]
			]), "multipart/form-data"];
	}

};

export default setRequestData;
