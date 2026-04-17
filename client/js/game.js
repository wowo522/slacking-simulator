// game.js - 游戏主逻辑（Canvas渲染 + 输入处理）

(function () {
  const socket = window.gameSocket;

  // ============ 初始化 Canvas ============
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  // 游戏逻辑尺寸
  const GAME_W = 800;
  const GAME_H = 600;

  // 缩放以适应屏幕
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resizeCanvas() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobile = vw < 600;

    // 预留虚拟按键空间
    const availH = isMobile ? vh - 180 : vh - 20;
    const availW = vw - (isMobile ? 0 : 20);

    scale = Math.min(availW / GAME_W, availH / GAME_H);
    scale = Math.max(0.3, Math.min(1.0, scale));

    canvas.width = Math.round(GAME_W * scale);
    canvas.height = Math.round(GAME_H * scale);

    // 显示虚拟按键（移动端）
    const virtualControls = document.getElementById('virtual-controls');
    if (isMobile || 'ontouchstart' in window) {
      virtualControls.style.display = 'block';
    }
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // ============ 游戏状态 ============
  let gameState = null;
  let mySocketId = null;
  let myName = sessionStorage.getItem('gamePlayerName') || '玩家';
  let animFrame = null;

  // 键盘输入
  const keys = { up: false, down: false, left: false, right: false };

  // ============ 会话信息 ============
  mySocketId = socket.id;
  socket.on('connect', () => {
    mySocketId = socket.id;
  });

  // ============ Socket 事件 ============
  socket.on('game-state', (state) => {
    gameState = state;
    if (!animFrame) {
      animFrame = requestAnimationFrame(renderLoop);
    }
  });

  socket.on('game-over', (leaderboard) => {
    showGameOver(leaderboard);
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
  });

  // ============ 输入处理 ============
  // 键盘
  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowUp':    case 'w': case 'W': keys.up    = true; break;
      case 'ArrowDown':  case 's': case 'S': keys.down  = true; break;
      case 'ArrowLeft':  case 'a': case 'A': keys.left  = true; break;
      case 'ArrowRight': case 'd': case 'D': keys.right = true; break;
      case ' ':
        e.preventDefault();
        socket.emit('toggle-slacking');
        break;
      case 'f': case 'F':
        socket.emit('report');
        showReportFlash();
        break;
    }
    sendInput();
  });

  document.addEventListener('keyup', (e) => {
    switch (e.key) {
      case 'ArrowUp':    case 'w': case 'W': keys.up    = false; break;
      case 'ArrowDown':  case 's': case 'S': keys.down  = false; break;
      case 'ArrowLeft':  case 'a': case 'A': keys.left  = false; break;
      case 'ArrowRight': case 'd': case 'D': keys.right = false; break;
    }
    sendInput();
  });

  let inputThrottle = null;
  function sendInput() {
    if (inputThrottle) return;
    inputThrottle = setTimeout(() => {
      socket.emit('player-input', { ...keys });
      inputThrottle = null;
    }, 16);
  }

  // 虚拟方向键
  const dpadBtns = document.querySelectorAll('.dpad-btn');
  dpadBtns.forEach(btn => {
    const dir = btn.dataset.dir;

    function pressDown(e) {
      e.preventDefault();
      keys[dir] = true;
      btn.classList.add('active');
      sendInput();
    }

    function pressUp(e) {
      e.preventDefault();
      keys[dir] = false;
      btn.classList.remove('active');
      sendInput();
    }

    btn.addEventListener('touchstart', pressDown, { passive: false });
    btn.addEventListener('touchend', pressUp, { passive: false });
    btn.addEventListener('mousedown', pressDown);
    btn.addEventListener('mouseup', pressUp);
    btn.addEventListener('mouseleave', pressUp);
  });

  // 动作按钮（摸鱼/举报）
  const btnToggleSlack = document.getElementById('btn-toggle-slack');
  const btnReport = document.getElementById('btn-report');

  function attachActionBtn(el, action) {
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      socket.emit(action);
      if (action === 'report') showReportFlash();
    }, { passive: false });
    el.addEventListener('click', () => {
      socket.emit(action);
      if (action === 'report') showReportFlash();
    });
  }

  attachActionBtn(btnToggleSlack, 'toggle-slacking');
  attachActionBtn(btnReport, 'report');

  // ============ 举报闪光效果 ============
  let reportFlashTimer = 0;
  function showReportFlash() {
    reportFlashTimer = 8;
  }

  // ============ Canvas 渲染 ============
  function renderLoop() {
    if (!gameState) {
      animFrame = requestAnimationFrame(renderLoop);
      return;
    }
    render(gameState);
    if (reportFlashTimer > 0) reportFlashTimer--;
    animFrame = requestAnimationFrame(renderLoop);
  }

  function render(state) {
    ctx.save();
    ctx.scale(scale, scale);

    // 背景
    drawBackground();

    // 办公桌
    if (state.desks) {
      state.desks.forEach(d => drawDesk(d));
    }

    // 玩家
    state.players.forEach(p => drawPlayer(p, p.id === mySocketId));

    // 老板
    drawBoss(state.boss);

    // HUD
    drawHUD(state);

    // 举报闪光
    if (reportFlashTimer > 0) {
      ctx.fillStyle = `rgba(231, 76, 60, ${reportFlashTimer / 8 * 0.3})`;
      ctx.fillRect(0, 0, GAME_W, GAME_H);
    }

    ctx.restore();
  }

  function drawBackground() {
    // 地板
    ctx.fillStyle = '#F8F9FA';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // 地板网格
    ctx.strokeStyle = '#E9ECEF';
    ctx.lineWidth = 1;
    for (let x = 0; x < GAME_W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, GAME_H);
      ctx.stroke();
    }
    for (let y = 0; y < GAME_H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(GAME_W, y);
      ctx.stroke();
    }

    // 边框
    ctx.strokeStyle = '#DEE2E6';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, GAME_W - 3, GAME_H - 3);
  }

  function drawDesk(desk) {
    // 桌子阴影
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(desk.x + 4, desk.y + 4, desk.w, desk.h);

    // 桌面
    ctx.fillStyle = '#CED4DA';
    ctx.fillRect(desk.x, desk.y, desk.w, desk.h);

    // 桌面高光
    ctx.fillStyle = '#E9ECEF';
    ctx.fillRect(desk.x, desk.y, desk.w, 6);

    // 桌腿
    ctx.fillStyle = '#ADB5BD';
    ctx.fillRect(desk.x + 6,             desk.y + desk.h - 8, 8, 8);
    ctx.fillRect(desk.x + desk.w - 14,   desk.y + desk.h - 8, 8, 8);

    // 电脑显示器装饰
    ctx.fillStyle = '#4A90D9';
    const monW = 36, monH = 26;
    const monX = desk.x + (desk.w - monW) / 2;
    const monY = desk.y + (desk.h - monH) / 2 - 4;
    ctx.fillRect(monX, monY, monW, monH);
    ctx.fillStyle = '#2c6fad';
    ctx.fillRect(monX, monY, monW, 3);
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(monX + 3, monY + 5, monW - 6, monH - 10);
  }

  function drawPlayer(p, isMe) {
    const { x, y, size, color, name, slacking, caught, danger } = p;

    // 被抓动画（抖动）
    let px = x, py = y;
    if (caught) {
      px += (Math.random() - 0.5) * 6;
      py += (Math.random() - 0.5) * 6;
    }

    // 危险光晕
    if (danger > 30) {
      const alpha = (danger - 30) / 70 * 0.4;
      const grd = ctx.createRadialGradient(px, py, size, px, py, size + 30);
      grd.addColorStop(0, `rgba(231, 76, 60, ${alpha})`);
      grd.addColorStop(1, 'rgba(231, 76, 60, 0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(px, py, size + 30, 0, Math.PI * 2);
      ctx.fill();
    }

    // 玩家圆形
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fillStyle = caught ? '#FF6B6B' : color;
    ctx.fill();
    ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.6)';
    ctx.lineWidth = isMe ? 3 : 2;
    ctx.stroke();

    // 状态emoji
    ctx.font = '14px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(slacking ? '🐟' : '💼', px, py);

    // 名字标签
    const labelY = py - size - 16;
    ctx.font = `bold ${isMe ? 12 : 11}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const labelW = ctx.measureText(name).width + 10;
    ctx.fillStyle = isMe ? 'rgba(74, 144, 217, 0.9)' : 'rgba(0,0,0,0.6)';
    const labelX = Math.max(labelW / 2 + 2, Math.min(GAME_W - labelW / 2 - 2, px));
    ctx.beginPath();
    ctx.roundRect(labelX - labelW / 2, labelY - 9, labelW, 18, 4);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.fillText(name, labelX, labelY);

    // 分数气泡（我自己）
    if (isMe) {
      ctx.font = 'bold 11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(46, 204, 113, 0.9)';
      const scoreText = `+${p.score}`;
      const sW = ctx.measureText(scoreText).width + 8;
      ctx.beginPath();
      ctx.roundRect(px - sW / 2, py + size + 4, sW, 16, 3);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(scoreText, px, py + size + 12);
    }
  }

  function drawBoss(boss) {
    const { x, y, size, visionRadius, angle, mode } = boss;

    // 视野圆（半透明）
    ctx.beginPath();
    ctx.arc(x, y, visionRadius, 0, Math.PI * 2);
    ctx.fillStyle = mode === 'chase'
      ? 'rgba(231, 76, 60, 0.12)'
      : 'rgba(231, 76, 60, 0.07)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(231, 76, 60, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 视野方向指示扇形
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, visionRadius * 0.6, angle - 0.6, angle + 0.6);
    ctx.closePath();
    ctx.fillStyle = 'rgba(231, 76, 60, 0.15)';
    ctx.fill();

    // 老板阴影
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(x - size + 3, y - size + 3, size * 2, size * 2);

    // 老板方块
    const bossColor = mode === 'chase' ? '#C0392B' : '#E74C3C';
    ctx.fillStyle = bossColor;
    ctx.fillRect(x - size, y - size, size * 2, size * 2);

    // 老板面部
    ctx.fillStyle = '#FDEBD0';
    ctx.fillRect(x - size + 4, y - size + 4, size * 2 - 8, size * 2 - 8);

    // 眼睛（根据移动方向）
    ctx.fillStyle = '#2C3E50';
    const eyeOffX = Math.cos(angle) * 3;
    const eyeOffY = Math.sin(angle) * 3;
    ctx.beginPath();
    ctx.arc(x - 5 + eyeOffX, y - 2 + eyeOffY, 3, 0, Math.PI * 2);
    ctx.arc(x + 5 + eyeOffX, y - 2 + eyeOffY, 3, 0, Math.PI * 2);
    ctx.fill();

    // 生气/正常表情
    if (mode === 'chase') {
      // 愤怒眉毛
      ctx.strokeStyle = '#2C3E50';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 8 + eyeOffX, y - 7 + eyeOffY);
      ctx.lineTo(x - 3 + eyeOffX, y - 5 + eyeOffY);
      ctx.moveTo(x + 8 + eyeOffX, y - 7 + eyeOffY);
      ctx.lineTo(x + 3 + eyeOffX, y - 5 + eyeOffY);
      ctx.stroke();
    }

    // 老板标签
    ctx.font = 'bold 11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = mode === 'chase' ? '😡 老板' : '👔 老板';
    const lW = ctx.measureText(label).width + 10;
    ctx.fillStyle = mode === 'chase' ? 'rgba(192, 57, 43, 0.9)' : 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect(x - lW / 2, y - size - 22, lW, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, y - size - 13);
  }

  function drawHUD(state) {
    // 找到自己的数据
    const me = state.players.find(p => p.id === mySocketId);

    // ====== 左上：分数列表 ======
    const sortedPlayers = [...state.players].sort((a, b) => b.score - a.score);
    const boardX = 10, boardY = 10;
    const boardW = 160, boardH = Math.min(sortedPlayers.length, 6) * 22 + 28;

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.roundRect(boardX, boardY, boardW, boardH, 8);
    ctx.fill();

    ctx.font = 'bold 11px -apple-system, sans-serif';
    ctx.fillStyle = '#6c757d';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('📊 分数榜', boardX + 8, boardY + 14);

    ctx.font = '11px -apple-system, sans-serif';
    sortedPlayers.slice(0, 6).forEach((p, i) => {
      const rowY = boardY + 28 + i * 22;
      // 高亮自己
      if (p.id === mySocketId) {
        ctx.fillStyle = 'rgba(74, 144, 217, 0.12)';
        ctx.fillRect(boardX + 2, rowY - 9, boardW - 4, 20);
      }
      // 颜色点
      ctx.beginPath();
      ctx.arc(boardX + 14, rowY + 1, 5, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      // 名字
      ctx.fillStyle = p.id === mySocketId ? '#2c6fad' : '#2d3748';
      ctx.font = p.id === mySocketId ? 'bold 11px -apple-system, sans-serif' : '11px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      const displayName = p.name.length > 8 ? p.name.substring(0, 8) + '…' : p.name;
      ctx.fillText(displayName, boardX + 24, rowY + 1);
      // 分数
      ctx.fillStyle = '#4A90D9';
      ctx.font = 'bold 11px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(p.score, boardX + boardW - 8, rowY + 1);
    });

    // ====== 右上：倒计时 ======
    const timeLeft = state.timeLeft || 0;
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    const timeStr = `${mins}:${String(secs).padStart(2, '0')}`;

    const timerX = GAME_W - 90, timerY = 10;
    const timerW = 80, timerH = 40;

    const isUrgent = timeLeft <= 30;
    ctx.fillStyle = isUrgent ? 'rgba(231, 76, 60, 0.9)' : 'rgba(74, 144, 217, 0.9)';
    ctx.beginPath();
    ctx.roundRect(timerX, timerY, timerW, timerH, 8);
    ctx.fill();

    ctx.font = 'bold 22px -apple-system, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(timeStr, timerX + timerW / 2, timerY + timerH / 2);

    // 时间警告抖动
    if (isUrgent && Math.floor(Date.now() / 500) % 2 === 0) {
      ctx.strokeStyle = 'rgba(231, 76, 60, 0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(timerX - 2, timerY - 2, timerW + 4, timerH + 4, 10);
      ctx.stroke();
    }

    // ====== 底部：状态栏（仅自己） ======
    if (me) {
      const barH = 44;
      const barY = GAME_H - barH - 8;
      const barX = (GAME_W - 300) / 2;
      const barW = 300;

      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, 10);
      ctx.fill();

      // 状态文字
      ctx.font = 'bold 13px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const statusEmoji = me.slacking ? '🐟' : '💼';
      const statusText = me.slacking ? '摸鱼中' : '工作中';
      const statusColor = me.slacking ? '#2ECC71' : '#4A90D9';
      ctx.fillStyle = statusColor;
      ctx.fillText(`${statusEmoji} ${statusText}`, barX + 12, barY + 15);

      // 空格键提示
      ctx.font = '10px -apple-system, sans-serif';
      ctx.fillStyle = '#adb5bd';
      ctx.fillText('[空格]切换', barX + 12, barY + 32);

      // 危险值进度条
      const dangerBarX = barX + 110;
      const dangerBarY = barY + 14;
      const dangerBarW = 170;
      const dangerBarH = 12;

      ctx.fillStyle = '#E9ECEF';
      ctx.beginPath();
      ctx.roundRect(dangerBarX, dangerBarY, dangerBarW, dangerBarH, 6);
      ctx.fill();

      const dangerRatio = me.danger / 100;
      const dangerColor = dangerRatio > 0.7 ? '#E74C3C' : dangerRatio > 0.4 ? '#F39C12' : '#2ECC71';
      if (dangerRatio > 0) {
        ctx.fillStyle = dangerColor;
        ctx.beginPath();
        ctx.roundRect(dangerBarX, dangerBarY, dangerBarW * dangerRatio, dangerBarH, 6);
        ctx.fill();
      }

      ctx.font = '10px -apple-system, sans-serif';
      ctx.fillStyle = '#6c757d';
      ctx.textAlign = 'center';
      ctx.fillText(`⚠️ 危险值 ${Math.round(dangerRatio * 100)}%`, dangerBarX + dangerBarW / 2, barY + 32);
    }
  }

  // ============ 游戏结束 ============
  function showGameOver(leaderboard) {
    const overlay = document.getElementById('game-over-overlay');
    const winnerText = document.getElementById('winner-text');
    const lbEl = document.getElementById('leaderboard');

    overlay.classList.add('show');

    if (leaderboard.length > 0) {
      const winner = leaderboard[0];
      winnerText.textContent = `🏆 ${winner.name} 获胜！得分：${winner.score}`;
    }

    const medals = ['🥇', '🥈', '🥉'];
    lbEl.innerHTML = leaderboard.map((p, i) => `
      <div class="leaderboard-row ${i === 0 ? 'rank-1' : ''}">
        <span class="rank-medal">${medals[i] || `${i + 1}`}</span>
        <div class="player-dot" style="background:${p.color}"></div>
        <span class="player-name-lb">${escapeHtml(p.name)}</span>
        <span class="player-score-lb">${p.score} 分</span>
      </div>
    `).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ============ 启动渲染循环 ============
  animFrame = requestAnimationFrame(renderLoop);

  // 防止空格键滚动
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') e.preventDefault();
  });

  // ============ 提示进入游戏 ============
  // 在等待 game-state 期间显示加载画面
  (function drawLoadingScreen() {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    ctx.fillStyle = '#4A90D9';
    ctx.font = 'bold 28px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐟 摸鱼大作战', GAME_W / 2, GAME_H / 2 - 20);
    ctx.fillStyle = '#adb5bd';
    ctx.font = '16px -apple-system, sans-serif';
    ctx.fillText('游戏加载中...', GAME_W / 2, GAME_H / 2 + 20);
    ctx.restore();
  })();

})();
