# AGENTS.md

## 项目概览

这是一个软萌水果果冻风的网页版俄罗斯方块对战游戏。前端使用 Vite + React + TypeScript，支持本地双人对战和在线对战；在线对战通过 Node WebSocket 信令/中继服务连接两个浏览器。

主要体验包括：

- 本地双人同屏对战。
- 在线创建房间、复制邀请码、输入邀请码加入。
- 主机权威的在线同步：主机运行双人棋局，客端发送自己的操作。
- 水果果冻方块贴图、果冻抖动动效、落地反馈。
- Web Audio API 合成操作音效和背景音乐。
- 设置面板支持音效音量、音乐音量、抖动幅度和中/英/日语言切换。

## 常用命令

```bash
npm run dev
```

同时启动 Vite 前端和 WebSocket 信令服务。日常本地联调优先使用这个命令。

```bash
npm run dev:client
```

只启动 Vite 前端，默认用于本地静态界面和本地双人模式调试。

```bash
npm run dev:server
```

只启动 Node WebSocket 信令服务，在线对战本地联调需要它运行。

```bash
npm run test
npm run lint
npm run build
```

提交或交付前运行测试、静态检查和生产构建。

## 架构地图

- `src/game/`：纯游戏逻辑，包括棋盘、碰撞、旋转、锁定、消行、垃圾行、胜负判定、动作事件和单元测试。这里的逻辑应尽量保持无 React、无 DOM、可测试。
- `src/components/`：游戏 UI 组件，包括棋盘、玩家面板、工具栏、设置面板、触控按钮和下一个方块预览。
- `src/hooks/useBattleGame.ts`：本地双人棋局控制层，负责状态推进、玩家操作、攻击结算、音频事件和开始/暂停/重开。
- `src/hooks/useOnlineRoom.ts`：在线房间客户端逻辑，负责 WebSocket 连接、创建/加入房间、邀请码复制、客端输入转发、主机快照同步。
- `src/hooks/useAudioEngine.ts`：Web Audio 音效和 BGM 合成逻辑。
- `src/i18n.ts`：中/英/日文案。新增任何可见 UI 文案时，应同步维护三种语言。
- `server/rooms.mjs`：可测试的房间码和房间状态管理逻辑。
- `server/signaling.mjs`：WebSocket 信令/中继服务，只负责房间消息和转发，不放游戏规则。
- `public/assets/blocks/`：水果果冻方块 PNG 资产。`*-source.png` 已被 `.gitignore` 忽略。
- `netlify.toml`：Netlify 静态前端部署配置，构建命令为 `npm run build`，发布目录为 `dist`。

## 开发规则

- 修改俄罗斯方块规则、碰撞、消行、垃圾行、胜负判定时，优先在 `src/game/` 内完成，并补充或更新 Vitest 测试。
- 不要把游戏核心规则写进 React 组件；组件只负责展示和触发动作。
- 修改在线协议时，需要同时检查 `src/hooks/useOnlineRoom.ts`、`server/signaling.mjs`、`server/rooms.mjs` 和相关测试。
- 在线模式当前是主机权威：主机控制 `p1`，客端控制 `p2`；客端发送 `guestInput`，主机广播 `hostSnapshot`。
- 新增 UI 文案时，更新 `src/i18n.ts` 的中文、英文、日文键值，避免界面出现未翻译文本。
- 音效和音乐使用 Web Audio API 合成，不依赖外部音频文件。新增操作反馈时，应考虑是否需要对应 `AudioEvent`。
- 果冻动效幅度由 CSS 变量和设置面板控制。新增动画时，应兼顾 `prefers-reduced-motion` 和棋盘尺寸稳定。
- 图片类方块资产放在 `public/assets/blocks/`，保留纯色/渐变 fallback，避免图片加载失败时方块不可见。
- 不要随意删除或重置用户已有改动。编辑文件前先确认当前内容，保持改动范围贴近任务。

## 在线与部署注意

本地在线对战需要 WebSocket 服务运行：

```bash
npm run dev
```

或分别运行：

```bash
npm run dev:client
npm run dev:server
```

前端默认按当前页面协议推导 WebSocket 地址，本地通常连接 `ws://127.0.0.1:8787` 或同主机名的 `:8787`。

部署到 Netlify 时，当前配置只托管静态前端。Netlify 静态站点不会直接托管 `server/signaling.mjs` 这个长连接 WebSocket 服务。若要让线上在线对战可用，需要额外部署 WebSocket 服务，并在前端构建环境中配置：

```bash
VITE_WS_URL=wss://your-websocket-host.example
```

没有配置可用的线上 WebSocket 服务时，线上页面仍可运行本地双人模式，但在线房间功能无法成功连接。

## 验收清单

完成代码改动后，按风险选择检查范围；交付前建议至少运行：

```bash
npm run test
npm run lint
npm run build
```

重点手动检查：

- 本地双人模式可以开始、暂停、继续、重开。
- 两名玩家的移动、旋转、软降、硬降正常。
- 消行、攻击、垃圾行和胜负结算正常。
- 设置面板中的音量、音乐、抖动幅度和语言切换正常。
- 在线模式可以创建房间、复制邀请码、加入房间，并同步双方棋盘。
- 桌面和移动视口下棋盘、按钮、设置弹窗不重叠。

## 交付默认

- 文档和注释优先使用中文，代码标识、命令、路径、类型名保留英文原文。
- 业务逻辑改动应配套测试；纯样式或文档改动可说明未运行自动测试的原因。
- 保持项目轻量，不新增依赖，除非现有实现无法可靠覆盖需求。
