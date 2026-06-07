// ============================================================
// Sunhaven Chronicles — Multiplayer RPG
// Stack: React + SmartFoxServer 2X + MySQL (via PHP API)
//
// Load SFS2X client in your HTML before this bundle:
//   <script src="https://your-sfs-host/sfs2x-api-1.7.8.min.js"></script>
//   Or from npm: import * as SFS2X from 'sfs2x-api';
// ============================================================
import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// CONFIG — edit to match your servers
// ============================================================
const API_BASE  = "http://localhost/sunhaven/backend/api.php";
const SFS_HOST  = "localhost";
const SFS_PORT  = 8080;   // SFS2X WebSocket port (default 8080)
const SFS_ZONE  = "SunhavenChronicles";

// ============================================================
// GAME DATA
// ============================================================
const CLASSES = {
  warrior: {
    name: "Warrior", icon: "⚔️", color: "#e05a3a", hp: 120, mp: 60,
    skills: [
      { name: "Slash",      mpCost: 0,  damage: [12,20], cooldown: 0, icon: "⚔️", desc: "Basic attack" },
      { name: "Shield Bash",mpCost: 15, damage: [18,28], cooldown: 3, icon: "🛡️", desc: "Stun + dmg", stun: true },
      { name: "War Cry",    mpCost: 25, damage: [30,45], cooldown: 5, icon: "💢", desc: "AOE burst" },
    ],
  },
  mage: {
    name: "Mage", icon: "🔮", color: "#6a7fdb", hp: 80, mp: 120,
    skills: [
      { name: "Fireball", mpCost: 0,  damage: [10,18], cooldown: 0, icon: "🔥", desc: "Basic spell" },
      { name: "Ice Lance", mpCost: 18, damage: [22,34], cooldown: 3, icon: "❄️", desc: "Slow + dmg", slow: true },
      { name: "Meteor",    mpCost: 35, damage: [40,60], cooldown: 6, icon: "☄️", desc: "Massive nuke" },
    ],
  },
  rogue: {
    name: "Rogue", icon: "🗡️", color: "#44b37b", hp: 95, mp: 80,
    skills: [
      { name: "Stab",       mpCost: 0,  damage: [8,22],  cooldown: 0, icon: "🗡️", desc: "Quick strike" },
      { name: "Smoke Bomb", mpCost: 20, damage: [15,25], cooldown: 4, icon: "💨", desc: "Evade + dmg", evade: true },
      { name: "Death Mark", mpCost: 30, damage: [35,55], cooldown: 5, icon: "💀", desc: "Critical hit" },
    ],
  },
};

const ZONES = {
  town: { name: "Sunhaven Town", bg: "town" },
  forest: {
    name: "Dark Forest", bg: "forest",
    enemies: [
      { name: "Shadow Wolf",   hp: 60,  maxHp: 60,  atk: [8,14],  xp: 25, gold: 12, icon: "🐺", color: "#7b5ea7" },
      { name: "Undead Archer", hp: 80,  maxHp: 80,  atk: [10,18], xp: 35, gold: 18, icon: "💀", color: "#4a7c59" },
      { name: "Forest Troll",  hp: 140, maxHp: 140, atk: [14,22], xp: 60, gold: 30, icon: "👹", color: "#c06c00", boss: true },
    ],
  },
};

const SHOP_ITEMS = [
  { id: "hpotion", name: "Health Potion", icon: "🧪", cost: 20, effect: "hp",  value: 40, desc: "+40 HP" },
  { id: "mpotion", name: "Mana Potion",   icon: "💧", cost: 15, effect: "mp",  value: 30, desc: "+30 MP" },
  { id: "sword2",  name: "Iron Blade",    icon: "🗡️", cost: 80, effect: "atk", value: 5,  desc: "+5 Attack" },
  { id: "armor2",  name: "Chain Mail",    icon: "🛡️", cost: 100, effect: "def", value: 4, desc: "+4 Defense" },
];

const DEFAULT_QUESTS = [
  { id: "q1", name: "Wolf Hunter",  desc: "Slay 3 Shadow Wolves.", target: "Shadow Wolf",  count: 3, reward: { xp: 80,  gold: 40 }, done: false },
  { id: "q2", name: "Troll Slayer", desc: "Defeat the Forest Troll.", target: "Forest Troll", count: 1, reward: { xp: 150, gold: 75 }, done: false },
];

// ============================================================
// HELPERS
// ============================================================
const rand     = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp    = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const xpForLevel = (lvl) => lvl * 100;

function initPlayer(className) {
  const cls = CLASSES[className];
  return {
    name: "Hero", class: className, level: 1, xp: 0, gold: 50,
    hp: cls.hp, maxHp: cls.hp, mp: cls.mp, maxMp: cls.mp,
    atk: 0, def: 0, cooldowns: [0,0,0], inventory: [],
    quests: JSON.parse(JSON.stringify(DEFAULT_QUESTS)),
    kills: {}, stats: { totalDmg: 0, kills: 0, deaths: 0 },
  };
}

// ============================================================
// CANVAS BACKGROUNDS (unchanged from original)
// ============================================================
function drawTownBg(ctx, w, h, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
  sky.addColorStop(0, "#ffd59e"); sky.addColorStop(1, "#ffb347");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h * 0.6);
  ctx.save(); ctx.beginPath(); ctx.arc(w*0.75, h*0.18, 38, 0, Math.PI*2);
  ctx.fillStyle="#ffe066"; ctx.shadowColor="#ffcc00"; ctx.shadowBlur=40; ctx.fill(); ctx.restore();
  const drawCloud = (x,y,s) => {
    ctx.fillStyle="rgba(255,255,255,0.85)"; ctx.beginPath();
    ctx.arc(x,y,s*1.1,0,Math.PI*2); ctx.arc(x+s*1.4,y-s*0.3,s*0.9,0,Math.PI*2);
    ctx.arc(x+s*2.6,y,s,0,Math.PI*2); ctx.fill();
  };
  drawCloud((w*0.1+t*0.3)%(w+120)-60, h*0.1, 22);
  drawCloud((w*0.5+t*0.15)%(w+120)-60, h*0.15, 18);
  const ground = ctx.createLinearGradient(0,h*0.6,0,h);
  ground.addColorStop(0,"#7ec850"); ground.addColorStop(1,"#4a8c2a");
  ctx.fillStyle=ground; ctx.fillRect(0,h*0.6,w,h*0.4);
  ctx.fillStyle="#d4a96a"; ctx.beginPath();
  ctx.moveTo(w*0.3,h); ctx.lineTo(w*0.7,h); ctx.lineTo(w*0.62,h*0.62); ctx.lineTo(w*0.38,h*0.62); ctx.fill();
  const drawBuilding = (x,bw,bh,color,roofColor,windows=2) => {
    const by=h*0.6-bh; ctx.fillStyle=color; ctx.fillRect(x-bw/2,by,bw,bh);
    ctx.fillStyle=roofColor; ctx.beginPath();
    ctx.moveTo(x-bw/2-8,by); ctx.lineTo(x,by-bh*0.45); ctx.lineTo(x+bw/2+8,by); ctx.fill();
    for(let i=0;i<windows;i++){
      ctx.fillStyle="rgba(255,220,100,0.7)";
      ctx.fillRect(x-bw*0.35+i*(bw*0.5),by+bh*0.2,bw*0.25,bh*0.25);
    }
    ctx.fillStyle="#6b3a1f"; ctx.fillRect(x-bw*0.15,by+bh*0.6,bw*0.3,bh*0.4);
  };
  drawBuilding(w*0.15,80,100,"#e8c99a","#c0392b",2);
  drawBuilding(w*0.42,90,120,"#d5eaf5","#2980b9",2);
  drawBuilding(w*0.68,70,90,"#f5e6c8","#27ae60",2);
  ctx.fillStyle="#2d5a27"; ctx.fillRect(w*0.83,h*0.38,14,h*0.22); ctx.fillRect(w*0.9,h*0.38,14,h*0.22);
  ctx.fillStyle="#1a3a16"; ctx.fillRect(w*0.83,h*0.35,21,10); ctx.fillRect(w*0.9,h*0.35,21,10);
  const drawTree=(x,s)=>{
    ctx.fillStyle="#2d5a27"; ctx.beginPath();
    ctx.moveTo(x,h*0.6-s*2.2); ctx.lineTo(x-s,h*0.6-s*0.5); ctx.lineTo(x+s,h*0.6-s*0.5); ctx.fill();
    ctx.fillStyle="#5c3317"; ctx.fillRect(x-s*0.2,h*0.6-s*0.5,s*0.4,s*0.5);
  };
  drawTree(w*0.02,18); drawTree(w*0.96,16); drawTree(w*0.92,14);
}

