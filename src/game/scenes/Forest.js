import Phaser from 'phaser';
import { EventBus } from '../EventBus';

const ENEMIES = [
  { name: 'Shadow Wolf',   hp: 60,  maxHp: 60,  atk: [8,14],  xp: 25, gold: 12, color: 0x7b5ea7, scale: 1.0, boss: false },
  { name: 'Undead Archer', hp: 80,  maxHp: 80,  atk: [10,18], xp: 35, gold: 18, color: 0x4a7c59, scale: 1.0, boss: false },
  { name: 'Forest Troll',  hp: 140, maxHp: 140, atk: [14,22], xp: 60, gold: 30, color: 0xc06c00, scale: 1.5, boss: true  },
];

const rand = (min, max) => Phaser.Math.Between(min, max);

export default class Forest extends Phaser.Scene {
  constructor() { super('Forest'); }

  create() {
    const { width, height } = this.scale;
    this.groundY = Math.round(height * 0.74);
    this.monsters = [];
    this.target = null;
    this.inCombat = false;
    this.attackTimer = null;
    this.moveTween = null;
    this.player = this.registry.get('player');

    this.drawBackground(width, height);
    this.createHero(width);
    this.spawnMonsters(width, height);
    this.setupInput(width, height);

    this.cameras.main.fadeIn(400);
    EventBus.emit('scene-ready', 'Forest');
    EventBus.on('use-skill', this.onUseSkill, this);
    EventBus.on('go-town',   this.gotoTown,   this);
  }

  // ── Background ──────────────────────────────────────────────
  drawBackground(w, h) {
    const g = this.add.graphics();
    g.fillGradientStyle(0x0d1117, 0x0d1117, 0x1a2a1a, 0x1a2a1a, 1);
    g.fillRect(0, 0, w, h * 0.74);
    g.fillGradientStyle(0x1a3a1a, 0x1a3a1a, 0x0d1f0d, 0x0d1f0d, 1);
    g.fillRect(0, h * 0.74, w, h * 0.26);
    // Moon
    this.add.circle(w * 0.15, h * 0.12, 28, 0xd4e8b0);
    this.add.circle(w * 0.15, h * 0.12, 36, 0xa8d070, 0.18);
    // Stars
    [[0.3,0.05],[0.5,0.08],[0.7,0.04],[0.85,0.09],[0.6,0.14],[0.2,0.12]].forEach(([sx,sy]) => {
      this.add.circle(w*sx, h*sy, 1.5, 0xffffff, 0.7);
    });
    // Fog strip
    const fog = this.add.graphics();
    fog.fillGradientStyle(0x1e3a1e, 0x1e3a1e, 0x1e3a1e, 0x1e3a1e, 0, 0, 0.35, 0.35);
    fog.fillRect(0, h * 0.60, w, h * 0.14);
    // Trees (back layer)
    [0.0,0.12,0.28,0.42,0.60,0.74,0.88,1.0].forEach((fx, i) => this.drawTree(g, w*fx, h, 16 + (i%3)*5, 0x0f240f));
    // Trees (front layer)
    [0.05,0.22,0.38,0.55,0.70,0.85,0.95].forEach((fx, i) => this.drawTree(g, w*fx, h, 22 + (i%2)*6, 0x1a3a1a));
    // Glowing wisps
    [0.25,0.55,0.78].forEach(fx => {
      const wisp = this.add.circle(w*fx, h*0.70, 5, 0x44ff88, 0.6);
      this.tweens.add({ targets: wisp, alpha: { from: 0.3, to: 0.8 }, scaleX: { from: 0.8, to: 1.2 }, scaleY: { from: 0.8, to: 1.2 }, yoyo: true, repeat: -1, duration: 1200 + rand(0, 800) });
    });
  }

