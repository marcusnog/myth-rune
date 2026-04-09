import {
  buildProgressionSnapshot,
  defaultStarterRunesForClass,
  isRuneUnlocked,
  type CharacterClassId,
  DEFAULT_EQUIPMENT,
  isEquippableItem,
  slotForItem,
  type EquipmentLoadout,
  type ProgressionSnapshot,
  type RuneId,
} from "@myth-of-rune/shared";

export interface PlayerProgressionState {
  experience: number;
  equippedRunes: Array<RuneId | null>;
  equipment: EquipmentLoadout;
}

export function createInitialProgression(
  characterClass: CharacterClassId,
): PlayerProgressionState {
  return {
    experience: 0,
    equippedRunes: defaultStarterRunesForClass(characterClass),
    equipment: { ...DEFAULT_EQUIPMENT },
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
    state.equipment,
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

export function equipItem(
  characterClass: CharacterClassId,
  state: PlayerProgressionState,
  slot: "weapon" | "armour",
  itemId: string | null,
): { ok: boolean; message: string; snapshot: ProgressionSnapshot } {
  if (itemId === null) {
    state.equipment = { ...state.equipment, [slot]: null };
    return {
      ok: true,
      message: "Item removido.",
      snapshot: snapshotPlayerProgression(characterClass, state),
    };
  }
  if (!isEquippableItem(itemId)) {
    return {
      ok: false,
      message: "Esse item nao pode ser equipado.",
      snapshot: snapshotPlayerProgression(characterClass, state),
    };
  }
  const expectedSlot = slotForItem(itemId);
  if (expectedSlot !== slot) {
    return {
      ok: false,
      message: "Slot invalido para este item.",
      snapshot: snapshotPlayerProgression(characterClass, state),
    };
  }
  state.equipment = { ...state.equipment, [slot]: itemId };
  return {
    ok: true,
    message: "Item equipado.",
    snapshot: snapshotPlayerProgression(characterClass, state),
  };
}
