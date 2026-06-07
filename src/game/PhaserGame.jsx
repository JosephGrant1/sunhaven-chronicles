import { useEffect, useRef, useState, useCallback } from 'react';
import Phaser from 'phaser';
import Boot   from './scenes/Boot';
import Town   from './scenes/Town';
import Forest from './scenes/Forest';
import { EventBus } from './EventBus';

const API_BASE = 'https://sunhaven-chronicles-production.up.railway.app/api.php';
const CLASSES = {
  warrior:     { name:'Warrior',     icon:'⚔️',  color:'#e05a3a', skills:[{name:'Slash',mp:0},{name:'Shield Bash',mp:15},{name:'War Cry',mp:25}] },
  mage:        { name:'Mage',        icon:'🔮',  color:'#6a7fdb', skills:[{name:'Fireball',mp:0},{name:'Ice Lance',mp:18},{name:'Meteor',mp:35}] },
  rogue:       { name:'Rogue',       icon:'🗡️', color:'#44b37b', skills:[{name:'Stab',mp:0},{name:'Smoke Bomb',mp:20},{name:'Death Mark',mp:30}] },
  necromancer: { name:'Necromancer', icon:'💀',  color:'#9b59b6', skills:[{name:'Magic Arrow',mp:0},{name:'Desiccation',mp:20},{name:'Wave of Souls',mp:40}] },
};
const xpForLevel = lvl => lvl * 100;

