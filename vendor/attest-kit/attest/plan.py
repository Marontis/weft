"""Plan DAG visualization for task manifests (Phase E).

Renders tasks/manifest.json as an interactive Mermaid DAG diagram in a self-contained HTML page.
"""

from __future__ import annotations

import html
import json
import re
from pathlib import Path

from attest.harness.spec import TaskManifest, TaskStatus


def _sanitize_id(raw: str) -> str:
    """Sanitize string for Mermaid node identifier."""
    return re.sub(r"[^a-zA-Z0-9_]", "_", raw)


def generate_mermaid_graph(manifest: TaskManifest) -> str:
    """Generate Mermaid graph syntax from a TaskManifest."""
    lines = [
        "graph TD",
        "    classDef pending fill:#1e293b,stroke:#475569,stroke-width:2px,color:#94a3b8;",
        "    classDef inprog fill:#1e3a5f,stroke:#3b82f6,stroke-width:2px,color:#93c5fd;",
        "    classDef completed fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#6ee7b7;",
        "    classDef failed fill:#7f1d1d,stroke:#ef4444,stroke-width:2px,color:#fca5a5;",
        "    classDef claim fill:#4c1d95,stroke:#8b5cf6,stroke-width:2px,color:#ddd6fe;",
        "    classDef dep fill:#312e81,stroke:#6366f1,stroke-width:1px,stroke-dasharray: 4 4,color:#c7d2fe;",
    ]

    status_map = {
        TaskStatus.PENDING: ":::pending",
        TaskStatus.IN_PROGRESS: ":::inprog",
        TaskStatus.EVALUATING: ":::inprog",
        TaskStatus.COMPLETED: ":::completed",
        TaskStatus.FAILED: ":::failed",
    }

    seen_claims: set[str] = set()
    seen_deps: set[str] = set()

    for task in manifest.tasks:
        t_id = _sanitize_id(task.task_id)
        status_cls = status_map.get(task.status, ":::pending")
        desc = html.escape(task.description[:45] + ("..." if len(task.description) > 45 else ""))
        lines.append(f'    {t_id}["<b>{task.task_id}</b><br/><small>{desc}</small>"]{status_cls}')

        # Dependency linkages
        for dep_key in task.dependency_fingerprints.keys():
            dep_node = f"dep_{_sanitize_id(dep_key)}"
            if dep_node not in seen_deps:
                seen_deps.add(dep_node)
                short_dep = html.escape(dep_key)
                lines.append(f'    {dep_node}["{short_dep}"]:::dep')
            lines.append(f"    {dep_node} -.-> {t_id}")

        # Claim linkages
        for claim_id in task.claims_discharged:
            claim_node = f"claim_{_sanitize_id(claim_id)}"
            if claim_node not in seen_claims:
                seen_claims.add(claim_node)
                lines.append(f'    {claim_node}(["Claim {claim_id}"]):::claim')
            lines.append(f"    {claim_node} ==> {t_id}")

    return "\n".join(lines)


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{TITLE}} - Attest Plan DAG</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(15, 23, 42, 0.75);
      --border: rgba(148, 163, 184, 0.12);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --primary: #6366f1;
      --accent: #38bdf8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Plus Jakarta Sans', sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background-image: radial-gradient(circle at top, rgba(99, 102, 241, 0.08) 0%, transparent 70%);
    }
    header {
      padding: 1.5rem 2rem;
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(12px);
      background: var(--card-bg);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.25rem 0.75rem;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 9999px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      color: #a5b4fc;
    }
    h1 { font-size: 1.25rem; font-weight: 700; }
    .stats {
      display: flex;
      gap: 1.5rem;
      font-size: 0.9rem;
      color: var(--text-muted);
    }
    .stats span b { color: var(--text); }
    main {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 2rem;
      overflow: auto;
    }
    .diagram-container {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 2.5rem;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
      max-width: 95%;
      overflow: auto;
    }
    .legend {
      display: flex;
      gap: 1rem;
      justify-content: center;
      padding: 1rem;
      border-top: 1px solid var(--border);
      font-size: 0.8rem;
      color: var(--text-muted);
      background: var(--card-bg);
    }
    .legend-item { display: flex; align-items: center; gap: 0.4rem; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
  </style>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({
      startOnLoad: true,
      theme: 'dark',
      themeVariables: {
        darkMode: true,
        background: '#090d16',
        primaryColor: '#1e3a5f',
        lineColor: '#64748b'
      }
    });
  </script>
</head>
<body>
  <header>
    <div>
      <div class="badge">EPIC: {{EPIC_ID}}</div>
      <h1 style="margin-top: 0.4rem;">{{TITLE}}</h1>
    </div>
    <div class="stats">
      <span>Total: <b>{{TOTAL_TASKS}}</b></span>
      <span>Completed: <b style="color: #6ee7b7;">{{COMPLETED}}</b></span>
      <span>Pending: <b style="color: #94a3b8;">{{PENDING}}</b></span>
      <span>Failed: <b style="color: #fca5a5;">{{FAILED}}</b></span>
    </div>
  </header>
  <main>
    <div class="diagram-container">
      <pre class="mermaid">
{{MERMAID_CODE}}
      </pre>
    </div>
  </main>
  <footer class="legend">
    <div class="legend-item"><span class="legend-dot" style="background:#10b981;"></span> Completed</div>
    <div class="legend-item"><span class="legend-dot" style="background:#3b82f6;"></span> In Progress</div>
    <div class="legend-item"><span class="legend-dot" style="background:#64748b;"></span> Pending</div>
    <div class="legend-item"><span class="legend-dot" style="background:#ef4444;"></span> Failed</div>
    <div class="legend-item"><span class="legend-dot" style="background:#8b5cf6;"></span> Claim</div>
    <div class="legend-item"><span class="legend-dot" style="background:#6366f1;"></span> Dependency</div>
  </footer>
</body>
</html>
"""


def generate_plan_html(manifest: TaskManifest, output_path: Path) -> Path:
    """Render manifest as a Mermaid DAG in a self-contained HTML file."""
    mermaid_code = generate_mermaid_graph(manifest)

    status_counts = {}
    for t in manifest.tasks:
        status_counts[t.status] = status_counts.get(t.status, 0) + 1

    content = HTML_TEMPLATE
    content = content.replace("{{TITLE}}", html.escape(manifest.title or "Attest Verification Plan"))
    content = content.replace("{{EPIC_ID}}", html.escape(manifest.epic_id or "EPIC"))
    content = content.replace("{{TOTAL_TASKS}}", str(len(manifest.tasks)))
    content = content.replace("{{COMPLETED}}", str(status_counts.get(TaskStatus.COMPLETED, 0)))
    content = content.replace("{{PENDING}}", str(status_counts.get(TaskStatus.PENDING, 0)))
    content = content.replace("{{FAILED}}", str(status_counts.get(TaskStatus.FAILED, 0)))
    content = content.replace("{{MERMAID_CODE}}", mermaid_code)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(content, encoding="utf-8")
    return output_path
