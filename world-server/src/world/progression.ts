import {
  buildProgressionSnapshot,
  defaultStarterRunesForClass,
  isRuneUnlocked,
  type CharacterClassId,
  type ProgressionSnapshot,
  type RuneId,
} from "@myth-of-rune/shared";

export interface PlayerProgressionState {
  experience: number;
  equippedRunes: Array<RuneId | null>;
}

export function createInitialProgression(
  characterClass: CharacterClassId,
): PlayerProgressionState {
  return {
    experience: 0,
    equippedRunes: defaultStarterRunesForClass(characterClass),
  };
}

export function snapshotPlayerProgression(
  characterClass: CharacterClassId,
  state: PlayerProgressionState,
  currentHealth?: number,
): ProgressionSnapshot {
  return buildProgressionSnapshot(
    characterClass,
    state.experience,
    state.equippedRunes,
    currentHealth,
  );
}

export function grantExperience(
  characterClass: CharacterClassId,
  state: PlayerProgressionState,
  amount: number,
): {
  snapshot: ProgressionSnapshot;
  previousLevel: number;
  levelChanged: boolean;
} {
  const before = snapshotPlayerProgression(characterClass, state);
  state.experience = Math.max(0, state.experience + Math.max(0, Math.floor(amount)));
  const after = snapshotPlayerProgression(characterClass, state);
  return {
    snapshot: after,
    previousLevel: before.level,
    levelChanged: after.level !== before.level,
  };
}

export function equipRune(
  characterClass: CharacterClassId,
  state: PlayerProgressionState,
  slotIndex: number,
  runeId: RuneId | null,
): { ok: boolean; message: string; snapshot: ProgressionSnapshot } {
  const snapshot = snapshotPlayerProgression(characterClass, state);
  if (slotIndex < 0 || slotIndex >= state.equippedRunes.length) {
    return { ok: false, message: "Slot de runa invalido.", snapshot };
  }

  if (runeId === null) {
    state.equippedRunes[slotIndex] = null;
    return {
      ok: true,
      message: "Runa removida.",
      snapshot: snapshotPlayerProgression(characterClass, state),
    };
  }

  if (!isRuneUnlocked(runeId, snapshot.level)) {
    return {
      ok: false,
      message: "Essa runa ainda nao foi desbloqueada.",
      snapshot,
    };
  }

  const existingIndex = state.equippedRunes.findIndex((entry) => entry === runeId);
  if (existingIndex >= 0) {
    state.equippedRunes[existingIndex] = null;
  }
  state.equippedRunes[slotIndex] = runeId;

  return {
    ok: true,
    message: "Runa equipada.",
    snapshot: snapshotPlayerProgression(characterClass, state),
  };
}
