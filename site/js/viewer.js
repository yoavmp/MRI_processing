// Niivue-backed MRI viewer: slice navigation, orientation labels (built in
// to niivue's multiplanar view), before/after comparison, mask/registration
// overlays, and a time-volume slider for 4D data.
//
// Niivue is loaded lazily (only when the Viewer tab is first opened) to
// avoid shipping ~2MB of JS to students who never open it.
//
// Not every browser/driver supports WebGL2, which Niivue requires. When it's
// missing, every show* method below falls back to a precomputed static
// preview image (generated once from the real shipped pipeline outputs —
// see scripts/06_build_previews.sh) plus Download links for the actual
// NIfTI/JSON files, instead of a blank canvas and a console error.

function detectWebGL2() {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch (e) {
    return false;
  }
}

class WebGL2UnavailableError extends Error {}

class Viewer {
  constructor(canvasEl, controlsEl) {
    this.canvasEl = canvasEl;
    this.controlsEl = controlsEl;
    this.nv = null;
    this.ready = false;
    this.webgl2Available = detectWebGL2();
  }

  async ensureLoaded() {
    if (this.ready) return;
    if (!this.webgl2Available) {
      throw new WebGL2UnavailableError("This browser or graphics driver doesn't support WebGL2.");
    }
    if (!window.niivue) {
      await loadScript("vendor/niivue/niivue.umd.js");
    }
    this.nv = new window.niivue.Niivue({ show3Dcrosshair: true, backColor: [0.1, 0.1, 0.12, 1] });
    this.nv.attachToCanvas(this.canvasEl);
    this.ready = true;
  }

  async showSingle(asset) {
    this.clearControls();
    try {
      await this.ensureLoaded();
      await this.nv.loadVolumes([{ url: asset.url, colormap: "gray" }]);
    } catch (e) {
      this.showFallback(e, [asset]);
      return;
    }
    this.afterLoad(asset);
    this.appendDownloads([asset]);
  }

  async showOverlay(baseAsset, overlayAsset) {
    this.clearControls();
    try {
      await this.ensureLoaded();
      await this.nv.loadVolumes([
        { url: baseAsset.url, colormap: "gray" },
        { url: overlayAsset.url, colormap: "red", opacity: 0.5 },
      ]);
    } catch (e) {
      this.showFallback(e, [baseAsset, overlayAsset], PREVIEW_PROMPTS[Object.keys(STATIC_ASSET_MAP).find((k) => STATIC_ASSET_MAP[k] === overlayAsset)]);
      return;
    }
    this.afterLoad(overlayAsset, { overlayOpacity: true });
    this.appendDownloads([baseAsset, overlayAsset]);
  }

  async showComparison(beforeAsset, afterAsset, whatToLookFor) {
    this.clearControls();
    try {
      await this.ensureLoaded();
      await this.nv.loadVolumes([{ url: beforeAsset.url, colormap: "gray" }]);
    } catch (e) {
      this.showFallback(e, [beforeAsset, afterAsset], whatToLookFor, { sideBySide: true });
      return;
    }
    if (whatToLookFor) this.appendWhatToLookFor(whatToLookFor);
    const toggle = document.createElement("button");
    toggle.className = "viewer-btn";
    toggle.textContent = `Showing: ${beforeAsset.label}  (click to toggle)`;
    let showingAfter = false;
    toggle.addEventListener("click", async () => {
      showingAfter = !showingAfter;
      const a = showingAfter ? afterAsset : beforeAsset;
      await this.nv.loadVolumes([{ url: a.url, colormap: "gray" }]);
      toggle.textContent = `Showing: ${a.label}  (click to toggle)`;
    });
    this.controlsEl.appendChild(toggle);
    this.afterLoad(beforeAsset);
    this.appendDownloads([beforeAsset, afterAsset]);
  }

