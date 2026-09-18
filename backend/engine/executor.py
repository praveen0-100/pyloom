"""
PYLOOM Execution Engine
Topologically orders DAG graph nodes and safely executes controlled modules.
"""
from collections import defaultdict, deque
from backend.engine.registry import MODULE_REGISTRY

def execute_flow(flow_json, input_data_override=None):
    """
    Executes a validated flow JSON graph.
    Returns (success, result_dict or error_dict)
    """
    nodes = flow_json.get("nodes", [])
    edges = flow_json.get("edges", [])

    node_map = {n["id"]: n for n in nodes}

    # Build adjacency & in-degree lists
    adj = defaultdict(list)
    in_degree = defaultdict(int)
    predecessors = defaultdict(list)

    for edge in edges:
        from_id = edge.get("from")
        to_id = edge.get("to")
        adj[from_id].append(to_id)
        in_degree[to_id] += 1
        predecessors[to_id].append(from_id)

    # Topological sort order
    queue = deque([n_id for n_id in node_map if in_degree[n_id] == 0])
    topo_order = []

    while queue:
        curr = queue.popleft()
        topo_order.append(curr)
        for neighbor in adj[curr]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    # Values produced by each node ID
    outputs = {}
    output_node_results = []

    for n_id in topo_order:
        node = node_map[n_id]
        n_type = node.get("type")
        config = node.get("config", {})
        func = MODULE_REGISTRY.get(n_type)

        if not func:
            return False, {
                "type": "UNKNOWN_MODULE",
                "message": f"Module {n_type} not found."
            }

        # Gather input values from predecessors
        preds = predecessors[n_id]
        if not preds:
            # Source node (Input)
            if n_type == "Input":
                val = input_data_override if input_data_override is not None else config.get("data")
            else:
                val = None
        elif len(preds) == 1:
            val = outputs.get(preds[0])
        else:
            # Multiple inputs combined as list
            val = [outputs.get(p) for p in preds]

        try:
            res = func(val, config=config)
            outputs[n_id] = res
            if n_type == "Output":
                output_node_results.append(res)
        except Exception as e:
            return False, {
                "type": "EXECUTION_ERROR",
                "message": f"Error executing node '{n_type}': {str(e)}"
            }

    final_output = output_node_results[-1] if output_node_results else None
    return True, final_output
