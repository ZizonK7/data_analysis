import argparse
import json
import sqlite3
from difflib import SequenceMatcher
from pathlib import Path

import pandas as pd


DB_PATH = Path("data") / "sofascore.db"
DEFAULT_PLAYER = "Reece James"
MIN_MINUTES = 900
SEARCH_LIMIT = 12

BASE_COLUMNS = [
    "goals",
    "assists",
    "total_shots",
    "shots_on_target",
    "blocked_shots",
    "expected_goals",
    "expected_assists",
    "key_passes",
    "accurate_passes",
    "total_passes",
    "accurate_long_balls",
    "total_long_balls",
    "accurate_crosses",
    "total_crosses",
    "dribble_attempts",
    "successful_dribbles",
    "dribbled_past",
    "possession_lost",
    "total_touches",
    "duels_won",
    "duels_lost",
    "aerial_duels_won",
    "aerial_duels_lost",
    "tackles",
    "interceptions",
    "clearances",
    "saves",
    "yellow_cards",
    "red_cards",
    "big_chances_created",
    "fouls_committed",
    "fouls_drawn",
    "errors_leading_to_shot",
    "errors_leading_to_goal",
]

# SofaScore's useful defensive/player-detail stats are present in extra_data even
# when the normalized DB columns are empty. Values here are copied into the
# standard column names only when the standard column is missing for that row.
EXTRA_DATA_MAP = {
    "totalPass": "total_passes",
    "accuratePass": "accurate_passes",
    "keyPass": "key_passes",
    "totalCross": "total_crosses",
    "accurateCross": "accurate_crosses",
    "totalContest": "dribble_attempts",
    "wonContest": "successful_dribbles",
    "dispossessed": "possession_lost",
    "touches": "total_touches",
    "duelWon": "duels_won",
    "duelLost": "duels_lost",
    "aerialWon": "aerial_duels_won",
    "aerialLost": "aerial_duels_lost",
    "totalTackle": "tackles",
    "interceptionWon": "interceptions",
    "totalClearance": "clearances",
    "saves": "saves",
    "errorLeadToAShot": "errors_leading_to_shot",
    "errorLeadToAGoal": "errors_leading_to_goal",
}

METRICS = [
    ("avg_rating", "평균 평점", "rating", "raw", False),
    ("goal_contributions_p90", "공격포인트", "per 90", "per90", False),
    ("expected_goal_contributions_p90", "xG+xA", "per 90", "per90", False),
    ("expected_assists_p90", "xA", "per 90", "per90", False),
    ("key_passes_p90", "키패스", "per 90", "per90", False),
    ("big_chances_created_p90", "빅찬스 생성", "per 90", "per90", False),
    ("accurate_crosses_p90", "정확한 크로스", "per 90", "per90", False),
    ("cross_accuracy", "크로스 성공률", "%", "percent", False),
    ("accurate_long_balls_p90", "정확한 롱볼", "per 90", "per90", False),
    ("long_ball_accuracy", "롱볼 성공률", "%", "percent", False),
    ("successful_dribbles_p90", "성공 드리블", "per 90", "per90", False),
    ("dribble_success_rate", "드리블 성공률", "%", "percent", False),
    ("total_passes_p90", "패스", "per 90", "per90", False),
    ("pass_accuracy", "패스 성공률", "%", "percent", False),
    ("total_touches_p90", "터치", "per 90", "per90", False),
    ("duels_won_p90", "경합 승리", "per 90", "per90", False),
    ("duel_win_rate", "경합 승률", "%", "percent", False),
    ("aerial_duels_won_p90", "공중 경합 승리", "per 90", "per90", False),
    ("aerial_duel_win_rate", "공중 경합 승률", "%", "percent", False),
    ("tackles_p90", "태클", "per 90", "per90", False),
    ("interceptions_p90", "인터셉트", "per 90", "per90", False),
    ("clearances_p90", "클리어런스", "per 90", "per90", False),
    ("defensive_actions_p90", "태클+인터셉트", "per 90", "per90", False),
    ("errors_p90", "실수로 인한 슈팅/골", "per 90", "per90", True),
    ("fouls_committed_p90", "파울", "per 90", "per90", True),
]


