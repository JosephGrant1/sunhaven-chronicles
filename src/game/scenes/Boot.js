import Phaser from 'phaser';
import manifest from '../spriteManifest.json';

export const MANIFEST = manifest; // re-exported for scenes to use

export default class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    const { width, height } = this.scale;

    // Loading bar
    const bg  = this.add.rectangle(width/2, height/2, 320, 40, 0x1a0a2e);
    const bar = this.add.rectangle(width/2 - 150, height/2, 0, 20, 0x9b59b6).setOrigin(0, 0.5);
    this.add.rectangle(width/2, height/2, 304, 24).setStrokeStyle(1, 0x7b4faa);
    this.add.text(width/2, height/2 - 30, 'Loading Sunhaven Chronicles...', { fontFamily:'Georgia', fontSize:14, color:'#c39bd3' }).setOrigin(0.5);
    this.load.on('progress', v => { bar.width = 300 * v; });

    const F = manifest.frameSize;

    // ── Hero (Dark Oracle) ──────────────────────────────────
    Object.entries(manifest.chars.oracle).forEach(([anim, frames]) => {
      this.load.spritesheet(`oracle_${anim}`, `/sprites/chibi/oracle/${anim}.png`, { frameWidth: F, frameHeight: F });
    });

    // ── Enemies ─────────────────────────────────────────────
    ['goblin','orc','ogre'].forEach(enemy => {
      Object.entries(manifest.chars[enemy]).forEach(([anim, frames]) => {
        this.load.spritesheet(`${enemy}_${anim}`, `/sprites/chibi/${enemy}/${anim}.png`, { frameWidth: F, frameHeight: F });
      });
    });

    // ── Parallax backgrounds (scene 1 = dark forest) ────────
    [1,2,3,4,5].forEach(i => {
      this.load.image(`bg_forest_${i}`, `/backgrounds/scene1/${i}.png`);
      this.load.image(`bg_town_${i}`,   `/backgrounds/scene2/${i}.png`);
    });

    // ── UI panels ────────────────────────────────────────────
    this.load.image('panel_0', '/ui/panels/panel-000.png');
    this.load.image('panel_1', '/ui/panels/panel-001.png');
    this.load.image('panel_2', '/ui/panels/panel-002.png');
  }

  create() {
    const chars = manifest.chars;

    // Helper: create animation
    const anim = (key, spriteKey, frames, fps, loop) =>
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(spriteKey, { start:0, end:frames-1 }), frameRate: fps, repeat: loop ? -1 : 0 });

    // Hero animations
    anim('oracle_idle',  'oracle_idle',  chars.oracle.idle,  10, true);
    anim('oracle_walk',  'oracle_walk',  chars.oracle.walk,  12, true);
    anim('oracle_slash', 'oracle_slash', chars.oracle.slash, 14, false);
    anim('oracle_throw', 'oracle_throw', chars.oracle.throw, 14, false);
    anim('oracle_kick',  'oracle_kick',  chars.oracle.kick,  14, false);
    anim('oracle_hurt',  'oracle_hurt',  chars.oracle.hurt,  12, false);
    anim('oracle_die',   'oracle_die',   chars.oracle.die,   10, false);

    // Enemy animations
    ['goblin','orc','ogre'].forEach(e => {
      const c = chars[e];
      anim(`${e}_idle`,   `${e}_idle`,   c.idle,   10, true);
      anim(`${e}_walk`,   `${e}_walk`,   c.walk,   12, true);
      anim(`${e}_attack`, `${e}_attack`, c.attack, 12, false);
      anim(`${e}_hurt`,   `${e}_hurt`,   c.hurt,   12, false);
      anim(`${e}_die`,    `${e}_die`,    c.die,    10, false);
    });

    this.scene.start('Town');
  }
}
