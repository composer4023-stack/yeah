"use strict";

const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");
const { width, height } = canvas;
const message = document.querySelector("#message");
const missImage = document.querySelector("#miss-image");
const fuelLabel = document.querySelector("#fuel");
const nitroButton = document.querySelector("#nitro");
const soundButton = document.querySelector("#sound");
const livesLabel = document.querySelector("#lives");
const remainingLabel = document.querySelector("#remaining");

const paddle = { x: 437, y: 687, w: 150, h: 36 };
const ball = { x: 0, y: 0, r: 8, vx: 0, vy: 0 };
const keys = new Set();
const sprites = {};
for (const name of ["engine", "car", "exhaust", "circuit", "frog"]) {
  sprites[name] = new Image();
  sprites[name].src = "assets/" + name + ".png";
}
const engineSound = new Audio("assets/engine-loop.wav");
engineSound.loop = true;
engineSound.volume = 0.34;

const fuelPerNitro = 3;
const comboWindow = .5;
const armorInterval = 600;
const frogDuration = 1.5;
let armorTicks, armorPulse, armorSparks;
let bricks, lives, mode, nitroCharges, nitro, effects, missTime;
let fuelDrops, fuelCollected, pairTime, frogTime;
let soundEnabled = true;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const center = brick => ({ x: brick.x + brick.w / 2, y: brick.y + brick.h / 2 });

function setMode(next) {
  mode = next;
  const messages = {
    ready: ["출발 준비", "스페이스바를 눌러 시작"],
    waiting: ["다시 출발", "스페이스바로 다음 공 발사"],
    miss: ["공 놓쳤다!", ""],
    win: ["서킷 정복!", "스페이스바로 새 게임"],
    lose: ["경기 종료", "스페이스바로 다시 도전"]
  };
  message.hidden = !messages[mode];
  missImage.hidden = mode !== "miss";
  if (messages[mode]) {
    const [title, help] = messages[mode];
    message.querySelector("h2").textContent = title;
    message.querySelector("p").textContent = help;
    message.querySelector("p").hidden = !help;
  }
  syncControls();
  syncSound();
}

function syncControls() {
  livesLabel.textContent = "남은 공 " + lives;
  remainingLabel.textContent = "벽돌 " + bricks.length;
  fuelLabel.textContent = "연료 " + fuelCollected + "/" + fuelPerNitro;
  nitroButton.disabled = mode !== "play" || nitroCharges === 0;
  nitroButton.textContent = "니트로 " + nitroCharges + " · N";
}

function syncSound() {
  if (soundEnabled && ["play", "nitro", "miss", "waiting"].includes(mode)) {
    engineSound.play().catch(() => {});
  } else {
    engineSound.pause();
    if (mode !== "waiting" && mode !== "miss") engineSound.currentTime = 0;
  }
}

function parkBall() {
  ball.x = paddle.x + paddle.w / 2;
  ball.y = paddle.y - ball.r - 2;
}

function reset() {
  bricks = Array.from({ length: 63 }, (_, i) => ({
    x: 30 + i % 9 * 108, y: 86 + Math.floor(i / 9) * 48, w: 100, h: 42, armored: false
  }));
  lives = 3;
  paddle.x = (width - paddle.w) / 2;
  nitroCharges = 1;
  fuelDrops = [];
  fuelCollected = 0;
  pairTime = 0;
  frogTime = 0;
  armorTicks = 0;
  armorPulse = 0;
  armorSparks = [];
  nitro = null;
  effects = [];
  parkBall();
  setMode("ready");
}

function launch() {
  if (mode === "win" || mode === "lose") reset();
  if (mode !== "ready" && mode !== "waiting") return;
  ball.vx = 175;
  ball.vy = -410;
  setMode("play");
}

