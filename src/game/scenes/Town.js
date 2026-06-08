import Phaser from 'phaser';
import { EventBus } from '../EventBus';

export default class Town extends Phaser.Scene {
  constructor() { super('Town'); }

  create() {
    const { width, height } = this.scale;
    this.groundY = Math.round(height * 0.72);
    this.moveTween = null;

    this.createParallaxBg(width, height);
    this.drawForeground(width, height);
    this.createHero(width);
    this.createNPCs(width);
    this.setupInput(width);

    // Clouds
    this.cloud1 = this.add.ellipse(80,  height * 0.1, 120, 36, 0xffffff, 0.8);
    this.cloud2 = this.add.ellipse(500, height * 0.15, 100, 28, 0xffffff, 0.8);

    EventBus.emit('scene-ready', 'Town');
    EventBus.on('go-forest', this.gotoForest, this);
    EventBus.on('do-rest', () => {
      this.hero.play('hero_idle', true);
      EventBus.emit('player-rested');
    }, this);
  }

  update() {
    this.bgLayers?.forEach(layer => { layer.tilePositionX += layer.scrollSpeed; });
    if (this.heroShadow && this.hero) this.heroShadow.x = this.hero.x;
  }

  createParallaxBg(w, h) {
    this.bgLayers = [];
    const speeds = [0, 0.01, 0.03, 0.06, 0.1];
    for (let i = 1; i <= 5; i++) {
      const layer = this.add.tileSprite(0, 0, w, h, `bg_town_${i}`)
        .setOrigin(0, 0).setDisplaySize(w, h);
      layer.scrollSpeed = speeds[i - 1];
      this.bgLayers.push(layer);
    }
  }

  drawForeground(w, h) {
    // Transparent ground overlay so NPCs have a surface to stand on
    const g = this.add.graphics();
    g.fillStyle(0xd4a96a, 0.35);
    g.fillTriangle(w * 0.28, h, w * 0.72, h, w * 0.62, h * 0.75);
    // Forest gate markers (right side)
    g.fillStyle(0x2d5a27, 0.8);
    g.fillRect(w * 0.87, h * 0.72 - 100, 18, 100);
    g.fillRect(w * 0.93, h * 0.72 - 100, 18, 100);
    g.fillRect(w * 0.87, h * 0.72 - 106, 24, 16);
  }

  drawBuilding(g, x, h, bw, bh, wall, roof) {
    const by = h * 0.72 - bh;
    g.fillStyle(wall); g.fillRect(x - bw / 2, by, bw, bh);
    g.fillStyle(roof);
    g.fillTriangle(x - bw / 2 - 8, by, x, by - bh * 0.42, x + bw / 2 + 8, by);
    g.fillStyle(0x6b3a1f); g.fillRect(x - bw * 0.16, by + bh * 0.6, bw * 0.32, bh * 0.4);
    g.fillStyle(0xffe08866);
    g.fillRect(x - bw * 0.38, by + bh * 0.2, bw * 0.26, bh * 0.26);
    g.fillRect(x + bw * 0.12, by + bh * 0.2, bw * 0.26, bh * 0.26);
  }

  drawTree(g, x, h, s) {
    g.fillStyle(0x2d5a27);
    g.fillTriangle(x, h * 0.72 - s * 2.2, x - s, h * 0.72 - s * 0.5, x + s, h * 0.72 - s * 0.5);
    g.fillStyle(0x5c3317); g.fillRect(x - s * 0.2, h * 0.72 - s * 0.5, s * 0.4, s * 0.5);
  }

  createHero(width) {
    this.heroShadow = this.add.ellipse(width * 0.3, this.groundY + 6, 55, 14, 0x000000, 0.28);
    this.hero = this.add.sprite(width * 0.3, this.groundY, 'oracle_idle').setOrigin(0.5, 1).setScale(1.0);
    this.hero.play('oracle_idle');
  }

  createNPCs(width) {
    const gnd = this.groundY;
    const npcs = [
      { id: 'inn',    label: '🏠 Golden Fin Inn',   x: 0.10 },
      { id: 'shop',   label: "🛍️ Alva's Emporium",  x: 0.40 },
      { id: 'mortis', label: '🌑 Mortis',            x: 0.57 },
      { id: 'quest',  label: '📋 Guild Board',       x: 0.72 },
      { id: 'forest', label: '🌲 Dark Forest',       x: 0.90 },
    ];

    npcs.forEach(npc => {
      const x = Math.round(width * npc.x);
      const hit = this.add.rectangle(x, gnd - 50, 80, 100, 0xffffff, 0).setInteractive({ cursor: 'pointer' });
      const txt = this.add.text(x, gnd - 108, npc.label, {
        fontFamily: 'Georgia', fontSize: 11, color: '#ffe066',
        backgroundColor: '#000000cc', padding: { x: 7, y: 4 }, align: 'center',
      }).setOrigin(0.5, 1);

      const arrow = this.add.triangle(x, gnd - 110, 0, 8, 6, 0, -6, 0, 0xffe066, 1).setOrigin(0.5, 0).setVisible(false);

      hit.on('pointerover', () => { txt.setStyle({ color: '#ffffff', backgroundColor: '#7b4faa99' }); arrow.setVisible(true); });
      hit.on('pointerout',  () => { txt.setStyle({ color: '#ffe066', backgroundColor: '#000000cc' }); arrow.setVisible(false); });
      hit.on('pointerdown', ptr => { ptr.event.stopPropagation(); EventBus.emit('npc-click', npc.id); });
    });
  }

  setupInput(width) {
    this.input.on('pointerdown', ptr => {
      const x = Phaser.Math.Clamp(ptr.worldX, 50, width - 50);
      // Only move on ground level clicks (not NPC zone hits)
      if (ptr.worldY < this.groundY - 110) return;
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
      targets: this.hero, x,
      duration: dist * 4.5, ease: 'Linear',
      onComplete: () => this.hero.play('oracle_idle', true),
    });
  }

  gotoForest() {
    this.moveTween?.stop();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.time.delayedCall(320, () => this.scene.start('Forest'));
  }

  shutdown() { EventBus.removeAllListeners(); }
}
