import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const { renderRunningWeekReportHtml } = await import(
  path.join(ROOT, "dist", "report", "render-running-week-report-html.js")
);
const { assignHrZone, buildHrZoneDefinitions } = await import(
  path.join(ROOT, "dist", "report", "hr-zones.js")
);

function buildSyntheticModel() {
  const profile = {
    user_id: "selftest",
    nickname: "Selftest Runner",
    max_hr: 190,
    resting_hr: 50,
    lthr: 170,
    lt_pace_sec_per_km: 300,
    pace_zones: [],
  };
  const zoneDefs = buildHrZoneDefinitions(profile);
  assert.equal(zoneDefs.length, 5);

  const dailyDates = ["20250414", "20250415", "20250416", "20250417", "20250418", "20250419", "20250420"];
  const daily = dailyDates.map((date, i) => ({
    date,
    run_count: i % 2,
    distance_km: i * 2.5,
    training_load: i * 12,
    workout_time_s: i * 1200,
  }));

  const pace_bins = [];
  for (let i = 0; i < 26; i += 1) {
    const low = 210 + i * 15;
    pace_bins.push({
      low_sec_per_km: low,
      high_sec_per_km: low + 15,
      distance_km: i === 10 ? 4.2 : i === 11 ? 2.1 : 0,
    });
  }

  return {
    date_from: "20250414",
    date_to: "20250420",
    generated_at: "2026-04-20T12:00:00.000Z",
    sport_filter: "run",
    profile: {
      nickname: profile.nickname,
      max_hr: profile.max_hr,
      resting_hr: profile.resting_hr,
      lthr: profile.lthr,
    },
    methodology: ["Synthetic fixture for offline self-test."],
    totals: {
      run_count: 4,
      distance_km: 42.5,
      training_load: 310,
      workout_time_s: 14400,
    },
    intensity_counts: { easy: 2, quality: 1, long: 1 },
    hr_zones_seconds: { z1: 3600, z2: 2400, z3: 1200, z4: 600, z5: 120 },
    hr_time_groups_seconds: { aerobic_base: 6000, threshold: 1200, high_intensity: 720 },
    training_effect: { aerobic_sum: 8.5, anaerobic_sum: 1.2, sessions_count: 2 },
    hr_zone_definitions: zoneDefs,
    daily,
    pace_bins,
    activities: [
      {
        date: "20250418",
        label_id: "1",
        sport_type: 100,
        name: "Easy run",
        distance_km: 10,
        training_load: 70,
        workout_time_s: 3600,
        avg_hr: 140,
        classification: "easy",
        detail_fetched: true,
      },
    ],
  };
}

async function main() {
  const model = buildSyntheticModel();
  const zoneDefs = buildHrZoneDefinitions({
    user_id: "selftest",
    nickname: model.profile.nickname,
    max_hr: model.profile.max_hr,
    resting_hr: model.profile.resting_hr,
    lthr: model.profile.lthr,
    lt_pace_sec_per_km: 300,
    pace_zones: [],
  });
  assert.equal(assignHrZone(120, zoneDefs), "z1");

  const html = renderRunningWeekReportHtml(model);
  assert.ok(html.includes("<!DOCTYPE html>"));
  assert.ok(html.includes("echarts@5.5.1"));
  assert.ok(html.includes('id="ech_hr_zones"'));
  assert.ok(html.includes('id="ech_daily"'));
  assert.ok(html.includes('id="ech_pace_bars"'));
  assert.ok(html.includes('id="ech_sessions"'));
  assert.ok(html.includes("const REPORT = "));

  const jsonStart = html.indexOf("const REPORT = ") + "const REPORT = ".length;
  const jsonEnd = html.indexOf(";", jsonStart);
  const payloadText = html.slice(jsonStart, jsonEnd);
  JSON.parse(payloadText);

  const htmlOut = process.env.RUNNING_WEEK_REPORT_HTML_OUT;
  if (htmlOut) {
    await mkdir(path.dirname(path.resolve(htmlOut)), { recursive: true });
    await writeFile(path.resolve(htmlOut), html, "utf8");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        selftest: "running_week_report_html_render",
        html_bytes: html.length,
        ...(htmlOut ? { html_path: path.resolve(htmlOut) } : {}),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
