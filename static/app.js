const form = document.querySelector("#searchForm");
const analyzeButton = document.querySelector("#analyzeButton");
const queryInput = document.querySelector("#queryInput");
const minutesInput = document.querySelector("#minutesInput");
const statusEl = document.querySelector("#status");
const candidatesEl = document.querySelector("#candidates");
const reportEl = document.querySelector("#report");

const CSV_URL = new URL(
  window.location.pathname.includes("/static/") ? "../player_rows.csv" : "player_rows.csv",
  window.location.href,
);

const SEARCH_LIMIT = 8;
let players = [];
let searchTimer = null;

const METRICS = [
  ["avg_rating", "평균 평점", "rating", "raw", false],
  ["goal_contributions_p90", "공격포인트", "per 90", "per90", false],
  ["expected_goal_contributions_p90", "xG+xA", "per 90", "per90", false],
  ["expected_assists_p90", "xA", "per 90", "per90", false],
  ["key_passes_p90", "키패스", "per 90", "per90", false],
  ["big_chances_created_p90", "빅찬스 생성", "per 90", "per90", false],
  ["accurate_crosses_p90", "정확한 크로스", "per 90", "per90", false],
  ["cross_accuracy", "크로스 성공률", "%", "percent", false],
  ["accurate_long_balls_p90", "정확한 롱볼", "per 90", "per90", false],
  ["long_ball_accuracy", "롱볼 성공률", "%", "percent", false],
  ["successful_dribbles_p90", "성공 드리블", "per 90", "per90", false],
  ["dribble_success_rate", "드리블 성공률", "%", "percent", false],
  ["total_passes_p90", "패스", "per 90", "per90", false],
  ["pass_accuracy", "패스 성공률", "%", "percent", false],
  ["total_touches_p90", "터치", "per 90", "per90", false],
  ["duels_won_p90", "경합 승리", "per 90", "per90", false],
  ["duel_win_rate", "경합 승률", "%", "percent", false],
  ["tackles_p90", "태클", "per 90", "per90", false],
  ["interceptions_p90", "인터셉트", "per 90", "per90", false],
  ["clearances_p90", "클리어런스", "per 90", "per90", false],
  ["defensive_actions_p90", "태클+인터셉트", "per 90", "per90", false],
  ["aerial_duels_won_p90", "공중 경합 승리", "per 90", "per90", false],
  ["aerial_duel_win_rate", "공중 경합 승률", "%", "percent", false],
  ["errors_p90", "실수로 인한 슈팅/골", "per 90", "per90", true],
  ["fouls_committed_p90", "파울", "per 90", "per90", true],
];

const ATTACKING = [
  ["avg_rating", "평균 평점", "raw"],
  ["goal_contributions_p90", "공격포인트/90", "per90"],
  ["expected_goal_contributions_p90", "xG+xA/90", "per90"],
  ["expected_assists_p90", "xA/90", "per90"],
  ["key_passes_p90", "키패스/90", "per90"],
  ["accurate_crosses_p90", "정확한 크로스/90", "per90"],
  ["cross_accuracy", "크로스 성공률", "percent"],
  ["accurate_long_balls_p90", "정확한 롱볼/90", "per90"],
  ["long_ball_accuracy", "롱볼 성공률", "percent"],
];

const DEFENSIVE = [
  ["tackles_p90", "태클/90", "per90"],
  ["interceptions_p90", "인터셉트/90", "per90"],
  ["clearances_p90", "클리어런스/90", "per90"],
  ["defensive_actions_p90", "태클+인터셉트/90", "per90"],
  ["duels_won_p90", "경합 승리/90", "per90"],
  ["duel_win_rate", "경합 승률", "percent"],
  ["aerial_duels_won_p90", "공중 경합 승리/90", "per90"],
  ["aerial_duel_win_rate", "공중 경합 승률", "percent"],
  ["fouls_committed_p90", "파울/90", "per90"],
  ["errors_p90", "실수로 인한 슈팅/골/90", "per90"],
];