  drawTree(g, x, h, s, color) {
    g.fillStyle(color);
    g.fillTriangle(x, h*0.74-s*2.8, x-s*1.1, h*0.74-s*0.3, x+s*1.1, h*0.74-s*0.3);
    g.fillTriangle(x, h*0.74-s*4.2, x-s*0.8, h*0.74-s*2.2, x+s*0.8, h*0.74-s*2.2);
    g.fillRect(x-s*0.18, h*0.74-s*0.3, s*0.36, s*0.3);
  }

  // ── Hero ────────────────────────────────────────────────────
  createHero(width) {
    const x = width * 0.15;
    this.heroShadow = this.add.ellipse(x, this.groundY + 5, 50, 13, 0x000000, 0.22);
    this.hero = this.add.sprite(x, this.groundY, 'hero_idle').setOrigin(0.5, 1).setScale(1.5);
    this.hero.play('hero_idle');
    this.heroHp = this.player?.hp  ?? 80;
    this.heroMaxHp = this.player?.maxHp ?? 80;
    this.heroMp = this.player?.mp  ?? 100;
    this.heroMaxMp = this.player?.maxMp ?? 100;
    this.heroAtk = this.player?.atk ?? 0;
    this.heroDef = this.player?.def ?? 0;
  }

  // ── Monsters ────────────────────────────────────────────────
  spawnMonsters(width, height) {
    const positions = [width * 0.38, width * 0.58, width * 0.76];
    ENEMIES.forEach((def, i) => {
      const x = positions[i];
      const monster = this.createMonster(def, x, this.groundY);
      this.monsters.push(monster);
      // Bob tween
      this.tweens.add({ targets: monster.container, y: `-=${def.boss ? 6 : 4}`, yoyo: true, repeat: -1, duration: def.boss ? 900 : 700, ease: 'Sine.easeInOut' });
    });
  }

  createMonster(def, x, groundY) {
    const container = this.add.container(x, 0);
    const s = def.scale;

    // Body graphics
    const g = this.add.graphics();
    this.drawMonsterBody(g, def, s);
    container.add(g);

    // Boss crown
    if (def.boss) {
      const crown = this.add.text(0, -groundY + 20, '👑', { fontSize: 18 }).setOrigin(0.5, 1);
      container.add(crown);
    }

    // Name label (always visible)
    const nameStyle = { fontFamily: 'Georgia', fontSize: 11, color: def.boss ? '#ffcc00' : '#ffffff', backgroundColor: '#000000bb', padding: { x: 6, y: 3 } };
    const nameText = this.add.text(0, groundY - 145 * s, (def.boss ? '⚠ ' : '') + def.name, nameStyle).setOrigin(0.5, 1);
    container.add(nameText);

    // HP bar (hidden until targeted)
    const barW = def.boss ? 100 : 80;
    const barY = groundY - 150 * s;
    const hpBg  = this.add.rectangle(0, barY, barW, 8, 0x333333).setVisible(false);
    const hpFill = this.add.rectangle(-barW/2, barY, barW, 8, def.color).setOrigin(0, 0.5).setVisible(false);
    container.add(hpBg); container.add(hpFill);

    // Selection ring
    const ring = this.add.ellipse(0, groundY - 5, 60 * s, 16 * s, 0xffffff, 0).setStrokeStyle(2, 0xffffff, 0);
    container.add(ring);

    // Interactive zone
    const hitW = 64 * s, hitH = 120 * s;
    const zone = this.add.rectangle(0, groundY - hitH / 2, hitW, hitH, 0xffffff, 0).setInteractive({ cursor: 'pointer' });
    container.add(zone);

    const data = { ...def, hp: def.maxHp, container, g, hpBg, hpFill, ring, nameText, hitW, dead: false, lastClick: 0 };

    zone.on('pointerover', () => { if (!data.dead) nameText.setStyle({ ...nameStyle, backgroundColor: `#${def.color.toString(16).padStart(6,'0')}88` }); });
    zone.on('pointerout',  () => { if (!data.dead) nameText.setStyle(nameStyle); });
    zone.on('pointerdown', ptr => {
      ptr.event.stopPropagation();
      if (data.dead) return;
      const now = Date.now();
      if (now - data.lastClick < 350) {
        this.engageCombat(data);   // double-click
      } else {
        this.selectTarget(data);   // single click
      }
      data.lastClick = now;
    });

    container.setPosition(x, 0);
    return data;
  }

