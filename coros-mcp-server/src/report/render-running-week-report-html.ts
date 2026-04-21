import type { RunningWeekReportOutput } from "../types.js";

export type RunningWeekReportChartModel = Omit<RunningWeekReportOutput, "html">;

/** ECharts 5.x (pinned) — loaded from CDN when the HTML file is opened. */
const ECHARTS_CDN = "https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js";

const ZONE_COLORS = ["#4e79a7", "#59a14f", "#edc948", "#f28e2b", "#e15759"] as const;

const GROUP_COLORS = {
  aerobic_base: "#59a14f",
  threshold: "#edc948",
  high_intensity: "#e15759",
} as const;

export function renderRunningWeekReportHtml(model: RunningWeekReportChartModel): string {
  const title = `跑步周报 · ${model.date_from}–${model.date_to}`;
  const payloadJson = JSON.stringify(model)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

  return `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", sans-serif;
      background: linear-gradient(180deg, #0c0e12 0%, #0f1115 32%);
      color: #e8eaed;
      min-height: 100vh;
    }
    header {
      padding: 22px 26px 14px;
      border-bottom: 1px solid #252a36;
      background: rgba(21, 24, 33, 0.85);
      backdrop-filter: blur(8px);
    }
    h1 { font-size: 20px; font-weight: 650; margin: 0 0 6px; letter-spacing: 0.02em; }
    .sub { font-size: 13px; color: #9aa0a6; }
    main { padding: 18px 26px 36px; max-width: 1280px; margin: 0 auto; display: grid; gap: 18px; }
    section.card {
      background: #151821;
      border: 1px solid #252a36;
      border-radius: 12px;
      padding: 16px 16px 12px;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
    }
    h2 {
      font-size: 13px;
      font-weight: 650;
      margin: 0 0 12px;
      color: #bdc1c6;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }
    .kpi {
      background: #1a1e2a;
      border: 1px solid #2a3142;
      border-radius: 10px;
      padding: 14px 16px;
    }
    .kpi .v { font-size: 22px; font-weight: 700; color: #f1f3f4; font-variant-numeric: tabular-nums; }
    .kpi .l { font-size: 11px; color: #80868b; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.06em; }
    .chart {
      width: 100%;
      height: 320px;
    }
    .chart-sm { height: 280px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    @media (max-width: 960px) { .grid2 { grid-template-columns: 1fr; } }
    footer { padding: 0 26px 32px; max-width: 1280px; margin: 0 auto; font-size: 12px; color: #80868b; line-height: 1.5; }
    footer ul { margin: 8px 0 0; padding-left: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #252a36; }
    th { color: #9aa0a6; font-weight: 600; }
    .muted { color: #9aa0a6; }
    .note { font-size: 11px; color: #6f7378; margin-top: 8px; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="sub">${escapeHtml(model.profile.nickname)} · 生成于 ${escapeHtml(model.generated_at)}</div>
  </header>
  <main>
    <section class="card">
      <h2>本周概览</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="v">${model.totals.run_count}</div><div class="l">跑步次数</div></div>
        <div class="kpi"><div class="v">${model.totals.distance_km.toFixed(1)} km</div><div class="l">总距离</div></div>
        <div class="kpi"><div class="v">${model.totals.training_load}</div><div class="l">训练负荷</div></div>
        <div class="kpi"><div class="v">${formatDuration(model.totals.workout_time_s)}</div><div class="l">跑步时长</div></div>
      </div>
    </section>
    <div class="grid2">
      <section class="card">
        <h2>心率区间 · 时间占比</h2>
        <div id="ech_hr_zones" class="chart chart-sm"></div>
        <div class="note">基于周内心率时间累计；有分段数据时用分段，否则整节按平均心率归入一区。</div>
      </section>
      <section class="card">
        <h2>强度结构 · 有氧基础 / 阈值 / 高强度</h2>
        <div id="ech_hr_groups" class="chart chart-sm"></div>
        <div class="note">Z1+Z2 有氧基础 · Z3 阈值/混氧 · Z4+Z5 高强度</div>
      </section>
    </div>
    <div class="grid2">
      <section class="card">
        <h2>心率区间 · 时间堆叠</h2>
        <div id="ech_hr_stack" class="chart"></div>
      </section>
      <section class="card">
        <h2>每日负荷与跑量</h2>
        <div id="ech_daily" class="chart"></div>
      </section>
    </div>
    <div class="grid2">
      <section class="card">
        <h2>配速分布 · 各箱距离</h2>
        <div id="ech_pace_bars" class="chart"></div>
      </section>
      <section class="card">
        <h2>配速带 · 距离占比</h2>
        <div id="ech_pace_share" class="chart chart-sm"></div>
        <div class="note">将配速箱合并为 5 档，按距离比例展示。</div>
      </section>
    </div>
    <div class="grid2">
      <section class="card">
        <h2>课型结构 · 节数</h2>
        <div id="ech_sessions" class="chart chart-sm"></div>
      </section>
      <section class="card">
        <h2>COROS 训练效果 · 有氧 / 无氧（可获取详情的场次累计）</h2>
        <div id="ech_te" class="chart chart-sm"></div>
        <div class="note">仅为成功拉取详情的跑步累计 TE，非官方周统计口径。</div>
      </section>
    </div>
    <section class="card">
      <h2>活动列表</h2>
      <table>
        <thead><tr><th>日期</th><th>名称</th><th>km</th><th>负荷</th><th>均心</th><th>课型</th><th>分段</th></tr></thead>
        <tbody>
          ${model.activities
            .map(
              (a) => `<tr>
            <td>${escapeHtml(a.date)}</td>
            <td>${escapeHtml(a.name)}</td>
            <td>${a.distance_km.toFixed(1)}</td>
            <td>${a.training_load}</td>
            <td>${a.avg_hr || "—"}</td>
            <td>${escapeHtml(a.classification)}</td>
            <td class="muted">${a.detail_fetched ? "是" : "列表估"}</td>
          </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </section>
  </main>
  <footer>
    <div>方法说明</div>
    <ul>
      ${model.methodology.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}
    </ul>
  </footer>
  <script src="${ECHARTS_CDN}" crossorigin="anonymous"></script>
  <script>
  const REPORT = ${payloadJson};
  const ZONE_COLORS = ${JSON.stringify(ZONE_COLORS)};
  const GROUP_COLORS = ${JSON.stringify(GROUP_COLORS)};

  function fmtPace(sec) {
    if (!sec || !isFinite(sec)) return "—";
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60).toString().padStart(2, "0");
    return m + ":" + s + "/km";
  }

  function secToMin(s) {
    return Math.round((s || 0) / 60);
  }

  function fmtMin(m) {
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      return h + "h" + (mm ? mm + "m" : "");
    }
    return m + " min";
  }

  function corosDateToLabel(d) {
    const s = String(d);
    return s.slice(4, 6) + "-" + s.slice(6, 8);
  }

  function baseTextStyle() {
    return { color: "#bdc1c6", fontSize: 11 };
  }

  const charts = [];

  function initCharts() {
    if (typeof echarts === "undefined") {
      document.querySelectorAll(".chart").forEach(function (el) {
        el.innerHTML = '<p style="padding:24px;color:#9aa0a6;">无法加载 ECharts，请联网后重新打开本页（jsDelivr）。</p>';
      });
      return;
    }

    const hrKeys = ["z1", "z2", "z3", "z4", "z5"];
    const zoneMeta = {};
    (REPORT.hr_zone_definitions || []).forEach(function (z) {
      zoneMeta[z.zone] = z;
    });

    const hrPieData = hrKeys.map(function (k, i) {
      const sec = REPORT.hr_zones_seconds[k] || 0;
      const zm = zoneMeta[k];
      const name = zm
        ? zm.label + " " + zm.bpm_low + "–" + zm.bpm_high + " bpm"
        : "Z" + (i + 1);
      return { name: name, value: secToMin(sec), rawSec: sec, itemStyle: { color: ZONE_COLORS[i] } };
    }).filter(function (d) { return d.rawSec > 0; });

    const hrPie = echarts.init(document.getElementById("ech_hr_zones"), null, { renderer: "canvas" });
    charts.push(hrPie);
    hrPie.setOption({
      backgroundColor: "transparent",
      textStyle: baseTextStyle(),
      tooltip: {
        trigger: "item",
        formatter: function (p) {
          var m = p.value;
          var pct = p.percent;
          return p.name + "<br/>时间 " + m + " min (" + pct.toFixed(1) + "%)";
        },
      },
      legend: { bottom: 0, textStyle: { color: "#9aa0a6", fontSize: 10 } },
      series: [
        {
          type: "pie",
          radius: ["40%", "68%"],
          center: ["50%", "46%"],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 4, borderColor: "#151821", borderWidth: 2 },
          label: { color: "#e8eaed", formatter: "{b}\\n{d}%" },
          data: hrPieData.length ? hrPieData : [{ name: "无心率时间", value: 1, itemStyle: { color: "#3c4043" } }],
        },
      ],
    });

    const g = REPORT.hr_time_groups_seconds || { aerobic_base: 0, threshold: 0, high_intensity: 0 };
    const groupPieData = [
      { name: "有氧基础 (Z1–Z2)", value: secToMin(g.aerobic_base), raw: g.aerobic_base, itemStyle: { color: GROUP_COLORS.aerobic_base } },
      { name: "阈值/混氧 (Z3)", value: secToMin(g.threshold), raw: g.threshold, itemStyle: { color: GROUP_COLORS.threshold } },
      { name: "高强度 (Z4–Z5)", value: secToMin(g.high_intensity), raw: g.high_intensity, itemStyle: { color: GROUP_COLORS.high_intensity } },
    ].filter(function (d) { return d.raw > 0; });

    const gPie = echarts.init(document.getElementById("ech_hr_groups"), null, { renderer: "canvas" });
    charts.push(gPie);
    gPie.setOption({
      backgroundColor: "transparent",
      textStyle: baseTextStyle(),
      tooltip: {
        trigger: "item",
        formatter: function (p) {
          return p.name + "<br/>" + p.value + " min (" + p.percent.toFixed(1) + "%)";
        },
      },
      legend: { bottom: 0, textStyle: { color: "#9aa0a6", fontSize: 10 } },
      series: [
        {
          type: "pie",
          roseType: "radius",
          radius: ["25%", "68%"],
          center: ["50%", "46%"],
          itemStyle: { borderRadius: 3, borderColor: "#151821", borderWidth: 2 },
          label: { color: "#e8eaed", formatter: "{b}\\n{d}%" },
          data: groupPieData.length ? groupPieData : [{ name: "无心率时间", value: 1, itemStyle: { color: "#3c4043" } }],
        },
      ],
    });

    const hrStack = echarts.init(document.getElementById("ech_hr_stack"), null, { renderer: "canvas" });
    charts.push(hrStack);
    hrStack.setOption({
      backgroundColor: "transparent",
      textStyle: baseTextStyle(),
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: function (items) {
          if (!items.length) return "";
          var total = items.reduce(function (a, x) { return a + (x.value || 0); }, 0);
          var lines = items.map(function (x) {
            return x.marker + x.seriesName + ": " + fmtMin(x.value) + " (" + (total ? ((x.value / total) * 100).toFixed(1) : 0) + "%)";
          });
          return "合计 " + fmtMin(total) + "<br/>" + lines.join("<br/>");
        },
      },
      grid: { left: 12, right: 24, top: 16, bottom: 24, containLabel: true },
      xAxis: { type: "value", axisLabel: { formatter: function (v) { return v + "m"; }, color: "#80868b" }, splitLine: { lineStyle: { color: "#2a3142" } } },
      yAxis: { type: "category", data: ["本周"], axisLabel: { color: "#80868b" } },
      series: hrKeys.map(function (k, i) {
        var zm = zoneMeta[k];
        var nm = zm ? zm.label + " (" + zm.bpm_low + "–" + zm.bpm_high + ")" : "Z" + (i + 1);
        return {
          name: nm,
          type: "bar",
          stack: "hr",
          emphasis: { focus: "series" },
          itemStyle: { color: ZONE_COLORS[i] },
          data: [secToMin(REPORT.hr_zones_seconds[k] || 0)],
        };
      }),
    });

    const daily = REPORT.daily || [];
    const dailyLbl = daily.map(function (d) { return corosDateToLabel(d.date); });
    const dailyLoad = daily.map(function (d) { return d.training_load; });
    const dailyKm = daily.map(function (d) { return Number(d.distance_km.toFixed(2)); });

    const dailyCh = echarts.init(document.getElementById("ech_daily"), null, { renderer: "canvas" });
    charts.push(dailyCh);
    dailyCh.setOption({
      backgroundColor: "transparent",
      textStyle: baseTextStyle(),
      tooltip: { trigger: "axis" },
      legend: { data: ["负荷", "跑量 km"], textStyle: { color: "#9aa0a6" }, top: 0 },
      grid: { left: 48, right: 48, top: 40, bottom: 28 },
      xAxis: { type: "category", data: dailyLbl, axisLabel: { color: "#80868b" } },
      yAxis: [
        { type: "value", name: "负荷", axisLabel: { color: "#8ab4f8" }, splitLine: { lineStyle: { color: "#2a3142" } } },
        { type: "value", name: "km", axisLabel: { color: "#81c995" }, splitLine: { show: false } },
      ],
      series: [
        { name: "负荷", type: "bar", data: dailyLoad, itemStyle: { color: "#8ab4f8", borderRadius: [4, 4, 0, 0] } },
        { name: "跑量 km", type: "line", yAxisIndex: 1, smooth: true, data: dailyKm, itemStyle: { color: "#81c995" } },
      ],
    });

    var bins = REPORT.pace_bins || [];
    var paceLabels = bins.map(function (b, i) {
      return fmtPace(b.low_sec_per_km);
    });
    var paceKm = bins.map(function (b) { return Number(b.distance_km.toFixed(3)); });
    var paceCh = echarts.init(document.getElementById("ech_pace_bars"), null, { renderer: "canvas" });
    charts.push(paceCh);
    paceCh.setOption({
      backgroundColor: "transparent",
      textStyle: baseTextStyle(),
      tooltip: {
        trigger: "axis",
        formatter: function (rows) {
          var p = rows[0];
          var i = p.dataIndex;
          var b = bins[i];
          return fmtPace(b.low_sec_per_km) + " – " + fmtPace(b.high_sec_per_km) + "<br/>距离 " + p.value + " km";
        },
      },
      grid: { left: 44, right: 16, top: 20, bottom: 56 },
      dataZoom: [{ type: "inside", start: 0, end: 100 }, { type: "slider", start: 0, end: 100, bottom: 8, height: 18 }],
      xAxis: {
        type: "category",
        data: paceLabels,
        axisLabel: { color: "#80868b", rotate: 45, interval: 2 },
      },
      yAxis: { type: "value", name: "km", axisLabel: { color: "#80868b" }, splitLine: { lineStyle: { color: "#2a3142" } } },
      series: [
        {
          name: "距离",
          type: "bar",
          data: paceKm,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "#6abf69" },
              { offset: 1, color: "#2e6b2f" },
            ]),
            borderRadius: [3, 3, 0, 0],
          },
        },
      ],
    });

    var bandCount = 5;
    var nBin = bins.length;
    var paceBandData = [];
    for (var bi = 0; bi < bandCount; bi++) {
      var lo = Math.floor((bi * nBin) / bandCount);
      var hi = Math.floor(((bi + 1) * nBin) / bandCount) - 1;
      if (hi < lo) hi = lo;
      var sumKm = 0;
      for (var j = lo; j <= hi; j++) sumKm += bins[j] ? bins[j].distance_km : 0;
      var slow = bins[lo];
      var fast = bins[hi];
      var label = fmtPace(slow.low_sec_per_km) + " – " + fmtPace(fast.high_sec_per_km);
      paceBandData.push({ name: label, value: Number(sumKm.toFixed(3)) });
    }
    var paceShare = echarts.init(document.getElementById("ech_pace_share"), null, { renderer: "canvas" });
    charts.push(paceShare);
    var paceSum = paceBandData.reduce(function (a, x) { return a + x.value; }, 0);
    paceShare.setOption({
      backgroundColor: "transparent",
      textStyle: baseTextStyle(),
      tooltip: { trigger: "item", formatter: "{b}<br/>{c} km ({d}%)" },
      legend: { type: "scroll", bottom: 0, textStyle: { color: "#9aa0a6", fontSize: 9 } },
      series: [
        {
          type: "pie",
          radius: ["36%", "62%"],
          center: ["50%", "44%"],
          data: paceSum > 0 ? paceBandData.filter(function (x) { return x.value > 0; }) : [{ name: "无配速距离", value: 1, itemStyle: { color: "#3c4043" } }],
          itemStyle: { borderRadius: 4, borderColor: "#151821", borderWidth: 2 },
          label: { formatter: function (p) { return p.percent >= 8 ? p.name.split(" – ")[0] + "\\n" + p.percent.toFixed(0) + "%" : ""; } },
        },
      ],
    });

    var ic = REPORT.intensity_counts || { easy: 0, quality: 0, long: 0 };
    var sess = echarts.init(document.getElementById("ech_sessions"), null, { renderer: "canvas" });
    charts.push(sess);
    var sessData = [
      { name: "轻松", value: ic.easy, itemStyle: { color: "#4e79a7" } },
      { name: "质量", value: ic.quality, itemStyle: { color: "#f28e2b" } },
      { name: "长距离", value: ic.long, itemStyle: { color: "#b07aa1" } },
    ].filter(function (x) { return x.value > 0; });
    sess.setOption({
      backgroundColor: "transparent",
      textStyle: baseTextStyle(),
      tooltip: { trigger: "item" },
      legend: { bottom: 0, textStyle: { color: "#9aa0a6" } },
      series: [
        {
          type: "pie",
          radius: ["42%", "65%"],
          center: ["50%", "46%"],
          data: sessData.length ? sessData : [{ name: "无跑步", value: 1, itemStyle: { color: "#3c4043" } }],
          label: { formatter: "{b} {c} 节\\n{d}%" },
          itemStyle: { borderRadius: 4, borderColor: "#151821", borderWidth: 2 },
        },
      ],
    });

    var te = REPORT.training_effect;
    var teEl = document.getElementById("ech_te");
    var teChart = echarts.init(teEl, null, { renderer: "canvas" });
    charts.push(teChart);
    if (te && te.sessions_count > 0 && (te.aerobic_sum > 0 || te.anaerobic_sum > 0)) {
      teChart.setOption({
        backgroundColor: "transparent",
        textStyle: baseTextStyle(),
        tooltip: { trigger: "axis" },
        grid: { left: 80, right: 24, top: 16, bottom: 24 },
        xAxis: { type: "value", axisLabel: { color: "#80868b" }, splitLine: { lineStyle: { color: "#2a3142" } } },
        yAxis: { type: "category", data: ["有氧 TE", "无氧 TE"], axisLabel: { color: "#80868b" } },
        series: [
          {
            type: "bar",
            data: [
              { value: te.aerobic_sum, itemStyle: { color: "#59a14f", borderRadius: [0, 4, 4, 0] } },
              { value: te.anaerobic_sum, itemStyle: { color: "#e15759", borderRadius: [0, 4, 4, 0] } },
            ],
            label: { show: true, position: "right", color: "#e8eaed", formatter: "{c}" },
          },
        ],
      });
    } else {
      teChart.setOption({
        backgroundColor: "transparent",
        title: {
          text: "暂无 TE 累计\\n（需成功获取活动详情且 COROS 返回训练效果）",
          left: "center",
          top: "center",
          textStyle: { color: "#6f7378", fontSize: 13, lineHeight: 20 },
        },
      });
    }

    window.addEventListener("resize", function () {
      charts.forEach(function (c) { c.resize(); });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCharts);
  } else {
    initCharts();
  }
  </script>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDuration(seconds: number) {
  const m = Math.round(seconds / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h <= 0) return `${mm} 分钟`;
  return `${h} 小时 ${mm} 分`;
}
