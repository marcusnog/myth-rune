# Combat Validation Checklist (Phase 4)

## Server Unit Tests

Run:

```bash
npm run test -w world-server
```

Coverage in automated tests:

- Attack rejects when target is out of range.
- Attack rejects when cooldown is active.
- Attack can kill mob and removes mob from state.
- Simultaneous mob hits are blocked by mob invulnerability window.
- Mob telegraph delays hit and damage uses player defense.
- Parallel mob attacks respect player post-hit invulnerability window.
- Multiplayer burst (many attackers on one mob in same timestamp) yields one damaging hit window.
- Telegraph keeps the initially chosen target even when nearest target changes mid-windup.
- Mob disengages and returns to spawn after crossing leash distance.

## Manual Multiplayer Checklist

Environment:

- Start backend services (`npm run dev` in project root).
- Open two game clients connected to the same world map.

### 1. Local Attack

- Attack a nearby mob.
- Confirm damage popup appears only when server confirms `combat_event`.
- Confirm no immediate local-only damage is applied when target is invalid.

### 2. Remote Attack Visibility

- From Client A, attack a mob.
- On Client B, confirm attack animation and mob hurt/death feedback are visible.
- Confirm both clients converge to same mob state after death.

### 3. Out-of-Range / Cooldown / Missing Target Feedback

- Attack while out of range and confirm rejection feedback appears.
- Spam attack and confirm cooldown rejection feedback appears.
- Try attacking when no valid mob exists and confirm missing-target feedback appears.

### 4. Player Damage Intake

- Let mob hit player.
- Confirm HP update and damage popup happen once per hit window.
- Confirm there is no stunlock feeling (brief post-hit invulnerability).

### 5. Death Flow

- Kill a mob and confirm:
  - Death animation plays before removal.
  - Mob is removed once on all clients.
  - No extra hits after death.

### 6. AI Behavior

- Enter mob detection range and confirm chase starts.
- Exit far enough and confirm mob leashes/returns to spawn area.
- Observe telegraph pause before mob hit lands.

## Acceptance Criteria

- No damage applied outside valid server range.
- No multiple hits from a single swing window.
- Animation and damage perceived in the same combat beat.
- Client and server stay in sync on target health and death outcome.