export default function PhaserGame({ player: initPlayer, authToken, username, onPlayerUpdate, onLogout }) {
  const containerRef  = useRef(null);
  const gameRef       = useRef(null);
  const [player,      setPlayer]      = useState(initPlayer);
  const [scene,       setScene]       = useState('Town');
  const [battleLog,   setBattleLog]   = useState([]);
  const [targeted,    setTargeted]    = useState(null);
  const [notification,setNotification]= useState(null);
  const [mortisOpen,  setMortisOpen]  = useState(false);
  const [shopOpen,    setShopOpen]    = useState(false);

  const notify = useCallback((msg, color='#ffe066') => {
    setNotification({ msg, color });
    setTimeout(() => setNotification(null), 2500);
  }, []);

  const addLog = useCallback((msg, color='#cdd6f4') => {
    setBattleLog(prev => [...prev.slice(-9), { msg, color, id: Date.now()+Math.random() }]);
  }, []);

  const savePlayer = useCallback(async (p) => {
    if (!authToken || !p) return;
    try { await fetch(`${API_BASE}?action=save`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${authToken}` }, body: JSON.stringify({ character: p }) }); } catch {}
  }, [authToken]);

  // Boot Phaser once
  useEffect(() => {
    if (gameRef.current) return;
    const cfg = {
      type: Phaser.AUTO,
      width: window.innerWidth,
      height: window.innerHeight,
      parent: containerRef.current,
      backgroundColor: '#0d1117',
      scene: [Boot, Town, Forest],
    };
    gameRef.current = new Phaser.Game(cfg);
    gameRef.current.registry.set('player', initPlayer);
    gameRef.current.registry.set('authToken', authToken);
    gameRef.current.registry.set('username', username);
    return () => { gameRef.current?.destroy(true); gameRef.current = null; };
  }, []);

  // Sync player → Phaser registry
  useEffect(() => { gameRef.current?.registry.set('player', player); }, [player]);

  // EventBus listeners
  useEffect(() => {
    const onSceneReady   = (s) => setScene(s);
    const onPlayerUpdate = (p) => {
      // Level-up check
      let np = { ...p };
      while (np.xp >= xpForLevel(np.level)) {
        np = { ...np, xp: np.xp - xpForLevel(np.level), level: np.level + 1, maxHp: np.maxHp + 15, hp: np.maxHp + 15, maxMp: np.maxMp + 10, mp: np.maxMp + 10 };
        notify(`🎉 LEVEL UP! Now Level ${np.level}!`, '#ffe066');
      }
      // Quest check
      np = { ...np, quests: (np.quests ?? []).map(q => {
        if (q.done) return q;
        const killCount = np.kills?.[q.target] ?? 0;
        if (killCount >= q.count) {
          notify(`✅ Quest Complete: ${q.name}! +${q.reward.xp}XP`, '#44ff88');
          np.xp += q.reward.xp; np.gold += q.reward.gold;
          if (q.unlockId && !np.unlocks?.includes(q.unlockId))
            np.unlocks = [...(np.unlocks ?? []), q.unlockId];
          return { ...q, done: true };
        }
        return q;
      })};
      setPlayer(np);
      savePlayer(np);
      gameRef.current?.registry.set('player', np);
    };
    const onLog       = ({ text, color }) => addLog(text, color);
    const onTargeted  = (m)  => setTargeted(m);
    const onHpChange  = ({ hp }) => setPlayer(p => p ? { ...p, hp } : p);
    const onDied      = ({ hp }) => { setPlayer(p => p ? { ...p, hp, stats: { ...p.stats, deaths: (p.stats?.deaths??0)+1 } } : p); notify('💀 Defeated! Returning to town...', '#ff4444'); };
    const onRested    = ()   => { setPlayer(p => p ? { ...p, hp: p.maxHp, mp: p.maxMp } : p); notify('🏠 Fully rested!', '#44ff88'); };
    const onNpcClick  = (id) => {
      if (id === 'mortis') { setMortisOpen(true); return; }
      if (id === 'shop')   { setShopOpen(true);   return; }
      if (id === 'forest') { EventBus.emit('go-forest'); return; }
      if (id === 'inn')    { EventBus.emit('do-rest');   return; }
    };

    EventBus.on('scene-ready',       onSceneReady);
    EventBus.on('player-update',     onPlayerUpdate);
    EventBus.on('log-message',       onLog);
    EventBus.on('monster-targeted',  onTargeted);
    EventBus.on('player-hp-change',  onHpChange);
    EventBus.on('player-died',       onDied);
    EventBus.on('player-rested',     onRested);
    EventBus.on('npc-click',         onNpcClick);
    return () => EventBus.removeAllListeners();
  }, [addLog, notify, savePlayer]);

  const cls = CLASSES[player?.class] ?? CLASSES.warrior;
  const hpPct  = player ? Math.max(0, player.hp  / player.maxHp)  : 0;
  const mpPct  = player ? Math.max(0, player.mp  / player.maxMp)  : 0;
  const xpPct  = player ? Math.max(0, player.xp  / xpForLevel(player.level)) : 0;

  return (
    <div style={{ position:'relative', width:'100%', height:'100vh', overflow:'hidden', fontFamily:'Georgia,serif' }}>
      {/* Phaser canvas */}
      <div ref={containerRef} style={{ position:'absolute', inset:0 }} />

      {/* ── HUD ── */}
      <div style={{ position:'absolute', top:0, left:0, right:0, display:'flex', alignItems:'center', gap:10, padding:'6px 14px', background:'rgba(0,0,0,0.82)', borderBottom:'1px solid rgba(255,255,255,0.08)', zIndex:10, flexWrap:'wrap' }}>
        <span style={{ fontSize:16, color:cls.color }}>{cls.icon}</span>
        <span style={{ fontWeight:700, fontSize:13, color:'#fff' }}>{player?.name}</span>
        <span style={{ fontSize:11, color:'#8a9a7a', background:'rgba(255,255,255,0.07)', padding:'2px 8px', borderRadius:20 }}>Lv.{player?.level}</span>
        <span style={{ fontSize:10, color:'#6a88aa' }}>@{username}</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          {[['HP', hpPct, player?.hp, player?.maxHp, '#e05a3a'],['MP', mpPct, player?.mp, player?.maxMp, '#6a7fdb'],['XP', xpPct, player?.xp, xpForLevel(player?.level??1), '#ffe066']].map(([lbl,pct,val,max,color])=>(
            <div key={lbl} style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:10, color:'#6a7a8a', minWidth:20 }}>{lbl}</span>
              <div style={{ width:80, height:8, background:'rgba(255,255,255,0.09)', borderRadius:4, overflow:'hidden' }}>
                <div style={{ width:`${pct*100}%`, height:'100%', background:color, borderRadius:4, transition:'width 0.3s' }} />
              </div>
              <span style={{ fontSize:10, color:'#6a7a8a' }}>{val}</span>
            </div>
          ))}
          <span style={{ fontSize:12, color:'#ffd700' }}>🪙{player?.gold}</span>
        </div>
        <span style={{ fontSize:11, color:'#8a9ab0', background:'rgba(255,255,255,0.05)', padding:'2px 10px', borderRadius:20 }}>📍 {scene}</span>
        <button onClick={onLogout} style={{ background:'rgba(255,50,50,0.1)', border:'1px solid rgba(255,50,50,0.25)', color:'#ff8a8a', padding:'3px 10px', borderRadius:99, cursor:'pointer', fontSize:11, fontFamily:'Georgia,serif' }}>Logout</button>
      </div>

      {/* ── Skill Bar ── */}
      {scene === 'Forest' && (
        <div style={{ position:'absolute', bottom:16, left:'50%', transform:'translateX(-50%)', display:'flex', gap:8, zIndex:10 }}>
          {cls.skills.map((sk, i) => (
            <button key={i} onClick={() => EventBus.emit('use-skill', i)}
              style={{ background:`${cls.color}22`, border:`1px solid ${cls.color}66`, color:'#fff', padding:'10px 18px', borderRadius:12, cursor:'pointer', fontFamily:'Georgia,serif', fontSize:12, minWidth:90, textAlign:'center' }}
              onMouseEnter={e => e.currentTarget.style.background=`${cls.color}55`}
              onMouseLeave={e => e.currentTarget.style.background=`${cls.color}22`}>
              <div style={{ fontWeight:700 }}>{sk.name}</div>
              <div style={{ fontSize:10, color:'#aaa' }}>{sk.mp > 0 ? `${sk.mp}MP` : 'Free'}</div>
            </button>
          ))}
          <button onClick={() => EventBus.emit('go-town')}
            style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', color:'#a0a0b0', padding:'10px 18px', borderRadius:12, cursor:'pointer', fontFamily:'Georgia,serif', fontSize:12 }}>
            ← Town
          </button>
        </div>
      )}

      {/* ── Targeted Monster Panel ── */}
      {targeted && scene === 'Forest' && (
        <div style={{ position:'absolute', top:60, right:16, width:200, background:'rgba(0,0,0,0.88)', border:`1px solid ${targeted.boss?'#c06c00':'rgba(255,255,255,0.12)'}`, borderRadius:12, padding:'12px 14px', zIndex:10 }}>
          {targeted.boss && <div style={{ fontSize:10, color:'#c06c00', letterSpacing:1, marginBottom:4 }}>⚠ BOSS</div>}
          <div style={{ fontWeight:700, fontSize:13, marginBottom:8 }}>{targeted.name}</div>
          <div style={{ fontSize:10, color:'#6a8a7a', marginBottom:4 }}>HP</div>
          <div style={{ width:'100%', height:10, background:'rgba(255,255,255,0.08)', borderRadius:5, overflow:'hidden', marginBottom:6 }}>
            <div style={{ width:`${(targeted.hp/targeted.maxHp)*100}%`, height:'100%', background:'#e05a3a', borderRadius:5, transition:'width 0.3s' }} />
          </div>
          <div style={{ fontSize:11, color:'#8a9ab0' }}>{targeted.hp} / {targeted.maxHp}</div>
          <div style={{ fontSize:10, color:'#6a8a7a', marginTop:6 }}>Double-click to engage</div>
        </div>
      )}

      {/* ── Battle Log ── */}
      {scene === 'Forest' && battleLog.length > 0 && (
        <div style={{ position:'absolute', bottom:90, left:16, width:280, background:'rgba(0,0,0,0.78)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'8px 12px', zIndex:10, maxHeight:160, overflowY:'auto' }}>
          {battleLog.map(l => <div key={l.id} style={{ fontSize:11, color:l.color, lineHeight:1.6 }}>{l.msg}</div>)}
        </div>
      )}

      {/* ── Quest Tracker ── */}
      {player?.quests?.filter(q=>!q.done).length > 0 && (
        <div style={{ position:'absolute', top:60, left:16, width:190, background:'rgba(0,0,0,0.75)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, padding:'10px 12px', zIndex:10 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#44ff88', letterSpacing:1, marginBottom:8 }}>ACTIVE QUESTS</div>
          {player.quests.filter(q=>!q.done).slice(0,3).map(q => {
            const kills = player.kills?.[q.target] ?? 0;
            const pct = Math.min(1, kills / q.count);
            return (
              <div key={q.id} style={{ marginBottom:8 }}>
                <div style={{ fontSize:11, color:'#ffe066', marginBottom:3 }}>{q.name}</div>
                <div style={{ width:'100%', height:5, background:'rgba(255,255,255,0.08)', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ width:`${pct*100}%`, height:'100%', background:'#44ff88', borderRadius:3 }} />
                </div>
                <div style={{ fontSize:10, color:'#6a8a7a', marginTop:2 }}>{Math.min(kills, q.count)} / {q.count}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Notification ── */}
      {notification && (
        <div style={{ position:'absolute', top:56, left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,0.9)', border:`1px solid ${notification.color}`, color:notification.color, padding:'8px 24px', borderRadius:24, fontSize:13, zIndex:50, whiteSpace:'nowrap', pointerEvents:'none' }}>
          {notification.msg}
        </div>
      )}

      {/* ── Mortis Panel ── (inline) */}
      {mortisOpen && player && <MortisOverlay player={player} onClose={() => setMortisOpen(false)} onPlayerChange={p => { setPlayer(p); savePlayer(p); }} notify={notify} />}
      {shopOpen   && player && <ShopOverlay   player={player} onClose={() => setShopOpen(false)}   onPlayerChange={p => { setPlayer(p); savePlayer(p); }} notify={notify} />}
    </div>
  );
}

// ── Mortis Panel ────────────────────────────────────────────────────────────
const NPC_QUEST = { id:'q_mortis_1', name:'Trial of Shadows', target:'Shadow Wolf', count:10, reward:{ xp:300, gold:0 }, unlockId:'mortis_trial_done',
  desc:'Mortis watches you with hollow eyes. "Slay ten Shadow Wolves. Return when the forest runs cold."' };
const NECRO_ITEM = { id:'class_necromancer', name:'Necromancer Class', cost:500, unlockId:'class_necromancer',
  desc:'A dark spellcaster who commands souls and channels death itself.' };

function MortisOverlay({ player, onClose, onPlayerChange, notify }) {
  const quest    = player.quests?.find(q => q.id === NPC_QUEST.id);
  const accepted = !!quest;
  const done     = quest?.done;
  const kills    = player.kills?.[NPC_QUEST.target] ?? 0;
  const hasAccess = player.unlocks?.includes('mortis_trial_done');
  const hasNecro  = player.unlocks?.includes('class_necromancer');
  const isNecro   = player.class === 'necromancer';

  const acceptQuest = () => {
    if (accepted) return;
    onPlayerChange({ ...player, quests: [...(player.quests ?? []), { ...NPC_QUEST, done: false }] });
    notify('📜 Quest accepted: Trial of Shadows', '#ffe066');
  };
  const buyNecro = () => {
    if (player.gold < NECRO_ITEM.cost) { notify('Not enough gold!', '#ff6b6b'); return; }
    onPlayerChange({ ...player, gold: player.gold - NECRO_ITEM.cost, unlocks: [...(player.unlocks??[]), NECRO_ITEM.unlockId] });
    notify('✨ Necromancer unlocked!', '#9b59b6');
  };
  const equipNecro = () => {
    const cls = { hp:70, mp:140 };
    const bonus = (player.level-1);
    onPlayerChange({ ...player, class:'necromancer', maxHp:cls.hp+bonus*15, hp:cls.hp+bonus*15, maxMp:cls.mp+bonus*10, mp:cls.mp+bonus*10, cooldowns:[0,0,0] });
    notify('💀 Class changed to Necromancer!', '#9b59b6');
    onClose();
  };

  const overlay = { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500 };
  const panel = { background:'linear-gradient(160deg,#1a0a2e,#0d1117)', border:'1px solid #7b4faa', borderRadius:20, padding:'28px 28px 24px', maxWidth:420, width:'90%', fontFamily:'Georgia,serif', color:'#fff', position:'relative' };

  return (
    <div style={overlay} onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={panel}>
        <button onClick={onClose} style={{ position:'absolute', top:12, right:16, background:'none', border:'none', color:'#7a6a9a', fontSize:18, cursor:'pointer' }}>✕</button>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
          <div style={{ fontSize:52, filter:'drop-shadow(0 0 12px #9b59b6)' }}>🌑</div>
          <div>
            <div style={{ fontSize:20, fontWeight:700, color:'#c39bd3' }}>Mortis</div>
            <div style={{ fontSize:11, color:'#7a5a9a', letterSpacing:2 }}>KEEPER OF SHADOWS</div>
          </div>
        </div>

        {!accepted && (
          <>
            <p style={{ fontSize:13, color:'#b0a0c8', lineHeight:1.7, borderLeft:'2px solid #7b4faa', paddingLeft:12, fontStyle:'italic', marginBottom:16 }}>{NPC_QUEST.desc}</p>
            <div style={{ background:'rgba(155,89,182,0.12)', border:'1px solid rgba(155,89,182,0.3)', borderRadius:10, padding:'12px', marginBottom:16, fontSize:12 }}>
              <div style={{ fontWeight:700, color:'#c39bd3', marginBottom:4 }}>📜 {NPC_QUEST.name}</div>
              <div style={{ color:'#8a7a9a' }}>Shadow Wolf × 10 — Reward: +300 XP · Shop access</div>
            </div>
            <button onClick={() => { acceptQuest(); onClose(); }} style={{ width:'100%', background:'linear-gradient(135deg,#7b4faa,#5a3080)', border:'none', color:'#fff', padding:12, borderRadius:24, cursor:'pointer', fontSize:13, fontFamily:'Georgia,serif' }}>Accept the Trial</button>
          </>
        )}

        {accepted && !done && (
          <div>
            <div style={{ fontSize:12, color:'#7a8a9a', marginBottom:8, letterSpacing:1 }}>TRIAL IN PROGRESS</div>
            <div style={{ background:'rgba(155,89,182,0.1)', border:'1px solid rgba(155,89,182,0.25)', borderRadius:10, padding:14 }}>
              <div style={{ fontWeight:700, color:'#c39bd3', marginBottom:8 }}>📜 {NPC_QUEST.name}</div>
              <div style={{ width:'100%', height:8, background:'rgba(255,255,255,0.08)', borderRadius:4, overflow:'hidden' }}>
                <div style={{ width:`${Math.min(1, kills/10)*100}%`, height:'100%', background:'#9b59b6', borderRadius:4 }} />
              </div>
              <div style={{ fontSize:11, color:'#6a7a8a', marginTop:5 }}>{Math.min(kills,10)} / 10 Shadow Wolves slain</div>
            </div>
            <p style={{ fontSize:12, color:'#6a5a7a', marginTop:12, fontStyle:'italic' }}>Return when the deed is done.</p>
          </div>
        )}

        {hasAccess && !hasNecro && (
          <div style={{ marginTop: accepted && !done ? 16 : 0 }}>
            {done && <div style={{ fontSize:12, color:'#44ff88', marginBottom:12, padding:'8px 12px', background:'rgba(68,255,136,0.08)', borderRadius:8, border:'1px solid rgba(68,255,136,0.25)' }}>✅ Trial complete — the shop is open.</div>}
            <div style={{ background:'rgba(155,89,182,0.12)', border:'1px solid rgba(155,89,182,0.35)', borderRadius:12, padding:16, display:'flex', gap:14, alignItems:'center' }}>
              <div style={{ fontSize:42 }}>💀</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, color:'#c39bd3', marginBottom:4 }}>Necromancer Class</div>
                <div style={{ fontSize:11, color:'#8a7a9a', marginBottom:6 }}>{NECRO_ITEM.desc}</div>
                <div style={{ color:'#ffd700' }}>🪙 {NECRO_ITEM.cost}G</div>
              </div>
            </div>
            <button onClick={buyNecro} disabled={player.gold < NECRO_ITEM.cost}
              style={{ width:'100%', marginTop:10, background: player.gold>=NECRO_ITEM.cost ? 'linear-gradient(135deg,#7b4faa,#5a3080)' : 'rgba(255,255,255,0.05)', border:'none', color: player.gold>=NECRO_ITEM.cost ? '#fff' : '#4a4a6a', padding:12, borderRadius:24, cursor: player.gold>=NECRO_ITEM.cost ? 'pointer' : 'not-allowed', fontSize:13, fontFamily:'Georgia,serif' }}>
              {player.gold >= NECRO_ITEM.cost ? 'Purchase Necromancer Class' : `Need ${NECRO_ITEM.cost - player.gold}G more`}
            </button>
          </div>
        )}

        {hasNecro && !isNecro && (
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:12, color:'#c39bd3', marginBottom:12, padding:'8px 12px', background:'rgba(155,89,182,0.1)', borderRadius:8 }}>✨ Necromancer class unlocked.</div>
            <button onClick={equipNecro} style={{ width:'100%', background:'linear-gradient(135deg,#9b59b6,#6c3483)', border:'none', color:'#fff', padding:12, borderRadius:24, cursor:'pointer', fontSize:13, fontFamily:'Georgia,serif' }}>💀 Become the Necromancer</button>
          </div>
        )}
        {isNecro && <div style={{ marginTop:16, textAlign:'center', color:'#9b59b6', padding:12, background:'rgba(155,89,182,0.08)', borderRadius:10 }}>💀 You already walk in shadow.</div>}
      </div>
    </div>
  );
}

// ── Shop ────────────────────────────────────────────────────────────────────
const SHOP_ITEMS = [
  { id:'hp',   name:'Health Potion', icon:'🧪', cost:20,  desc:'+40 HP' },
  { id:'mp',   name:'Mana Potion',   icon:'💧', cost:15,  desc:'+30 MP' },
  { id:'atk',  name:'Iron Blade',    icon:'🗡️', cost:80,  desc:'+5 Atk' },
  { id:'def',  name:'Chain Mail',    icon:'🛡️', cost:100, desc:'+4 Def' },
];
function ShopOverlay({ player, onClose, onPlayerChange, notify }) {
  const buy = (item) => {
    if (player.gold < item.cost) { notify('Not enough gold!', '#ff6b6b'); return; }
    let np = { ...player, gold: player.gold - item.cost };
    if (item.id==='hp')  np.hp  = Math.min(np.maxHp, np.hp + 40);
    if (item.id==='mp')  np.mp  = Math.min(np.maxMp, np.mp + 30);
    if (item.id==='atk') np.atk = (np.atk??0) + 5;
    if (item.id==='def') np.def = (np.def??0) + 4;
    onPlayerChange(np);
    notify(`Bought ${item.name}!`, '#ffe066');
  };
  const overlay = { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500 };
  return (
    <div style={overlay} onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'#0d1117', border:'1px solid rgba(255,255,255,0.12)', borderRadius:20, padding:28, maxWidth:460, width:'90%', fontFamily:'Georgia,serif', color:'#fff', position:'relative' }}>
        <button onClick={onClose} style={{ position:'absolute', top:12, right:16, background:'none', border:'none', color:'#6a7a8a', fontSize:18, cursor:'pointer' }}>✕</button>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h2 style={{ margin:0, color:'#ffe066', fontSize:18 }}>🛍️ Alva's Emporium</h2>
          <span style={{ color:'#ffd700' }}>🪙 {player.gold}G</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {SHOP_ITEMS.map(item => (
            <div key={item.id} style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, padding:'14px 12px', textAlign:'center' }}>
              <div style={{ fontSize:32, marginBottom:6 }}>{item.icon}</div>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>{item.name}</div>
              <div style={{ fontSize:11, color:'#44ff88', marginBottom:8 }}>{item.desc}</div>
              <div style={{ fontSize:12, color:'#ffd700', marginBottom:10 }}>🪙 {item.cost}G</div>
              <button onClick={() => buy(item)} style={{ background: player.gold>=item.cost ? 'linear-gradient(135deg,#e05a3a,#c0392b)' : 'rgba(255,255,255,0.05)', border:'none', color: player.gold>=item.cost ? '#fff' : '#4a5a6a', padding:'6px 18px', borderRadius:20, cursor: player.gold>=item.cost ? 'pointer' : 'not-allowed', fontSize:12, fontFamily:'Georgia,serif' }}>Buy</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
