import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Trophy, ShieldCheck, LockKeyhole, Plus, CalendarDays, Users, ArrowLeft, Pencil, Trash2, Check, X, RefreshCw, ListOrdered, Swords, LogOut, AlertTriangle } from 'lucide-react';
import './style.css';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = url && key ? createClient(url, key) : null;
const byName = (a,b) => a.player_name.localeCompare(b.player_name, 'es');

function computeStandings(participants, matches) {
  const stats = new Map(participants.map(p => [p.id, { ...p, pj:0, pg:0, pe:0, pp:0, gf:0, gc:0, pts:0 }]));
  matches.filter(m => m.home_score !== null && m.away_score !== null).forEach(m => {
    const h = stats.get(m.home_id), a = stats.get(m.away_id);
    if (!h || !a) return;
    h.pj++; a.pj++; h.gf+=m.home_score; h.gc+=m.away_score; a.gf+=m.away_score; a.gc+=m.home_score;
    if(m.home_score > m.away_score){h.pg++;h.pts+=3;a.pp++;}
    else if(m.home_score < m.away_score){a.pg++;a.pts+=3;h.pp++;}
    else {h.pe++;a.pe++;h.pts++;a.pts++;}
  });
  return [...stats.values()].map(s => ({...s, dg:s.gf-s.gc})).sort((a,b)=>b.pts-a.pts||b.dg-a.dg||b.gf-a.gf||a.player_name.localeCompare(b.player_name,'es'));
}

