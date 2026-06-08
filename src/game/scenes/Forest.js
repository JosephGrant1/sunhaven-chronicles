import Phaser from 'phaser';
import { EventBus } from '../EventBus';

const ENEMIES = [
  { key:'goblin', name:'Goblin Scout',  hp:60,  maxHp:60,  atk:[8,14],  xp:25, gold:12, scale:0.9, boss:false, color:0x7bc87b },
  { key:'orc',    name:'Orc Warrior',   hp:80,  maxHp:80,  atk:[10,18], xp:35, gold:18, scale:1.0, boss:false, color:0xc87b3a },
  { key:'ogre',   name:'Ogre Brute',    hp:140, maxHp:140, atk:[14,22], xp:60, gold:30, scale:1.4, boss:true,  color:0xc84444 },
];

const rand = (min, max) => Phaser.Math.Between(min, max);

export default class Forest extends Phaser.Scene {
  constructor() { super('Forest'); }

  create() {
    const { width, height } = this.scale;
    this.groundY  = Math.round(height * 0.78);
    this.monsters = [];
    this.target   = null;
    this.inCombat = false;
    this.attackTimer = null;
    this.moveTween   = null;
    this.player = this.registry.get('player');

    this.createParallaxBg(width, height);
    this.createHero(width);
    this.spawnMonsters(width);
    this.setupInput(width);

    this.cameras.main.fadeIn(500);
    EventBus.emit('scene-ready', 'Forest');
    EventBus.on('use-skill', this.onUseSkill, this);
    EventBus.on('go-town',   this.gotoTown,   this);
  }

  // ── Parallax background ──────────────────────────────────
  createParallaxBg(w, h) {
    this.bgLayers = [];
    // 5 layers: 1=sky/far, 5=near foreground
    const speeds = [0, 0.02, 0.05, 0.1, 0.15];
    for (let i = 1; i <= 5; i++) {
      // The source images are 3840×915 — tile them to fill width
      const img = this.add.tileSprite(0, 0, w, h, `bg_forest_${i}`)
        .setOrigin(0, 0)
        .setDisplaySize(w, h);
      img.scrollSpeed = speeds[i - 1];
      this.bgLayers.push(img);
    }
  }

  // ── Hero ─────────────────────────────────────────────────
  createHero(width) {
    const x = width * 0.14;
    this.heroShadow = this.add.ellipse(x, this.groundY + 6, 55, 14, 0x000000, 0.3);
    this.hero = this.add.sprite(x, this.groundY, 'oracle_idle').setOrigin(0.5, 1).setScale(1.0);
    this.hero.play('oracle_idle');
    this.heroHp    = this.player?.hp    ?? 80;
    this.heroMaxHp = this.player?.maxHp ?? 80;
    this.heroMp    = this.player?.mp    ?? 100;
    this.heroMaxMp = this.player?.maxMp ?? 100;
    this.heroAtk   = this.player?.atk   ?? 0;
    this.heroDef   = this.player?.def   ?? 0;
  }

  // ── Monsters ─────────────────────────────────────────────
  spawnMonsters(width) {
    const positions = [width * 0.40, width * 0.60, width * 0.80];
    ENEMIES.forEach((def, i) => {
      const mon = this.createMonster(def, positions[i]);
      this.monsters.push(mon);
    });
  }

  createMonster(def, x) {
    const s = def.scale;

    // Sprite — flip to face left (toward hero)
    const sprite = this.add.sprite(x, this.groundY, `${def.key}_idle`)
      .setOrigin(0.5, 1)
      .setScale(s)
      .setFlipX(true);
    sprite.play(`${def.key}_idle`);

    // Shadow
    const shadow = this.add.ellipse(x, this.groundY + 5, 60 * s, 16 * s, 0x000000, 0.25);

    // Name label
    const nameY = this.groundY - 220 * s;
    const nameTxt = this.add.text(x, nameY, (def.boss ? '⚠ ' : '') + def.name, {
      fontFamily: 'Georgia', fontSize: def.boss ? 13 : 11,
      color: def.boss ? '#ffcc00' : '#ffffff',
      backgroundColor: '#000000bb', padding: { x:7, y:3 },
    }).setOrigin(0.5, 1);

    // HP bar (hidden until targeted)
    const barW = def.boss ? 110 : 85;
    const barY = nameY - 12;
    const hpBg   = this.add.rectangle(x, barY, barW, 9, 0x333333).setVisible(false);
    const hpFill = this.add.rectangle(x - barW/2, barY, barW, 9, def.color).setOrigin(0, 0.5).setVisible(false);

    // Selection glow
    const glow = this.add.ellipse(x, this.groundY + 2, 70*s, 18*s, 0xffffff, 0).setStrokeStyle(2, 0xffffff, 0);

    // Hit zone (transparent interactive rect)
    const hitW = 160*s, hitH = 220*s;
    const zone = this.add.rectangle(x, this.groundY - hitH/2, hitW, hitH, 0xffffff, 0)
      .setInteractive({ cursor:'pointer' });

    const data = {
      ...def, hp: def.maxHp, sprite, shadow, nameTxt, hpBg, hpFill, glow, zone,
      dead: false, lastClick: 0,
    };

    zone.on('pointerover', () => {
      if (data.dead) return;
      sprite.setTint(0xddddff);
      this.game.canvas.style.cursor = 'pointer';
    });
    zone.on('pointerout', () => {
      sprite.clearTint();
      this.game.canvas.style.cursor = 'default';
    });
    zone.on('pointerdown', ptr => {
      ptr.event.stopPropagation();
      if (data.dead) return;
      const now = Date.now();
      if (now - data.lastClick < 350) this.engageCombat(data);
      else                            this.selectTarget(data);
      data.lastClick = now;
    });

    // Idle bob tween
    this.tweens.add({ targets: [sprite, shadow, nameTxt, hpBg, hpFill, glow, zone],
      y: `-=${def.boss ? 8 : 5}`, yoyo:true, repeat:-1,
      duration: def.boss ? 1000 : 800, ease:'Sine.easeInOut' });

    return data;
  }