const POSITION_RADARS = [
  {
    title: "공격수",
    metrics: [
      ["expected_assists_p90", "xA", "per90"],
      ["big_chances_created_p90", "빅찬스 생성", "per90"],
      ["successful_dribbles_p90", "성공 드리블", "per90"],
      ["goal_contributions_p90", "공격포인트", "per90"],
      ["accurate_crosses_p90", "정확한 크로스", "per90"],
    ],
  },
  {
    title: "공격형 미드필더",
    metrics: [
      ["total_touches_p90", "터치", "per90"],
      ["pass_accuracy", "패스 성공률", "percent"],
      ["goal_contributions_p90", "공격포인트", "per90"],
      ["key_passes_p90", "키패스", "per90"],
      ["big_chances_created_p90", "빅찬스 생성", "per90"],
      ["successful_dribbles_p90", "성공 드리블", "per90"],
    ],
  },
  {
    title: "수비형 미드필더",
    metrics: [
      ["total_touches_p90", "터치", "per90"],
      ["pass_accuracy", "패스 성공률", "percent"],
      ["accurate_long_balls_p90", "정확한 롱볼", "per90"],
      ["key_passes_p90", "키패스", "per90"],
      ["interceptions_p90", "인터셉트", "per90"],
      ["duels_won_p90", "경합 승리", "per90"],
    ],
  },
  {
    title: "수비수",
    metrics: [
      ["accurate_long_balls_p90", "정확한 롱볼", "per90"],
      ["pass_accuracy", "패스 성공률", "percent"],
      ["duels_won_p90", "경합 승리", "per90"],
      ["fouls_committed_p90", "파울", "per90", true],
      ["clearances_p90", "클리어런스", "per90"],
      ["errors_p90", "실수로 인한 슈팅/골", "per90", true],
    ],
  },
];

function setStatus(message, type = "normal") {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", type === "error");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift();
  return rows
    .filter((values) => values.length === headers.length)
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, normalizeCsvValue(values[index])])),
    );
}

