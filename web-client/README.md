# Web Client (Phaser + TypeScript)

Client web para substituir o fluxo Godot com o mesmo backend existente.

## Scripts

- `npm run dev -w web-client` inicia Vite (http://localhost:5173)
- `npm run build -w web-client` gera build de produção
- `npm run preview -w web-client` serve build local

## Configuração

Variáveis opcionais (Vite):

- `VITE_GATEWAY_HTTP_URL` (default: `http://127.0.0.1:3000`)
- `VITE_GATEWAY_WS_URL` (default: `ws://127.0.0.1:3000/ws`)

Exemplo:

```bash
VITE_GATEWAY_HTTP_URL=http://127.0.0.1:3000 VITE_GATEWAY_WS_URL=ws://127.0.0.1:3000/ws npm run dev -w web-client
```

## Escopo atual

- Login HTTP em `/auth/login`
- Conexão WebSocket no world (`/ws?token=...`)
- Movimento local + sync de players/mobs
- Ataque básico com seleção de alvo (in-range + fallback nearest)
- Feedback visual de dano e rejeição de ataque
