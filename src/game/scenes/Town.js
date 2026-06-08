import Phaser from 'phaser';
import { EventBus } from '../EventBus';

export default class Town extends Phaser.Scene {
  constructor() { super('Town'); }

  create() {
    const { width, height } = this.scale;
    this.groundY = Math.round(height * 0.72);
    this.moveTween = null;

    this.createParallaxBg(width, height);
    this.createHero(width);
    this.createNPCs(width);
    this.setupInput(width);

    EventBus.emit('scene-ready', 'Town');
    EventBus.on('go-forest', this.gotoForest, this);
    EventBus.on('do-rest', () => {
      this.hero.play('oracle_idle', true);
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
