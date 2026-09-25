"""
PYLOOM Chart Modules
Matplotlib chart generation module creating static image artifacts.
"""
import base64
import io

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
    plt.xlabel((config or {}).get("x_label") or "X Axis", fontsize=10, color='#64748b')
    plt.ylabel((config or {}).get("y_label") or "Y Axis", fontsize=10, color='#64748b')
    plt.grid(True, linestyle="--", alpha=0.5)
    plt.tight_layout()
    
    # Encode straight to a data URI - serverless instances don't share disk, so
    # returning the image inline avoids depending on a later request landing on
    # the same instance that wrote the file (see backend/db.py for the same
    # reasoning applied to participant/progress/submission records).
    buffer = io.BytesIO()
    plt.savefig(buffer, format="png", dpi=150)
    plt.close()
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")

    return f"data:image/png;base64,{encoded}"