  // ── Targeting ────────────────────────────────────────────
  selectTarget(data) {
    if (this.target && this.target !== data) this.deselectTarget(this.target);
    this.target = data;
    data.hpBg.setVisible(true);
    data.hpFill.setVisible(true);
    this.tweens.add({ targets: data.glow, alpha: { from:0, to:0.9 }, duration:200 });
    data.glow.setStrokeStyle(2, 0xffffff, 1);
    EventBus.emit('monster-targeted', { name:data.name, hp:data.hp, maxHp:data.maxHp, boss:data.boss, color:data.color });
  }

  deselectTarget(data) {
    data.hpBg.setVisible(false);
    data.hpFill.setVisible(false);
    data.glow.setAlpha(0);
    data.glow.setStrokeStyle(2, 0xffffff, 0);
  }

  // ── Combat ───────────────────────────────────────────────
  engageCombat(data) {
    if (this.inCombat || data.dead) return;
    this.selectTarget(data);
    this.inCombat = true;
    EventBus.emit('combat-start');

    const targetX = data.sprite.x - 130;
    this.hero.setFlipX(false);
    this.hero.play('oracle_walk', true);
    this.moveTween?.stop();
    this.moveTween = this.tweens.add({
      targets: [this.hero, this.heroShadow], x: targetX,
      duration: Math.abs(this.hero.x - targetX) * 4, ease:'Linear',
      onComplete: () => this.doPlayerAttack(data, 0),
    });
  }

  // skill: 0=throw(magic arrow), 1=slash(desiccation), 2=kick(wave of souls)
  doPlayerAttack(data, skillIdx) {
    if (!this.inCombat || !data || data.dead) return;

    const skills = [
      { name:'Magic Arrow',    anim:'oracle_throw', mp:0,  dmg:[8,16]  },
      { name:'Desiccation',    anim:'oracle_slash', mp:20, dmg:[20,35] },
      { name:'Wave of Souls',  anim:'oracle_kick',  mp:40, dmg:[45,65] },
    ];
    const skill = skills[Phaser.Math.Clamp(skillIdx, 0, 2)];

    if (this.heroMp < skill.mp) {
      EventBus.emit('log-message', { text:'Not enough MP!', color:'#ff6b6b' });
      skill.mp = 0; Object.assign(skill, skills[0]);
    }

    this.heroMp = Math.max(0, this.heroMp - skill.mp);
    EventBus.emit('player-hp-change', { hp:this.heroHp, maxHp:this.heroMaxHp, mp:this.heroMp, maxMp:this.heroMaxMp });

    this.hero.play(skill.anim, true);
    this.hero.once('animationcomplete', () => {
      if (!data.dead && this.inCombat) this.hero.play('oracle_idle', true);
    });

    const dmg = rand(...skill.dmg) + this.heroAtk;
    data.hp = Math.max(0, data.hp - dmg);
    this.updateHpBar(data);
    this.floatText(data.sprite.x - 30, data.sprite.y - 160, `-${dmg}`, '#ff9966');
    EventBus.emit('log-message', { text:`${skill.name}: ${dmg} dmg!`, color:'#ff9966' });

    // Monster recoil
    this.tweens.add({ targets: data.sprite, x: data.sprite.x + 12, yoyo:true, duration:60, repeat:2 });
    data.sprite.play(`${data.key}_hurt`, true);
    data.sprite.once('animationcomplete', () => {
      if (!data.dead) data.sprite.play(`${data.key}_idle`, true);
    });

    if (data.hp <= 0) { this.onMonsterDead(data); return; }

    this.attackTimer = this.time.delayedCall(950, () => this.doMonsterAttack(data));
  }

