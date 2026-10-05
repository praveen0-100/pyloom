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


# ---------------------------------------------------------------- Pie & Bar charts
from backend.modules.analysis_modules import PercentDict


class ChartResult(str):
    """The chart image (a data URI) that also remembers the data it drew, in `summary`.

    It behaves like the plain image string everywhere (so the page can show it), while the
    checker compares `summary` - e.g. 'Rent: 50% | Food: 25%' - with the expected answer."""

    summary = ""

    def __new__(cls, image, summary):
        obj = super().__new__(cls, image)
        obj.summary = summary
        return obj


def _png_data_uri(figure):
    buffer = io.BytesIO()
    figure.savefig(buffer, format="png", dpi=150)
    plt.close(figure)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def _fmt(number):
    return f"{number:g}"


PIE_COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899"]


def execute_pie_chart(val, config=None):
    """Pie Chart Render: one slice per category (percentages or counts)."""
    if not isinstance(val, dict) or not val or not all(isinstance(v, (int, float)) for v in val.values()):
        raise ValueError("Pie Chart needs category values, e.g. the output of Percentage Calculator.")
    suffix = "%" if isinstance(val, PercentDict) else ""
    summary = " | ".join(f"{k}: {_fmt(v)}{suffix}" for k, v in val.items())
    if not HAS_MATPLOTLIB:
        return ChartResult("[Chart Output: Matplotlib package not installed]", summary)

    shown = {k: v for k, v in val.items() if v > 0}  # a 0 slice has no area
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.pie(
        list(shown.values()),
        labels=[f"{k} ({_fmt(v)}{suffix})" for k, v in shown.items()],
        colors=PIE_COLORS[:len(shown)],
        startangle=90, counterclock=False,
        wedgeprops={"edgecolor": "white", "linewidth": 2},
    )
    ax.set_title((config or {}).get("title") or "PYLOOM Pie Chart", fontsize=12, fontweight="bold", color="#1e293b")
    ax.axis("equal")
    fig.tight_layout()
    return ChartResult(_png_data_uri(fig), summary)


def execute_bar_chart(val, config=None):
    """Bar Chart Render: one bar per day, green = Above Target, red = Below Target."""
    if not isinstance(val, dict) or not all(k in val for k in ("labels", "values", "status")):
        raise ValueError("Bar Chart needs the result of the Target Comparison block.")
    summary = " | ".join(f"{label}: {status}" for label, status in zip(val["labels"], val["status"]))
    if not HAS_MATPLOTLIB:
        return ChartResult("[Chart Output: Matplotlib package not installed]", summary)

    colors = ["#16a34a" if s == "Above Target" else "#dc2626" for s in val["status"]]
    fig, ax = plt.subplots(figsize=(6, 4))
    bars = ax.bar(val["labels"], val["values"], color=colors)
    ax.bar_label(bars, fontsize=9)
    if "target" in val:
        ax.axhline(val["target"], color="#475569", linestyle="--", linewidth=1.5)
        ax.text(-0.45, val["target"], f"Target {_fmt(val['target'])}", va="bottom", ha="left", fontsize=9, color="#475569")
    ax.set_title((config or {}).get("title") or "PYLOOM Bar Chart", fontsize=12, fontweight="bold", color="#1e293b")
    ax.set_ylabel((config or {}).get("y_label") or "Sales", fontsize=10, color="#64748b")
    ax.legend(handles=[plt.Rectangle((0, 0), 1, 1, color="#16a34a"), plt.Rectangle((0, 0), 1, 1, color="#dc2626")],
              labels=["Above Target", "Below Target"], fontsize=8, loc="upper left")
    ax.grid(True, axis="y", linestyle="--", alpha=0.4)
    fig.tight_layout()
    return ChartResult(_png_data_uri(fig), summary)