def read_player_stats(conn: sqlite3.Connection) -> pd.DataFrame:
    columns = ", ".join(f"p.{column}" for column in BASE_COLUMNS)
    query = f"""
        SELECT
            p.player_id,
            p.player_name,
            p.team_id,
            p.team_name,
            p.is_home,
            p.position,
            p.shirt_number,
            p.is_starter,
            p.minutes_played,
            p.rating,
            p.extra_data,
            {columns},
            m.event_id,
            m.competition,
            m.season,
            m.match_date,
            m.home_team,
            m.away_team,
            m.home_score,
            m.away_score
        FROM player_match_stats p
        JOIN matches m ON p.event_id = m.event_id
        WHERE p.minutes_played > 0
    """
    df = pd.read_sql_query(query, conn)
    return apply_extra_data_stats(df)


def extra_number(extra: dict, key: str):
    value = extra.get(key)
    if value is None:
        return pd.NA
    try:
        return float(value)
    except (TypeError, ValueError):
        return pd.NA


def apply_extra_data_stats(df: pd.DataFrame) -> pd.DataFrame:
    parsed = []
    for text in df["extra_data"].fillna(""):
        if not text:
            parsed.append({})
            continue
        try:
            parsed.append(json.loads(text))
        except json.JSONDecodeError:
            parsed.append({})

    for extra_key, column in EXTRA_DATA_MAP.items():
        values = pd.Series([extra_number(extra, extra_key) for extra in parsed], index=df.index)
        df[column] = pd.to_numeric(df[column], errors="coerce")
        df[column] = df[column].where(df[column].notna(), pd.to_numeric(values, errors="coerce"))

    return df


def normalize_text(value: str) -> str:
    return " ".join(str(value).lower().strip().split())


def name_match_score(query: str, player_name: str) -> float:
    normalized_query = normalize_text(query)
    normalized_name = normalize_text(player_name)
    query_parts = normalized_query.split()

    if not normalized_query:
        return 0
    if normalized_query == normalized_name:
        return 120
    if normalized_query in normalized_name:
        return 100 + len(normalized_query) / max(len(normalized_name), 1)
    if all(part in normalized_name for part in query_parts):
        return 90 + sum(len(part) for part in query_parts) / max(len(normalized_name), 1)

    name_parts = normalized_name.split()
    token_score = max(
        (SequenceMatcher(None, part, name_part).ratio() for part in query_parts for name_part in name_parts),
        default=0,
    )
    full_score = SequenceMatcher(None, normalized_query, normalized_name).ratio()
    return max(token_score, full_score) * 80


def joined_unique(values: pd.Series, separator: str = ", ") -> str:
    return separator.join(sorted(str(value) for value in values.dropna().unique() if str(value)))


def player_summary(df: pd.DataFrame) -> pd.DataFrame:
    summary = (
        df.groupby(["player_id", "player_name"], as_index=False)
        .agg(
            teams=("team_name", joined_unique),
            positions=("position", lambda values: joined_unique(values, "/")),
            seasons=("season", joined_unique),
            competitions=("competition", joined_unique),
            matches=("event_id", "count"),
            minutes=("minutes_played", "sum"),
            avg_rating=("rating", "mean"),
        )
        .sort_values(["minutes", "matches"], ascending=False)
    )
    return summary


def search_player_candidates(df: pd.DataFrame, query: str, limit: int = SEARCH_LIMIT) -> pd.DataFrame:
    summary = player_summary(df)
    summary["match_score"] = summary["player_name"].map(lambda name: name_match_score(query, name))
    candidates = summary[summary["match_score"] >= 45].copy()
    if candidates.empty:
        return candidates

    strong_candidates = candidates[candidates["match_score"] >= 90]
    if not strong_candidates.empty:
        candidates = strong_candidates

    candidates = candidates.sort_values(
        ["match_score", "minutes", "matches"], ascending=[False, False, False]
    ).head(limit)
    candidates.insert(0, "no", range(1, len(candidates) + 1))
    return candidates