  doMonsterAttack(data) {
    if (!this.inCombat || data.dead) return;
    data.sprite.play(`${data.key}_attack`, true);
    data.sprite.once('animationcomplete', () => {
      if (!data.dead && this.inCombat) data.sprite.play(`${data.key}_idle`, true);
    });

    const eDmg = Math.max(1, rand(...data.atk) - this.heroDef);
    this.heroHp = Math.max(0, this.heroHp - eDmg);
    this.hero.play('oracle_hurt', true);
    this.hero.once('animationcomplete', () => { if (this.inCombat) this.hero.play('oracle_idle', true); });
    this.floatText(this.hero.x, this.hero.y - 140, `-${eDmg}`, '#ff4444');
    EventBus.emit('log-message', { text:`${data.name} hits for ${eDmg}!`, color:'#ff6b6b' });
    EventBus.emit('player-hp-change', { hp:this.heroHp, maxHp:this.heroMaxHp, mp:this.heroMp, maxMp:this.heroMaxMp });
    this.cameras.main.shake(100, 0.003);

    if (this.heroHp <= 0) {
      this.inCombat = false;
      this.hero.play('oracle_die', true);
      EventBus.emit('log-message', { text:'💀 Defeated! Returning to town...', color:'#ff4444' });
      this.time.delayedCall(1800, () => {
        this.heroHp = Math.floor(this.heroMaxHp * 0.3);
        EventBus.emit('player-died', { hp:this.heroHp });
        this.gotoTown();
      });
      return;
    }
    this.attackTimer = this.time.delayedCall(850, () => this.doPlayerAttack(data, 0));
  }

  onMonsterDead(data) {
    data.dead = true;
    this.inCombat = false;
    this.attackTimer?.remove();
    this.hero.play('oracle_idle', true);

    data.sprite.play(`${data.key}_die`, true);
    data.sprite.once('animationcomplete', () => {
      this.tweens.add({ targets: [data.sprite, data.shadow, data.nameTxt, data.hpBg, data.hpFill, data.glow], alpha:0, duration:500 });
    });

    const player = this.registry.get('player');
    const kills  = { ...(player?.kills ?? {}), [data.name]: ((player?.kills?.[data.name] ?? 0) + 1) };
    const updated = { ...player, xp:(player?.xp??0)+data.xp, gold:(player?.gold??0)+data.gold, kills, hp:this.heroHp, mp:this.heroMp };
    this.registry.set('player', updated);
    EventBus.emit('player-update', updated);
    EventBus.emit('log-message', { text:`⚔️ ${data.name} defeated! +${data.xp}XP +${data.gold}G`, color:'#44ff88' });
    this.floatText(data.sprite.x, data.sprite.y - 180, `+${data.xp} XP`, '#ffe066', 18);

    if (this.target === data) { this.target = null; EventBus.emit('monster-targeted', null); }

    // Respawn after 10s
    this.time.delayedCall(10000, () => {
      if (!data.dead) return;
      data.dead = false; data.hp = data.maxHp;
      this.updateHpBar(data);
      [data.sprite, data.shadow, data.nameTxt, data.glow].forEach(o => { o.setAlpha(0); this.tweens.add({ targets:o, alpha:1, duration:600 }); });
      data.sprite.play(`${data.key}_idle`, true);
    });
  }

  onUseSkill(idx) {
    if (this.inCombat && this.target && !this.target.dead) {
      this.attackTimer?.remove();
      this.doPlayerAttack(this.target, idx);
    }
  }

  // ── Helpers ──────────────────────────────────────────────
  updateHpBar(data) {
    const barW = data.boss ? 110 : 85;
    data.hpFill.width = Math.max(0, barW * (data.hp / data.maxHp));
    EventBus.emit('monster-hp-change', { hp:data.hp, maxHp:data.maxHp });
  }

  floatText(x, y, value, color, size = 16) {
    const txt = this.add.text(x, y, String(value), {
      fontFamily:'Georgia', fontSize:size, fontStyle:'bold', color,
      stroke:'#000000', strokeThickness:3,
    }).setOrigin(0.5);
    this.tweens.add({ targets:txt, y:y-60, alpha:0, duration:900, ease:'Cubic.easeOut', onComplete:()=>txt.destroy() });
  }

  setupInput(width) {
    this.input.on('pointerdown', ptr => {
      if (ptr.worldY < this.groundY - 150 || this.inCombat) return;
      const x = Phaser.Math.Clamp(ptr.worldX, 40, width * 0.28);
      this.moveHeroTo(x);
    });
  }

  moveHeroTo(x) {
    const dist = Math.abs(x - this.hero.x);
    if (dist < 8) return;
    this.hero.setFlipX(x < this.hero.x);
    this.hero.play('oracle_walk', true);
    this.moveTween?.stop();
    this.moveTween = this.tweens.add({
      targets:[this.hero, this.heroShadow], x, duration:dist*4.5, ease:'Linear',
      onComplete:()=>this.hero.play('oracle_idle', true),
    });
  }

  update() {
    // Parallax scroll
    this.bgLayers?.forEach(layer => { layer.tilePositionX += layer.scrollSpeed; });
    if (this.heroShadow && this.hero) this.heroShadow.x = this.hero.x;
  }

  gotoTown() {
    this.attackTimer?.remove();
    this.inCombat = false;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.time.delayedCall(320, () => this.scene.start('Town'));
  }

  shutdown() { this.attackTimer?.remove(); EventBus.removeAllListeners(); }
}
