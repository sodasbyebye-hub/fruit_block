# 在线对战部署说明

在线对战现在使用 WebRTC DataChannel 传输游戏操作和主机快照，Vercel 只负责短生命周期房间信令。连接建立后，`guestInput`、`hostSnapshot`、`ping` 和 `pong` 都在两个浏览器之间点对点传输。

## Vercel 环境变量

在 Vercel 项目中安装 Upstash Redis Marketplace 集成，或手动配置同名变量：

```bash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

默认 ICE 配置使用公共 STUN：

```text
stun:stun.l.google.com:19302
```

如果需要 TURN，可额外配置：

```bash
VITE_ICE_SERVERS='[{"urls":"turn:turn.example.com","username":"user","credential":"pass"}]'
```

## 本地开发

```bash
npm run dev
```

这个命令会同时启动：

- Vite 前端：`http://127.0.0.1:5173`
- 本地 HTTP 信令服务：`http://127.0.0.1:8787/api/rooms`

Vite 会把 `/api/rooms` 代理到本地信令服务，因此本地和线上使用同一套前端协议。

## 旧 WebSocket 服务

旧的 `server/signaling.mjs` WebSocket 中继已经废弃。线上部署不再需要 `VITE_WS_URL`，也不需要额外托管长连接 Node 服务。