  // N-way comparison across revealed BET threshold variants. `entries` is
  // [{id, asset, label}] — already filtered by the caller to only what's
  // actually been revealed this session (terminal-progress gating).
  async showMultiOverlay(baseAsset, entries, whatToLookFor) {
    this.clearControls();
    if (entries.length === 0) {
      this.controlsEl.innerHTML = `<div class="viewer-error">No BET variants revealed yet — run the BET step in the Terminal first.</div>`;
      return;
    }
    let glOk = true;
    try {
      await this.ensureLoaded();
    } catch (e) {
      glOk = false;
    }
    if (whatToLookFor) this.appendWhatToLookFor(whatToLookFor);

    if (!glOk) {
      const grid = document.createElement("div");
      grid.className = "viewer-preview-grid";
      for (const entry of entries) {
        const previewUrl = entry.asset.previewUrl;
        if (!previewUrl) continue;
        const cell = document.createElement("div");
        cell.className = "viewer-preview-cell";
        cell.innerHTML = `<div class="viewer-dims">${entry.label}</div><img class="viewer-preview-img" src="${previewUrl}" alt="${entry.label} preview" />`;
        grid.appendChild(cell);
      }
      this.controlsEl.appendChild(grid);
      this.appendNoWebGL2Notice();
      this.appendDownloads([baseAsset, ...entries.map((e) => e.asset)]);
      return;
    }

    const row = document.createElement("div");
    row.className = "viewer-toggle-row";
    let active = entries[0];
    const buttons = [];
    async function load(entry) {
      active = entry;
      buttons.forEach((b) => b.classList.toggle("active", b.dataset.id === entry.id));
      await this.nv.loadVolumes([
        { url: baseAsset.url, colormap: "gray" },
        { url: entry.asset.url, colormap: "red", opacity: 0.5 },
      ]);
    }
    const boundLoad = load.bind(this);
    for (const entry of entries) {
      const btn = document.createElement("button");
      btn.className = "viewer-toggle-btn";
      btn.textContent = entry.label;
      btn.dataset.id = entry.id;
      btn.addEventListener("click", () => boundLoad(entry));
      buttons.push(btn);
      row.appendChild(btn);
    }
    this.controlsEl.appendChild(row);
    try {
      await boundLoad(entries[0]);
    } catch (e) {
      this.showFallback(e, [baseAsset, entries[0].asset], whatToLookFor);
      return;
    }
    buttons[0].classList.add("active");
    this.afterLoad(active, { overlayOpacity: true });
    this.appendDownloads([baseAsset, ...entries.map((e) => e.asset)]);
  }

  afterLoad(asset, opts = {}) {
    if (asset.dims) {
      const dimsEl = document.createElement("div");
      dimsEl.className = "viewer-dims";
      dimsEl.textContent = asset.dims;
      this.controlsEl.appendChild(dimsEl);
    }

    if (opts.overlayOpacity) {
      const row = document.createElement("label");
      row.className = "viewer-slider-row";
      row.textContent = "Overlay opacity: ";
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "0";
      slider.max = "1";
      slider.step = "0.05";
      slider.value = "0.5";
      slider.addEventListener("input", () => {
        try {
          this.nv.setOpacity(1, Number(slider.value));
          this.nv.updateGLVolume();
        } catch (e) {
          /* older niivue APIs may differ; ignore */
        }
      });
      row.appendChild(slider);
      this.controlsEl.appendChild(row);
    }

    // 4D time-volume slider
    const vol = this.nv.volumes && this.nv.volumes[0];
    const nFrames = vol && (vol.nFrame4D || vol.frame4D !== undefined ? vol.nFrame4D : 0);
    if (nFrames && nFrames > 1) {
      const row = document.createElement("label");
      row.className = "viewer-slider-row";
      row.textContent = `Volume: 1 / ${nFrames}  `;
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "0";
      slider.max = String(nFrames - 1);
      slider.step = "1";
      slider.value = "0";
      slider.addEventListener("input", () => {
        const idx = Number(slider.value);
        row.firstChild.textContent = `Volume: ${idx + 1} / ${nFrames}  `;
        try {
          this.nv.setFrame4D(vol.id, idx);
        } catch (e) {
          console.warn("setFrame4D failed", e);
        }
      });
      row.appendChild(slider);
      this.controlsEl.appendChild(row);
    }
  }