function activateNitro() {
  if (mode !== "play" || nitroCharges === 0) return;
  nitroCharges--;
  const start = { x: paddle.x + paddle.w / 2, y: paddle.y + paddle.h / 2 };
  // 아래쪽 배기관 중에서 차량에 가장 가까운 곳을 첫 충돌 지점으로 삼는다.
  const lowest = Math.max(...bricks.map(brick => brick.y));
  const candidates = bricks.filter(brick => brick.y === lowest);
  const target = candidates.reduce((near, brick) =>
    Math.abs(center(brick).x - start.x) < Math.abs(center(near).x - start.x) ? brick : near);
  const end = center(target);
  const distance = brick => Math.hypot(center(brick).x - end.x, center(brick).y - end.y);
  const targets = [...bricks].sort((a, b) => distance(a) - distance(b)).slice(0, 10);
  nitro = { start, end, targets, elapsed: 0, broken: 0, exploded: false };
  setMode("nitro");
}

function explode(x, y, size) {
  const sparks = Array.from({ length: 15 }, () => ({
    angle: Math.random() * Math.PI * 2,
    speed: 45 + Math.random() * 145,
    color: Math.random() < .5 ? "#ffd695" : "#b3b1ac"
  }));
  effects.push({ x, y, size, age: 0, sparks });
}

function breakBrick(brick) {
  const { x, y } = center(brick);
  bricks.splice(bricks.indexOf(brick), 1);
  explode(x, y, 1);
  fuelDrops.push({ x, y });
  if (pairTime > 0) {
    frogTime = frogDuration;
    pairTime = 0;
  } else {
    pairTime = comboWindow;
  }
  syncControls();
}

function updateNitro(dt) {
  nitro.elapsed += dt;
  if (nitro.elapsed < .66) return;
  if (!nitro.exploded) {
    nitro.exploded = true;
    explode(nitro.end.x, nitro.end.y, 2.3);
  }
  while (nitro.broken < nitro.targets.length && nitro.elapsed >= .78 + nitro.broken * .055) {
    breakBrick(nitro.targets[nitro.broken]);
    nitro.broken++;
  }
  if (nitro.elapsed >= .78 + (nitro.targets.length - 1) * .055 + .8) {
    nitro = null;
    setMode(bricks.length ? "play" : "win");
  }
}

function touches(rect) {
  const x = clamp(ball.x, rect.x, rect.x + rect.w);
  const y = clamp(ball.y, rect.y, rect.y + rect.h);
  return Math.hypot(ball.x - x, ball.y - y) <= ball.r;
}

function updateFuel(dt) {
  // 바에 닿은 연료통만 모으고, 바닥을 지나간 연료통은 치운다.
  fuelDrops = fuelDrops.filter(drop => {
    const bottom = drop.y + 13;
    drop.y += 195 * dt;
    const crossesPaddle = bottom <= paddle.y && drop.y + 13 >= paddle.y;
    const overlapsPaddle = drop.x + 10 > paddle.x && drop.x - 10 < paddle.x + paddle.w;
    if (crossesPaddle && overlapsPaddle) {
      fuelCollected++;
      if (fuelCollected === fuelPerNitro) {
        fuelCollected = 0;
        nitroCharges++;
      }
      syncControls();
      return false;
    }
    return drop.y - 13 < height;
  });
}

