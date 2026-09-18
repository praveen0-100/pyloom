"""
PYLOOM Flow Validator
Validates graph structure, node types, connections, required configurations, and cycle detection.
"""
from collections import defaultdict, deque
from backend.engine.registry import MODULE_REGISTRY

def validate_flow(flow_json, required_modules=None):
    """
    Validates flow JSON graph.
    Returns (is_valid, error_dict)
    """
    nodes = flow_json.get("nodes", [])
    edges = flow_json.get("edges", [])

    if not nodes:
        return False, {
            "type": "EMPTY_GRAPH",
            "message": "The flow canvas is empty. Add modules to execute."
        }

    # Build node maps & type sets
    node_map = {n["id"]: n for n in nodes}
    node_types = [n.get("type") for n in nodes]

    # Check Input and Output node presence
    if "Input" not in node_types:
        return False, {
            "type": "MISSING_INPUT",
            "message": "The flow requires at least one Input node."
        }

    if "Output" not in node_types:
        return False, {
            "type": "MISSING_OUTPUT",
            "message": "The flow requires at least one Output node."
        }

    # Check unknown modules
    for n in nodes:
        m_type = n.get("type")
        if m_type not in MODULE_REGISTRY:
            return False, {
                "type": "UNKNOWN_MODULE",
                "message": f"Module '{m_type}' is not registered in the system."
            }

    # Check required modules if specified by mission
    if required_modules:
        for req in required_modules:
            if req not in node_types:
                return False, {
                    "type": "MISSING_REQUIRED_MODULE",
                    "message": f"Mission requires node type '{req}' in your flow."
                }

    # Validate edges / connections
    in_degree = defaultdict(int)
    adj = defaultdict(list)

    for edge in edges:
        from_id = edge.get("from")
        to_id = edge.get("to")
        if from_id not in node_map or to_id not in node_map:
            return False, {
                "type": "INVALID_CONNECTION",
                "message": "An edge connects to a non-existent node."
            }
        adj[from_id].append(to_id)
        in_degree[to_id] += 1

    # Cycle Detection (Kahn's Algorithm)
    queue = deque([n_id for n_id in node_map if in_degree[n_id] == 0])
    visited_count = 0

    while queue:
        curr = queue.popleft()
        visited_count += 1
        for neighbor in adj[curr]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if visited_count < len(nodes):
        return False, {
            "type": "CYCLE_DETECTED",
            "message": "Flow contains an invalid loop or circular connection."
        }

    # Check disconnected nodes (at least 1 path from an Input to an Output)
    # Perform reachability check from Input nodes to Output nodes
    input_ids = [n["id"] for n in nodes if n.get("type") == "Input"]
    output_ids = set(n["id"] for n in nodes if n.get("type") == "Output")

    reachable = set()
    stack = list(input_ids)
    while stack:
        curr = stack.pop()
        reachable.add(curr)
        for neighbor in adj[curr]:
            if neighbor not in reachable:
                stack.append(neighbor)

    if not (output_ids & reachable):
        return False, {
            "type": "DISCONNECTED_FLOW",
            "message": "Output node is not connected to the Input flow."
        }

    return True, None