  drawMonsterBody(g, def, s) {
    const { color } = def;
    const c = Phaser.Display.Color.IntegerToColor(color);
    const dark = Phaser.Display.Color.GetColor(Math.max(0,c.red-40), Math.max(0,c.green-40), Math.max(0,c.blue-40));

    if (def.name === 'Shadow Wolf') {
      g.fillStyle(color);
      g.fillRect(-18*s, this.groundY-22*s, 36*s, 20*s);
      g.fillRect(-10*s, this.groundY-38*s, 22*s, 20*s);
      g.fillRect(-8*s,  this.groundY-48*s, 7*s,  12*s);
      g.fillRect(7*s,   this.groundY-48*s, 7*s,  12*s);
      g.fillStyle(0xff4444); g.fillRect(-4*s, this.groundY-34*s, 5*s, 5*s); g.fillRect(6*s, this.groundY-34*s, 5*s, 5*s);
      g.fillStyle(dark);  g.fillRect(18*s, this.groundY-22*s, 12*s, 7*s);
      g.fillStyle(color);
      [-12,-4,4,12].forEach(lx => g.fillRect(lx*s, this.groundY-2*s, 6*s, 14*s));
    } else if (def.name === 'Undead Archer') {
      g.fillStyle(0xc8e6c9); g.fillRect(-8*s, this.groundY-42*s, 16*s, 20*s);
      g.fillStyle(color);    g.fillRect(-12*s, this.groundY-22*s, 24*s, 28*s);
      g.fillStyle(0x1b5e20); g.fillRect(-5*s, this.groundY-48*s, 4*s, 8*s); g.fillRect(3*s, this.groundY-48*s, 4*s, 8*s);
      g.fillStyle(0xff8f00); g.fillRect(-4*s, this.groundY-38*s, 4*s, 4*s); g.fillRect(3*s, this.groundY-38*s, 4*s, 4*s);
      g.fillStyle(0x795548); g.fillRect(14*s, this.groundY-36*s, 4*s, 36*s);
      g.fillStyle(color);  g.fillRect(-12*s, this.groundY+6*s, 6*s, 16*s); g.fillRect(6*s, this.groundY+6*s, 6*s, 16*s);
    } else { // Forest Troll
      g.fillStyle(color); g.fillRect(-24*s, this.groundY-8*s, 48*s, 34*s);
      g.fillRect(-18*s, this.groundY-42*s, 36*s, 36*s);
      g.fillStyle(dark); g.fillRect(-22*s, this.groundY-14*s, 8*s, 44*s); g.fillRect(14*s, this.groundY-14*s, 8*s, 44*s);
      g.fillStyle(0x00897b); g.fillRect(-10*s, this.groundY-38*s, 8*s, 8*s); g.fillRect(4*s, this.groundY-38*s, 8*s, 8*s);
      g.fillStyle(0x4e342e); g.fillRect(-8*s, this.groundY-24*s, 16*s, 5*s);
      g.fillStyle(0x5d4037); g.fillRect(24*s, this.groundY-26*s, 10*s, 44*s); g.fillRect(20*s, this.groundY-32*s, 18*s, 14*s);
    }
  }

  // ── Targeting ───────────────────────────────────────────────
  selectTarget(data) {
    // Deselect previous
    if (this.target && this.target !== data) this.deselectTarget(this.target);
    this.target = data;
    data.hpBg.setVisible(true);
    data.hpFill.setVisible(true);
    data.ring.setStrokeStyle(2, 0xffffff, 0.9);
    this.tweens.add({ targets: data.ring, alpha: { from: 0, to: 1 }, duration: 200 });
    EventBus.emit('monster-targeted', { name: data.name, hp: data.hp, maxHp: data.maxHp, boss: data.boss, color: data.color });
  }

