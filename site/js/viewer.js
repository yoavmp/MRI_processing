// Niivue-backed MRI viewer: slice navigation, orientation labels (built in
// to niivue's multiplanar view), before/after comparison, mask/registration
// overlays, and a time-volume slider for 4D data.
//
// Niivue is loaded lazily (only when the Viewer tab is first opened) to
// avoid shipping ~2MB of JS to students who never open it.

class Viewer {
  constructor(canvasEl, controlsEl) {
    this.canvasEl = canvasEl;
    this.controlsEl = controlsEl;
    this.nv = null;
    this.ready = false;
  }

  async ensureLoaded() {
    if (this.ready) return;
    if (!window.niivue) {
      await loadScript("vendor/niivue/niivue.umd.js");
    }
    this.nv = new window.niivue.Niivue({ show3Dcrosshair: true, backColor: [0.1, 0.1, 0.12, 1] });
    this.nv.attachToCanvas(this.canvasEl);
    this.ready = true;
  }

  async showSingle(asset) {
    await this.ensureLoaded();
    this.clearControls();
    try {
      await this.nv.loadVolumes([{ url: asset.url, colormap: "gray" }]);
    } catch (e) {
      this.showError(e);
      return;
    }
    this.afterLoad(asset);
  }

  async showOverlay(baseAsset, overlayAsset) {
    await this.ensureLoaded();
    this.clearControls();
    try {
      await this.nv.loadVolumes([
        { url: baseAsset.url, colormap: "gray" },
        { url: overlayAsset.url, colormap: "red", opacity: 0.5 },
      ]);
    } catch (e) {
      this.showError(e);
      return;
    }
    this.afterLoad(overlayAsset, { overlayOpacity: true });
  }

  async showComparison(beforeAsset, afterAsset) {
    await this.ensureLoaded();
    this.clearControls();
    try {
      await this.nv.loadVolumes([{ url: beforeAsset.url, colormap: "gray" }]);
    } catch (e) {
      this.showError(e);
      return;
    }
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
  }

  showError(e) {
    console.error("Viewer load error", e);
    this.controlsEl.innerHTML = `<div class="viewer-error">Could not load this volume in the viewer (${e.message || e}). You can still inspect it with command-line FSL tools.</div>`;
  }

  async showMatrix(url, label) {
    this.clearControls();
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
  }

  async showJSON(url, label) {
    this.clearControls();
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