def print_player_candidates(candidates: pd.DataFrame, query: str) -> None:
    print_section(f"'{query}' 선수 검색 후보")
    if candidates.empty:
        print("검색 후보가 없습니다. 철자를 조금 더 짧게 넣거나 성/이름 일부만 입력해보세요.")
        return

    view = candidates[
        ["no", "player_id", "player_name", "teams", "positions", "seasons", "matches", "minutes", "avg_rating"]
    ].copy()
    view["avg_rating"] = view["avg_rating"].map(lambda value: f"{value:.2f}" if pd.notna(value) else "-")
    print(view.to_string(index=False))
    print("\n원하는 선수가 애매하면 player_id로 지정하세요.")
    print("예: python instant.py --player-id 885908")


def find_player_id(df: pd.DataFrame, player_name: str, player_id: int | None, limit: int) -> int:
    if player_id is not None:
        if player_id not in set(df["player_id"]):
            raise ValueError(f"player_id={player_id} 선수를 DB에서 찾지 못했습니다.")
        return player_id

    candidates = search_player_candidates(df, player_name, limit)
    if candidates.empty:
        raise ValueError(f"'{player_name}' 선수를 DB에서 찾지 못했습니다.")

    exact = candidates[candidates["player_name"].map(normalize_text) == normalize_text(player_name)]
    if len(exact) == 1:
        return int(exact.iloc[0]["player_id"])
    if len(candidates) == 1 and float(candidates.iloc[0]["match_score"]) >= 90:
        return int(candidates.iloc[0]["player_id"])

    print_player_candidates(candidates, player_name)
    raise SystemExit("\n후보가 여러 명이라 자동 선택하지 않았습니다. --player-id로 한 명을 골라 다시 실행하세요.")


def sum_min_count(values: pd.Series):
    numeric = pd.to_numeric(values, errors="coerce")
    return numeric.sum(min_count=1)