function update(dt) {
  pairTime = Math.max(0, pairTime - dt);
  frogTime = Math.max(0, frogTime - dt);
  armorPulse = Math.max(0, armorPulse - dt);
  for (const spark of armorSparks) spark.age += dt;
  armorSparks = armorSparks.filter(spark => spark.age < .28);
  for (const effect of effects) effect.age += dt;
  effects = effects.filter(effect => effect.age < .78);
  if (mode === "nitro") {
    updateNitro(dt);
    return;
  }
  if (mode === "miss") {
    missTime += dt;
    if (missTime >= 1) {
      parkBall();
      setMode(lives ? "waiting" : "lose");
    }
    return;
  }
  if (!["ready", "waiting", "play"].includes(mode)) return;

  const direction = Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft"));
  paddle.x = clamp(paddle.x + direction * 550 * dt, 0, width - paddle.w);
  if (mode !== "play") {
    parkBall();
    return;
  }

  // 게임은 초당 120번 진행하므로 600번이 지나면 5초다.
  if (++armorTicks === armorInterval) {
    armorTicks = 0;
    armorPulse = .65;
    for (const brick of bricks) brick.armored = true;
  }
  updateFuel(dt);

  const previousX = ball.x;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  if (ball.x < ball.r || ball.x > width - ball.r) {
    ball.x = clamp(ball.x, ball.r, width - ball.r);
    ball.vx *= -1;
  }
  if (ball.y < 62 + ball.r) {
    ball.y = 62 + ball.r;
    ball.vy = Math.abs(ball.vy);
  }
  if (ball.vy > 0 && ball.y < paddle.y && touches(paddle)) {
    const offset = (ball.x - paddle.x - paddle.w / 2) / (paddle.w / 2);
    const angle = clamp(offset, -1, 1) * 1.06;
    const speed = clamp(Math.hypot(ball.vx, ball.vy) * 1.012, 445, 660);
    ball.vx = Math.sin(angle) * speed;
    ball.vy = -Math.cos(angle) * speed;
    ball.y = paddle.y - ball.r;
  }
  const brick = bricks.find(touches);
  if (brick) {
    // 충돌 면 바깥에 공을 놓아 한 번 닿은 것을 두 번으로 세지 않는다.
    if (previousX <= brick.x - ball.r || previousX >= brick.x + brick.w + ball.r) {
      ball.x = previousX < brick.x ? brick.x - ball.r - .01 : brick.x + brick.w + ball.r + .01;
      ball.vx *= -1;
    } else {
      ball.y = ball.vy > 0 ? brick.y - ball.r - .01 : brick.y + brick.h + ball.r + .01;
      ball.vy *= -1;
    }
    if (brick.armored) {
      brick.armored = false;
      armorSparks.push({ ...center(brick), age: 0 });
    } else {
      breakBrick(brick);
    }
    if (!bricks.length) setMode("win");
  }
  if (ball.y > height + ball.r) {
    lives--;
    pairTime = 0;
    frogTime = 0;
    missTime = 0;
    setMode("miss");
  }
}

function sprite(name, x, y, w, h) {
  const img = sprites[name];
  if (!img.complete || !img.naturalWidth) return false;
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  return true;
}

const backdrop = document.createElement("canvas");
backdrop.width = width;
backdrop.height = height;
const bg = backdrop.getContext("2d");
function prepareBackdrop() {
  bg.fillStyle = "#20262c";
  bg.fillRect(0, 0, width, height);
  const road = sprites.circuit;
  if (road.complete && road.naturalWidth) {
    const scale = Math.max(width / road.naturalWidth, height / road.naturalHeight);
    const w = road.naturalWidth * scale;
    const h = road.naturalHeight * scale;
    bg.drawImage(road, (width - w) / 2, (height - h) / 2, w, h);
  } else {
    // 서킷 사진을 사용할 수 없을 때 연석과 아스팔트를 그린다.
    bg.fillStyle = "#48484a";
    bg.beginPath();
    bg.moveTo(0, 768);
    bg.lineTo(440, 290);
    bg.lineTo(622, 290);
    bg.lineTo(1024, 768);
    bg.fill();
    bg.lineWidth = 12;
    bg.strokeStyle = "#cbccc6";
    bg.setLineDash([22, 24]);
    bg.stroke();
    bg.lineDashOffset = 22;
    bg.strokeStyle = "#a53129";
    bg.stroke();
    bg.setLineDash([]);
    bg.lineDashOffset = 0;
  }
  const car = sprites.car;
  if (car.complete && car.naturalWidth) {
    const carWidth = 440;
    const carHeight = carWidth * car.naturalHeight / car.naturalWidth;
    bg.fillStyle = "#0008";
    bg.beginPath();
    bg.ellipse(584, 624, 226, 23, 0, 0, Math.PI * 2);
    bg.fill();
    bg.drawImage(car, 364, 630 - carHeight, carWidth, carHeight);
  }
  bg.fillStyle = "rgba(9, 11, 16, .46)";
  bg.fillRect(0, 0, width, height);
}