function normalizeCsvValue(value) {
  if (value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && value.trim() !== "" ? numberValue : value;
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function splitList(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function positionSet(value) {
  return String(value ?? "")
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean);
}

function intersects(left, right) {
  const rightSet = new Set(right);
  return left.some((item) => rightSet.has(item));
}

function ratio(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const maxLength = Math.max(a.length, b.length, 1);
  return 1 - dp[a.length][b.length] / maxLength;
}

function nameMatchScore(query, playerName) {
  const q = normalizeText(query);
  const name = normalizeText(playerName);
  const parts = q.split(" ").filter(Boolean);

  if (!q) return 0;
  if (q === name) return 120;
  if (name.includes(q)) return 100 + q.length / Math.max(name.length, 1);
  if (parts.every((part) => name.includes(part))) {
    return 90 + parts.join("").length / Math.max(name.length, 1);
  }

  const nameParts = name.split(" ");
  const tokenScore = Math.max(
    0,
    ...parts.flatMap((part) => nameParts.map((namePart) => ratio(part, namePart))),
  );
  return Math.max(tokenScore, ratio(q, name)) * 80;
}

function searchCandidates(query, limit = SEARCH_LIMIT) {
  const candidates = players
    .map((player) => ({ ...player, match_score: nameMatchScore(query, player.player_name) }))
    .filter((player) => player.match_score >= 45);

  const strongCandidates = candidates.filter((player) => player.match_score >= 90);
  const pool = strongCandidates.length ? strongCandidates : candidates;

  return pool
    .sort((a, b) => b.match_score - a.match_score || b.minutes - a.minutes || b.appearances - a.appearances)
    .slice(0, limit)
    .map((player, index) => ({ ...player, no: index + 1 }));
}

function formatValue(value, type) {
  if (!isValidNumber(value)) return "-";
  const numberValue = Number(value);
  if (type === "percent") return `${numberValue.toFixed(1)}%`;
  if (type === "raw") return numberValue.toFixed(2);
  return numberValue.toFixed(2);
}

function isValidNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function percentileFor(values, value, lowerIsBetter) {
  const clean = values.filter(isValidNumber).map(Number);
  if (!clean.length || !isValidNumber(value)) return null;
  const count = lowerIsBetter
    ? clean.filter((item) => item >= value).length
    : clean.filter((item) => item <= value).length;
  return (count / clean.length) * 100;
}

function rankFor(values, value, lowerIsBetter) {
  const clean = values.filter(isValidNumber).map(Number);
  if (!clean.length || !isValidNumber(value)) return null;
  return lowerIsBetter
    ? clean.filter((item) => item < value).length + 1
    : clean.filter((item) => item > value).length + 1;
}

function enrichPlayer(player) {
  const enriched = { ...player };
  const errorsShot = Number(enriched.errors_leading_to_shot_p90);
  const errorsGoal = Number(enriched.errors_leading_to_goal_p90);
  const hasShot = Number.isFinite(errorsShot);
  const hasGoal = Number.isFinite(errorsGoal);
  enriched.errors_p90 = hasShot || hasGoal ? (hasShot ? errorsShot : 0) + (hasGoal ? errorsGoal : 0) : null;

  const tackles = Number(enriched.tackles_p90);
  const interceptions = Number(enriched.interceptions_p90);
  const hasTackles = Number.isFinite(tackles);
  const hasInterceptions = Number.isFinite(interceptions);
  enriched.defensive_actions_p90 =
    hasTackles || hasInterceptions ? (hasTackles ? tackles : 0) + (hasInterceptions ? interceptions : 0) : null;
  return enriched;
}

function comparisonPool(player, minMinutes) {
  const playerSeasons = splitList(player.seasons);
  const playerCompetitions = splitList(player.competitions);
  const playerPositions = positionSet(player.positions || player.position);

  return players
    .filter((candidate) => Number(candidate.minutes) >= minMinutes)
    .filter((candidate) => intersects(splitList(candidate.seasons), playerSeasons))
    .filter((candidate) => intersects(splitList(candidate.competitions), playerCompetitions))
    .filter((candidate) => intersects(positionSet(candidate.positions || candidate.position), playerPositions))
    .map(enrichPlayer);
}

function buildStrengths(pool, player) {
  return METRICS.map(([column, label, unit, type, lowerIsBetter]) => {
    const value = player[column];
    if (!isValidNumber(value)) return null;
    if (!lowerIsBetter && type !== "raw" && Number(value) <= 0) return null;

    const values = pool.map((candidate) => candidate[column]);
    const validValues = values.filter(isValidNumber);
    const percentile = percentileFor(validValues, value, lowerIsBetter);
    const rank = rankFor(validValues, value, lowerIsBetter);
    if (percentile === null || rank === null || percentile < 70) return null;
    return {
      label,
      unit,
      value: formatValue(value, type),
      percentile,
      percentileText: `상위 ${(100 - percentile).toFixed(1)}%`,
      rankText: `${rank}/${validValues.length}`,
      metaText: `${unit} · ${rank}/${validValues.length}`,
      raw: Number(value),
    };
  })
    .filter(Boolean)
    .sort((a, b) => b.percentile - a.percentile || b.raw - a.raw);
}

function buildWeaknesses(pool, player) {
  return METRICS.map(([column, label, unit, type, lowerIsBetter]) => {
    const value = player[column];
    if (!isValidNumber(value)) return null;

    const values = pool.map((candidate) => candidate[column]);
    const validValues = values.filter(isValidNumber);
    const percentile = percentileFor(validValues, value, lowerIsBetter);
    const rank = rankFor(validValues, value, lowerIsBetter);
    if (percentile === null || rank === null || percentile > 30) return null;

    return {
      label,
      unit,
      value: formatValue(value, type),
      percentile,
      percentileText: `하위 ${percentile.toFixed(1)}%`,
      rankText: `${rank}/${validValues.length}`,
      metaText: `${unit} · ${rank}/${validValues.length}`,
      raw: Number(value),
    };
  })
    .filter(Boolean)
    .sort((a, b) => a.percentile - b.percentile || a.raw - b.raw)
    .slice(0, 8);
}

function metricItems(columns, player) {
  return columns.map(([column, label, type]) => ({
    label,
    value: formatValue(player[column], type),
  }));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function radarPoint(index, total, value, radius = 74, center = 100) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const scaledRadius = radius * clamp(value, 0, 100) / 100;
  return {
    x: center + Math.cos(angle) * scaledRadius,
    y: center + Math.sin(angle) * scaledRadius,
  };
}

function radarGridPolygon(total, value, radius = 74, center = 100) {
  return Array.from({ length: total }, (_, index) => {
    const point = radarPoint(index, total, value, radius, center);
    return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }).join(" ");
}

function buildRadarItems(pool, player, metrics) {
  return metrics.map(([column, label, type, lowerIsBetter = false]) => {
    const values = pool.map((candidate) => candidate[column]);
    const percentile = percentileFor(values, player[column], lowerIsBetter);
    return {
      label,
      value: formatValue(player[column], type),
      score: percentile === null ? 0 : percentile,
      scoreText: percentile === null ? "-" : Math.round(percentile).toString(),
    };
  });
}

function radarChartSvg(items, title) {
  const total = items.length;
  const rings = [20, 40, 60, 80, 100]
    .map((value) => `<polygon points="${radarGridPolygon(total, value)}" />`)
    .join("");
  const axes = items
    .map((_, index) => {
      const point = radarPoint(index, total, 100);
      return `<line x1="100" y1="100" x2="${point.x.toFixed(1)}" y2="${point.y.toFixed(1)}" />`;
    })
    .join("");
  const points = items.map((item, index) => radarPoint(index, total, item.score));
  const polygon = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const dots = points
    .map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.2" />`)
    .join("");

  return `
    <svg class="radar-svg" viewBox="0 0 200 200" role="img" aria-label="${escapeHtml(title)} 방사형 그래프">
      <g class="radar-grid-lines">${rings}${axes}</g>
      <polygon class="radar-fill" points="${polygon}" />
      <polyline class="radar-stroke" points="${polygon} ${polygon.split(" ")[0]}" />
      <g class="radar-dots">${dots}</g>
    </svg>
  `;
}

function radarLegend(items) {
  return `
    <div class="radar-legend">
      ${items
        .map(
          (item) => `
            <div class="radar-legend-row">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.scoreText)}</strong>
              <small>${escapeHtml(item.value)}</small>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderRadarCharts(pool, player) {
  return `
    <div class="radar-grid">
      ${POSITION_RADARS.map((radar) => {
        const items = buildRadarItems(pool, player, radar.metrics);
        return `
          <article class="radar-card">
            <div class="radar-card-header">
              <h4>${escapeHtml(radar.title)}</h4>
              <span>percentile</span>
            </div>
            ${radarChartSvg(items, radar.title)}
            ${radarLegend(items)}
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderCandidates(candidates) {
  candidatesEl.innerHTML = "";
  if (!candidates.length) return;

  const fragment = document.createDocumentFragment();
  candidates.forEach((candidate) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "candidate";
    button.dataset.playerId = candidate.player_id;
    button.innerHTML = `
      <strong>${escapeHtml(candidate.player_name)}</strong>
      <span>${escapeHtml(candidate.teams || candidate.team_name)} · ${escapeHtml(candidate.positions || candidate.position)} · ${escapeHtml(candidate.seasons)}</span>
      <span>${Number(candidate.appearances).toLocaleString()}경기 · ${Number(candidate.minutes).toLocaleString()}분 · 평균 평점 ${formatValue(candidate.avg_rating, "raw")}</span>
    `;
    button.addEventListener("click", () => analyzePlayer(candidate));
    fragment.appendChild(button);
  });
  candidatesEl.appendChild(fragment);
}

function renderEmptyReport(message) {
  reportEl.classList.add("is-empty");
  reportEl.innerHTML = `
    <div class="empty-state">
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function metricGrid(items) {
  return `
    <div class="metric-grid">
      ${items
        .map(
          (item) => `
            <div class="metric">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.value)}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function metricCards(items, emptyText, extraClass = "") {
  return items.length
    ? items
        .map(
          (item) => `
            <div class="strength-card ${extraClass}">
              <span class="metric-title">${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.value)}</strong>
              <small>${escapeHtml(item.metaText)}</small>
            </div>
          `,
        )
        .join("")
    : `<div class="strength-card ${extraClass}"><span>${escapeHtml(emptyText)}</span></div>`;
}

function renderReport(player, pool, strengths, weaknesses) {
  const strengthCards = strengths.length
    ? metricCards(strengths, "상위권으로 잡힌 지표가 없습니다.")
    : metricCards([], "상위권으로 잡힌 지표가 없습니다.");
  const weaknessCards = metricCards(weaknesses, "하위권으로 잡힌 지표가 없습니다.", "weakness-card");

  reportEl.classList.remove("is-empty");
  reportEl.innerHTML = `
    <div class="report-grid">
      <div class="summary-band">
        <div class="summary-main">
          <h2>${escapeHtml(player.player_name)}</h2>
          <p>${escapeHtml(player.teams || player.team_name)} · ${escapeHtml(player.positions || player.position)} · ${escapeHtml(player.seasons)}</p>
          <p>${escapeHtml(player.competitions)}</p>
        </div>
        <div class="stat-box"><span>Apps</span><strong>${Number(player.appearances).toLocaleString()}</strong></div>
        <div class="stat-box"><span>Minutes</span><strong>${Number(player.minutes).toLocaleString()}</strong></div>
        <div class="stat-box"><span>Pool</span><strong>${pool.length.toLocaleString()}</strong></div>
        <div class="stat-box"><span>Rating</span><strong>${formatValue(player.avg_rating, "raw")}</strong></div>
      </div>

      <section class="section-block">
        <div class="section-header">
          <h3>상위권 강점 지표</h3>
          <span>같은 시즌/대회/포지션, ${Number(minutesInput.value).toLocaleString()}분 이상 비교</span>
        </div>
        <div class="strength-grid">${strengthCards}</div>
      </section>

      <section class="section-block">
        <div class="section-header">
          <h3>하위권 보완 지표</h3>
          <span>좋은 쪽 하위 30% 이내 지표</span>
        </div>
        <div class="strength-grid weakness-grid">${weaknessCards}</div>
      </section>

      <section class="section-block">
        <div class="section-header">
          <h3>포지션별 방사형 그래프</h3>
          <span>같은 비교군 안에서 각 지표의 백분위 점수</span>
        </div>
        ${renderRadarCharts(pool, player)}
      </section>

      <section class="section-block">
        <div class="section-header"><h3>공격/전개</h3></div>
        ${metricGrid(metricItems(ATTACKING, player))}
      </section>

      <section class="section-block">
        <div class="section-header"><h3>수비/안정성</h3></div>
        ${metricGrid(metricItems(DEFENSIVE, player))}
      </section>

      <section class="section-block">
        <div class="section-header"><h3>CSV 데이터 범위</h3></div>
        <div class="metric-grid">
          <div class="metric"><span>첫 경기</span><strong>${escapeHtml(player.first_match_date || "-")}</strong></div>
          <div class="metric"><span>마지막 경기</span><strong>${escapeHtml(player.last_match_date || "-")}</strong></div>
          <div class="metric"><span>선발</span><strong>${Number(player.starts || 0).toLocaleString()}</strong></div>
          <div class="metric"><span>주장 경기</span><strong>${Number(player.captain_matches || 0).toLocaleString()}</strong></div>
        </div>
      </section>
    </div>
  `;
}

function analyzePlayer(rawPlayer) {
  const player = enrichPlayer(rawPlayer);
  const minMinutes = Number(minutesInput.value) || 900;
  let pool = comparisonPool(player, minMinutes);
  if (!pool.some((candidate) => String(candidate.player_id) === String(player.player_id))) {
    pool = [...pool, player];
  }
  const strengths = buildStrengths(pool, player);
  const weaknesses = buildWeaknesses(pool, player);
  renderReport(player, pool, strengths, weaknesses);
  setStatus(`${player.player_name} 리포트를 표시했습니다.`);
}

function analyzeByQuery(query) {
  const candidates = searchCandidates(query, SEARCH_LIMIT);
  renderCandidates(candidates);
  if (!candidates.length) {
    renderEmptyReport("검색 후보가 없습니다.");
    setStatus("후보가 없습니다. 영문 이름 일부를 다시 입력해보세요.", "error");
    return;
  }

  const exact = candidates.filter((candidate) => normalizeText(candidate.player_name) === normalizeText(query));
  if (exact.length === 1) {
    analyzePlayer(exact[0]);
    return;
  }

  if (candidates.length === 1 && candidates[0].match_score >= 90) {
    analyzePlayer(candidates[0]);
    return;
  }

  renderEmptyReport("후보 중 한 명을 선택하면 리포트가 표시됩니다.");
  setStatus("이름이 애매합니다. 후보 중 한 명을 선택하세요.");
}

function searchPlayers(query) {
  if (!query.trim()) {
    candidatesEl.innerHTML = "";
    setStatus("이름을 입력하면 CSV에서 후보를 추립니다.");
    return;
  }

  const candidates = searchCandidates(query, SEARCH_LIMIT);
  renderCandidates(candidates);
  if (candidates.length === 0) {
    setStatus("후보가 없습니다. 이름 일부나 영문 철자를 조금 바꿔보세요.");
  } else if (candidates.length === 1) {
    setStatus("후보 1명이 잡혔습니다. 분석 버튼을 누르거나 후보를 선택하세요.");
  } else {
    setStatus(`후보 ${candidates.length}명이 잡혔습니다. 원하는 선수를 선택하세요.`);
  }
}

queryInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => searchPlayers(queryInput.value), 180);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  analyzeByQuery(queryInput.value);
});

analyzeButton.addEventListener("click", () => {
  analyzeByQuery(queryInput.value);
});

async function init() {
  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) throw new Error(`CSV를 불러오지 못했습니다: ${response.status}`);
    const text = await response.text();
    players = parseCsv(text).map(enrichPlayer);
    setStatus(`${players.length.toLocaleString()}명의 선수 데이터를 불러왔습니다.`);
    searchPlayers(queryInput.value);
  } catch (error) {
    renderEmptyReport("player_rows.csv를 찾을 수 없습니다.");
    setStatus(error.message, "error");
  }
}

init();
