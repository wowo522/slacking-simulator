# 上班模拟器：摸鱼大作战 🐟

多人网页小游戏 - 在老板眼皮底下拼命摸鱼！

## 快速开始

```bash
cd server
npm install
npm start
```

访问 http://localhost:3000

或者指定端口：
```bash
PORT=3456 npm start
```

## 游戏玩法

| 按键 | 操作 |
|------|------|
| WASD / 方向键 | 移动 |
| 空格 | 切换摸鱼🎮 / 工作💼 |
| F | 举报附近玩家（引开老板） |

- 摸鱼状态：每秒 +1 分
- 被老板视野内抓到：-10 分，强制切换工作状态
- 3 分钟倒计时结束，分数最高者获胜

## 技术栈

- **后端**: Node.js + Express + Socket.io
- **前端**: 原生 HTML/CSS/JS + Canvas 2D
- **实时通信**: WebSocket

## 项目结构

```
slacking-simulator/
├── server/
│   ├── index.js          # 主入口，Express + Socket.io
│   ├── package.json
│   └── game/
│       ├── Room.js       # 房间 & 玩家管理
│       └── GameState.js  # 游戏逻辑（NPC巡逻、碰撞、计分）
└── client/
    ├── index.html        # 主页（创建/加入房间）
    ├── game.html         # 游戏页面
    ├── style.css
    └── js/
        ├── socket.js     # Socket.io 客户端初始化
        ├── game.js       # Canvas 渲染 + 输入处理
        └── ui.js         # 等待室 UI 逻辑
```

## 部署

### Render（免费）

1. 推到 GitHub
2. 在 Render 创建 Web Service，指向 `server/` 目录
3. 设置 Build Command: `npm install`，Start Command: `npm start`

### 本地开发

```bash
cd server && npm install && npm start
```
