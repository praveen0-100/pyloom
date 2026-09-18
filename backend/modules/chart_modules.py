"""
PYLOOM Chart Modules
Matplotlib chart generation module creating static image artifacts.
"""
import os
import uuid

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False


def execute_line_chart(val, config=None):
    """
    Generates line chart from input dict or list.
    Returns relative path to saved png.
    """
    if not HAS_MATPLOTLIB:
        return "[Chart Output: Matplotlib package not installed]"

    plt.figure(figsize=(6, 4))

    
    if isinstance(val, dict) and "x" in val and "y" in val:
        x = val["x"]
        y = val["y"]
        plt.plot(x, y, marker="o", color="#3b82f6", linewidth=2.5, markersize=8)
    elif isinstance(val, list) and val and isinstance(val[0], (list, tuple)):
        x = [pt[0] for pt in val]
        y = [pt[1] for pt in val]
        plt.plot(x, y, marker="o", color="#3b82f6", linewidth=2.5, markersize=8)
    else:
        # Default fallback plot
        y = val if isinstance(val, list) else [10, 20, 15, 30, 25]
        x = list(range(1, len(y) + 1))
        plt.plot(x, y, marker="o", color="#3b82f6", linewidth=2.5, markersize=8)
    
    title = config.get("title", "PYLOOM Chart Output") if config else "PYLOOM Chart Output"
    plt.title(title, fontsize=12, fontweight='bold', color='#1e293b')
    plt.xlabel("X Axis", fontsize=10, color='#64748b')
    plt.ylabel("Y Axis", fontsize=10, color='#64748b')
    plt.grid(True, linestyle="--", alpha=0.5)
    plt.tight_layout()
    
    # Save to generated directory
    gen_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "generated")
    os.makedirs(gen_dir, exist_ok=True)
    filename = f"chart_{uuid.uuid4().hex[:8]}.png"
    filepath = os.path.join(gen_dir, filename)
    plt.savefig(filepath, dpi=150)
    plt.close()
    
    return f"/generated/{filename}"
