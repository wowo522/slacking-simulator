// GameState.js - 游戏状态逻辑（老板NPC + 游戏循环）

const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;
const PLAYER_SPEED = 3;
const BOSS_SPEED = 1.8;
const BOSS_VISION_RADIUS = 120;
const TICK_RATE = 100; // ms
const GAME_DURATION = 180; // 3分钟（秒）

// 办公桌（障碍物/装饰）
const DESKS = [
  { x: 80,  y: 80,  w: 100, h: 60 },
  { x: 260, y: 80,  w: 100, h: 60 },
  { x: 440, y: 80,  w: 100, h: 60 },
  { x: 620, y: 80,  w: 100, h: 60 },
  { x: 80,  y: 220, w: 100, h: 60 },
  { x: 260, y: 220, w: 100, h: 60 },
  { x: 440, y: 220, w: 100, h: 60 },
  { x: 620, y: 220, w: 100, h: 60 },
  { x: 80,  y: 380, w: 100, h: 60 },
  { x: 260, y: 380, w: 100, h: 60 },
  { x: 440, y: 380, w: 100, h: 60 },
  { x: 620, y: 380, w: 100, h: 60 },
  { x: 80,  y: 500, w: 100, h: 60 },
  { x: 260, y: 500, w: 100, h: 60 },
  { x: 440, y: 500, w: 100, h: 60 },
  { x: 620, y: 500, w: 100, h: 60 },
];

// 玩家颜色
const PLAYER_COLORS = ['#4A90D9', '#E67E22', '#2ECC71', '#9B59B6', '#E74C3C', '#1ABC9C'];

// 玩家出生点（避开桌子）
const SPAWN_POINTS = [
  { x: 190, y: 110 },
  { x: 370, y: 110 },
  { x: 550, y: 110 },
  { x: 190, y: 460 },
  { x: 370, y: 460 },
  { x: 550, y: 460 },
];

