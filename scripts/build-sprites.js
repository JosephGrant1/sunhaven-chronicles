import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const FRAME_SIZE = 200; // output px per frame
const SRC = '/Users/josephgrant/Desktop/test';
const OUT = '/Users/josephgrant/Desktop/test/public/sprites/chibi';

const CHARS = {
  oracle: {
    src: `${SRC}/craftpix-net-919731-free-chibi-dark-oracle-character-sprites/Dark_Oracle_1/PNG/PNG Sequences`,
    prefix: '0_Dark_Oracle_',
    anims: { idle:'Idle', walk:'Walking', slash:'Slashing', throw:'Throwing', kick:'Kicking', hurt:'Hurt', die:'Dying' },
  },
  goblin: {
    src: `${SRC}/craftpix-064112-free-orc-ogre-and-goblin-chibi-2d-game-sprites/Goblin/PNG/PNG Sequences`,
    prefix: '0_Goblin_',
    anims: { idle:'Idle', walk:'Walking', attack:'Slashing', hurt:'Hurt', die:'Dying' },
  },
  orc: {
    src: `${SRC}/craftpix-064112-free-orc-ogre-and-goblin-chibi-2d-game-sprites/Orc/PNG/PNG Sequences`,
    prefix: '0_Orc_',
    anims: { idle:'Idle', walk:'Walking', attack:'Slashing', hurt:'Hurt', die:'Dying' },
  },
  ogre: {
    src: `${SRC}/craftpix-064112-free-orc-ogre-and-goblin-chibi-2d-game-sprites/Ogre/PNG/PNG Sequences`,
    prefix: '0_Ogre_',
    anims: { idle:'Idle', walk:'Walking', attack:'Slashing', hurt:'Hurt', die:'Dying' },
  },
};

async function buildSheet(charKey, animKey, animFolder, prefix, srcBase) {
  const folder = path.join(srcBase, animFolder);
  if (!fs.existsSync(folder)) { console.log(`  skip ${animFolder} (not found)`); return 0; }

  const files = fs.readdirSync(folder)
    .filter(f => f.endsWith('.png'))
    .sort()
    .map(f => path.join(folder, f));

  if (!files.length) return 0;

  const count = files.length;
  const sheetW = FRAME_SIZE * count;
  const sheetH = FRAME_SIZE;

  // Resize all frames and composite onto one wide image
  const composites = await Promise.all(files.map(async (f, i) => ({
    input: await sharp(f).resize(FRAME_SIZE, FRAME_SIZE, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } }).png().toBuffer(),
    left: i * FRAME_SIZE,
    top: 0,
  })));

  const outPath = path.join(OUT, charKey, `${animKey}.png`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  await sharp({ create: { width: sheetW, height: sheetH, channels: 4, background: { r:0,g:0,b:0,alpha:0 } } })
    .composite(composites)
    .png()
    .toFile(outPath);

  console.log(`  ✓ ${charKey}/${animKey}.png — ${count} frames`);
  return count;
}

async function main() {
  console.log('Building spritesheets...\n');
  const manifest = {};

  for (const [charKey, cfg] of Object.entries(CHARS)) {
    console.log(`[${charKey}]`);
    manifest[charKey] = {};
    for (const [animKey, animFolder] of Object.entries(cfg.anims)) {
      const count = await buildSheet(charKey, animKey, animFolder, cfg.prefix, cfg.src);
      if (count) manifest[charKey][animKey] = count;
    }
  }

  // Write manifest so Boot.js knows frame counts
  fs.writeFileSync(
    path.join(OUT, 'manifest.json'),
    JSON.stringify({ frameSize: FRAME_SIZE, chars: manifest }, null, 2)
  );
  console.log('\n✅ Done. Manifest written to public/sprites/chibi/manifest.json');
}

main().catch(console.error);