def safe_divide(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    return numerator.div(denominator.where(denominator != 0))


def aggregate_players(df: pd.DataFrame) -> pd.DataFrame:
    aggregations = {
        "player_name": "first",
        "team_name": "last",
        "position": lambda values: joined_unique(values, "/"),
        "competition": joined_unique,
        "season": joined_unique,
        "event_id": "count",
        "minutes_played": "sum",
        "is_starter": "sum",
        "rating": "mean",
    }
    aggregations.update({column: sum_min_count for column in BASE_COLUMNS})

    grouped = df.groupby("player_id", as_index=False).agg(aggregations)
    grouped = grouped.rename(
        columns={
            "event_id": "matches",
            "minutes_played": "minutes",
            "is_starter": "starts",
            "rating": "avg_rating",
        }
    )

    minutes = grouped["minutes"]
    grouped["goal_contributions"] = grouped[["goals", "assists"]].fillna(0).sum(axis=1)
    grouped["expected_goal_contributions"] = grouped[["expected_goals", "expected_assists"]].fillna(0).sum(axis=1)

    for column in BASE_COLUMNS + ["goal_contributions", "expected_goal_contributions"]:
        grouped[f"{column}_p90"] = pd.to_numeric(grouped[column], errors="coerce") * 90 / minutes

    grouped["defensive_actions_p90"] = grouped[["tackles_p90", "interceptions_p90"]].sum(axis=1, min_count=1)
    grouped["errors_p90"] = grouped[["errors_leading_to_shot_p90", "errors_leading_to_goal_p90"]].sum(
        axis=1, min_count=1
    )
    grouped["pass_accuracy"] = safe_divide(grouped["accurate_passes"], grouped["total_passes"]) * 100
    grouped["cross_accuracy"] = safe_divide(grouped["accurate_crosses"], grouped["total_crosses"]) * 100
    grouped["long_ball_accuracy"] = safe_divide(grouped["accurate_long_balls"], grouped["total_long_balls"]) * 100
    grouped["dribble_success_rate"] = safe_divide(grouped["successful_dribbles"], grouped["dribble_attempts"]) * 100
    grouped["duel_win_rate"] = safe_divide(grouped["duels_won"], grouped["duels_won"] + grouped["duels_lost"]) * 100
    grouped["aerial_duel_win_rate"] = (
        safe_divide(grouped["aerial_duels_won"], grouped["aerial_duels_won"] + grouped["aerial_duels_lost"]) * 100
    )

    return grouped


def is_valid(value) -> bool:
    return pd.notna(value)


def percentile_for(series: pd.Series, value: float, lower_is_better: bool) -> float:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    if clean.empty or pd.isna(value):
        return float("nan")
    if lower_is_better:
        return (clean.ge(value).sum() / len(clean)) * 100
    return (clean.le(value).sum() / len(clean)) * 100


def rank_for(series: pd.Series, value: float, lower_is_better: bool) -> int:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    if lower_is_better:
        return int(clean.lt(value).sum() + 1)
    return int(clean.gt(value).sum() + 1)


def format_value(value: float, metric_type: str) -> str:
    if pd.isna(value):
        return "-"
    if metric_type == "percent":
        return f"{value:.1f}%"
    return f"{value:.2f}"


def build_metric_table(pool: pd.DataFrame, player_row: pd.Series, mode: str) -> pd.DataFrame:
    rows = []
    for column, label, unit, metric_type, lower_is_better in METRICS:
        value = player_row.get(column)
        if not is_valid(value):
            continue
        if mode == "strength" and not lower_is_better and metric_type != "raw" and float(value) <= 0:
            continue

        valid_pool = pool[["player_id", column]].dropna()
        if len(valid_pool) < 5:
            continue

        percentile = percentile_for(valid_pool[column], value, lower_is_better)
        rank = rank_for(valid_pool[column], value, lower_is_better)
        if pd.isna(percentile):
            continue

        if mode == "strength" and percentile < 70:
            continue
        if mode == "weakness" and percentile > 30:
            continue

        rows.append(
            {
                "지표": label,
                "값": format_value(value, metric_type),
                "단위/순위": f"{unit} · {rank}/{len(valid_pool)}",
                "좋은쪽백분위": percentile,
                "raw_value": value,
            }
        )

    table = pd.DataFrame(rows)
    if table.empty:
        return table
    if mode == "strength":
        table = table.sort_values(["좋은쪽백분위", "raw_value"], ascending=[False, False])
        table["구간"] = table["좋은쪽백분위"].map(lambda value: f"상위 {100 - value:.1f}%")
    else:
        table = table.sort_values(["좋은쪽백분위", "raw_value"], ascending=[True, True]).head(8)
        table["구간"] = table["좋은쪽백분위"].map(lambda value: f"하위 {value:.1f}%")
    return table[["지표", "값", "단위/순위", "구간"]]


def print_section(title: str) -> None:
    print("\n" + "=" * 80)
    print(title)
    print("=" * 80)


def print_metric_block(title: str, metrics: list[tuple[str, str, str]], player_row: pd.Series) -> None:
    print_section(title)
    for label, column, metric_type in metrics:
        print(f"{label:18s}: {format_value(player_row[column], metric_type)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="sofascore.db extra_data까지 사용해 선수 강점/보완 지표를 분석합니다.")
    parser.add_argument("query", nargs="?", help="분석할 선수 이름. 예: reece james")
    parser.add_argument("--player", default=DEFAULT_PLAYER, help="분석할 선수 이름")
    parser.add_argument("--player-id", type=int, help="동명이인/유사 이름이 있을 때 player_id로 직접 지정")
    parser.add_argument("--search", help="분석하지 않고 선수 후보만 검색합니다")
    parser.add_argument("--db", default=str(DB_PATH), help="SQLite DB 경로")
    parser.add_argument("--min-minutes", type=int, default=MIN_MINUTES, help="비교군 최소 출전 시간")
    parser.add_argument("--limit", type=int, default=SEARCH_LIMIT, help="검색 후보 표시 개수")
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        raise FileNotFoundError(f"DB 파일이 없습니다: {db_path}")

    with sqlite3.connect(db_path) as conn:
        stats = read_player_stats(conn)

    if args.search:
        print_player_candidates(search_player_candidates(stats, args.search, args.limit), args.search)
        return

    player_name = args.query or args.player
    player_id = find_player_id(stats, player_name, args.player_id, args.limit)
    player_matches = stats[stats["player_id"] == player_id].copy()
    seasons = sorted(player_matches["season"].dropna().unique())
    competitions = sorted(player_matches["competition"].dropna().unique())
    positions = sorted(player_matches["position"].dropna().unique())

    comparison_matches = stats[
        stats["season"].isin(seasons)
        & stats["competition"].isin(competitions)
        & stats["position"].isin(positions)
    ].copy()

    aggregated = aggregate_players(comparison_matches)
    pool = aggregated[aggregated["minutes"] >= args.min_minutes].copy()
    if player_id not in set(pool["player_id"]):
        pool = pd.concat([pool, aggregated[aggregated["player_id"] == player_id]], ignore_index=True).drop_duplicates(
            "player_id"
        )

    player_row = aggregated[aggregated["player_id"] == player_id].iloc[0]

    print_section(f"{player_row['player_name']} 분석")
    print(f"팀: {player_row['team_name']}")
    print(f"포지션: {player_row['position']}")
    print(f"대회: {', '.join(competitions)}")
    print(f"시즌: {', '.join(seasons)}")
    print(f"출전: {int(player_row['matches'])}경기 / {int(player_row['minutes'])}분")
    print(f"비교군: 같은 시즌/대회/포지션, {args.min_minutes}+분 출전 선수 {len(pool)}명")
    print("수비 지표 출처: player_match_stats.extra_data JSON")

    strengths = build_metric_table(pool, player_row, "strength")
    print_section("상위권 강점 지표")
    print(strengths.to_string(index=False) if not strengths.empty else "상위권으로 잡힌 지표가 없습니다.")

    weaknesses = build_metric_table(pool, player_row, "weakness")
    print_section("하위권 보완 지표")
    print(weaknesses.to_string(index=False) if not weaknesses.empty else "하위권으로 잡힌 지표가 없습니다.")

    print_metric_block(
        "공격/전개",
        [
            ("평균 평점", "avg_rating", "raw"),
            ("공격포인트/90", "goal_contributions_p90", "per90"),
            ("xG+xA/90", "expected_goal_contributions_p90", "per90"),
            ("xA/90", "expected_assists_p90", "per90"),
            ("키패스/90", "key_passes_p90", "per90"),
            ("정확한 크로스/90", "accurate_crosses_p90", "per90"),
            ("크로스 성공률", "cross_accuracy", "percent"),
            ("터치/90", "total_touches_p90", "per90"),
        ],
        player_row,
    )

    print_metric_block(
        "수비/안정성",
        [
            ("태클/90", "tackles_p90", "per90"),
            ("인터셉트/90", "interceptions_p90", "per90"),
            ("클리어런스/90", "clearances_p90", "per90"),
            ("태클+인터셉트/90", "defensive_actions_p90", "per90"),
            ("경합 승리/90", "duels_won_p90", "per90"),
            ("경합 승률", "duel_win_rate", "percent"),
            ("공중 경합 승리/90", "aerial_duels_won_p90", "per90"),
            ("공중 경합 승률", "aerial_duel_win_rate", "percent"),
            ("파울/90", "fouls_committed_p90", "per90"),
            ("실수로 인한 슈팅/골/90", "errors_p90", "per90"),
        ],
        player_row,
    )


if __name__ == "__main__":
    main()
