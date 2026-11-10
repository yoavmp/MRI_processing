(function () {
  "use strict";

  // ---------------- Tabs ----------------
  const tabs = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");
  function showTab(name) {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    panels.forEach((p) => p.classList.toggle("active", p.id === "panel-" + name));
    if (name === "viewer") viewerTabOpened();
  }
  tabs.forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));

  // ---------------- Workflow diagram ----------------
  const diagramEl = document.getElementById("workflow-diagram");
  const detailEl = document.getElementById("step-detail");

  function renderDiagram() {
    const byOrder = {};
    for (const s of WORKFLOW_STEPS) (byOrder[s.order] = byOrder[s.order] || []).push(s);
    const orders = Object.keys(byOrder)
      .map(Number)
      .sort((a, b) => a - b);

    let lastStage = null;
    for (const o of orders) {
      const rowSteps = byOrder[o];
      const first = rowSteps[0];
      if (first.stage !== lastStage) {
        const header = document.createElement("div");
        header.className = "stage-header";
        header.textContent = first.stageTitle;
        diagramEl.appendChild(header);
        if (first.stage === 1) {
          const legend = document.createElement("div");
          legend.className = "diagram-legend";
          legend.innerHTML =
            '<span class="legend-chip legend-anat">T1w / Anatomical</span>' + '<span class="legend-chip legend-func">fMRI / Functional</span>';
          diagramEl.appendChild(legend);
        }
        lastStage = first.stage;
      }

      const row = document.createElement("div");
      row.className = "diagram-row";

      if (first.layout === "full") {
        row.appendChild(makeNode(first, "full"));
      } else {
        const anat = rowSteps.find((s) => s.branch === "anat");
        const func = rowSteps.find((s) => s.branch === "func");
        const left = document.createElement("div");
        left.className = "diagram-col";
        left.appendChild(anat ? makeNode(anat, "anat") : makeEmptySlot("anat"));
        const right = document.createElement("div");
        right.className = "diagram-col";
        right.appendChild(func ? makeNode(func, "func") : makeEmptySlot("func"));
        row.appendChild(left);
        row.appendChild(right);
      }
      diagramEl.appendChild(row);
    }
  }

  function makeNode(step, kind) {
    const btn = document.createElement("button");
    btn.className = "diagram-node diagram-" + kind;
    const badge = BRANCH_LABELS[step.branch] ? `<span class="diagram-badge diagram-badge-${step.branch}">${BRANCH_LABELS[step.branch]}</span>` : "";
    btn.innerHTML = `${badge}<span class="diagram-step-title">${step.title}</span><span class="diagram-step-cmd">${step.short}</span>`;
    btn.addEventListener("click", () => selectStep(step.id));
    btn.dataset.stepId = step.id;
    return btn;
  }

  function makeEmptySlot(branch) {
    const div = document.createElement("div");
    div.className = "diagram-empty";
    div.textContent = "— not used in this stage —";
    return div;
  }

  function selectStep(stepId) {
    const step = WORKFLOW_STEPS.find((s) => s.id === stepId);
    if (!step) return;
    document.querySelectorAll(".diagram-node").forEach((n) => n.classList.toggle("selected", n.dataset.stepId === stepId));
    renderDetail(step);
    detailEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderDetail(step) {
    const md = (s) => s.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
    const listHTML = (arr) => "<ul>" + arr.map((x) => `<li>${md(x)}</li>`).join("") + "</ul>";
    detailEl.innerHTML = `
      <h3>${step.title}</h3>
      <p class="detail-branch">${BRANCH_LABELS[step.branch] || ""}</p>
      <p><strong>Purpose:</strong> ${md(step.purpose)}</p>
      <p><strong>Why this step exists:</strong> ${md(step.rationale)}</p>
      <p><strong>Inputs:</strong></p>${listHTML(step.inputs)}
      <p><strong>Outputs:</strong></p>${listHTML(step.outputs)}
      <p><strong>Command:</strong></p><pre class="detail-command">${escapeHtml(step.command)}</pre>
      ${step.slideNote ? `<p class="detail-slidenote"><strong>Homework vs. our additions:</strong> ${md(step.slideNote)}</p>` : ""}
      ${step.paramHelp ? `<p class="detail-paramhelp">${md(step.paramHelp)}</p>` : ""}
      <p><strong>What to inspect afterward:</strong></p>${listHTML(step.inspect)}
      <button class="btn-primary" id="open-terminal-btn">Try it in the terminal →</button>
    `;
    document.getElementById("open-terminal-btn").addEventListener("click", () => {
      showTab("terminal");
      setActiveTerminalStep(step.id);
    });
  }

  // ---------------- Terminal ----------------
  const term = new Terminal(
    document.getElementById("term-output"),
    document.getElementById("term-input"),
    document.getElementById("term-task"),
    document.getElementById("term-prompt")
  );

  const stepSelectEl = document.getElementById("term-step-select");
  WORKFLOW_STEPS.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.stage}. ${s.title}`;
    stepSelectEl.appendChild(opt);
  });
  stepSelectEl.addEventListener("change", () => setActiveTerminalStep(stepSelectEl.value));

  function setActiveTerminalStep(stepId) {
    stepSelectEl.value = stepId;
    term.setStep(stepId);
    renderFilesPanel();
    document.getElementById("term-input").focus();
  }

  function renderFilesPanel() {
    const el = document.getElementById("term-files");
    el.innerHTML = "";
    const entries = [...term.vfs.files.values()]
      .filter((f) => f.kind !== "dir" || f.role === "t1w-dicom" || f.role === "bold-dicom")
      .sort((a, b) => a.path.localeCompare(b.path));
    const dicomZips = { "t1w-dicom": "dicom/T1w_dicom.zip", "bold-dicom": "dicom/BOLD_dicom.zip" };
    for (const f of entries) {
      const row = document.createElement("div");
      row.className = "file-row";
      const nameSpan = document.createElement("span");
      if (f.kind === "dir") {
        const count = [...term.vfs.files.values()].filter((g) => g.isDicom && g.path.startsWith(f.path + "/")).length;
        nameSpan.textContent = `${f.path.replace(/^~\//, "")}/  (${count} real DICOM files — 'ls' to list)`;
        row.appendChild(nameSpan);
        const dl = document.createElement("a");
        dl.className = "btn-small";
        dl.textContent = "Download .zip";
        dl.href = `${DATA}/${dicomZips[f.role]}`;
        dl.target = "_blank";
        row.appendChild(dl);
        el.appendChild(row);
        continue;
      }
      nameSpan.textContent = f.path.replace(/^~\//, "");
      row.appendChild(nameSpan);
      const asset = f.assetId ? term.assetMap[f.assetId] : null;
      if (asset) {
        const viewBtn = document.createElement("button");
        viewBtn.className = "btn-small";
        viewBtn.textContent = "View";
        viewBtn.addEventListener("click", () => {
          showTab("viewer");
          loadAssetInViewer(f.assetId, asset);
        });
        row.appendChild(viewBtn);
      }
      el.appendChild(row);
    }
  }

  term.onReveal = () => {
    renderFilesPanel();
    populateViewerAssetList();
    updateCompareButtons();
  };

  renderFilesPanel();
  setActiveTerminalStep(WORKFLOW_STEPS[0].id);

  // ---------------- Viewer ----------------
  let viewer = null;
  let viewerInitStarted = false;

  function viewerTabOpened() {
    if (!viewerInitStarted) {
      viewerInitStarted = true;
      viewer = new Viewer(document.getElementById("viewer-canvas"), document.getElementById("viewer-controls"));
    }
    populateViewerAssetList();
    updateCompareButtons();
  }

  // Gated: only files actually present in the vfs right now (provided-at-start
  // or revealed by a successful command this session) are offered.
  function availableAssets() {
    const map = new Map();
    for (const f of term.vfs.files.values()) {
      if (f.assetId && STATIC_ASSET_MAP[f.assetId]) map.set(f.assetId, STATIC_ASSET_MAP[f.assetId]);
    }
    return map;
  }

  function populateViewerAssetList() {
    const sel = document.getElementById("viewer-asset-select");
    const prev = sel.value;
    sel.innerHTML = "";
    for (const [id, a] of availableAssets()) {
      if (a.kind === "warp") continue; // shown via its own description panel, not the generic select
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = a.label;
      sel.appendChild(opt);
    }
    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }

  document.getElementById("viewer-asset-select").addEventListener("change", (e) => {
    const id = e.target.value;
    loadAssetInViewer(id, STATIC_ASSET_MAP[id]);
  });

  async function loadAssetInViewer(assetId, asset) {
    if (!asset) return;
    populateViewerAssetList();
    document.getElementById("viewer-asset-select").value = assetId;
    document.getElementById("viewer-motion-plot").innerHTML = "";
    document.getElementById("viewer-canvas").classList.remove("hidden");
    document.getElementById("viewer-controls").classList.remove("hidden");

    if (asset.kind === "mat") {
      document.getElementById("viewer-canvas").classList.add("hidden");
      await viewer.showMatrix(asset.url, asset.label);
      return;
    }
    if (asset.kind === "json") {
      document.getElementById("viewer-canvas").classList.add("hidden");
      await viewer.showJSON(asset.url, asset.label);
      return;
    }
    if (asset.kind === "par") {
      document.getElementById("viewer-canvas").classList.add("hidden");
      document.getElementById("viewer-controls").innerHTML = "";
      await renderMotionPlot(document.getElementById("viewer-motion-plot"), asset.url, 2.0);
      return;
    }
    if (asset.kind === "warp") {
      document.getElementById("viewer-canvas").classList.add("hidden");
      viewer.showWarpDescription(asset);
      return;
    }
    if (asset.overlayBase) {
      const base = STATIC_ASSET_MAP[asset.overlayBase];
      if (!availableAssets().has(asset.overlayBase)) {
        viewer.showError(new Error(`${base ? base.label : asset.overlayBase} hasn't been revealed yet — run the step that produces it first.`));
        return;
      }
      await viewer.showOverlay(base, asset);
      return;
    }
    await viewer.showSingle(asset);
  }

  // Quick comparison buttons — gated on both sides being available.
  const compareButtons = [...document.querySelectorAll(".compare-btn")];
  function updateCompareButtons() {
    const avail = availableAssets();
    for (const btn of compareButtons) {
      const [a, b] = btn.dataset.pair.split(",");
      const ok = avail.has(a) && avail.has(b);
      btn.disabled = !ok;
      btn.title = ok ? "" : "Run the steps that produce both sides of this comparison first.";
    }
  }
  compareButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      showTab("viewer");
      if (!viewer) viewerTabOpened();
      const [a, b] = btn.dataset.pair.split(",");
      document.getElementById("viewer-motion-plot").innerHTML = "";
      document.getElementById("viewer-canvas").classList.remove("hidden");
      await viewer.showComparison(STATIC_ASSET_MAP[a], STATIC_ASSET_MAP[b]);
    });
  });

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  renderDiagram();
  selectStep(WORKFLOW_STEPS[0].id);
  updateCompareButtons();
})();