  deselectTarget(data) {
    data.hpBg.setVisible(false);
    data.hpFill.setVisible(false);
    data.ring.setStrokeStyle(2, 0xffffff, 0);
  }

  // ── Combat ──────────────────────────────────────────────────
  engageCombat(data) {
    if (this.inCombat || data.dead) return;
    this.selectTarget(data);
    this.inCombat = true;
    EventBus.emit('combat-start');

    // Walk hero close to monster
    const targetX = data.container.x - 90;
    const dist = Math.abs(this.hero.x - targetX);
    this.hero.setFlipX(false);
    this.hero.play('hero_walk', true);
    this.moveTween?.stop();
    this.moveTween = this.tweens.add({
      targets: [this.hero, this.heroShadow], x: targetX,
      duration: dist * 4, ease: 'Linear',
      onComplete: () => this.startAttackLoop(data),
    });
  }

  startAttackLoop(data) {
    if (data.dead || !this.inCombat) return;
    this.hero.play('hero_idle', true);
    this.doPlayerAttack(data, 0); // default skill 0
  }

  doPlayerAttack(data, skillIdx) {
    if (!this.inCombat || !data || data.dead) return;

    const skills = [
      { name: 'Magic Arrow', anim: 'hero_attack', mp: 0,  dmg: [8,16]  },
      { name: 'Desiccation', anim: 'hero_cast',   mp: 20, dmg: [20,35] },
      { name: 'Wave of Souls', anim: 'hero_souls', mp: 40, dmg: [45,65] },
    ];
    const skill = skills[skillIdx] ?? skills[0];

    if (this.heroMp < skill.mp) {
      EventBus.emit('log-message', { text: 'Not enough MP!', color: '#ff6b6b' });
      skillIdx = 0;
    }

    this.heroMp = Math.max(0, this.heroMp - skill.mp);
    this.hero.play(skill.anim, true);
    this.hero.once('animationcomplete', () => {
      if (!this.inCombat || data.dead) return;
      this.hero.play('hero_idle', true);
    });

    const dmg = rand(...skill.dmg) + this.heroAtk;
    data.hp = Math.max(0, data.hp - dmg);
    this.updateHpBar(data);
    this.floatDamage(data.container.x - 40, this.groundY - 60, dmg, '#ff9966');
    EventBus.emit('log-message', { text: `${skill.name}: ${dmg} dmg!`, color: '#ff9966' });
    this.shakeMonster(data);

    if (data.hp <= 0) { this.onMonsterDead(data); return; }

    // Monster counter-attacks after delay
    this.attackTimer = this.time.delayedCall(900, () => this.doMonsterAttack(data));
  }

  doMonsterAttack(data) {
    if (!this.inCombat || data.dead) return;
    const eDmg = Math.max(1, rand(...data.atk) - this.heroDef);
    this.heroHp = Math.max(0, this.heroHp - eDmg);
    this.hero.play('hero_hurt', true);
    this.hero.once('animationcomplete', () => this.hero.play('hero_idle', true));
    this.floatDamage(this.hero.x, this.groundY - 80, eDmg, '#ff4444');
    EventBus.emit('log-message', { text: `${data.name} hits you for ${eDmg}!`, color: '#ff6b6b' });
    EventBus.emit('player-hp-change', { hp: this.heroHp, maxHp: this.heroMaxHp });
    this.cameras.main.shake(120, 0.004);

    if (this.heroHp <= 0) {
      this.hero.play('hero_dead', true);
      this.inCombat = false;
      EventBus.emit('log-message', { text: '💀 You were defeated! Returning to town...', color: '#ff4444' });
      this.time.delayedCall(1500, () => {
        this.heroHp = Math.floor(this.heroMaxHp * 0.3);
        EventBus.emit('player-died', { hp: this.heroHp });
        this.gotoTown();
      });
      return;
    }
    // Queue next player attack
    this.attackTimer = this.time.delayedCall(800, () => this.doPlayerAttack(data, 0));
  }