function drawForestBg(ctx, w, h, t) {
  const sky = ctx.createLinearGradient(0,0,0,h*0.55);
  sky.addColorStop(0,"#0d1117"); sky.addColorStop(1,"#1a2a1a");
  ctx.fillStyle=sky; ctx.fillRect(0,0,w,h*0.55);
  ctx.save(); ctx.beginPath(); ctx.arc(w*0.15,h*0.12,28,0,Math.PI*2);
  ctx.fillStyle="#d4e8b0"; ctx.shadowColor="#a8d070"; ctx.shadowBlur=30; ctx.fill(); ctx.restore();
  ctx.fillStyle="rgba(255,255,255,0.7)";
  [[0.3,0.05],[0.5,0.08],[0.7,0.04],[0.85,0.09],[0.6,0.14],[0.2,0.12]].forEach(([sx,sy])=>{
    ctx.beginPath(); ctx.arc(w*sx,h*sy,1.5,0,Math.PI*2); ctx.fill();
  });
  const ground=ctx.createLinearGradient(0,h*0.55,0,h);
  ground.addColorStop(0,"#1a3a1a"); ground.addColorStop(1,"#0d1f0d");
  ctx.fillStyle=ground; ctx.fillRect(0,h*0.55,w,h*0.45);
  const fog=ctx.createLinearGradient(0,h*0.5,0,h*0.7);
  fog.addColorStop(0,"rgba(60,100,60,0)"); fog.addColorStop(1,"rgba(30,60,30,0.4)");
  ctx.fillStyle=fog; ctx.fillRect(0,h*0.5,w,h*0.2);
  const drawDarkTree=(x,s,layer)=>{
    const shade=layer===0?"#0f240f":"#1a3a1a";
    ctx.fillStyle=shade; ctx.beginPath();
    ctx.moveTo(x,h*0.55-s*2.8); ctx.lineTo(x-s*1.1,h*0.55-s*0.3); ctx.lineTo(x+s*1.1,h*0.55-s*0.3); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x,h*0.55-s*4.2); ctx.lineTo(x-s*0.8,h*0.55-s*2.2); ctx.lineTo(x+s*0.8,h*0.55-s*2.2); ctx.fill();
    ctx.fillStyle=shade; ctx.fillRect(x-s*0.18,h*0.55-s*0.3,s*0.36,s*0.3);
  };
  [0.05,0.18,0.32,0.55,0.72,0.88,0.97].forEach((fx,i)=>drawDarkTree(w*fx,14+(i%3)*4,0));
  [0.0,0.22,0.45,0.65,0.82,1.0].forEach((fx,i)=>drawDarkTree(w*fx,22+(i%2)*6,1));
  [[0.2,0.72],[0.55,0.78],[0.75,0.68]].forEach(([mx,my])=>{
    const pulse=0.7+0.3*Math.sin(t*0.03+mx*10);
    ctx.save(); ctx.beginPath(); ctx.arc(w*mx,h*my,6*pulse,0,Math.PI*2);
    ctx.fillStyle=`rgba(100,255,150,${0.6*pulse})`; ctx.shadowColor="#44ff88"; ctx.shadowBlur=15*pulse; ctx.fill(); ctx.restore();
  });
}