  clearControls() {
    this.controlsEl.innerHTML = "";
    this.canvasEl.classList.remove("hidden");
  }

  appendWhatToLookFor(text) {
    const p = document.createElement("p");
    p.className = "viewer-whatlook";
    p.textContent = "What to look for: " + text;
    this.controlsEl.appendChild(p);
  }

  appendNoWebGL2Notice() {
    const div = document.createElement("div");
    div.className = "viewer-webgl2-notice";
    div.textContent = "Your browser or graphics driver doesn't support WebGL2, which the interactive 3D viewer requires. Showing static previews generated from these exact files instead.";
    this.controlsEl.insertBefore(div, this.controlsEl.firstChild);
  }

  appendDownloads(assets) {
    const seen = new Set();
    const wrap = document.createElement("div");
    wrap.className = "viewer-downloads";
    for (const asset of assets) {
      if (!asset || !asset.url || seen.has(asset.url)) continue;
      seen.add(asset.url);
      wrap.appendChild(this.downloadLink(asset.url, asset.label));
      if (asset.siblingJson) {
        const sib = STATIC_ASSET_MAP[asset.siblingJson];
        if (sib && !seen.has(sib.url)) {
          seen.add(sib.url);
          wrap.appendChild(this.downloadLink(sib.url, sib.label));
        }
      }
    }
    if (wrap.children.length) this.controlsEl.appendChild(wrap);
  }

  downloadLink(url, label) {
    const a = document.createElement("a");
    a.className = "viewer-download";
    a.href = url;
    a.download = "";
    a.textContent = "⬇ Download " + label;
    return a;
  }

  // Dispatches to a static-preview fallback when WebGL2 is unavailable, or
  // to the plain error message for any other load failure (bad URL, etc).
  showFallback(e, assets, whatToLookFor, opts = {}) {
    this.clearControls();
    this.canvasEl.classList.add("hidden");
    if (!(e instanceof WebGL2UnavailableError)) {
      console.error("Viewer load error", e);
      const div = document.createElement("div");
      div.className = "viewer-error";
      div.textContent = `Could not load this volume in the viewer (${e.message || e}). You can still inspect it with command-line FSL tools, or download it below.`;
      this.controlsEl.appendChild(div);
      this.appendDownloads(assets);
      return;
    }
    console.warn("WebGL2 unavailable — showing static preview fallback instead of the interactive 3D viewer.");
    this.appendNoWebGL2Notice();
    const previews = assets.filter((a) => a && a.previewUrl);
    if (previews.length) {
      const grid = document.createElement("div");
      grid.className = opts.sideBySide ? "viewer-preview-grid viewer-preview-side-by-side" : "viewer-preview-grid";
      const seenUrls = new Set();
      for (const asset of previews) {
        if (seenUrls.has(asset.previewUrl)) continue;
        seenUrls.add(asset.previewUrl);
        const cell = document.createElement("div");
        cell.className = "viewer-preview-cell";
        cell.innerHTML = `<div class="viewer-dims">${asset.label}</div><img class="viewer-preview-img" src="${asset.previewUrl}" alt="${asset.label} preview" />${asset.previewCaption ? `<p class="viewer-preview-caption">${asset.previewCaption}</p>` : ""}`;
        grid.appendChild(cell);
      }
      this.controlsEl.appendChild(grid);
    } else {
      const div = document.createElement("div");
      div.className = "viewer-error";
      div.textContent = "No static preview is available for this file — download it below and inspect it in FSLeyes instead.";
      this.controlsEl.appendChild(div);
    }
    if (whatToLookFor) this.appendWhatToLookFor(whatToLookFor);
    this.appendDownloads(assets);
  }

  showError(e, assets) {
    this.showFallback(e, assets || []);
  }

