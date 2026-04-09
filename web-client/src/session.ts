import type { AuthResponse } from "@myth-of-rune/shared";

export interface ClientSession {
  token: string;
  characterId: string;
  characterName: string;
  characterClass: string;
}

export function sessionFromAuthResponse(auth: AuthResponse): ClientSession {
  return {
    token: auth.token,
    characterId: auth.character.id,
    characterName: auth.character.name,
    characterClass: auth.character.characterClass,
  };
}