// ============================================================
// SPRITES
// ============================================================
function drawHeroSprite(ctx, x, y, cls, t, facing=1) {
  const color = CLASSES[cls].color;
  const bob = Math.sin(t*0.08)*2;
  ctx.save(); ctx.translate(x, y+bob);
  if(facing<0) ctx.scale(-1,1);
  ctx.fillStyle="rgba(0,0,0,0.15)"; ctx.beginPath(); ctx.ellipse(0,22,14,5,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=color; ctx.fillRect(-10,-8,20,24);
  ctx.fillStyle="#f5cba7"; ctx.fillRect(-8,-22,16,16);
  ctx.fillStyle="#2c3e50"; ctx.fillRect(-4,-18,3,3); ctx.fillRect(2,-18,3,3);
  ctx.fillStyle="#5d4037"; ctx.fillRect(-8,-24,16,5);
  if(cls==="warrior"){ ctx.fillStyle="#95a5a6"; ctx.fillRect(12,-10,4,28); ctx.fillStyle="#7f8c8d"; ctx.fillRect(8,-4,12,4); }
  else if(cls==="mage"){ ctx.fillStyle="#8e44ad"; ctx.fillRect(11,-14,3,30); ctx.beginPath(); ctx.arc(12,-16,6,0,Math.PI*2); ctx.fillStyle="#9b59b6"; ctx.shadowColor="#d8a0ff"; ctx.shadowBlur=8; ctx.fill(); ctx.shadowBlur=0; }
  else if(cls==="rogue"){ ctx.fillStyle="#7f8c8d"; ctx.fillRect(12,-6,3,20); ctx.fillStyle="#95a5a6"; ctx.fillRect(10,-8,5,6); }
  const legSwing=Math.sin(t*0.12)*4;
  ctx.fillStyle="#2c3e50"; ctx.fillRect(-9,16,8,14+legSwing); ctx.fillRect(1,16,8,14-legSwing);
  ctx.restore();
}

function drawOtherPlayerSprite(ctx, x, y, cls, name, t) {
  drawHeroSprite(ctx, x, y, cls || "warrior", t, 1);
  // Name tag above
  ctx.save();
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  const tw = ctx.measureText(name).width + 8;
  ctx.fillRect(x - tw/2, y - 42, tw, 14);
  ctx.fillStyle = "#ffe066";
  ctx.fillText(name, x, y - 31);
  ctx.restore();
}

function drawEnemySprite(ctx, x, y, enemy, t, shake=0) {
  const bob=Math.sin(t*0.07)*2;
  const sx=x+(shake>0?rand(-shake,shake):0);
  ctx.save(); ctx.translate(sx, y+bob);
  ctx.fillStyle="rgba(0,0,0,0.15)"; ctx.beginPath(); ctx.ellipse(0,26,18,6,0,0,Math.PI*2); ctx.fill();
  if(enemy.name==="Shadow Wolf"){
    ctx.fillStyle="#7b5ea7"; ctx.fillRect(-16,-4,32,18); ctx.fillRect(-8,-20,20,18);
    ctx.fillRect(-6,-28,6,10); ctx.fillRect(8,-28,6,10);
    ctx.fillStyle="#ff4444"; ctx.fillRect(-3,-16,4,4); ctx.fillRect(7,-16,4,4);
    ctx.fillStyle="#5a3e8a"; ctx.fillRect(16,-8,10,6);
    const lw=Math.sin(t*0.1)*3; ctx.fillStyle="#7b5ea7";
    [-12,-4,4,12].forEach((lx,i)=>ctx.fillRect(lx,14,6,12+(i%2===0?lw:-lw)));
  } else if(enemy.name==="Undead Archer"){
    ctx.fillStyle="#4a7c59"; ctx.fillRect(-10,-8,20,26); ctx.fillStyle="#c8e6c9"; ctx.fillRect(-7,-24,14,18);
    ctx.fillStyle="#1b5e20"; ctx.fillRect(-4,-28,3,6); ctx.fillRect(2,-28,3,6);
    ctx.fillStyle="#ff8f00"; ctx.fillRect(-3,-20,3,3); ctx.fillRect(2,-20,3,3);
    ctx.fillStyle="#795548"; ctx.fillRect(12,-18,3,30);
  } else if(enemy.name==="Forest Troll"){
    ctx.fillStyle="#c06c00"; ctx.fillRect(-20,-4,40,30); ctx.fillRect(-14,-28,28,26);
    ctx.fillRect(-18,-10,6,34); ctx.fillRect(12,-10,6,34);
    ctx.fillStyle="#00897b"; ctx.fillRect(-8,-24,6,6); ctx.fillRect(4,-24,6,6);
    ctx.fillStyle="#4e342e"; ctx.fillRect(-6,-10,12,4);
    ctx.fillStyle="#5d4037"; ctx.fillRect(20,-18,8,36); ctx.fillRect(16,-22,16,12);
  }
  ctx.restore();
}

// ============================================================
// PARTICLES
// ============================================================
function createParticles(x, y, type) {
  if(type==="hit") return Array.from({length:8},()=>({
    x,y,vx:rand(-4,4),vy:rand(-5,-1),life:1,color:`hsl(${rand(0,40)},90%,60%)`,size:rand(3,7),type:"circle"
  }));
  if(type==="heal") return Array.from({length:6},()=>({
    x,y:y+rand(-20,0),vx:rand(-2,2),vy:rand(-3,-1),life:1,color:"#44ff88",size:rand(4,8),type:"plus"
  }));
  if(type==="levelup"){
    return Array.from({length:20},(_,i)=>{
      const angle=(i/20)*Math.PI*2;
      return {x,y,vx:Math.cos(angle)*rand(3,7),vy:Math.sin(angle)*rand(3,7)-2,life:1,color:`hsl(${rand(40,60)},100%,70%)`,size:rand(4,10),type:"star"};
    });
  }
  return [];
}

// ============================================================
// MAIN GAME
// ============================================================
export default function Game() {
  // --- Screen / auth state ---
  const [screen, setScreen]         = useState("login");
  const [authToken, setAuthToken]   = useState(null);
  const [username, setUsername]     = useState("");
  const [authError, setAuthError]   = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [loginForm, setLoginForm]   = useState({ username: "", password: "" });
  const [regForm, setRegForm]       = useState({ username: "", password: "", confirm: "" });
  const [saving, setSaving]         = useState(false);

  // --- Game state ---
  const [player, setPlayer]           = useState(null);
  const [currentEnemy, setCurrentEnemy] = useState(null);
  const [battleLog, setBattleLog]     = useState([]);
  const [notification, setNotification] = useState(null);
  const [heroPos, setHeroPos]         = useState({ x: 40 });
  const [facing, setFacing]           = useState(1);
  const [leaderboard, setLeaderboard] = useState([]);

  // --- Multiplayer state ---
  const [sfsConnected, setSfsConnected]   = useState(false);
  const [otherPlayers, setOtherPlayers]   = useState(new Map()); // name → {name,pos,class,hp,level}
  const [chatMessages, setChatMessages]   = useState([]);
  const [chatInput, setChatInput]         = useState("");
  const [chatOpen, setChatOpen]           = useState(false);
  const [onlineCount, setOnlineCount]     = useState(0);

  // --- Refs ---
  const canvasRef      = useRef(null);
  const animRef        = useRef(null);
  const tRef           = useRef(0);
  const shakeRef       = useRef(0);
  const particlesRef   = useRef([]);
  const playerRef      = useRef(player);
  const sfsRef         = useRef(null);
  const otherPlayersRef = useRef(otherPlayers);
  const screenRef      = useRef(screen);

  playerRef.current      = player;
  otherPlayersRef.current = otherPlayers;
  screenRef.current      = screen;

  // ============================================================
  // PHP API
  // ============================================================
  const apiCall = useCallback(async (action, method="GET", data=null, token=null) => {
    const t = token || authToken;
    const opts = {
      method,
      headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) }
    };
    if(data) opts.body = JSON.stringify(data);
    const res = await fetch(`${API_BASE}?action=${action}`, opts);
    return res.json();
  }, [authToken]);

  const saveCharacter = useCallback(async (p) => {
    if(!authToken || !p) return;
    setSaving(true);
    try { await apiCall("save", "POST", { character: p }); } catch {}
    setSaving(false);
  }, [authToken, apiCall]);

  // Auto-save on important events (debounced via useEffect watching player.level/gold/kills)
  const saveTimerRef = useRef(null);
  useEffect(() => {
    if(!player || !authToken) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveCharacter(player), 3000);
    return () => clearTimeout(saveTimerRef.current);
  }, [player?.level, player?.gold, player?.stats?.kills, player?.stats?.deaths]);

  // ============================================================
  // SMARTFOXSERVER 2X
  // ============================================================
  const initSFS = useCallback((user, token) => {
    const SFS2X = window.SFS2X;
    if(!SFS2X) { console.warn("SFS2X library not loaded."); return; }

    const sfs = new SFS2X.SmartFox({ host: SFS_HOST, port: SFS_PORT, zone: SFS_ZONE, debug: false, useSSL: false });

    sfs.addEventListener(SFS2X.SFSEvent.CONNECTION, (e) => {
      if(e.success) {
        sfs.send(new SFS2X.LoginRequest(user, token, SFS_ZONE));
      } else {
        console.warn("SFS2X connection failed");
      }
    });

    sfs.addEventListener(SFS2X.SFSEvent.CONNECTION_LOST, () => {
      setSfsConnected(false);
      setOtherPlayers(new Map());
    });

    sfs.addEventListener(SFS2X.SFSEvent.LOGIN, () => {
      setSfsConnected(true);
      sfs.send(new SFS2X.JoinRoomRequest("Sunhaven Town"));
    });

    sfs.addEventListener(SFS2X.SFSEvent.LOGIN_ERROR, (e) => {
      console.warn("SFS2X login error:", e.errorMessage);
    });

    sfs.addEventListener(SFS2X.SFSEvent.ROOM_JOIN, (e) => {
      const users = e.room.getUserList();
      const next = new Map();
      users.forEach(u => {
        if(u.name === user) return;
        const posVar   = u.getVariable("pos");
        const classVar = u.getVariable("class");
        if(posVar) next.set(u.name, { name: u.name, pos: posVar.value || { x: 50, zone: "town" }, class: classVar?.value || "warrior" });
      });
      setOtherPlayers(next);
      setOnlineCount(e.room.getUserCount());
      syncPositionToSFS(sfs, user);
    });

    sfs.addEventListener(SFS2X.SFSEvent.USER_ENTER_ROOM, () => {
      setOnlineCount(prev => prev + 1);
    });

    sfs.addEventListener(SFS2X.SFSEvent.USER_EXIT_ROOM, (e) => {
      setOtherPlayers(prev => { const n = new Map(prev); n.delete(e.user.name); return n; });
      setOnlineCount(prev => Math.max(0, prev - 1));
    });

    sfs.addEventListener(SFS2X.SFSEvent.USER_VARIABLES_UPDATE, (e) => {
      if(e.user.name === user) return;
      const posVar   = e.user.getVariable("pos");
      const classVar = e.user.getVariable("class");
      if(!posVar) return;
      const posVal = posVar.value;
      // Only show player in same zone
      setOtherPlayers(prev => {
        const n = new Map(prev);
        if(posVal && posVal.zone === screenRef.current) {
          n.set(e.user.name, { name: e.user.name, pos: posVal, class: classVar?.value || "warrior" });
        } else {
          n.delete(e.user.name);
        }
        return n;
      });
    });

    sfs.addEventListener(SFS2X.SFSEvent.PUBLIC_MESSAGE, (e) => {
      setChatMessages(prev => [...prev.slice(-99), {
        id: Date.now() + Math.random(),
        sender: e.sender.name,
        text: e.message,
        mine: e.sender.name === user,
      }]);
    });

    // Extension responses
    sfs.addEventListener(SFS2X.SFSEvent.EXTENSION_RESPONSE, (e) => {
      if(e.cmd === "battleNews") {
        const p = e.params;
        const who = p.getUtfString("player");
        const en  = p.getUtfString("enemy");
        const won = p.getBool("won");
        if(who !== user) {
          setChatMessages(prev => [...prev.slice(-99), {
            id: Date.now()+Math.random(), sender: "⚔️ World",
            text: won ? `${who} slew a ${en}!` : `${who} was defeated by ${en}...`,
            mine: false, system: true,
          }]);
        }
      }
    });

    sfs.connect();
    sfsRef.current = sfs;
  }, []);

  function syncPositionToSFS(sfs, user) {
    const SFS2X = window.SFS2X;
    if(!SFS2X || !sfs?.isConnected) return;
    try {
      const posVar   = new SFS2X.SFSUserVariable("pos",   { x: heroPos.x, zone: screenRef.current });
      const classVar = new SFS2X.SFSUserVariable("class", playerRef.current?.class || "warrior");
      sfs.send(new SFS2X.SetUserVariablesRequest([posVar, classVar]));
    } catch {}
  }

  // Sync position whenever hero moves or zone changes
  useEffect(() => {
    if(!sfsRef.current?.isConnected) return;
    syncPositionToSFS(sfsRef.current, username);
  }, [heroPos.x, screen, username]);

  function sendChat(text) {
    const SFS2X = window.SFS2X;
    if(!text.trim() || !sfsRef.current?.isConnected || !SFS2X) return;
    sfsRef.current.send(new SFS2X.PublicMessageRequest(text.trim()));
    setChatInput("");
  }

  function reportBattleResult(enemyName, won) {
    const SFS2X = window.SFS2X;
    if(!sfsRef.current?.isConnected || !SFS2X) return;
    const params = SFS2X.SFSObject.newInstance();
    params.putUtfString("enemy", enemyName);
    params.putBool("won", won);
    params.putInt("xpGained", 0);
    sfsRef.current.send(new SFS2X.ExtensionRequest("battleResult", params));
  }

  useEffect(() => {
    return () => { sfsRef.current?.disconnect?.(); };
  }, []);

  // ============================================================
  // AUTH
  // ============================================================
  const doLogin = useCallback(async () => {
    setAuthError(""); setAuthLoading(true);
    try {
      const res = await apiCall("login", "POST", loginForm, null);
      if(res.success) {
        setAuthToken(res.token);
        setUsername(res.username);
        initSFS(res.username, res.token);
        if(res.character) {
          const char = { ...res.character, cooldowns: [0,0,0], quests: res.character.quests?.length ? res.character.quests : JSON.parse(JSON.stringify(DEFAULT_QUESTS)) };
          setPlayer(char);
          setScreen("town");
        } else {
          setScreen("charselect");
        }
      } else {
        setAuthError(res.error || "Login failed");
      }
    } catch { setAuthError("Cannot reach server. Is PHP running?"); }
    setAuthLoading(false);
  }, [loginForm, apiCall, initSFS]);

  const doRegister = useCallback(async () => {
    setAuthError(""); setAuthLoading(true);
    if(regForm.password !== regForm.confirm) { setAuthError("Passwords don't match"); setAuthLoading(false); return; }
    try {
      const res = await apiCall("register", "POST", { username: regForm.username, password: regForm.password }, null);
      if(res.success) {
        setLoginForm({ username: regForm.username, password: regForm.password });
        setScreen("login");
        setAuthError("Account created! Please log in.");
      } else {
        setAuthError(res.error || "Registration failed");
      }
    } catch { setAuthError("Cannot reach server."); }
    setAuthLoading(false);
  }, [regForm, apiCall]);

  const loadLeaderboard = useCallback(async () => {
    try {
      const res = await apiCall("leaderboard", "GET");
      if(res.success) setLeaderboard(res.data);
    } catch {}
  }, [apiCall]);

  // ============================================================
  // CANVAS LOOP
  // ============================================================
  useEffect(() => {
    if(!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const loop = () => {
      tRef.current++;
      const t = tRef.current;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if(screen === "town") {
        drawTownBg(ctx, w, h, t);
        if(playerRef.current) drawHeroSprite(ctx, (heroPos.x/100)*w, h*0.72, playerRef.current.class, t, facing);
        // Other players
        otherPlayersRef.current.forEach(op => {
          if(op.pos?.zone === "town") {
            drawOtherPlayerSprite(ctx, (op.pos.x/100)*w, h*0.72, op.class, op.name, t);
          }
        });
      } else if(screen === "forest") {
        drawForestBg(ctx, w, h, t);
        if(playerRef.current) drawHeroSprite(ctx, w*0.22, h*0.72, playerRef.current.class, t, 1);
        otherPlayersRef.current.forEach(op => {
          if(op.pos?.zone === "forest") {
            drawOtherPlayerSprite(ctx, w*0.35, h*0.72, op.class, op.name, t);
          }
        });
      } else if(screen === "battle") {
        drawForestBg(ctx, w, h, t);
        if(playerRef.current) drawHeroSprite(ctx, w*0.2, h*0.72, playerRef.current.class, t, 1);
        if(currentEnemy) {
          drawEnemySprite(ctx, w*0.75, h*0.68, currentEnemy, t, shakeRef.current);
          if(shakeRef.current > 0) shakeRef.current = Math.max(0, shakeRef.current - 1);
        }
      }

      // Particles
      particlesRef.current = particlesRef.current
        .map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.2,life:p.life-0.03}))
        .filter(p=>p.life>0);
      particlesRef.current.forEach(p=>{
        ctx.save(); ctx.globalAlpha=p.life; ctx.fillStyle=p.color;
        if(p.type==="circle"){ ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill(); }
        else if(p.type==="plus"){ ctx.font=`${p.size*3}px serif`; ctx.fillText("+",p.x,p.y); }
        else if(p.type==="star"){ ctx.font=`${p.size*2}px serif`; ctx.fillText("★",p.x,p.y); }
        ctx.restore();
      });

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [screen, heroPos, facing, currentEnemy]);

  // ============================================================
  // GAME LOGIC
  // ============================================================
  const notify = useCallback((msg, color="#ffe066") => {
    setNotification({ msg, color });
    setTimeout(() => setNotification(null), 2500);
  }, []);

  const addLog = useCallback((msg, color="#cdd6f4") => {
    setBattleLog(prev => [...prev.slice(-8), { msg, color, id: Date.now()+Math.random() }]);
  }, []);

  const checkLevelUp = useCallback((p) => {
    const needed = xpForLevel(p.level);
    if(p.xp >= needed) {
      const np = { ...p, xp: p.xp-needed, level: p.level+1, maxHp: p.maxHp+15, hp: p.maxHp+15, maxMp: p.maxMp+10, mp: p.maxMp+10 };
      notify(`🎉 LEVEL UP! Now Level ${np.level}!`, "#ffe066");
      particlesRef.current = [...particlesRef.current, ...createParticles(200, 150, "levelup")];
      return np;
    }
    return p;
  }, [notify]);

  const doPlayerAttack = useCallback((skillIdx) => {
    if(!currentEnemy || screen !== "battle") return;
    setPlayer(prev => {
      if(!prev) return prev;
      const skill = CLASSES[prev.class].skills[skillIdx];
      if(prev.mp < skill.mpCost) { notify("Not enough MP!", "#ff6b6b"); return prev; }
      if(prev.cooldowns[skillIdx] > 0) { notify(`Skill on cooldown (${prev.cooldowns[skillIdx]})`, "#ff9966"); return prev; }
      const dmg = rand(...skill.damage) + prev.atk;
      const newMp = prev.mp - skill.mpCost;
      const newCds = prev.cooldowns.map((cd,i)=>i===skillIdx?skill.cooldown:Math.max(0,cd-1));

      setCurrentEnemy(en => {
        const newHp = Math.max(0, en.hp - dmg);
        shakeRef.current = 5;
        particlesRef.current = [...particlesRef.current, ...createParticles(500, 140, "hit")];
        addLog(`${skill.icon} ${skill.name}: ${dmg} dmg!`, "#ff9966");

        if(newHp <= 0) {
          reportBattleResult(en.name, true);
          setTimeout(() => {
            setPlayer(p => {
              if(!p) return p;
              let np = { ...p, xp: p.xp+en.xp, gold: p.gold+en.gold, stats: {...p.stats,kills:p.stats.kills+1}, kills: {...p.kills,[en.name]:(p.kills[en.name]||0)+1} };
              np = { ...np, quests: np.quests.map(q => {
                if(q.done || q.target!==en.name) return q;
                if((np.kills[en.name]||0) >= q.count) {
                  notify(`✅ Quest Complete: ${q.name}! +${q.reward.xp}XP +${q.reward.gold}G`, "#44ff88");
                  np.xp += q.reward.xp; np.gold += q.reward.gold;
                  return {...q,done:true};
                }
                return q;
              })};
              np = checkLevelUp(np);
              saveCharacter(np);
              return np;
            });
            addLog(`💀 ${en.name} defeated! +${en.xp}XP +${en.gold}G`, "#44ff88");
            notify(`⚔️ Victory! ${en.name} slain!`, "#44ff88");
            setScreen("forest");
            setCurrentEnemy(null);
          }, 500);
          return {...en,hp:0};
        }

        setTimeout(() => {
          setPlayer(p => {
            if(!p) return p;
            const eDmg = Math.max(1, rand(...en.atk) - p.def);
            const newHp2 = p.hp - eDmg;
            addLog(`🐾 ${en.name} attacks: ${eDmg} dmg!`, "#ff6b6b");
            particlesRef.current = [...particlesRef.current, ...createParticles(130, 140, "hit")];
            if(newHp2 <= 0) {
              reportBattleResult(en.name, false);
              notify("💀 You were defeated...", "#ff4444");
              setTimeout(() => {
                setPlayer(pp => { const r = {...pp, hp:Math.floor(pp.maxHp*0.3), stats:{...pp.stats,deaths:pp.stats.deaths+1}}; saveCharacter(r); return r; });
                setScreen("town"); setCurrentEnemy(null); setBattleLog([]);
              }, 800);
              return {...p,hp:0};
            }
            return {...p,hp:newHp2};
          });
        }, 700);

        return {...en,hp:newHp};
      });

      return {...prev, mp:newMp, cooldowns:newCds, stats:{...prev.stats,totalDmg:prev.stats.totalDmg+dmg}};
    });
  }, [currentEnemy, screen, addLog, notify, checkLevelUp, saveCharacter]);

  const doRest = useCallback(() => {
    setPlayer(p => {
      const np = {...p, hp:p.maxHp, mp:p.maxMp};
      notify("🏠 Fully rested at the Inn!", "#44ff88");
      particlesRef.current = [...particlesRef.current, ...createParticles(200,150,"heal")];
      return np;
    });
  }, [notify]);

  const buyItem = useCallback((item) => {
    setPlayer(p => {
      if(p.gold < item.cost) { notify("Not enough gold!", "#ff6b6b"); return p; }
      let np = {...p, gold:p.gold-item.cost};
      if(item.effect==="hp"){ np.hp=clamp(np.hp+item.value,0,np.maxHp); particlesRef.current=[...particlesRef.current,...createParticles(200,150,"heal")]; }
      else if(item.effect==="mp") np.mp=clamp(np.mp+item.value,0,np.maxMp);
      else if(item.effect==="atk") np.atk=(np.atk||0)+item.value;
      else if(item.effect==="def") np.def=(np.def||0)+item.value;
      notify(`Bought ${item.name}!`, "#ffe066");
      return np;
    });
  }, [notify]);

  // ============================================================
  // SHARED UI
  // ============================================================
  const ChatOverlay = () => (
    <div style={{ position:"fixed", bottom:16, right:16, zIndex:200, width:300 }}>
      {chatOpen && (
        <div style={{ background:"rgba(0,0,0,0.9)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:12, marginBottom:8, padding:12 }}>
          <div style={{ height:180, overflowY:"auto", display:"flex", flexDirection:"column", gap:4, marginBottom:8 }}>
            {chatMessages.length===0 && <div style={{fontSize:11,color:"#4a5a6a"}}>No messages yet...</div>}
            {chatMessages.map(m=>(
              <div key={m.id} style={{ fontSize:11, lineHeight:1.5, color: m.system?"#6a9a8a": m.mine?"#ffe066":"#cdd6f4" }}>
                {!m.system && <span style={{color:"#88c8ff",fontWeight:700}}>{m.sender}: </span>}
                {m.text}
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:6}}>
            <input
              value={chatInput}
              onChange={e=>setChatInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&sendChat(chatInput)}
              placeholder="Say something..."
              style={{ flex:1, background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)", color:"#fff", padding:"5px 10px", borderRadius:20, fontSize:12, outline:"none", fontFamily:"Georgia, serif" }}
            />
            <button onClick={()=>sendChat(chatInput)} style={{ background:"#2980b9", border:"none", color:"#fff", padding:"5px 12px", borderRadius:20, cursor:"pointer", fontSize:12 }}>Send</button>
          </div>
        </div>
      )}
      <button onClick={()=>setChatOpen(o=>!o)} style={{ width:"100%", background:"rgba(0,0,0,0.85)", border:"1px solid rgba(255,255,255,0.15)", color:"#ffe066", padding:"8px 16px", borderRadius:24, cursor:"pointer", fontSize:12, fontFamily:"Georgia, serif", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span>💬 Chat {chatMessages.length > 0 && !chatOpen && <span style={{background:"#e05a3a",borderRadius:99,padding:"1px 6px",fontSize:10}}>{chatMessages.length}</span>}</span>
        <span style={{fontSize:10,color:"#6a9a6a"}}>{sfsConnected ? `🟢 ${onlineCount} online` : "🔴 offline"}</span>
      </button>
    </div>
  );

  const SavingIndicator = () => saving ? (
    <div style={{position:"fixed",top:8,right:8,zIndex:300,fontSize:11,color:"#6a9a6a",background:"rgba(0,0,0,0.6)",padding:"4px 10px",borderRadius:99}}>💾 Saving...</div>
  ) : null;

  // ============================================================
  // SCREENS
  // ============================================================

  // ---- LOGIN ----
  if(screen === "login") return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0d1117,#1a2a3a,#0d2a1a)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"Georgia, serif", color:"#fff", padding:20 }}>
      <div style={{fontSize:48,marginBottom:8}}>⚔️🌆</div>
      <h1 style={{ fontSize:"clamp(24px,5vw,44px)", margin:"0 0 4px", background:"linear-gradient(135deg,#ffe066,#ff9933)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", fontWeight:900, letterSpacing:2 }}>SUNHAVEN CHRONICLES</h1>
      <p style={{color:"#6a8a7a",fontSize:12,marginBottom:32,letterSpacing:3}}>MULTIPLAYER RPG</p>

      <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:16, padding:"28px 32px", width:"100%", maxWidth:360 }}>
        <h3 style={{margin:"0 0 20px",color:"#ffe066",fontSize:16,letterSpacing:1}}>Sign In</h3>
        {authError && <div style={{background:"rgba(224,90,58,0.15)",border:"1px solid #e05a3a",color:"#ff9966",padding:"8px 14px",borderRadius:8,marginBottom:14,fontSize:12}}>{authError}</div>}
        <input value={loginForm.username} onChange={e=>setLoginForm(f=>({...f,username:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&doLogin()} placeholder="Username" style={inputStyle} />
        <input value={loginForm.password} onChange={e=>setLoginForm(f=>({...f,password:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&doLogin()} type="password" placeholder="Password" style={{...inputStyle,marginBottom:20}} />
        <button onClick={doLogin} disabled={authLoading} style={{...btnStyle,background:"linear-gradient(135deg,#e05a3a,#c0392b)",width:"100%",marginBottom:12}}>{authLoading?"Signing in...":"Sign In"}</button>
        <button onClick={()=>{setScreen("register");setAuthError("");}} style={{...btnStyle,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.15)",width:"100%"}}>Create Account</button>
      </div>
      <p style={{marginTop:20,fontSize:11,color:"#4a6a5a"}}>Requires PHP + MySQL (phpMyAdmin) + SmartFoxServer</p>
    </div>
  );

  // ---- REGISTER ----
  if(screen === "register") return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0d1117,#1a2a3a)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"Georgia, serif", color:"#fff", padding:20 }}>
      <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:16, padding:"28px 32px", width:"100%", maxWidth:360 }}>
        <h3 style={{margin:"0 0 20px",color:"#ffe066",fontSize:16}}>Create Account</h3>
        {authError && <div style={{background:"rgba(68,255,136,0.1)",border:"1px solid #44ff88",color:"#44ff88",padding:"8px 14px",borderRadius:8,marginBottom:14,fontSize:12}}>{authError}</div>}
        <input value={regForm.username} onChange={e=>setRegForm(f=>({...f,username:e.target.value}))} placeholder="Username (3–32 chars)" style={inputStyle} />
        <input value={regForm.password} onChange={e=>setRegForm(f=>({...f,password:e.target.value}))} type="password" placeholder="Password (min 6)" style={inputStyle} />
        <input value={regForm.confirm} onChange={e=>setRegForm(f=>({...f,confirm:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&doRegister()} type="password" placeholder="Confirm password" style={{...inputStyle,marginBottom:20}} />
        <button onClick={doRegister} disabled={authLoading} style={{...btnStyle,background:"linear-gradient(135deg,#27ae60,#1e8449)",width:"100%",marginBottom:12}}>{authLoading?"Creating...":"Create Account"}</button>
        <button onClick={()=>{setScreen("login");setAuthError("");}} style={{...btnStyle,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.15)",width:"100%"}}>← Back to Login</button>
      </div>
    </div>
  );

  // ---- CHAR SELECT ----
  if(screen === "charselect") return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0d1117,#1a2a3a)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"Georgia, serif", color:"#fff", padding:20 }}>
      <h2 style={{ fontSize:28, marginBottom:6, color:"#ffe066", letterSpacing:2 }}>Choose Your Class</h2>
      <p style={{color:"#6a8a7a",marginBottom:32,fontSize:13}}>Playing as <b style={{color:"#88c8ff"}}>{username}</b></p>
      <div style={{ display:"flex", gap:20, flexWrap:"wrap", justifyContent:"center" }}>
        {Object.entries(CLASSES).map(([key,cls])=>(
          <div key={key} onClick={()=>{ const p=initPlayer(key); setPlayer(p); saveCharacter(p); setScreen("town"); }}
            style={{ background:"rgba(255,255,255,0.05)", border:`2px solid ${cls.color}44`, borderRadius:16, padding:"28px 24px", width:180, cursor:"pointer", textAlign:"center", transition:"all 0.2s" }}
            onMouseEnter={e=>{e.currentTarget.style.background=`${cls.color}22`;e.currentTarget.style.borderColor=cls.color;e.currentTarget.style.transform="translateY(-4px)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.05)";e.currentTarget.style.borderColor=`${cls.color}44`;e.currentTarget.style.transform="translateY(0)";}}>
            <div style={{fontSize:44,marginBottom:10}}>{cls.icon}</div>
            <div style={{fontSize:20,fontWeight:700,color:cls.color,marginBottom:8}}>{cls.name}</div>
            <div style={{fontSize:12,color:"#8a9ab0",marginBottom:12}}>HP: {cls.hp} · MP: {cls.mp}</div>
            <div style={{fontSize:11,color:"#6a7a8a",lineHeight:1.7}}>{cls.skills.map(s=>`${s.icon} ${s.name}`).join("\n")}</div>
          </div>
        ))}
      </div>
    </div>
  );

  // ---- LEADERBOARD ----
  if(screen === "leaderboard") return (
    <div style={{ minHeight:"100vh", background:"#0d1117", fontFamily:"Georgia, serif", color:"#fff", display:"flex", flexDirection:"column" }}>
      <HUD player={player} username={username} onLeaderboard={()=>{}} onLogout={()=>{setScreen("login");setPlayer(null);setAuthToken(null);sfsRef.current?.disconnect?.();}} />
      <div style={{ flex:1, padding:20, maxWidth:700, margin:"0 auto", width:"100%" }}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <h2 style={{margin:0,color:"#ffe066",fontSize:20}}>🏆 Leaderboard</h2>
          <button onClick={loadLeaderboard} style={{...btnStyle,fontSize:12,padding:"6px 16px"}}>Refresh</button>
        </div>
        {leaderboard.length===0 && <div style={{color:"#4a5a6a",fontSize:13}}>No data yet. Click Refresh.</div>}
        {leaderboard.map((row,i)=>(
          <div key={i} style={{ display:"flex", alignItems:"center", gap:16, background:i===0?"rgba(255,200,50,0.08)":"rgba(255,255,255,0.03)", border:`1px solid ${i===0?"rgba(255,200,50,0.3)":"rgba(255,255,255,0.07)"}`, borderRadius:10, padding:"12px 16px", marginBottom:8 }}>
            <div style={{fontSize:20,minWidth:30,textAlign:"center"}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:14,color:i===0?"#ffe066":"#cdd6f4"}}>{row.username}</div>
              <div style={{fontSize:11,color:"#6a8a7a"}}>{CLASSES[row.class]?.icon} {row.class} · Lv.{row.level}</div>
            </div>
            <div style={{textAlign:"right",fontSize:12}}>
              <div style={{color:"#ff9966"}}>⚔️ {row.total_kills} kills</div>
              <div style={{color:"#ffd700"}}>🪙 {row.gold}G</div>
            </div>
          </div>
        ))}
        <button onClick={()=>setScreen("town")} style={{marginTop:16,...btnStyle,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#a0a0b0"}}>← Back to Town</button>
      </div>
      <ChatOverlay />
      <SavingIndicator />
    </div>
  );

  // ---- TOWN ----
  if(screen === "town" && player) {
    const cls = CLASSES[player.class];
    const NPCS = [
      { id:"inn",    name:"Golden Fin Inn",   icon:"🏠", x:15, y:55, action:"rest",         desc:"Rest & restore HP/MP" },
      { id:"shop",   name:"Alva's Emporium",  icon:"🛍️", x:42, y:50, action:"shop",         desc:"Buy gear & potions" },
      { id:"quest",  name:"Guild Board",      icon:"📋", x:68, y:52, action:"quests",        desc:"Accept quests" },
      { id:"rank",   name:"Hall of Heroes",   icon:"🏆", x:30, y:48, action:"leaderboard",  desc:"View leaderboard" },
      { id:"forest", name:"Dark Forest Gate", icon:"🌲", x:85, y:55, action:"enter_forest", desc:"Enter the Dark Forest" },
    ];
    return (
      <div style={{ minHeight:"100vh", background:"#0d1117", fontFamily:"Georgia, serif", color:"#fff", display:"flex", flexDirection:"column" }}>
        <HUD player={player} username={username} onLeaderboard={()=>{loadLeaderboard();setScreen("leaderboard");}} onLogout={()=>{saveCharacter(player);setScreen("login");setPlayer(null);setAuthToken(null);sfsRef.current?.disconnect?.();setSfsConnected(false);}} />
        <div style={{position:"relative"}}>
          <canvas ref={canvasRef} width={700} height={260} style={{width:"100%",display:"block",maxHeight:260}} />
          {NPCS.map(npc=>(
            <button key={npc.id}
              onClick={()=>{
                if(npc.action==="rest") doRest();
                else if(npc.action==="shop") setScreen("shop");
                else if(npc.action==="quests") setScreen("quests");
                else if(npc.action==="leaderboard") { loadLeaderboard(); setScreen("leaderboard"); }
                else if(npc.action==="enter_forest") { setScreen("forest"); syncPositionToSFS(sfsRef.current, username); }
              }}
              style={{ position:"absolute", left:`${npc.x}%`, top:`${npc.y}%`, transform:"translate(-50%,-100%)", background:"rgba(0,0,0,0.75)", border:"1px solid rgba(255,255,255,0.2)", color:"#ffe066", padding:"4px 10px", borderRadius:20, fontSize:11, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"Georgia, serif" }}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,200,50,0.15)";e.currentTarget.style.borderColor="#ffe066";}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(0,0,0,0.75)";e.currentTarget.style.borderColor="rgba(255,255,255,0.2)";}}>
              {npc.icon} {npc.name}
            </button>
          ))}
          {notification && <Notification data={notification} />}
        </div>
        <div style={{ flex:1, padding:16, display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, maxWidth:700, margin:"0 auto", width:"100%" }}>
          <div style={{ gridColumn:"1/-1", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, padding:"12px 16px" }}>
            <h3 style={{margin:"0 0 6px",fontSize:14,color:"#ffe066",letterSpacing:1}}>🏘️ SUNHAVEN TOWN</h3>
            <p style={{margin:0,fontSize:12,color:"#8a9ab0",lineHeight:1.6}}>
              Welcome, <b style={{color:"#88c8ff"}}>{username}</b>! Visit the Inn, shop at the Emporium, check the Guild Board, or head to the <b style={{color:"#ff6b6b"}}>Dark Forest Gate</b> for battle.
              {sfsConnected && <span style={{color:"#44ff88"}}> {onlineCount} player{onlineCount!==1?"s":""} online.</span>}
            </p>
          </div>
          <StatCard title="Character" items={[["Class",`${cls.icon} ${cls.name}`],["Level",player.level],["Attack Bonus",`+${player.atk}`],["Defense",`+${player.def}`],["Kills",player.stats.kills],["Deaths",player.stats.deaths]]} />
          <StatCard title="Active Quests" items={player.quests.filter(q=>!q.done).slice(0,3).map(q=>[q.name,`${player.kills[q.target]||0}/${q.count}`])} emptyMsg="No quests active" accentColor="#44ff88" />
        </div>
        <ChatOverlay />
        <SavingIndicator />
      </div>
    );
  }

  // ---- FOREST ----
  if(screen === "forest" && player) return (
    <div style={{ minHeight:"100vh", background:"#0d1117", fontFamily:"Georgia, serif", color:"#fff", display:"flex", flexDirection:"column" }}>
      <HUD player={player} username={username} onLeaderboard={()=>{loadLeaderboard();setScreen("leaderboard");}} onLogout={null} />
      <div style={{position:"relative"}}>
        <canvas ref={canvasRef} width={700} height={260} style={{width:"100%",display:"block",maxHeight:260}} />
        {notification && <Notification data={notification} />}
      </div>
      <div style={{ flex:1, padding:16, maxWidth:700, margin:"0 auto", width:"100%" }}>
        <h3 style={{margin:"0 0 12px",color:"#a8d070",fontSize:14,letterSpacing:1}}>🌲 DARK FOREST — Choose your quarry</h3>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:16 }}>
          {ZONES.forest.enemies.map((en,i)=>(
            <button key={i} onClick={()=>{ setCurrentEnemy({...en,hp:en.maxHp}); setBattleLog([{msg:`⚔️ A ${en.name} appears!`,color:"#ff9966",id:Date.now()}]); setScreen("battle"); }}
              style={{ background:en.boss?"rgba(192,108,0,0.15)":"rgba(255,255,255,0.04)", border:`1px solid ${en.boss?"#c06c00":"rgba(255,255,255,0.1)"}`, borderRadius:12, padding:"14px 12px", cursor:"pointer", color:"#fff", textAlign:"left", transition:"all 0.15s", fontFamily:"Georgia, serif" }}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,100,50,0.1)";e.currentTarget.style.borderColor=en.color;}}
              onMouseLeave={e=>{e.currentTarget.style.background=en.boss?"rgba(192,108,0,0.15)":"rgba(255,255,255,0.04)";e.currentTarget.style.borderColor=en.boss?"#c06c00":"rgba(255,255,255,0.1)";}}>
              <div style={{fontSize:28,marginBottom:6}}>{en.icon}</div>
              <div style={{fontWeight:700,fontSize:13,color:en.color}}>{en.name}</div>
              {en.boss&&<div style={{fontSize:10,color:"#c06c00",letterSpacing:1,marginTop:2}}>⚠ BOSS</div>}
              <div style={{fontSize:11,color:"#6a8a7a",marginTop:4}}>HP: {en.maxHp} · XP: {en.xp}</div>
            </button>
          ))}
        </div>
        <button onClick={()=>setScreen("town")} style={{...btnStyle,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#a0a0b0"}}>← Return to Town</button>
      </div>
      <ChatOverlay />
      <SavingIndicator />
    </div>
  );

  // ---- BATTLE ----
  if(screen === "battle" && player && currentEnemy) {
    const cls = CLASSES[player.class];
    return (
      <div style={{ minHeight:"100vh", background:"#0d1117", fontFamily:"Georgia, serif", color:"#fff", display:"flex", flexDirection:"column" }}>
        <HUD player={player} username={username} onLeaderboard={null} onLogout={null} />
        <div style={{position:"relative"}}>
          <canvas ref={canvasRef} width={700} height={260} style={{width:"100%",display:"block",maxHeight:260}} />
          <div style={{ position:"absolute", right:"10%", top:16, width:160, background:"rgba(0,0,0,0.7)", borderRadius:8, padding:"8px 12px", border:"1px solid rgba(255,255,255,0.1)" }}>
            <div style={{fontSize:12,fontWeight:700,marginBottom:4,color:currentEnemy.color||"#ff6b6b"}}>{currentEnemy.icon} {currentEnemy.name}</div>
            <MiniBar val={currentEnemy.hp} max={currentEnemy.maxHp} color="#e05a3a" />
            <div style={{fontSize:10,color:"#8a9ab0",marginTop:3}}>{currentEnemy.hp} / {currentEnemy.maxHp}</div>
          </div>
          {notification && <Notification data={notification} />}
        </div>
        <div style={{ display:"flex", gap:10, padding:"12px 16px", flexWrap:"wrap", maxWidth:700, margin:"0 auto", width:"100%" }}>
          {cls.skills.map((skill,i)=>{
            const onCd=player.cooldowns[i]>0, noMp=player.mp<skill.mpCost;
            return (
              <button key={i} onClick={()=>doPlayerAttack(i)} disabled={onCd||noMp||player.hp<=0}
                style={{ flex:1, minWidth:120, background:onCd||noMp?"rgba(255,255,255,0.03)":`${cls.color}22`, border:`1px solid ${onCd||noMp?"rgba(255,255,255,0.08)":cls.color+"66"}`, borderRadius:10, padding:"10px 8px", cursor:onCd||noMp?"not-allowed":"pointer", color:onCd||noMp?"#4a5a6a":"#fff", textAlign:"center", transition:"all 0.15s", opacity:onCd||noMp?0.5:1, fontFamily:"Georgia, serif" }}
                onMouseEnter={e=>{if(!onCd&&!noMp){e.currentTarget.style.background=`${cls.color}44`;e.currentTarget.style.transform="translateY(-2px)";}}}
                onMouseLeave={e=>{e.currentTarget.style.background=onCd||noMp?"rgba(255,255,255,0.03)":`${cls.color}22`;e.currentTarget.style.transform="translateY(0)";}}>
                <div style={{fontSize:22}}>{skill.icon}</div>
                <div style={{fontSize:12,fontWeight:700}}>{skill.name}</div>
                <div style={{fontSize:10,color:"#8a9ab0"}}>{skill.mpCost>0?`${skill.mpCost}MP`:"Free"}</div>
                {onCd&&<div style={{fontSize:10,color:"#ff9966"}}>CD: {player.cooldowns[i]}</div>}
              </button>
            );
          })}
        </div>
        <div style={{ flex:1, maxWidth:700, margin:"0 auto", width:"100%", padding:"0 16px 16px" }}>
          <div style={{ background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:10, padding:12, height:140, overflowY:"auto", display:"flex", flexDirection:"column", gap:3 }}>
            {battleLog.map(l=><div key={l.id} style={{fontSize:12,color:l.color,lineHeight:1.5}}>{l.msg}</div>)}
          </div>
          <button onClick={()=>{ setScreen("forest"); setCurrentEnemy(null); setBattleLog([]); }} style={{marginTop:10,...btnStyle,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#a0a0b0",fontSize:12,padding:"8px 20px"}}>🏃 Flee</button>
        </div>
        <ChatOverlay />
        <SavingIndicator />
      </div>
    );
  }

  // ---- SHOP ----
  if(screen === "shop" && player) return (
    <div style={{ minHeight:"100vh", background:"#0d1117", fontFamily:"Georgia, serif", color:"#fff", display:"flex", flexDirection:"column" }}>
      <HUD player={player} username={username} onLeaderboard={null} onLogout={null} />
      <div style={{ flex:1, padding:20, maxWidth:700, margin:"0 auto", width:"100%" }}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <h2 style={{margin:0,color:"#ffe066",fontSize:20}}>🛍️ Alva's Emporium</h2>
          <span style={{color:"#ffd700",fontSize:14}}>🪙 {player.gold}G</span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:14 }}>
          {SHOP_ITEMS.map(item=>(
            <div key={item.id} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:"16px 12px", textAlign:"center" }}>
              <div style={{fontSize:36,marginBottom:8}}>{item.icon}</div>
              <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>{item.name}</div>
              <div style={{fontSize:11,color:"#44ff88",marginBottom:8}}>{item.desc}</div>
              <div style={{fontSize:12,color:"#ffd700",marginBottom:10}}>🪙 {item.cost}G</div>
              <button onClick={()=>buyItem(item)} style={{background:player.gold>=item.cost?"linear-gradient(135deg,#e05a3a,#c0392b)":"rgba(255,255,255,0.05)",border:"none",color:player.gold>=item.cost?"#fff":"#4a5a6a",padding:"7px 18px",borderRadius:20,cursor:player.gold>=item.cost?"pointer":"not-allowed",fontSize:12,fontFamily:"Georgia, serif"}}>Buy</button>
            </div>
          ))}
        </div>
        {notification && <div style={{position:"fixed",top:80,left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,0,0.85)",border:`1px solid ${notification.color}`,color:notification.color,padding:"10px 24px",borderRadius:24,fontSize:13,zIndex:100,whiteSpace:"nowrap"}}>{notification.msg}</div>}
        <button onClick={()=>setScreen("town")} style={{marginTop:24,...btnStyle,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#a0a0b0"}}>← Back to Town</button>
      </div>
      <ChatOverlay />
      <SavingIndicator />
    </div>
  );

  // ---- QUESTS ----
  if(screen === "quests" && player) return (
    <div style={{ minHeight:"100vh", background:"#0d1117", fontFamily:"Georgia, serif", color:"#fff", display:"flex", flexDirection:"column" }}>
      <HUD player={player} username={username} onLeaderboard={null} onLogout={null} />
      <div style={{ flex:1, padding:20, maxWidth:700, margin:"0 auto", width:"100%" }}>
        <h2 style={{margin:"0 0 20px",color:"#ffe066",fontSize:20}}>📋 Guild Board</h2>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {player.quests.map(q=>{
            const progress = Math.min(player.kills[q.target]||0, q.count);
            return (
              <div key={q.id} style={{ background:q.done?"rgba(68,255,136,0.06)":"rgba(255,255,255,0.04)", border:`1px solid ${q.done?"#44ff88":"rgba(255,255,255,0.1)"}`, borderRadius:12, padding:"16px 18px" }}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:15,color:q.done?"#44ff88":"#ffe066",marginBottom:4}}>{q.done?"✅ ":"📜 "}{q.name}</div>
                    <div style={{fontSize:12,color:"#8a9ab0",marginBottom:10}}>{q.desc}</div>
                    <MiniBar val={progress} max={q.count} color={q.done?"#44ff88":"#ffe066"} />
                    <div style={{fontSize:11,color:"#6a8a7a",marginTop:4}}>{progress} / {q.count}</div>
                  </div>
                  <div style={{textAlign:"right",minWidth:80,fontSize:12,color:"#a0b0a0"}}>
                    <div style={{color:"#88c8ff"}}>+{q.reward.xp} XP</div>
                    <div style={{color:"#ffd700"}}>+{q.reward.gold} G</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={()=>setScreen("town")} style={{marginTop:24,...btnStyle,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#a0a0b0"}}>← Back to Town</button>
      </div>
      <ChatOverlay />
      <SavingIndicator />
    </div>
  );

  return null;
}

// ============================================================
// SHARED COMPONENTS
// ============================================================
function HUD({ player, username, onLeaderboard, onLogout }) {
  const cls = CLASSES[player.class];
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 14px", background:"rgba(0,0,0,0.85)", borderBottom:"1px solid rgba(255,255,255,0.07)", flexWrap:"wrap" }}>
      <span style={{fontSize:16,color:cls.color}}>{cls.icon}</span>
      <span style={{fontWeight:700,fontSize:13}}>{player.name}</span>
      <span style={{fontSize:11,color:"#8a9a7a",background:"rgba(255,255,255,0.06)",padding:"2px 8px",borderRadius:20}}>Lv.{player.level}</span>
      {username && <span style={{fontSize:10,color:"#6a88aa",background:"rgba(255,255,255,0.04)",padding:"2px 8px",borderRadius:99}}>@{username}</span>}
      <div style={{display:"flex",gap:8,marginLeft:"auto",flexWrap:"wrap"}}>
        <StatBar label="HP" val={player.hp} max={player.maxHp} color="#e05a3a" />
        <StatBar label="MP" val={player.mp} max={player.maxMp} color="#6a7fdb" />
        <StatBar label="XP" val={player.xp} max={xpForLevel(player.level)} color="#ffe066" />
      </div>
      <span style={{fontSize:12,color:"#ffd700"}}>🪙{player.gold}</span>
      {onLeaderboard && <button onClick={onLeaderboard} style={{background:"rgba(255,200,50,0.1)",border:"1px solid rgba(255,200,50,0.3)",color:"#ffe066",padding:"3px 10px",borderRadius:99,cursor:"pointer",fontSize:11,fontFamily:"Georgia,serif"}}>🏆</button>}
      {onLogout && <button onClick={onLogout} style={{background:"rgba(255,50,50,0.1)",border:"1px solid rgba(255,50,50,0.25)",color:"#ff8a8a",padding:"3px 10px",borderRadius:99,cursor:"pointer",fontSize:11,fontFamily:"Georgia,serif"}}>Logout</button>}
    </div>
  );
}

function StatBar({ label, val, max, color }) {
  const pct = clamp(val/max, 0, 1);
  return (
    <div style={{display:"flex",alignItems:"center",gap:5}}>
      <span style={{fontSize:10,color:"#6a7a8a",minWidth:22}}>{label}</span>
      <div style={{width:70,height:8,background:"rgba(255,255,255,0.08)",borderRadius:4,overflow:"hidden"}}>
        <div style={{width:`${pct*100}%`,height:"100%",background:color,borderRadius:4,transition:"width 0.3s"}} />
      </div>
      <span style={{fontSize:10,color:"#6a7a8a"}}>{val}</span>
    </div>
  );
}

function MiniBar({ val, max, color }) {
  const pct = clamp(val/max, 0, 1);
  return (
    <div style={{width:"100%",height:6,background:"rgba(255,255,255,0.08)",borderRadius:3,overflow:"hidden"}}>
      <div style={{width:`${pct*100}%`,height:"100%",background:color,borderRadius:3,transition:"width 0.3s"}} />
    </div>
  );
}

function StatCard({ title, items, emptyMsg, accentColor="#ffe066" }) {
  return (
    <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,padding:"12px 14px"}}>
      <div style={{fontSize:11,fontWeight:700,color:accentColor,letterSpacing:1,marginBottom:10,textTransform:"uppercase"}}>{title}</div>
      {items.length===0&&emptyMsg ? <div style={{fontSize:12,color:"#4a5a6a"}}>{emptyMsg}</div>
        : items.map(([k,v],i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:5,color:"#cdd6f4"}}>
            <span style={{color:"#6a8a9a"}}>{k}</span><span>{v}</span>
          </div>
        ))}
    </div>
  );
}

function Notification({ data }) {
  return (
    <div style={{ position:"absolute", top:12, left:"50%", transform:"translateX(-50%)", background:"rgba(0,0,0,0.88)", border:`1px solid ${data.color}`, color:data.color, padding:"8px 20px", borderRadius:24, fontSize:12, zIndex:100, whiteSpace:"nowrap", pointerEvents:"none" }}>
      {data.msg}
    </div>
  );
}

// Shared style tokens
const inputStyle = {
  width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.06)",
  border:"1px solid rgba(255,255,255,0.12)", color:"#fff", padding:"10px 14px",
  borderRadius:8, fontSize:13, outline:"none", fontFamily:"Georgia, serif", marginBottom:12,
  display:"block",
};
const btnStyle = {
  background:"rgba(255,255,255,0.08)", border:"none", color:"#fff",
  padding:"10px 24px", borderRadius:24, cursor:"pointer", fontSize:13, fontFamily:"Georgia, serif",
};