  async showMatrix(url, label, previewAsset) {
    this.clearControls();
    this.canvasEl.classList.add("hidden");
    try {
      const res = await fetch(url);
      const text = await res.text();
      const rows = text
        .trim()
        .split("\n")
        .map((l) => l.trim().split(/\s+/).map(Number).map((v) => v.toFixed(4)));
      const table = document.createElement("table");
      table.className = "matrix-table";
      for (const r of rows) {
        const tr = document.createElement("tr");
        for (const c of r) {
          const td = document.createElement("td");
          td.textContent = c;
          tr.appendChild(td);
        }
        table.appendChild(tr);
      }
      const title = document.createElement("div");
      title.className = "viewer-dims";
      title.textContent = label + " (4×4 affine matrix)";
      this.controlsEl.appendChild(title);
      this.controlsEl.appendChild(table);
      if (previewAsset && previewAsset.previewUrl) {
        const img = document.createElement("img");
        img.className = "viewer-preview-img";
        img.src = previewAsset.previewUrl;
        img.alt = "Alignment preview";
        this.controlsEl.appendChild(img);
        if (previewAsset.previewCaption) {
          const cap = document.createElement("p");
          cap.className = "viewer-preview-caption";
          cap.textContent = previewAsset.previewCaption;
          this.controlsEl.appendChild(cap);
        }
        const promptText = PREVIEW_PROMPTS[Object.keys(STATIC_ASSET_MAP).find((k) => STATIC_ASSET_MAP[k] === previewAsset)];
        if (promptText) this.appendWhatToLookFor(promptText);
      }
      this.appendDownloads([previewAsset].filter(Boolean).concat([{ url, label }]));
    } catch (e) {
      this.controlsEl.innerHTML = `<div class="viewer-error">Could not load matrix: ${e.message}</div>`;
    }
  }

  // A FNIRT warp field (--cout) is a spline coefficient field, not an image
  // — rendering it as if it were a brain volume is meaningless. Instead,
  // show what it actually is plus a precomputed displacement-magnitude map
  // (the real warp, converted to a full field and reduced to |displacement|
  // in mm, overlaid on the MNI brain) so students see *where* and *how much*
  // the nonlinear step moved things, in anatomical context.
  showWarpDescription(asset) {
    this.clearControls();
    this.canvasEl.classList.add("hidden");
    const wrap = document.createElement("div");
    wrap.className = "warp-description";
    wrap.innerHTML = `
      <div class="viewer-dims">${asset.label}</div>
      <p>This file is <strong>not an image</strong>. FNIRT's <code>--cout</code> output is a field of
      spline coefficients (here, a coarse 21×24×21×3 grid) that <em>describes</em> a nonlinear
      displacement — how much to move each point in x/y/z to warp the T1 onto the MNI template —
      not pixel intensities. Opening it as if it were a brain volume would just show noise.</p>
      <p>Below: the same warp converted to a full-resolution displacement field and reduced to its
      magnitude (mm moved, at every point), overlaid on the MNI brain so you can see where the
      nonlinear step did the most work — typically near the ventricles and cortical surface, where
      individual anatomy differs most from the template.</p>
      <img class="warp-magnitude-img" src="${DATA}/anat/warp_magnitude_overlay.png" alt="Warp displacement magnitude overlaid on the MNI template" />
    `;
    this.controlsEl.appendChild(wrap);
    this.appendDownloads([asset]);
  }

  async showJSON(url, label) {
    this.clearControls();
    this.canvasEl.classList.add("hidden");
    try {
      const res = await fetch(url);
      const data = await res.json();
      const pre = document.createElement("pre");
      pre.className = "json-view";
      pre.textContent = JSON.stringify(data, null, 2);
      const title = document.createElement("div");
      title.className = "viewer-dims";
      title.textContent = label;
      this.controlsEl.appendChild(title);
      this.controlsEl.appendChild(pre);
      this.appendDownloads([{ url, label }]);
    } catch (e) {
      this.controlsEl.innerHTML = `<div class="viewer-error">Could not load JSON: ${e.message}</div>`;
    }
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("failed to load " + src));
    document.head.appendChild(s);
  });
}