function App() {
  const [tournaments, setTournaments] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [matches, setMatches] = useState([]);
  const [password, setPassword] = useState(sessionStorage.getItem('pes6-password') || '');
  const [authenticated, setAuthenticated] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTournamentOpen, setEditTournamentOpen] = useState(false);
  const [newTournament, setNewTournament] = useState({name:'', season:'', max_participants:12,format:'single'});
  const [newPlayer, setNewPlayer] = useState({player_name:'',team_name:''});
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editingMatch, setEditingMatch] = useState(null);
  const [round, setRound] = useState(1);
  const [tab, setTab] = useState('tabla');
  const [roundFilter, setRoundFilter] = useState('total');

  async function readAll(quiet=false) {
    if(!supabase) return;
    if(!quiet) setLoading(true);
    try {
      const {data, error:e} = await supabase.from('tournaments').select('*').order('created_at',{ascending:false});
      if(e) throw e;
      setTournaments(data||[]);
    } catch(e){setError(`No se pudieron cargar los torneos: ${e.message}`);}
    finally {if(!quiet) setLoading(false);}
  }
  async function readTournament(id,quiet=false) {
    if(!supabase || !id) return;
    if(!quiet) setLoading(true);
    try {
      const [a,b,c] = await Promise.all([
        supabase.from('tournaments').select('*').eq('id',id).single(),
        supabase.from('participants').select('*').eq('tournament_id',id).order('created_at'),
        supabase.from('matches').select('*').eq('tournament_id',id).order('round_number').order('created_at')
      ]);
      if(a.error||b.error||c.error) throw a.error||b.error||c.error;
      setChosen(a.data);setParticipants(b.data||[]);setMatches(c.data||[]);
    } catch(e){setError(`No se pudo cargar el torneo: ${e.message}`);}
    finally {if(!quiet) setLoading(false);}
  }
  useEffect(()=>{readAll();},[]);
  useEffect(()=>{
    if(!supabase || !password) return;
    supabase.functions.invoke('manage',{body:{password,action:'verify',data:{}}}).then(({error:e,data})=>{
      if(!e && data?.ok) setAuthenticated(true);
      else {setAuthenticated(false);setPassword('');sessionStorage.removeItem('pes6-password');}
    });
  },[]);
  useEffect(()=>{
    if(!supabase)return;
    const timer=setInterval(()=>{if(chosen) readTournament(chosen.id,true); else readAll(true);},20000);
    return ()=>clearInterval(timer);
  },[chosen?.id]);
  const participantsById = useMemo(()=>Object.fromEntries(participants.map(p=>[p.id,p])),[participants]);
  const rounds = useMemo(()=>[...new Set(matches.map(m=>m.round_number))].sort((a,b)=>a-b),[matches]);
  const mid = chosen?.format==='double' ? (rounds.length/2) : rounds.length;
  const filteredMatches = roundFilter==='total' ? matches : matches.filter(m=>roundFilter==='first' ? m.round_number<=mid : m.round_number>mid);
  const standings = useMemo(()=>computeStandings(participants,filteredMatches),[participants,filteredMatches]);
  const played = matches.filter(m=>m.home_score!==null).length;

  const goHome = ()=>{setChosen(null);setParticipants([]);setMatches([]);setRound(1);setTab('tabla');setRoundFilter('total');readAll();window.history.replaceState(null,'',location.pathname);};
  async function execute(action,data={},refresh=true, customPassword=null) {
    if(!supabase) return false;
    setPending(true);setError('');setNotice('');
    try {
      const {data:result,error:e}=await supabase.functions.invoke('manage',{body:{action,data,password:customPassword ?? password}});
      if(e || result?.error){
        let message=result?.error||e?.message||'No se pudo completar la operación';
        if(e?.context){try{const detail=await e.context.json();message=detail.error||message;}catch{}}
        throw new Error(message);
      }
      if(refresh){await readAll(true);if(chosen)await readTournament(chosen.id,true);}
      return result||{ok:true};
    } catch(e){setError(e.message);return false;}
    finally{setPending(false);}
  }
  async function login(e){
    e.preventDefault();const result=await execute('verify',{},false,passwordInput);
    if(result){setPassword(passwordInput);sessionStorage.setItem('pes6-password',passwordInput);setAuthenticated(true);setLoginOpen(false);setPasswordInput('');setNotice('Edición habilitada');}
  }
  const logout=()=>{setAuthenticated(false);setPassword('');sessionStorage.removeItem('pes6-password');setNotice('Saliste del modo edición');};
  async function submitTournament(e){
    e.preventDefault();const result=await execute('createTournament',newTournament);
    if(result){setCreateOpen(false);setNewTournament({name:'',season:'',max_participants:12,format:'single'});await readTournament(result.item.id);setTab('jugadores');setRound(1);setNotice('Torneo creado');}
  }
  async function submitPlayer(e){
    e.preventDefault();const result=await execute(editingPlayer?'updateParticipant':'addParticipant',{
      tournament_id:chosen.id,...newPlayer,...(editingPlayer?{participant_id:editingPlayer.id}:{})
    });
    if(result){setNewPlayer({player_name:'',team_name:''});setEditingPlayer(null);setNotice(editingPlayer?'Participante actualizado':'Participante agregado');}
  }
  function startEditPlayer(p){setEditingPlayer(p);setNewPlayer({player_name:p.player_name,team_name:p.team_name});}
  function cancelEditPlayer(){setEditingPlayer(null);setNewPlayer({player_name:'',team_name:''});}
  async function submitMatch(e){
    e.preventDefault();const h=editingMatch.h,a=editingMatch.a;
    if(h===''||a===''){setError('Completá ambos marcadores o usá “Dejar pendiente”');return;}
    const result=await execute('setResult',{tournament_id:chosen.id,match_id:editingMatch.id,home_score:Number(h),away_score:Number(a)});
    if(result){setEditingMatch(null);setNotice('Resultado guardado');}
  }
  async function clearMatch(){const r=await execute('setResult',{tournament_id:chosen.id,match_id:editingMatch.id,home_score:null,away_score:null});if(r){setEditingMatch(null);setNotice('Partido pendiente');}}
  async function createFixture(){
    if(!window.confirm(`¿Generar fixture ${chosen.format==='double'?'ida y vuelta':'a una rueda'} para ${participants.length} participantes?`))return;
    const r=await execute('generateFixture',{tournament_id:chosen.id});
    if(r){setTab('fixture');setRound(1);setNotice(`Fixture generado: ${r.matches} partidos`);}
  }
  async function removeTournament(){if(!window.confirm('¿Eliminar este torneo y TODOS sus resultados? Esta acción no se puede deshacer.'))return;const r=await execute('deleteTournament',{tournament_id:chosen.id},false);if(r){goHome();setNotice('Torneo eliminado');}}
  async function removeParticipant(p){if(!window.confirm(`¿Eliminar a ${p.player_name}?`))return;const r=await execute('deleteParticipant',{tournament_id:chosen.id,participant_id:p.id});if(r)setNotice('Participante eliminado');}
  async function updateTournament(e){e.preventDefault();const r=await execute('updateTournament',{tournament_id:chosen.id,name:chosen.name,season:chosen.season,status:chosen.status});if(r){setEditTournamentOpen(false);setNotice('Torneo actualizado');}}

  if(!supabase) return <main className="setup"><Trophy size={42}/><h1>PES 6 TR</h1><p>Configurá <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en Netlify o en tu archivo <code>.env</code> local.</p><p>Encontrás los pasos en <b>README.md</b> del ZIP.</p></main>;
  return <>
    <header className="site-header"><div className="wrap header-inner"><button className="brand" onClick={goHome} aria-label="Ir al inicio"><span className="brand-icon"><Trophy size={21}/></span><span>PES <strong>6</strong><small>TR</small></span></button><div className="header-right"><span className="online-dot"/> <span className="public-label">Resultados online</span>{authenticated?<button className="btn btn-subtle btn-sm" onClick={logout}><LogOut size={15}/> Salir de edición</button>:<button className="btn btn-outline btn-sm" onClick={()=>setLoginOpen(true)}><LockKeyhole size={15}/> Editar</button>}</div></div></header>
    <main className="wrap main">
      {error && <div className="alert alert-error" role="alert"><AlertTriangle size={17}/><span>{error}</span><button onClick={()=>setError('')}><X size={17}/></button></div>}
      {notice && <div className="alert alert-success" role="status"><Check size={17}/><span>{notice}</span><button onClick={()=>setNotice('')}><X size={17}/></button></div>}
      {!chosen ? <>
        <section className="hero"><div className="hero-tag"><span className="green-mark"/> LA LIGA NUNCA TERMINA</div><h1>Todos los torneos.<br/><em>Una sola cancha.</em></h1><p>Fixtures, posiciones y resultados de PES 6. Toda la historia, torneo por torneo.</p><div className="hero-actions">{authenticated?<button className="btn btn-primary" onClick={()=>setCreateOpen(true)}><Plus size={18}/> Nuevo torneo</button>:<button className="btn btn-primary" onClick={()=>setLoginOpen(true)}><LockKeyhole size={17}/> Ingresar para editar</button>}</div><div className="hero-decoration">06</div></section>
        <div className="section-heading"><div><div className="eyebrow">COMPETENCIAS</div><h2>Torneos <span className="muted">({tournaments.length})</span></h2></div><button className="btn btn-subtle btn-sm" onClick={()=>readAll()}><RefreshCw size={15}/> Actualizar</button></div>
        {loading?<div className="empty">Cargando torneos…</div>:tournaments.length===0?<div className="empty"><Trophy size={38}/><h3>Todavía no hay torneos</h3><p>Ingresá con la clave compartida para crear el primero.</p></div>:<div className="tournament-grid">{tournaments.map(t=><button className="tournament-card" key={t.id} onClick={()=>{readTournament(t.id);setRound(1);setRoundFilter('total');}}><div className="card-upper"><span className={'status '+(t.status==='finished'?'finished':'')}>{t.status==='finished'?'FINALIZADO':'EN JUEGO'}</span><span className="card-arrow">↗</span></div><div className="card-trophy"><Trophy size={27}/></div><h3>{t.name}</h3><p>{t.season||'Sin temporada'}</p><div className="card-footer"><span><Users size={15}/> {t.max_participants} jugadores</span><span><Swords size={15}/> {t.format==='double'?'Ida y vuelta':'Solo ida'}</span></div></button>)}</div>}
      </> : <>
        <button className="back" onClick={goHome}><ArrowLeft size={16}/> Todos los torneos</button>
        <div className="tournament-head"><div><div className="eyebrow">{chosen.season||'TORNEO PES 6'} · {chosen.status==='finished'?'FINALIZADO':'EN JUEGO'}</div><h1>{chosen.name}</h1><div className="meta"><span><Users size={15}/> {participants.length}/{chosen.max_participants} participantes</span><span><CalendarDays size={15}/> {rounds.length} fechas</span><span><Check size={15}/> {played}/{matches.length} jugados</span></div></div>{authenticated&&<div className="head-actions"><button className="btn btn-subtle btn-sm" onClick={()=>setEditTournamentOpen(true)}><Pencil size={15}/> Editar torneo</button><button className="btn btn-danger btn-sm" onClick={removeTournament}><Trash2 size={15}/></button></div>}</div>
        <div className="tabs"><button className={tab==='tabla'?'selected':''} onClick={()=>setTab('tabla')}><ListOrdered size={16}/> Posiciones</button><button className={tab==='fixture'?'selected':''} onClick={()=>setTab('fixture')}><CalendarDays size={16}/> Fixture</button><button className={tab==='jugadores'?'selected':''} onClick={()=>setTab('jugadores')}><Users size={16}/> Participantes</button></div>
        {tab==='tabla'&&<section className="panel"><div className="panel-top"><h2>Tabla de posiciones</h2>{chosen.format==='double'&&matches.length>0&&<div className="select-row"><label htmlFor="round-filter">Mostrar:</label><select id="round-filter" value={roundFilter} onChange={e=>setRoundFilter(e.target.value)}><option value="total">Tabla general</option><option value="first">Primera rueda</option><option value="second">Segunda rueda</option></select></div>}</div>{participants.length===0?<div className="empty small">Todavía no hay participantes.</div>:<div className="table-scroll"><table className="standings"><thead><tr><th>#</th><th className="align-left">Participante / Equipo</th><th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>GF</th><th>GC</th><th>DG</th><th className="points">PTS</th></tr></thead><tbody>{standings.map((p,i)=><tr key={p.id}><td><span className={'rank '+(i===0?'first':'')}>{i+1}</span></td><td className="align-left player-cell"><b>{p.player_name}</b><span>{p.team_name}</span></td><td>{p.pj}</td><td>{p.pg}</td><td>{p.pe}</td><td>{p.pp}</td><td>{p.gf}</td><td>{p.gc}</td><td>{p.dg>0?`+${p.dg}`:p.dg}</td><td className="points"><strong>{p.pts}</strong></td></tr>)}</tbody></table></div>}<p className="footnote">Orden: puntos, diferencia de goles y goles a favor. Victoria 3 pts · Empate 1 pt.</p></section>}
        {tab==='jugadores'&&<div className="split"><section className="panel"><div className="panel-top"><h2>Participantes</h2><span className="chip">{participants.length} / {chosen.max_participants}</span></div>{participants.length===0?<div className="empty small">Agregá los participantes para empezar.</div>:<div className="player-list">{[...participants].sort(byName).map((p,i)=><div className="player-row" key={p.id}><span className="player-avatar">{p.player_name.charAt(0).toUpperCase()}</span><div><b>{p.player_name}</b><small>{p.team_name}</small></div>{authenticated&&<div className="row-actions"><button title="Editar" onClick={()=>startEditPlayer(p)}><Pencil size={16}/></button>{matches.length===0&&<button title="Eliminar" onClick={()=>removeParticipant(p)}><Trash2 size={16}/></button>}</div>}</div>)}</div>}</section>
        <aside>{authenticated?<section className="panel side-panel"><h2>{editingPlayer?'Editar participante':'Agregar participante'}</h2>{matches.length===0||editingPlayer?<form onSubmit={submitPlayer} className="stack"><label>Nombre del participante<input required maxLength="80" placeholder="Ej. Francisco" value={newPlayer.player_name} onChange={e=>setNewPlayer({...newPlayer,player_name:e.target.value})}/></label><label>Equipo o selección<input required maxLength="80" placeholder="Ej. Juventus / Argentina" value={newPlayer.team_name} onChange={e=>setNewPlayer({...newPlayer,team_name:e.target.value})}/></label><button disabled={pending||(!editingPlayer&&participants.length>=chosen.max_participants)} className="btn btn-primary" type="submit">{editingPlayer?'Guardar cambios':'Agregar jugador'}</button>{editingPlayer&&<button className="btn btn-subtle" onClick={cancelEditPlayer} type="button">Cancelar</button>}</form>:<p className="muted small-text">Fixture generado. Podés editar nombres y equipos desde la lista, pero no agregar jugadores.</p>}{matches.length===0&&participants.length===chosen.max_participants&&<div className="fixture-cta"><p>¡Plantel completo! Ya podés generar el calendario.</p><button className="btn btn-primary" onClick={createFixture} disabled={pending}><CalendarDays size={17}/> Generar fixture</button></div>}</section>:<section className="panel side-panel"><ShieldCheck size={27} className="green-icon"/><h2>Modo consulta</h2><p>Las posiciones y los resultados son públicos. Para modificar participantes, ingresá con la clave compartida.</p><button className="btn btn-outline" onClick={()=>setLoginOpen(true)}><LockKeyhole size={16}/> Habilitar edición</button></section>}</aside></div>}
        {tab==='fixture'&&<section className="panel"><div className="panel-top"><h2>Calendario de partidos</h2><span className="chip">{played} de {matches.length} jugados</span></div>{matches.length===0?<div className="empty"><CalendarDays size={38}/><h3>Aún no hay fixture</h3><p>Agregá {chosen.max_participants} participantes y generá el calendario automáticamente.</p>{authenticated&&participants.length===chosen.max_participants&&<button className="btn btn-primary" onClick={createFixture} disabled={pending}><Plus size={16}/> Generar fixture</button>}{authenticated&&participants.length<chosen.max_participants&&<button className="btn btn-outline" onClick={()=>setTab('jugadores')}>Ir a participantes</button>}</div>:<><div className="round-toolbar"><button className="round-step" aria-label="Fecha anterior" disabled={round<=1} onClick={()=>setRound(r=>r-1)}>‹</button><select aria-label="Seleccionar fecha" value={rounds.includes(round)?round:1} onChange={e=>setRound(Number(e.target.value))}>{rounds.map(n=><option value={n} key={n}>Fecha {n}{chosen.format==='double'?(n<=mid?' · Ida':' · Vuelta'):''}</option>)}</select><button className="round-step" aria-label="Fecha siguiente" disabled={round>=rounds.length} onClick={()=>setRound(r=>r+1)}>›</button></div><div className="matches">{matches.filter(m=>m.round_number===(rounds.includes(round)?round:1)).map(m=><div className="match" key={m.id}><div className="match-player home"><b>{participantsById[m.home_id]?.player_name||'—'}</b><small>{participantsById[m.home_id]?.team_name||''}</small></div><div className={'score '+(m.home_score===null?'unplayed':'')}>{m.home_score===null?<span>VS</span>:<span>{m.home_score} <i>:</i> {m.away_score}</span>}</div><div className="match-player away"><b>{participantsById[m.away_id]?.player_name||'—'}</b><small>{participantsById[m.away_id]?.team_name||''}</small></div>{authenticated&&<button className="match-edit" onClick={()=>setEditingMatch({id:m.id,h:m.home_score??'',a:m.away_score??''})} title="Editar resultado"><Pencil size={16}/></button>}</div>)}</div></>}</section>}
      </>}
    </main>
    <footer><div className="wrap">PES 6 TR <span>·</span> Hecho para los que siguen jugando.</div></footer>
    {loginOpen&&<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setLoginOpen(false)}}><div className="modal" role="dialog" aria-modal="true" aria-label="Acceso de edición"><button className="modal-close" onClick={()=>setLoginOpen(false)}><X size={20}/></button><div className="modal-symbol"><LockKeyhole size={23}/></div><h2>Habilitar edición</h2><p>Ingresá la clave compartida para gestionar los torneos y resultados.</p><form onSubmit={login} className="stack"><label>Contraseña<input autoFocus type="password" value={passwordInput} onChange={e=>setPasswordInput(e.target.value)} placeholder="Clave de edición" required/></label><button className="btn btn-primary" disabled={pending}>Ingresar</button></form></div></div>}
    {createOpen&&<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCreateOpen(false)}}><div className="modal" role="dialog" aria-modal="true" aria-label="Nuevo torneo"><button className="modal-close" onClick={()=>setCreateOpen(false)}><X size={20}/></button><div className="modal-symbol"><Trophy size={23}/></div><h2>Nuevo torneo</h2><p>Definí los datos y el formato de la competencia.</p><form onSubmit={submitTournament} className="stack"><label>Nombre del torneo<input autoFocus required maxLength="100" placeholder="Ej. Liga PES 6" value={newTournament.name} onChange={e=>setNewTournament({...newTournament,name:e.target.value})}/></label><label>Temporada o edición<input maxLength="80" placeholder="Ej. Octubre 2026" value={newTournament.season} onChange={e=>setNewTournament({...newTournament,season:e.target.value})}/></label><label>Cantidad de participantes<input type="number" min="2" max="64" required value={newTournament.max_participants} onChange={e=>setNewTournament({...newTournament,max_participants:Number(e.target.value)})}/></label><label>Formato<select value={newTournament.format} onChange={e=>setNewTournament({...newTournament,format:e.target.value})}><option value="single">Todos contra todos · Solo ida</option><option value="double">Todos contra todos · Ida y vuelta</option></select></label><button className="btn btn-primary" disabled={pending}>Crear torneo</button></form></div></div>}
    {editTournamentOpen&&<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEditTournamentOpen(false)}}><div className="modal" role="dialog" aria-modal="true" aria-label="Editar torneo"><button className="modal-close" onClick={()=>setEditTournamentOpen(false)}><X size={20}/></button><h2>Editar torneo</h2><form className="stack" onSubmit={updateTournament}><label>Nombre<input required value={chosen.name} onChange={e=>setChosen({...chosen,name:e.target.value})}/></label><label>Edición<input value={chosen.season} onChange={e=>setChosen({...chosen,season:e.target.value})}/></label><label>Estado<select value={chosen.status} onChange={e=>setChosen({...chosen,status:e.target.value})}><option value="active">En juego</option><option value="finished">Finalizado</option></select></label><button className="btn btn-primary" disabled={pending}>Guardar torneo</button></form></div></div>}
    {editingMatch&&<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEditingMatch(null)}}><div className="modal" role="dialog" aria-modal="true" aria-label="Editar resultado"><button className="modal-close" onClick={()=>setEditingMatch(null)}><X size={20}/></button><h2>Resultado del partido</h2><p>Ingresá los goles de cada equipo.</p><form className="stack" onSubmit={submitMatch}><div className="result-editor"><label>Local<input type="number" min="0" max="99" required value={editingMatch.h} onChange={e=>setEditingMatch({...editingMatch,h:e.target.value})}/></label><span>—</span><label>Visitante<input type="number" min="0" max="99" required value={editingMatch.a} onChange={e=>setEditingMatch({...editingMatch,a:e.target.value})}/></label></div><button className="btn btn-primary" disabled={pending}>Guardar resultado</button><button className="btn btn-subtle" type="button" disabled={pending} onClick={clearMatch}>Dejar partido pendiente</button></form></div></div>}
  </>;
}

createRoot(document.getElementById('root')).render(<App/>);