function warp(x, y, radius, age, power) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  for (let row = Math.max(0, Math.floor(y - radius)); row < Math.min(height, y + radius); row += 6) {
    const fade = 1 - Math.min(1, Math.abs(row - y) / radius);
    const shift = Math.sin(row * .105 - age * 30) * fade * power;
    const strip = Math.min(6, height - row);
    ctx.drawImage(backdrop, 0, row, width, strip, shift, row, width, strip);
  }
  ctx.restore();
}

function circle(x, y, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawExplosion(effect) {
  const { x, y, size, age, sparks } = effect;
  const progress = age / .78;
  const fade = 1 - progress;
  const ring = (10 + age * 185) * size;
  ctx.save();
  ctx.globalAlpha = fade * .76;
  ctx.strokeStyle = "#ffd388";
  ctx.lineWidth = 2.5 * fade;
  ctx.beginPath();
  ctx.arc(x, y, ring, 0, Math.PI * 2);
  ctx.stroke();

  const glowSize = (17 + age * 60) * size;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
  glow.addColorStop(0, age < .10 ? "#ffffff" : "#ffbd63");
  glow.addColorStop(.35, "#ff7727");
  glow.addColorStop(1, "#ff430000");
  circle(x, y, glowSize, glow);

  const rise = age * 83 * size;
  ctx.globalAlpha = fade * Math.min(1, age * 7);
  // 연기 기둥 위에 둥근 연기를 겹쳐 버섯구름 윤곽을 만든다.
  for (let i = 1; i <= 3; i++) {
    circle(x, y - rise * i / 5, (4 + age * 9) * size, "#81706b");
  }
  for (let i = -2; i <= 2; i++) {
    circle(x + i * (6 + age * 12) * size, y - rise + Math.abs(i) * 2,
      (9 + age * 12 - Math.abs(i) * 2) * size, i % 2 ? "#746763" : "#ac8c76");
  }

  ctx.globalAlpha = fade;
  for (const spark of sparks) {
    const px = x + Math.cos(spark.angle) * spark.speed * age * size;
    const py = y + Math.sin(spark.angle) * spark.speed * age * size + 75 * age ** 2;
    ctx.fillStyle = spark.color;
    ctx.fillRect(px, py, 3 * size, 2 * size);
  }
  ctx.restore();
}

function carPosition(elapsed) {
  const t = clamp((elapsed - .12) / .54, 0, 1);
  const eased = t * t;
  return {
    x: nitro.start.x + (nitro.end.x - nitro.start.x) * eased,
    y: nitro.start.y + (nitro.end.y - nitro.start.y) * eased
  };
}

function drawFuel({ x, y }) {
  ctx.fillStyle = "#ffe6a3";
  ctx.fillRect(x + 3, y - 13, 6, 5);
  ctx.fillStyle = "#b82129";
  ctx.strokeStyle = "#ffcf86";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - 10, y - 9, 20, 22, 4);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 5, y - 3);
  ctx.lineTo(x + 5, y + 7);
  ctx.moveTo(x + 5, y - 3);
  ctx.lineTo(x - 5, y + 7);
  ctx.stroke();
}