  onMonsterDead(data) {
    data.dead = true;
    this.inCombat = false;
    this.attackTimer?.remove();

    this.hero.play('hero_idle', true);
    this.tweens.add({ targets: data.container, alpha: 0, duration: 600, delay: 300 });

    const player = this.registry.get('player');
    const kills = { ...(player?.kills ?? {}), [data.name]: ((player?.kills?.[data.name] ?? 0) + 1) };
    const newXp   = (player?.xp   ?? 0) + data.xp;
    const newGold = (player?.gold  ?? 0) + data.gold;
    const updated = { ...player, xp: newXp, gold: newGold, kills, hp: this.heroHp, mp: this.heroMp };

    this.registry.set('player', updated);
    EventBus.emit('player-update', updated);
    EventBus.emit('log-message', { text: `⚔️ ${data.name} defeated! +${data.xp}XP +${data.gold}G`, color: '#44ff88' });

    this.floatDamage(data.container.x, this.groundY - 40, `+${data.xp} XP`, '#ffe066', 20);

    // Respawn after 8s
    this.time.delayedCall(8000, () => {
      if (!data.dead) return;
      data.dead = false;
      data.hp = data.maxHp;
      this.updateHpBar(data);
      this.tweens.add({ targets: data.container, alpha: 1, duration: 600 });
    });

    // Check if target still alive
    if (this.target === data) { this.target = null; EventBus.emit('monster-targeted', null); }
  }

  onUseSkill(skillIdx) { if (this.inCombat && this.target && !this.target.dead) this.doPlayerAttack(this.target, skillIdx); }

  // ── Helpers ─────────────────────────────────────────────────
  updateHpBar(data) {
    const pct = data.hp / data.maxHp;
    const barW = data.boss ? 100 : 80;
    data.hpFill.width = Math.max(0, barW * pct);
    EventBus.emit('monster-hp-change', { hp: data.hp, maxHp: data.maxHp });
  }

  shakeMonster(data) {
    this.tweens.add({ targets: data.container, x: data.container.x + 6, yoyo: true, repeat: 2, duration: 40, ease: 'Linear',
      onComplete: () => { data.container.x = ENEMIES.indexOf(data) >= 0 ? data.container.x : data.container.x; } });
  }

  floatDamage(x, y, value, color, size = 16) {
    const txt = this.add.text(x, y, String(value), {
      fontFamily: 'Georgia', fontSize: size, fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    this.tweens.add({ targets: txt, y: y - 55, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => txt.destroy() });
  }

  setupInput(width, height) {
    this.input.on('pointerdown', ptr => {
      if (ptr.worldY < this.groundY - 120) return;
      const x = Phaser.Math.Clamp(ptr.worldX, 40, width * 0.25); // only left portion walkable freely
      this.moveHeroTo(x);
    });
  }

  moveHeroTo(x) {
    if (this.inCombat) return;
    const dist = Math.abs(x - this.hero.x);
    if (dist < 8) return;
    this.hero.setFlipX(x < this.hero.x);
    this.hero.play('hero_walk', true);
    this.moveTween?.stop();
    this.moveTween = this.tweens.add({
      targets: [this.hero, this.heroShadow], x, duration: dist * 4.5, ease: 'Linear',
      onComplete: () => this.hero.play('hero_idle', true),
    });
  }

  gotoTown() {
    this.attackTimer?.remove();
    this.inCombat = false;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.time.delayedCall(320, () => this.scene.start('Town'));
  }

  update() { if (this.heroShadow && this.hero) this.heroShadow.x = this.hero.x; }
  shutdown() { this.attackTimer?.remove(); EventBus.removeAllListeners(); }
}
