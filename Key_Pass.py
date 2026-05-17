from __future__ import annotations

import csv
import math
from dataclasses import dataclass
from pathlib import Path


DATA_PATH = Path(__file__).with_name("data") / "player_matches.csv"
MIN_TOTAL_MINUTES = 180
MIN_KEY_PASSES_PER_90 = 0.3
Z_VALUE = 1.959963984540054


@dataclass
class PlayerTotals:
	player_id: str
	player_name: str
	minutes_played: int = 0
	key_passes: int = 0
	matches: int = 0

	@property
	def key_passes_per_90(self) -> float:
		if self.minutes_played == 0:
			return 0.0
		return self.key_passes * 90 / self.minutes_played


def wilson_interval(successes: int, trials: int, z: float = Z_VALUE) -> tuple[float, float]:
	if trials <= 0:
		raise ValueError("trials must be positive")

	p_hat = successes / trials
	z2 = z * z
	denom = 1 + z2 / trials
	center = (p_hat + z2 / (2 * trials)) / denom
	margin = z * math.sqrt((p_hat * (1 - p_hat) / trials) + (z2 / (4 * trials * trials))) / denom
	lower = max(0.0, center - margin)
	upper = min(1.0, center + margin)
	return lower, upper


def load_player_totals(path: Path) -> dict[str, PlayerTotals]:
	totals: dict[str, PlayerTotals] = {}

	with path.open("r", encoding="utf-8-sig", newline="") as handle:
		reader = csv.DictReader(handle)
		for row in reader:
			player_id = row["player_id"]
			player = totals.get(player_id)
			if player is None:
				player = PlayerTotals(
					player_id=player_id,
					player_name=row["player_name"],
				)
				totals[player_id] = player

			player.minutes_played += int(float(row["minutes_played"] or 0))
			player.key_passes += int(float(row["key_passes"] or 0))
			player.matches += 1

	return totals


def main() -> None:
	player_totals = load_player_totals(DATA_PATH)

	eligible_players = [
		player
		for player in player_totals.values()
		if player.minutes_played >= MIN_TOTAL_MINUTES
		and player.key_passes_per_90 >= MIN_KEY_PASSES_PER_90
	]

	total_minutes = sum(player.minutes_played for player in eligible_players)
	total_key_passes = sum(player.key_passes for player in eligible_players)

	if total_minutes == 0:
		raise RuntimeError("No players matched the filter criteria.")

	p_hat = total_key_passes / total_minutes
	lower, upper = wilson_interval(total_key_passes, total_minutes)

	print(f"eligible players: {len(eligible_players)}")
	print(f"total minutes: {total_minutes}")
	print(f"total key passes: {total_key_passes}")
	print(f"p = key_passes / minutes_played: {p_hat:.8f}")
	print(f"95% Wilson CI: [{lower:.8f}, {upper:.8f}]")
	print(f"per 90: {p_hat * 90:.4f}")
	print(f"95% Wilson CI per 90: [{lower * 90:.4f}, {upper * 90:.4f}]")


if __name__ == "__main__":
	main()
