# 在线对战部署说明

Vercel 只负责托管前端静态页面。在线对战需要单独部署 `server/signaling.mjs` 这个 Node WebSocket 服务。

## WebSocket 服务

部署到支持长连接 WebSocket 的 Node 平台，例如 Render、Railway、Fly.io 或自有服务器。

启动命令：

```bash
npm run start:server
```

端口读取顺序：

```bash
WS_PORT -> PORT -> 8787
```

多数托管平台会自动提供 `PORT`，无需额外配置。

## Vercel 前端

在 Vercel 项目环境变量中设置：

```bash
VITE_WS_URL=wss://your-websocket-host.example
```

没有 `VITE_WS_URL` 时，线上在线对战会明确报错，不再回退到 Vercel Function 轮询。这样可以避免无状态函数导致的房间丢失、延迟高和同步不稳定问题。

## 本地开发

本地仍可直接运行：

```bash
npm run dev
```

前端会连接：

```bash
ws://127.0.0.1:8787
```