class GameState {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = {}; // socketId -> player
    this.boss = this._initBoss();
    this.timeLeft = GAME_DURATION;
    this.running = false;
    this.tickInterval = null;
    this.scoreInterval = null;
    this.startTime = null;
    this.reportTarget = null; // 被举报的位置 {x, y}
    this.desks = DESKS;
    this.colorIndex = 0;
    this.catchCooldown = {}; // socketId -> timestamp，防止连续扣分
  }

  _initBoss() {
    return {
      x: 400,
      y: 300,
      size: 24,
      speed: BOSS_SPEED,
      visionRadius: BOSS_VISION_RADIUS,
      // 巡逻目标
      targetX: 400,
      targetY: 300,
      angle: 0, // 朝向角度
      patrolTimer: 0,
      mode: 'patrol', // 'patrol' | 'chase'
      chaseTarget: null, // 追踪目标位置
    };
  }

  addPlayer(socketId, name) {
    const spawnIndex = Object.keys(this.players).length % SPAWN_POINTS.length;
    const spawn = SPAWN_POINTS[spawnIndex];
    this.players[socketId] = {
      id: socketId,
      name: name.substring(0, 12),
      x: spawn.x,
      y: spawn.y,
      size: 20,
      color: PLAYER_COLORS[this.colorIndex % PLAYER_COLORS.length],
      score: 0,
      slacking: false, // false=工作, true=摸鱼
      caught: false,   // 正在被抓的动画帧
      caughtTimer: 0,
      danger: 0,       // 0~100 危险值
      input: { up: false, down: false, left: false, right: false },
      alive: true,
    };
    this.colorIndex++;
    return this.players[socketId];
  }

  removePlayer(socketId) {
    delete this.players[socketId];
    delete this.catchCooldown[socketId];
  }

  handleInput(socketId, input) {
    if (this.players[socketId]) {
      this.players[socketId].input = input;
    }
  }

  toggleSlacking(socketId) {
    const p = this.players[socketId];
    if (!p) return;
    p.slacking = !p.slacking;
  }

  report(socketId) {
    // 举报：找到举报者附近的其他玩家，让老板过去
    const reporter = this.players[socketId];
    if (!reporter) return;

    // 找最近的其他玩家
    let nearest = null;
    let minDist = Infinity;
    for (const [id, p] of Object.entries(this.players)) {
      if (id === socketId) continue;
      const d = Math.hypot(p.x - reporter.x, p.y - reporter.y);
      if (d < minDist) {
        minDist = d;
        nearest = p;
      }
    }

    if (nearest) {
      // 老板冲向被举报玩家
      this.boss.mode = 'chase';
      this.boss.chaseTarget = { x: nearest.x, y: nearest.y };
      this.reportTarget = { x: nearest.x, y: nearest.y };
      // 2秒后恢复巡逻
      setTimeout(() => {
        if (this.boss.mode === 'chase') {
          this.boss.mode = 'patrol';
          this.boss.chaseTarget = null;
        }
        this.reportTarget = null;
      }, 5000);
    }
  }

  start(emitFn) {
    this.running = true;
    this.startTime = Date.now();
    this.emitFn = emitFn;

    // 游戏主循环
    this.tickInterval = setInterval(() => this._tick(), TICK_RATE);
    // 每秒给摸鱼玩家加分
    this.scoreInterval = setInterval(() => this._addScores(), 1000);
  }

  stop() {
    this.running = false;
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.scoreInterval) clearInterval(this.scoreInterval);
    this.tickInterval = null;
    this.scoreInterval = null;
  }

  _tick() {
    if (!this.running) return;

    // 更新倒计时
    const elapsed = (Date.now() - this.startTime) / 1000;
    this.timeLeft = Math.max(0, GAME_DURATION - elapsed);

    if (this.timeLeft <= 0) {
      this.stop();
      this.emitFn('game-over', this._getLeaderboard());
      return;
    }

    // 更新玩家位置
    this._updatePlayers();

    // 更新老板
    this._updateBoss();

    // 碰撞检测：老板视野内的摸鱼玩家
    this._checkCaught();

    // 广播游戏状态
    this.emitFn('game-state', this.getState());
  }

  _addScores() {
    for (const p of Object.values(this.players)) {
      if (p.slacking) {
        p.score += 1;
      }
    }
  }

  _updatePlayers() {
    for (const p of Object.values(this.players)) {
      // 更新caught冷却
      if (p.caught) {
        p.caughtTimer--;
        if (p.caughtTimer <= 0) {
          p.caught = false;
          p.caughtTimer = 0;
        }
      }

      const { up, down, left, right } = p.input;
      let dx = 0, dy = 0;
      if (up)    dy -= PLAYER_SPEED;
      if (down)  dy += PLAYER_SPEED;
      if (left)  dx -= PLAYER_SPEED;
      if (right) dx += PLAYER_SPEED;

      // 对角线移动归一化
      if (dx !== 0 && dy !== 0) {
        dx *= 0.707;
        dy *= 0.707;
      }

      const newX = Math.max(p.size, Math.min(MAP_WIDTH - p.size, p.x + dx));
      const newY = Math.max(p.size, Math.min(MAP_HEIGHT - p.size, p.y + dy));

      // 检查桌子碰撞
      if (!this._collidesWithDesk(newX, p.y, p.size)) p.x = newX;
      if (!this._collidesWithDesk(p.x, newY, p.size)) p.y = newY;
    }
  }

  _collidesWithDesk(x, y, radius) {
    for (const desk of DESKS) {
      // 圆形 vs 矩形 碰撞
      const closestX = Math.max(desk.x, Math.min(x, desk.x + desk.w));
      const closestY = Math.max(desk.y, Math.min(y, desk.y + desk.h));
      const dist = Math.hypot(x - closestX, y - closestY);
      if (dist < radius) return true;
    }
    return false;
  }

  _updateBoss() {
    const boss = this.boss;
    boss.patrolTimer++;

    if (boss.mode === 'chase' && boss.chaseTarget) {
      // 追踪模式：更新追踪目标为实际玩家位置（如果仍然存在）
      // 冲向举报的固定位置（已在report中设置）
      const tx = boss.chaseTarget.x;
      const ty = boss.chaseTarget.y;
      const dist = Math.hypot(tx - boss.x, ty - boss.y);

      if (dist < 10) {
        // 到达目标，恢复巡逻
        boss.mode = 'patrol';
        boss.chaseTarget = null;
      } else {
        const angle = Math.atan2(ty - boss.y, tx - boss.x);
        boss.angle = angle;
        boss.x += Math.cos(angle) * boss.speed * 2; // 追踪时速度翻倍
        boss.y += Math.sin(angle) * boss.speed * 2;
      }
    } else {
      // 巡逻模式：定期随机更换目标
      const dist = Math.hypot(boss.targetX - boss.x, boss.targetY - boss.y);

      if (dist < 15 || boss.patrolTimer > 120) {
        // 选新的巡逻点（在空旷区域）
        boss.targetX = 60 + Math.random() * (MAP_WIDTH - 120);
        boss.targetY = 60 + Math.random() * (MAP_HEIGHT - 120);
        boss.patrolTimer = 0;
      }

      const angle = Math.atan2(boss.targetY - boss.y, boss.targetX - boss.x);
      boss.angle = angle;
      boss.x += Math.cos(angle) * boss.speed;
      boss.y += Math.sin(angle) * boss.speed;
    }

    // 边界约束
    boss.x = Math.max(boss.size, Math.min(MAP_WIDTH - boss.size, boss.x));
    boss.y = Math.max(boss.size, Math.min(MAP_HEIGHT - boss.size, boss.y));
  }

  _checkCaught() {
    const boss = this.boss;
    const now = Date.now();

    for (const p of Object.values(this.players)) {
      const dist = Math.hypot(p.x - boss.x, p.y - boss.y);
      const inVision = dist < boss.visionRadius;

      if (inVision) {
        // 更新危险值
        p.danger = Math.min(100, p.danger + 8);
        // 追踪模式下更新老板追踪目标为最近看到的摸鱼玩家
        if (p.slacking && boss.mode !== 'chase') {
          boss.mode = 'chase';
          boss.chaseTarget = { x: p.x, y: p.y };
          // 3秒后恢复
          setTimeout(() => {
            if (boss.mode === 'chase') {
              boss.mode = 'patrol';
              boss.chaseTarget = null;
            }
          }, 3000);
        }

        // 被抓判定：距离足够近且在摸鱼
        if (p.slacking && dist < boss.size + p.size + 10) {
          const cooldown = this.catchCooldown[p.id] || 0;
          if (now - cooldown > 2000) { // 2秒冷却
            p.score = Math.max(0, p.score - 10);
            p.slacking = false;
            p.caught = true;
            p.caughtTimer = 5; // 5 ticks 动画
            this.catchCooldown[p.id] = now;
          }
        }
      } else {
        // 不在视野内，危险值慢慢恢复
        p.danger = Math.max(0, p.danger - 3);
      }
    }
  }

  _getLeaderboard() {
    return Object.values(this.players)
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({
        rank: i + 1,
        name: p.name,
        score: p.score,
        color: p.color,
        id: p.id,
      }));
  }

  getState() {
    return {
      players: Object.values(this.players).map(p => ({
        id: p.id,
        name: p.name,
        x: Math.round(p.x),
        y: Math.round(p.y),
        size: p.size,
        color: p.color,
        score: p.score,
        slacking: p.slacking,
        caught: p.caught,
        danger: p.danger,
      })),
      boss: {
        x: Math.round(this.boss.x),
        y: Math.round(this.boss.y),
        size: this.boss.size,
        visionRadius: this.boss.visionRadius,
        angle: this.boss.angle,
        mode: this.boss.mode,
      },
      timeLeft: Math.ceil(this.timeLeft),
      desks: this.desks,
    };
  }
}

module.exports = { GameState, MAP_WIDTH, MAP_HEIGHT };