function draw() {
  ctx.drawImage(backdrop, 0, 0);
  for (const effect of effects) {
    if (effect.age < .35) warp(effect.x, effect.y, (26 + effect.age * 245) * effect.size,
      effect.age, 7 * (1 - effect.age / .35));
  }
  const charging = mode === "nitro" && !nitro.exploded;
  if (charging) {
    const { x, y } = carPosition(nitro.elapsed);
    warp(x, y, 126, nitro.elapsed, 23);
  }
  for (const brick of bricks) {
    if (brick.armored) {
      ctx.fillStyle = "#132d42";
      ctx.strokeStyle = "#a0e5ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(brick.x + 3, brick.y + 3, brick.w - 6, brick.h - 6, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#d0f5ff";
      ctx.fillRect(brick.x + 8, brick.y + 8, 5, 5);
      ctx.fillRect(brick.x + brick.w - 13, brick.y + brick.h - 13, 5, 5);
    }
    if (!sprite("exhaust", brick.x, brick.y, brick.w, brick.h)) {
      ctx.fillStyle = "#b4aaa5";
      ctx.fillRect(brick.x + 13, brick.y + 16, 74, 10);
    }
  }
  for (const { x, y, age } of armorSparks) {
    ctx.save();
    ctx.globalAlpha = 1 - age / .28;
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      circle(x + Math.cos(angle) * (9 + age * 130),
        y + Math.sin(angle) * (9 + age * 130), 2.5, "#b7eeff");
    }
    ctx.restore();
  }
  if (armorPulse > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, armorPulse * 3);
    ctx.textAlign = "center";
    ctx.font = "bold 28px sans-serif";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#0a1e2e";
    ctx.strokeText("배기관 장갑 장착!", width / 2, 457);
    ctx.fillStyle = "#b8edff";
    ctx.fillText("배기관 장갑 장착!", width / 2, 457);
    ctx.restore();
  }
  for (const effect of effects) drawExplosion(effect);
  if (mode === "play" || mode === "nitro" || mode === "waiting") {
    for (const drop of fuelDrops) drawFuel(drop);
  }
  if (charging) {
    for (let i = 3; i >= 0; i--) {
      const { x, y } = carPosition(nitro.elapsed - i * .035);
      ctx.globalAlpha = i ? .16 / i : 1;
      if (!sprite("car", x - 96, y - 43, 192, 86)) circle(x, y, 23, "#fb772d");
    }
    ctx.globalAlpha = 1;
  } else if (mode !== "nitro") {
    // 엔진 그림의 비율을 유지하고, 받침대로 공이 닿는 전체 너비를 표시한다.
    ctx.fillStyle = "#241811";
    ctx.strokeStyle = "#ff9e5b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(paddle.x + 1, paddle.y + 1, paddle.w - 2, paddle.h - 2, 9);
    ctx.fill();
    ctx.stroke();
    sprite("engine", paddle.x, paddle.y, paddle.w, paddle.h);
  }
  if (["ready", "waiting", "play", "nitro"].includes(mode)) {
    ctx.shadowColor = "#ff9445";
    ctx.shadowBlur = 15;
    circle(ball.x, ball.y, ball.r, "#fff7dc");
    ctx.shadowBlur = 0;
  }
  if (frogTime > 0) {
    ctx.save();
    const elapsed = frogDuration - frogTime;
    const bounce = 1 - Math.exp(-11 * elapsed) * Math.cos(19 * elapsed);
    const scale = .32 + .68 * bounce;
    ctx.globalAlpha = Math.min(1, frogTime / .7);
    ctx.translate(176, 548 - 18 * Math.sin(elapsed * 8));
    ctx.rotate(Math.sin(elapsed * 15) * .16 * (frogTime / frogDuration));
    ctx.scale(scale, scale);
    sprite("frog", -143, -112, 286, 246);
    ctx.font = "900 33px sans-serif";
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#111a10";
    ctx.fillStyle = "#f4ff83";
    ctx.strokeText("따봉 두 방!", 55, -105);
    ctx.fillText("따봉 두 방!", 55, -105);
    ctx.restore();
  }
}

document.addEventListener("keydown", event => {
  if (event.code === "Space" && event.target.closest("button")) return;
  if (["ArrowLeft", "ArrowRight", "Space", "KeyN"].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (!event.repeat && event.code === "Space") launch();
  if (!event.repeat && event.code === "KeyN") activateNitro();
});
document.addEventListener("keyup", event => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
nitroButton.addEventListener("click", () => {
  activateNitro();
  nitroButton.blur();
});
soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  soundButton.textContent = soundEnabled ? "소리 켜짐" : "소리 꺼짐";
  syncSound();
  soundButton.blur();
});

reset();
prepareBackdrop();
sprites.car.addEventListener("load", prepareBackdrop);
sprites.circuit.addEventListener("load", prepareBackdrop);
let previous = performance.now();
let accumulator = 0;
function frame(now) {
  accumulator += clamp((now - previous) / 1000, 0, .05);
  previous = now;
  // 작은 시간 간격으로 충돌을 계산해 빠른 공도 벽돌을 지나치지 않게 한다.
  while (accumulator >= 1 / 120) {
    update(1 / 120);
    accumulator -= 1 / 120;
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
