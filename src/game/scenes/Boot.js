import Phaser from 'phaser';

export default class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2, height / 2, 0, 14, 0x9b59b6);
    this.add.rectangle(width / 2, height / 2, 302, 18).setStrokeStyle(1, 0x7b4faa);
    this.add.text(width / 2, height / 2 - 26, 'Loading Sunhaven...', {
      fontFamily: 'Georgia', fontSize: 14, color: '#c39bd3',
    }).setOrigin(0.5);
    this.load.on('progress', v => { bar.width = 300 * v; });

    const f = { frameWidth: 128, frameHeight: 128 };
    this.load.spritesheet('hero_idle',    '/sprites/necromancer/idle.png',          f);
    this.load.spritesheet('hero_walk',    '/sprites/necromancer/soul_walk.png',     f);
    this.load.spritesheet('hero_attack',  '/sprites/necromancer/magic_arrow.png',   f);
    this.load.spritesheet('hero_cast',    '/sprites/necromancer/desiccation.png',   f);
    this.load.spritesheet('hero_souls',   '/sprites/necromancer/wave_of_souls.png', f);
    this.load.spritesheet('hero_hurt',    '/sprites/necromancer/soul_hurt.png',     f);
    this.load.spritesheet('hero_dead',    '/sprites/necromancer/soul_dead.png',     f);
  }

  create() {
    const a = (key, tex, end, fps, loop) => this.anims.create({
      key, frames: this.anims.generateFrameNumbers(tex, { start: 0, end }),
      frameRate: fps, repeat: loop ? -1 : 0,
    });
    a('hero_idle',   'hero_idle',   5, 8,  true);
    a('hero_walk',   'hero_walk',   4, 8,  true);
    a('hero_attack', 'hero_attack', 8, 12, false);
    a('hero_cast',   'hero_cast',   9, 10, false);
    a('hero_souls',  'hero_souls',  6, 10, false);
    a('hero_hurt',   'hero_hurt',   2, 8,  false);
    a('hero_dead',   'hero_dead',   3, 8,  false);

    this.scene.start('Town');
  }
}
