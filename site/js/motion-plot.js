// Hand-rolled SVG plot for MCFLIRT .par files: 3 rotations (radians) and
// 3 translations (mm), plotted on separate axes since they're on very
// different scales (slide 14: "don't look at all 6 at once").

async function renderMotionPlot(container, parUrl, trSeconds) {
  container.innerHTML = "Loading motion parameters…";
  let text;
  try {
    const res = await fetch(parUrl);
    text = await res.text();
  } catch (e) {
    container.textContent = "Could not load motion parameters: " + e.message;
    return;
  }
  const rows = text
    .trim()
    .split("\n")
    .map((l) => l.trim().split(/\s+/).map(Number));
  const n = rows.length;
  const rot = [0, 1, 2].map((i) => rows.map((r) => r[i])); // radians
  const trans = [3, 4, 5].map((i) => rows.map((r) => r[i])); // mm

  container.innerHTML = "";
  container.appendChild(makeChart("Rotations (radians)", ["pitch (x)", "roll (y)", "yaw (z)"], rot, n, trSeconds, "rad"));
  container.appendChild(makeChart("Translations (mm)", ["x", "y", "z"], trans, n, trSeconds, "mm"));
}

function makeChart(title, seriesNames, series, n, trSeconds, unit) {
  const W = 640,
    H = 180,
    padL = 48,
    padB = 28,
    padT = 24,
    padR = 12;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  let min = Infinity,
    max = -Infinity;
  for (const s of series) for (const v of s) { if (v < min) min = v; if (v > max) max = v; }
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.1 || 0.1;
  min -= pad;
  max += pad;

  const x = (i) => padL + (plotW * i) / Math.max(1, n - 1);
  const y = (v) => padT + plotH - ((v - min) / (max - min)) * plotH;

  const colors = ["#e07a3f", "#3f7ae0", "#3fae5c"];
  const wrap = document.createElement("div");
  wrap.className = "motion-chart";

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "motion-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", title);

  // axes
  const axis = document.createElementNS(svgNS, "path");
  axis.setAttribute("d", `M${padL},${padT} V${padT + plotH} H${padL + plotW}`);
  axis.setAttribute("class", "motion-axis");
  svg.appendChild(axis);

  // zero line if in range
  if (min < 0 && max > 0) {
    const zline = document.createElementNS(svgNS, "line");
    zline.setAttribute("x1", padL);
    zline.setAttribute("x2", padL + plotW);
    zline.setAttribute("y1", y(0));
    zline.setAttribute("y2", y(0));
    zline.setAttribute("class", "motion-zeroline");
    svg.appendChild(zline);
  }

  // y labels (min, 0 or mid, max)
  for (const v of [min + pad, (min + max) / 2, max - pad]) {
    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", padL - 6);
    t.setAttribute("y", y(v) + 3);
    t.setAttribute("class", "motion-label");
    t.setAttribute("text-anchor", "end");
    t.textContent = v.toFixed(unit === "rad" ? 4 : 2);
    svg.appendChild(t);
  }

  // x labels (time in seconds, start/mid/end)
  for (const frac of [0, 0.5, 1]) {
    const i = Math.round((n - 1) * frac);
    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", x(i));
    t.setAttribute("y", H - 6);
    t.setAttribute("class", "motion-label");
    t.setAttribute("text-anchor", frac === 0 ? "start" : frac === 1 ? "end" : "middle");
    t.textContent = (i * trSeconds).toFixed(1) + "s";
    svg.appendChild(t);
  }

  series.forEach((s, si) => {
    const d = s.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "motion-line");
    path.setAttribute("stroke", colors[si]);
    svg.appendChild(path);
  });

  const header = document.createElement("div");
  header.className = "motion-chart-header";
  header.innerHTML =
    `<span class="motion-chart-title">${title}</span>` +
    seriesNames.map((n2, i) => `<span class="motion-legend" style="--c:${colors[i]}">${n2}</span>`).join("");
  wrap.appendChild(header);
  wrap.appendChild(svg);
  return wrap;
}
