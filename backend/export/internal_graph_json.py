import json


def export_internal_graph(payload: dict) -> str:
    return json.dumps(payload, indent=2)
