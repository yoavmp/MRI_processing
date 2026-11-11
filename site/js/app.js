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
    const feedFrom = step.feedsFrom ? `<span class="diagram-flow">${escapeHtml(step.feedsFrom)}</span>` : "";
    const feedTo = step.feedsTo ? `<span class="diagram-flow">${escapeHtml(step.feedsTo)}</span>` : "";
    btn.innerHTML = `${badge}${feedFrom}<span class="diagram-step-title">${step.title}</span><span class="diagram-step-cmd">${step.short}</span>${feedTo}`;
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

  // Workflow cards that offer a parameter-comparison shortcut into the Viewer.
  const BET_COMPARISON_CONFIG = {
    bet_t1w: {
      baseAssetId: "t1w_nifti",
      variants: [
        ["bet_mask_f0.2", "-f 0.2"],
        ["bet_mask_f0.4", "-f 0.4"],
        ["bet_mask_f0.5", "-f 0.5 (designated)"],
        ["bet_mask_f0.8", "-f 0.8"],
      ],
    },
    bet_func: {
      baseAssetId: "mcf_4d_default",
      variants: [
        ["funcbet_mask_f0.3", "-f 0.3 (-F's own default)"],
        ["funcbet_mask_f0.5", "-f 0.5 (designated)"],
      ],
    },
  };

  function renderDetail(step) {
    const md = (s) => s.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
    const listHTML = (arr) => "<ul>" + arr.map((x) => `<li>${md(x)}</li>`).join("") + "</ul>";
    detailEl.innerHTML = `
      <h3>${step.title}</h3>
      <p class="detail-branch">${BRANCH_LABELS[step.branch] || ""}</p>
      ${step.feedsFrom ? `<p class="detail-flow">${escapeHtml(step.feedsFrom)}</p>` : ""}
      <p><strong>Purpose:</strong> ${md(step.purpose)}</p>
      <p><strong>Why this step exists:</strong> ${md(step.rationale)}</p>
      <p><strong>Inputs:</strong></p>${listHTML(step.inputs)}
      <p><strong>Outputs:</strong></p>${listHTML(step.outputs)}
      ${step.feedsTo ? `<p class="detail-flow">${escapeHtml(step.feedsTo)}</p>` : ""}
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

    const betCfg = BET_COMPARISON_CONFIG[step.id];
    if (betCfg) {
      const btn = document.createElement("button");
      btn.className = "btn-secondary";
      btn.textContent = "Compare BET thresholds in Viewer →";
      const avail = availableAssets();
      const revealedCount = betCfg.variants.filter(([id]) => avail.has(id)).length;
      btn.disabled = revealedCount < 2;
      btn.title = btn.disabled ? "Run BET with at least two different -f values first, then come back." : "";
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        showTab("viewer");
        if (!viewer) viewerTabOpened();
        openBetComparison(step.id);
      });
      detailEl.appendChild(btn);
    }
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

  document.getElementById("term-hint-btn").addEventListener("click", () => {
    term.printHint();
    document.getElementById("term-input").focus();
  });

  function setActiveTerminalStep(stepId) {
    stepSelectEl.value = stepId;
    term.setStep(stepId);
    renderFilesPanel();
    renderStepStatus();
    document.getElementById("term-actions").innerHTML = "";
    document.getElementById("term-input").focus();
  }

  // ---- Files sidebar: the two real DICOM folders render as collapsed,
  // expandable summaries (count + zip download), never as 432 individual
  // rows. Expansion state persists across re-renders (every reveal/reset
  // rebuilds this panel). Session outputs are listed separately so new
  // files are never buried under the DICOM listings.
  const folderExpanded = {};

  function renderFilesPanel() {
    const el = document.getElementById("term-files");
    el.innerHTML = "";
    const allFiles = [...term.vfs.files.values()];
    const dicomZips = { "t1w-dicom": "dicom/T1w_dicom.zip", "bold-dicom": "dicom/BOLD_dicom.zip" };

    const dicomDirs = allFiles
      .filter((f) => f.kind === "dir" && (f.role === "t1w-dicom" || f.role === "bold-dicom"))
      .sort((a, b) => a.path.localeCompare(b.path));

    for (const dir of dicomDirs) {
      const members = allFiles.filter((g) => g.isDicom && g.path.startsWith(dir.path + "/"));
      const names = members.map((g) => basename(g.path)).sort();
      const details = document.createElement("details");
      details.className = "file-folder";
      details.open = !!folderExpanded[dir.role];
      details.addEventListener("toggle", () => {
        folderExpanded[dir.role] = details.open;
      });
      const summary = document.createElement("summary");
      const label = document.createElement("span");
      label.innerHTML = `${dir.path.replace(/^~\//, "")}/ <span class="file-folder-count">(${names.length} real DICOM files)</span>`;
      summary.appendChild(label);
      const dl = document.createElement("a");
      dl.className = "btn-small";
      dl.textContent = "Download .zip";
      dl.href = `${DATA}/${dicomZips[dir.role]}`;
      dl.download = "";
      dl.addEventListener("click", (e) => e.stopPropagation());
      summary.appendChild(dl);
      details.appendChild(summary);
      const list = document.createElement("div");
      list.className = "file-folder-list";
      list.textContent = names.join("  ");
      details.appendChild(list);
      el.appendChild(details);
    }

    const sectionLabel = document.createElement("div");
    sectionLabel.className = "file-section-label";
    sectionLabel.textContent = "Session files (provided + revealed)";
    el.appendChild(sectionLabel);

    const otherFiles = allFiles
      .filter((f) => f.kind !== "dir" && !f.isDicom)
      .sort((a, b) => a.path.localeCompare(b.path));

    for (const f of otherFiles) {
      const row = document.createElement("div");
      row.className = "file-row";
      const nameSpan = document.createElement("span");
      nameSpan.textContent = f.path.replace(/^~\//, "");
      row.appendChild(nameSpan);
      const asset = f.assetId ? term.assetMap[f.assetId] : null;
      if (asset) {
        const btnGroup = document.createElement("span");
        btnGroup.className = "file-row-actions";
        const viewBtn = document.createElement("button");
        viewBtn.className = "btn-small";
        viewBtn.textContent = "View";
        viewBtn.addEventListener("click", () => {
          showTab("viewer");
          loadAssetInViewer(f.assetId, asset);
        });
        btnGroup.appendChild(viewBtn);
        const dl = document.createElement("a");
        dl.className = "btn-small";
        dl.textContent = "⬇";
        dl.title = "Download " + asset.label;
        dl.href = asset.url;
        dl.download = "";
        btnGroup.appendChild(dl);
        row.appendChild(btnGroup);
      }
      el.appendChild(row);
    }
  }

  // ---- Terminal step status panel: actual input filenames present this
  // session, missing prerequisites, expected outputs, and (for mcflirt's
  // two-run step) per-run progress.
  function isStepComplete(stepId) {
    const step = STEP_RUNTIME[stepId];
    if (!step) return false;
    const vfsFiles = [...term.vfs.files.values()];
    const hasRole = (role) => !!role && vfsFiles.some((f) => f.role === role);
    return hasRole(step.outputRole);
  }

  function renderStepStatus() {
    const el = document.getElementById("term-status");
    const stepId = term.activeStepId;
    const step = STEP_RUNTIME[stepId];
    const def = WORKFLOW_STEPS.find((s) => s.id === stepId);
    if (!step || !def) {
      el.innerHTML = "";
      return;
    }
    const vfsFiles = [...term.vfs.files.values()];
    const filesWithRole = (role) => {
      if (!role) return [];
      const roles = Array.isArray(role) ? role : [role];
      return vfsFiles.filter((f) => roles.includes(f.role));
    };
    const nameList = (files) => files.map((f) => basename(f.path)).join(", ");
    const statusLine = (ok, label, files) =>
      `<li class="${ok ? "status-done" : "status-pending"}">${ok ? "✓" : "○"} ${label}${ok && files.length ? " — <code>" + escapeHtml(nameList(files)) + "</code>" : ""}</li>`;

    let html = "";

    if (stepId === "mcflirt") {
      const defFiles = filesWithRole(step.outputRole);
      const cmpFiles = filesWithRole(step.comparisonOutputRole);
      html += `<div class="term-status-section"><strong>Runs:</strong><ul class="term-status-list">` +
        statusLine(defFiles.length > 0, "Default reference", defFiles) +
        statusLine(cmpFiles.length > 0, "First volume", cmpFiles) +
        `</ul></div>`;
    } else {
      const reqs = [];
      if (step.expectedInputRole) reqs.push({ role: step.expectedInputRole, label: step.inputLabel || "input" });
      if (step.expectedRefRole) reqs.push({ role: step.expectedRefRole, label: step.refLabel || "reference" });
      if (step.expectedAffRole) reqs.push({ role: step.expectedAffRole, label: "affine matrix (--aff)" });
      if (step.expectedPremat) reqs.push({ role: step.expectedPremat, label: "func→struct matrix (--premat)" });
      if (step.expectedWarp) reqs.push({ role: step.expectedWarp, label: "warp field (--warp)" });
      if (reqs.length) {
        html += `<div class="term-status-section"><strong>Inputs in this session:</strong><ul class="term-status-list">` +
          reqs
            .map((r) => {
              const files = filesWithRole(r.role);
              return files.length
                ? statusLine(true, r.label, files)
                : `<li class="status-missing">✗ ${escapeHtml(r.label)} — not created yet</li>`;
            })
            .join("") + `</ul></div>`;
      }
    }

    html += `<div class="term-status-section"><strong>Expected output${def.outputs.length > 1 ? "s" : ""}:</strong> ` +
      def.outputs.map((o) => `<code>${escapeHtml(o)}</code>`).join(", ") + `</div>`;

    el.innerHTML = html;
  }

  function renderStepActions(stepId, revealedIds) {
    const el = document.getElementById("term-actions");
    el.innerHTML = "";
    if (!revealedIds || !revealedIds.length) return;
    const lastId = revealedIds[revealedIds.length - 1];
    const asset = STATIC_ASSET_MAP[lastId];
    if (asset) {
      const inspectBtn = document.createElement("button");
      inspectBtn.className = "btn-small term-action-btn";
      inspectBtn.textContent = "Inspect output →";
      inspectBtn.addEventListener("click", () => {
        showTab("viewer");
        loadAssetInViewer(lastId, asset);
      });
      el.appendChild(inspectBtn);
    }
    if (isStepComplete(stepId)) {
      const idx = WORKFLOW_STEPS.findIndex((s) => s.id === stepId);
      const next = WORKFLOW_STEPS[idx + 1];
      if (next) {
        const nextBtn = document.createElement("button");
        nextBtn.className = "btn-small term-action-btn term-action-next";
        nextBtn.textContent = `Next step: ${next.title} →`;
        nextBtn.addEventListener("click", () => setActiveTerminalStep(next.id));
        el.appendChild(nextBtn);
      }
    }
  }

  term.onReveal = () => {
    renderFilesPanel();
    populateViewerAssetList();
    updateCompareButtons();
    renderStepStatus();
  };
  term.onCommandSuccess = ({ stepId, revealedIds }) => {
    renderStepActions(stepId, revealedIds);
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
      await viewer.showMatrix(asset.url, asset.label, asset.previewUrl ? asset : null);
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
        viewer.showError(new Error(`${base ? base.label : asset.overlayBase} hasn't been revealed yet — run the step that produces it first.`), [asset]);
        return;
      }
      await viewer.showOverlay(base, asset);
      return;
    }
    await viewer.showSingle(asset);
  }

  // Multi-way BET-threshold comparison, reachable from the Workflow card and
  // the Viewer quickbar. Only revealed variants are offered.
  function openBetComparison(stepId) {
    const cfg = BET_COMPARISON_CONFIG[stepId] || BET_COMPARISON_CONFIG.bet_t1w;
    const avail = availableAssets();
    const entries = cfg.variants.filter(([id]) => avail.has(id)).map(([id, label]) => ({ id, asset: STATIC_ASSET_MAP[id], label }));
    document.getElementById("viewer-motion-plot").innerHTML = "";
    document.getElementById("viewer-controls").classList.remove("hidden");
    viewer.showMultiOverlay(STATIC_ASSET_MAP[cfg.baseAssetId], entries, COMPARISON_PROMPTS.betCompare);
  }

  document.getElementById("bet-compare-btn").addEventListener("click", () => {
    if (document.getElementById("bet-compare-btn").disabled) return;
    showTab("viewer");
    if (!viewer) viewerTabOpened();
    openBetComparison("bet_t1w");
  });

  document.getElementById("motion-compare-btn").addEventListener("click", async () => {
    if (document.getElementById("motion-compare-btn").disabled) return;
    showTab("viewer");
    document.getElementById("viewer-canvas").classList.add("hidden");
    document.getElementById("viewer-controls").innerHTML = "";
    await renderMotionComparison(
      document.getElementById("viewer-motion-plot"),
      [
        { url: STATIC_ASSET_MAP.mcf_par_default.url, label: "Default reference" },
        { url: STATIC_ASSET_MAP.mcf_par_refvol0.url, label: "First volume" },
      ],
      2.0,
      COMPARISON_PROMPTS.motionCompare
    );
  });

  // Quick comparison buttons — gated on both sides being available.
  const compareButtons = [...document.querySelectorAll(".compare-btn[data-pair]")];
  function updateCompareButtons() {
    const avail = availableAssets();
    for (const btn of compareButtons) {
      const [a, b] = btn.dataset.pair.split(",");
      const ok = avail.has(a) && avail.has(b);
      btn.disabled = !ok;
      btn.title = ok ? "" : "Run the steps that produce both sides of this comparison first.";
    }

    const betBtn = document.getElementById("bet-compare-btn");
    const betIds = ["bet_mask_f0.2", "bet_mask_f0.4", "bet_mask_f0.5", "bet_mask_f0.8"];
    const betCount = betIds.filter((id) => avail.has(id)).length;
    betBtn.disabled = betCount < 2;
    betBtn.title = betBtn.disabled ? "Run BET with at least two different -f values on the T1w first." : "";

    const motionBtn = document.getElementById("motion-compare-btn");
    const motionOk = avail.has("mcf_par_default") && avail.has("mcf_par_refvol0");
    motionBtn.disabled = !motionOk;
    motionBtn.title = motionOk ? "" : "Run both mcflirt forms (Default reference and -refvol 0) with -plots first.";
  }
  compareButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      showTab("viewer");
      if (!viewer) viewerTabOpened();
      const pairKey = btn.dataset.pair;
      const [a, b] = pairKey.split(",");
      document.getElementById("viewer-motion-plot").innerHTML = "";
      await viewer.showComparison(STATIC_ASSET_MAP[a], STATIC_ASSET_MAP[b], COMPARISON_PROMPTS[pairKey]);
    });
  });

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  renderDiagram();
  selectStep(WORKFLOW_STEPS[0].id);
  updateCompareButtons();
})();
