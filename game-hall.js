import { Chess } from './assets/vendor/chess.js';

const RULES={
 ludo:'Two players race four tokens. Roll six to leave the yard. Move exactly by the die. Landing on an opponent captures it unless the square is safe. Bring all four tokens home.',
 snakes:'Roll one die and reach square 100 exactly. Ladders move upward and snakes move downward. First to 100 wins.',
 chess:'Standard legal chess rules are enforced by chess.js, including check, checkmate, castling, promotion and en passant. Enter moves such as e2e4.',
 carrom:'Accessible turn simulation: choose angle 0–359 and power 1–10. Pocket your nine coins and then the queen. Fouls pass the turn.',
 blackjack:'Reach 21 without exceeding it. Number cards use face value, face cards count 10, and Ace counts 1 or 11. Dealer draws to 17.'
};
const SNAKES={17:7,54:34,62:19,64:60,87:24,93:73,95:75,99:78},LADDERS={4:14,9:31,20:38,28:84,40:59,51:67,63:81,71:91};
const COLORS=['Red','Orange','Yellow','Green','Blue','White','Black','Purple','Gold','Silver'];
const DEFAULT_COLORS=['Red','Orange','Yellow','Green','White'];
const esc=s=>Game.escapeHTML(String(s));

const GameHall={type:null,state:null,chess:null,onlineSession:null,version:0,subscription:null,
 initWorld(){for(const city of CityDirectory.cities){const lobby=`${city.key}_game_hall`,park=city.targets.park;WorldData.locations[lobby]={name:`${city.label} — Accessible Game Hall`,region:city.label,description:'A physical indoor game hall with five screen-reader-friendly rooms, rule desks, dice tables, card tables and quiet strategy boards.',exits:{down:park,north:`${lobby}_ludo`,east:`${lobby}_snakes`,south:`${lobby}_chess`,west:`${lobby}_carrom`,up:`${lobby}_blackjack`},features:['accessible game hall','rule desk','board game rooms'],items:[],enemies:[],safe:true,music:'game-hall'};WorldData.locations[park].exits.up=lobby;city.targets.game_hall=lobby;for(const [dir,type] of [['north','ludo'],['east','snakes'],['south','chess'],['west','carrom'],['up','blackjack']])WorldData.locations[`${lobby}_${type}`]={name:`${city.label} Game Hall — ${type[0].toUpperCase()+type.slice(1)} Room`,region:`${city.label} Game Hall`,description:`An accessible ${type} room with spoken rules, large controls, clear turn feedback and realistic board sounds.`,exits:{down:lobby},features:['game hall room',type],items:[],enemies:[],safe:true,music:'game-hall'};}
 },
 inject(){
  const panel=document.createElement('div');
  panel.id='game-hall-panel';
  panel.className='panel hidden wide-panel';
  panel.innerHTML=`<h3>Accessible Game Hall</h3>
   <div id="hall-game-list" class="directory-grid"></div>
   <div id="hall-help" class="settings-note"></div>
   <div id="hall-status" role="log" aria-live="assertive" aria-atomic="false"></div>
   <div id="hall-board" class="hall-board" aria-live="off"></div>
   <div id="hall-setup">
     <label>Players <select id="hall-player-count"><option>1</option><option selected>2</option><option>3</option><option>4</option><option>5</option></select></label>
     <label>Mode <select id="hall-player-mode"><option value="ai">You with AI opponents</option><option value="local">Local pass-and-play</option></select></label>
     <div id="hall-color-selectors" style="margin: 10px 0; display: flex; flex-wrap: wrap; gap: 8px;"></div>
   </div>
   <div id="hall-controls" class="hall-controls"></div>
   <details id="hall-online-details"><summary>Online friend match</summary>
     <input id="hall-session-name" placeholder="Match name">
     <input id="hall-invite-name" placeholder="Friend's exact hero name">
     <button id="hall-create-online">Create Online Match</button>
     <button id="hall-invite">Invite Friend</button>
     <button id="hall-start-online" class="action-btn hidden" style="margin-top:8px;">Start Challenge (Both Players)</button>
   </details>
   <button class="menu-btn close-btn" onclick="document.getElementById('game-hall-panel').classList.add('hidden')">Close</button>`;
  document.getElementById('game-screen').appendChild(panel);
  document.querySelector('.action-btns').insertAdjacentHTML('beforeend','<button class="action-btn" id="btn-game-hall">Game Hall</button>');
  document.getElementById('btn-game-hall').addEventListener('click',()=>this.enterOrOpen());
  document.getElementById('hall-create-online').addEventListener('click',()=>this.createOnline());
  document.getElementById('hall-invite').addEventListener('click',()=>this.invite());
  document.getElementById('hall-start-online').addEventListener('click',()=>this.startOnlineChallenge());
  document.getElementById('hall-player-count')?.addEventListener('change',()=>this.renderColorSelectors());
  document.getElementById('hall-player-mode')?.addEventListener('change',()=>this.renderColorSelectors());
 },
 renderColorSelectors(){
  const container=document.getElementById('hall-color-selectors');
  if(!container)return;
  const count=this.selectedCount(), mode=this.selectedMode();
  let html='';
  for(let i=0;i<count;i++){
    const name=(mode==='ai'&&(i>0))?`AI ${i}`:(i===0?'You':`Player ${i+1}`);
    const defColor=DEFAULT_COLORS[i]||COLORS[0];
    const opts=COLORS.map(c=>`<option value="${c}" ${c===defColor?'selected':''}>${c}</option>`).join('');
    html+=`<label style="font-size:12px;display:flex;align-items:center;gap:4px;">${esc(name)} Color: <select class="hall-player-color-sel" data-index="${i}">${opts}</select></label>`;
  }
  container.innerHTML=html;
 },
 getSelectedColors(){
  const count=this.selectedCount();
  const res=[];
  const selects=document.querySelectorAll('.hall-player-color-sel');
  selects.forEach((sel,idx)=>{
    res[idx]=sel.value||DEFAULT_COLORS[idx]||'Red';
  });
  for(let i=res.length;i<count;i++) res[i]=DEFAULT_COLORS[i]||'Red';
  return res;
 },
 playerColor(index){
  return this.state?.colors?.[index]||DEFAULT_COLORS[index]||'Red';
 },
 playerColoredName(index){
  const name=this.playerName(index), col=this.playerColor(index);
  return `${name} (${col})`;
 },
 enterOrOpen(){const city=Game.currentCityDefinition?.(),target=city?.targets?.game_hall;if(!target){Game.addNarrative('Enter a city to find its Game Hall.','system');return;}if(!Game.state.location.startsWith(target)){Game.routeToCityLandmark('game_hall');return;}this.open();},
 open(){this.loadInvites();const room=WorldData.locations[Game.state.location]?.features?.find(x=>['ludo','snakes','chess','carrom','blackjack'].includes(x));document.getElementById('game-hall-panel').classList.remove('hidden');document.getElementById('hall-game-list').innerHTML=['ludo','snakes','chess','carrom','blackjack'].map(t=>`<button onclick="GameHall.select('${t}')">${t==='snakes'?'Snakes & Ladders':t[0].toUpperCase()+t.slice(1)}</button>`).join('');if(room)this.select(room);},
 select(type){
  this.type=type;
  document.getElementById('hall-help').textContent=RULES[type];
  document.getElementById('hall-status').textContent='Read the rules, select players and colors, then start a game.';
  document.getElementById('hall-controls').innerHTML=`<button onclick="GameHall.startLocal()">Start vs Computer</button>`;
  document.getElementById('hall-board').innerHTML='';
  this.renderColorSelectors();
 },
 announce(text){const log=document.getElementById('hall-status'),p=document.createElement('p');p.textContent=text;log.appendChild(p);while(log.children.length>20)log.removeChild(log.firstChild);log.scrollTop=log.scrollHeight;},
 pause(ms){return new Promise(resolve=>setTimeout(resolve,ms));},
 selectedCount(){return Math.max(1,Math.min(5,Number(document.getElementById('hall-player-count')?.value||2)));},
 selectedMode(){return document.getElementById('hall-player-mode')?.value||'ai';},
 playerName(index){if(this.state?.mode==='ai'){if(index===0)return 'You';return `AI ${index}`;}return this.state?.players?.[index]||`Player ${index+1}`;},
 isAI(index){return this.state?.mode==='ai'&&index>0;},
 async pieceSteps(count,who='You'){await this.pause(80);},
 announceTurn(){
  const who=this.playerColoredName(this.state.turn);
  this.announce(this.isAI(this.state.turn)?`${who}'s turn.`:`${who}, it is your turn.`);
  MusicSystem.playSFX('board-turn');
 },
 legalLudoTokens(seat,die){return this.state.tokens[seat].map((pos,index)=>({pos,index})).filter(t=>(t.pos<0&&die===6)||(t.pos>=0&&t.pos+die<=56));},
 async passLudoTurn(){
  const who=this.playerColoredName(this.state.turn);
  this.announce(`${who} rolled ${this.state.roll}, not moving. Turn passes.`);
  await MusicSystem.playSFXAndWait('board-turn',400);
  await this.pause(3500);
  this.state.roll=null;
  this.state.turn=(this.state.turn+1)%this.state.tokens.length;
  this.render();
  this.announceTurn();
  await this.pause(2500);
  if(this.isAI(this.state.turn))setTimeout(()=>this.roll(),2500);
 },
 enterGameplayMode(){
  const list=document.getElementById('hall-game-list');
  const setup=document.getElementById('hall-setup');
  const help=document.getElementById('hall-help');
  const onlineDetails=document.getElementById('hall-online-details');
  if(list) list.classList.add('hidden');
  if(setup) setup.classList.add('hidden');
  if(help) help.classList.add('hidden');
  if(onlineDetails) onlineDetails.classList.add('hidden');
 },
 exitGameplayMode(){
  const list=document.getElementById('hall-game-list');
  const setup=document.getElementById('hall-setup');
  const help=document.getElementById('hall-help');
  const onlineDetails=document.getElementById('hall-online-details');
  if(list) list.classList.remove('hidden');
  if(setup) setup.classList.remove('hidden');
  if(help) help.classList.remove('hidden');
  if(onlineDetails) onlineDetails.classList.remove('hidden');
  this.state=null;
  document.getElementById('hall-board').innerHTML='';
  document.getElementById('hall-controls').innerHTML=`<button onclick="GameHall.startLocal()">Start vs Computer</button>`;
  this.announce('Returned to Game Hall setup menu. Select a game to play.');
 },
 async startLocal(){
  document.getElementById('hall-status').innerHTML='';
  const requested=this.selectedCount(),count=['ludo','snakes'].includes(this.type)?requested:2,mode=this.selectedMode();
  const colors=this.getSelectedColors();
  const players=Array.from({length:count},(_,i)=>mode==='ai'&&i>0?`AI ${i}`:`Player ${i+1}`);
  if(this.type==='ludo')this.state={tokens:Array.from({length:count},()=>[-1,-1,-1,-1]),players,colors,mode,turn:0,roll:null,winner:null};
  if(this.type==='snakes')this.state={positions:Array(count).fill(0),players,colors,mode,turn:0,winner:null};
  if(this.type==='chess'){this.chess=new Chess();this.state={fen:this.chess.fen(),players:['Player 1','AI 1'],colors,mode:'ai',turn:0,winner:null};}
  if(this.type==='carrom')this.state={scores:[0,0],queen:false,players:['Player 1','AI 1'],colors,mode:'ai',turn:0,winner:null};
  this.enterGameplayMode();
  this.announce(`Starting ${this.type==='snakes'?'Snakes & Ladders':this.type} with ${count} player${count===1?'':'s'} (${colors.slice(0,count).join(', ')}).`);
  if(this.type==='blackjack'){
   this.announce('Shuffling cards.');await MusicSystem.playSFXAndWait('card-shuffle',1800);this.startBlackjack();this.state.players=['Player 1','Dealer'];this.state.colors=colors;this.state.mode='ai';this.announce('Dealing cards.');for(let i=1;i<=4;i++){this.announce(`Dealing card ${i} of 4.`);await MusicSystem.playSFXAndWait('card-draw',650);}
  }else await MusicSystem.playSFXAndWait('board-turn',500);
  this.render();
  if(['ludo','snakes'].includes(this.type))this.announceTurn();
 },
 async roll(){
  if(!this.state||!['ludo','snakes'].includes(this.type))return;
  const who=this.playerColoredName(this.state.turn),ai=this.isAI(this.state.turn);
  this.announce(`${who} ${ai?'is':'are'} rolling the dice.`);
  await MusicSystem.playSFXAndWait('board-dice',1500);
  const die=1+Math.floor(Math.random()*6);
  this.announce(`${who} rolled ${die}.`);
  await this.pause(3500);
  if(this.type==='snakes')await this.snakesMove(die);
  else{
   this.state.roll=die;
   const legal=this.legalLudoTokens(this.state.turn,die);
   if(!legal.length){await this.pause(300);await this.passLudoTurn();return;}
   this.render();
   if(this.isAI(this.state.turn))await this.botLudo();
   else this.announce(`Choose a legal token: ${legal.map(t=>t.index+1).join(', ')}.`);
  }
 },
 async snakesMove(die){
  const p=this.state.turn,who=this.playerColoredName(p),start=this.state.positions[p];
  let landed=start+die;if(landed>100)landed=start;
  if(landed===start){
   this.announce(`${who} rolled ${die} from square ${start}, not moving.`);
   await this.pause(3500);
  }else{
   this.announce(`${who} moved from square ${start} to square ${landed}.`);
   await MusicSystem.playSFXAndWait('board-piece',350);
   await this.pause(3500);
  }
  let final=landed;
  if(LADDERS[final]){
   this.announce(`${who} reached ${final} and climbs a ladder to ${LADDERS[final]}.`);
   await MusicSystem.playSFXAndWait('board-piece',500);
   final=LADDERS[final];
   await this.pause(4000);
  }else if(SNAKES[final]){
   this.announce(`${who} reached ${final} and slides down a snake to ${SNAKES[final]}.`);
   await MusicSystem.playSFXAndWait('board-piece',500);
   final=SNAKES[final];
   await this.pause(4000);
  }
  this.state.positions[p]=final;
  this.announce(`${who} now stands on square ${final}.`);
  await this.pause(2500);
  if(final===100){this.state.winner=p;this.finish(`${who} won Snakes & Ladders.`);return;}
  this.state.turn=(p+1)%this.state.positions.length;
  this.render();
  this.announceTurn();
  await this.pause(2500);
  if(this.isAI(this.state.turn))setTimeout(()=>this.roll(),2500);
 },
 async moveLudo(token){
  const p=this.state.turn,who=this.playerColoredName(p),die=this.state.roll,pos=this.state.tokens[p][token];
  if(die==null)return;
  let next=pos;
  if(pos<0&&die===6)next=0;
  else if(pos>=0&&pos+die<=56)next=pos+die;
  else{
   this.announce(`${who} rolled ${die} from square ${pos<0?'yard':pos}, not moving.`);
   await MusicSystem.playSFXAndWait('board-error',400);
   await this.pause(3500);
   return;
  }
  this.announce(`${who} moved token ${token+1} from square ${pos<0?'yard':pos} to square ${next}.`);
  await MusicSystem.playSFXAndWait('board-piece',350);
  await this.pause(3500);
  this.state.tokens[p][token]=next;
  const safe=[0,8,13,21,26,34,39,47];
  let captured=false;
  if(!safe.includes(next)&&next<52)this.state.tokens.forEach((tokens,seat)=>{
   if(seat!==p)this.state.tokens[seat]=tokens.map(x=>{if(x===next){captured=true;return-1;}return x;});
  });
  this.announce(captured?`${who} captures an opponent token on square ${next}.`:`${who} token ${token+1} reaches square ${next}.`);
  await this.pause(3000);
  this.state.roll=null;
  if(this.state.tokens[p].every(x=>x===56)){this.finish(`${who} won Ludo.`);return;}
  const extra=die===6||captured;
  this.state.turn=extra?p:(p+1)%this.state.tokens.length;
  this.render();
  if(extra){
   this.announce(`${who} earns another turn.`);
   await this.pause(2500);
  }
  this.announceTurn();
  await this.pause(2500);
  if(this.isAI(this.state.turn))setTimeout(()=>this.roll(),2500);
 },
 async botLudo(){
  if(!this.isAI(this.state.turn))return;
  const seat=this.state.turn,legal=this.state.tokens[seat].map((p,i)=>({p,i})).filter(x=>(x.p<0&&this.state.roll===6)||(x.p>=0&&x.p+this.state.roll<=56));
  if(legal.length)await this.moveLudo(legal[0].i);
  else{
   this.announce(`${this.playerColoredName(seat)} cannot use this roll.`);
   await MusicSystem.playSFXAndWait('board-turn',400);
   await this.pause(3500);
   this.state.roll=null;
   this.state.turn=(seat+1)%this.state.tokens.length;
   this.render();
   this.announceTurn();
   await this.pause(2500);
   if(this.isAI(this.state.turn))setTimeout(()=>this.roll(),2500);
  }
 },
 startBlackjack(){const deck=[];for(const suit of ['S','H','D','C'])for(const rank of ['A','2','3','4','5','6','7','8','9','10','J','Q','K'])deck.push(rank+suit);for(let i=deck.length-1;i;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}this.state={deck,player:[deck.pop(),deck.pop()],dealer:[deck.pop(),deck.pop()],done:false};},
 handValue(hand){let value=0,aces=0;for(const c of hand){const r=c.slice(0,-1);if(r==='A'){aces++;value+=11}else value+=['K','Q','J'].includes(r)?10:Number(r);}while(value>21&&aces){value-=10;aces--;}return value;},
 async hit(){if(this.type!=='blackjack'||this.state.done)return;this.announce('You draw a card.');await MusicSystem.playSFXAndWait('card-draw',700);const card=this.state.deck.pop();this.state.player.push(card);this.announce(`You draw ${card}. Hand value ${this.handValue(this.state.player)}.`);if(this.handValue(this.state.player)>21)this.finish('You bust. Dealer wins.');else this.render();},
 async stand(){this.announce('You stand. Dealer reveals the hand.');while(this.handValue(this.state.dealer)<17){await MusicSystem.playSFXAndWait('card-draw',700);const card=this.state.deck.pop();this.state.dealer.push(card);this.announce(`Dealer draws ${card}. Dealer value ${this.handValue(this.state.dealer)}.`);}const p=this.handValue(this.state.player),d=this.handValue(this.state.dealer);this.finish(d>21||p>d?'You win Blackjack.':p===d?'Blackjack push.':'Dealer wins Blackjack.');},
 async chessMove(){const input=document.getElementById('chess-move'),v=input.value.trim().toLowerCase();try{const move=this.chess.move({from:v.slice(0,2),to:v.slice(2,4),promotion:v[4]||'q'});if(!move)throw Error();this.announce(`You move ${move.san}.`);await MusicSystem.playSFXAndWait('board-piece',700);if(this.chess.isGameOver()){this.finish(this.chess.isCheckmate()?`Checkmate. ${this.chess.turn()==='w'?'Black':'White'} wins.`:'Chess game drawn.');return;}this.announce('AI is choosing a chess move.');await this.pause(450);const moves=this.chess.moves({verbose:true}),choice=moves[Math.floor(Math.random()*moves.length)],ai=this.chess.move(choice);await MusicSystem.playSFXAndWait('board-piece',700);this.announce(`AI moves ${ai.san}.`);this.state.fen=this.chess.fen();this.render();}catch{this.announce('Illegal move. Use coordinates such as e2e4.');await MusicSystem.playSFXAndWait('board-error',700);}},
 async carromStrike(){const angle=Number(document.getElementById('carrom-angle').value),power=Number(document.getElementById('carrom-power').value),chance=Math.max(.1,Math.min(.85,.25+power*.055-Math.abs((angle%45)-22)/100));this.announce(`You strike at angle ${angle} with power ${power}.`);await MusicSystem.playSFXAndWait('board-piece',900);if(Math.random()<chance){this.state.scores[0]++;this.announce('Your striker pockets one coin.');}else this.announce('Your striker misses or rebounds.');if(!this.state.queen&&Math.random()<.08){this.state.queen=true;this.announce('You pocket the queen.');}if(this.state.scores[0]>=9&&this.state.queen){this.finish('You win Carrom.');return;}this.announce('AI is striking.');await this.pause(450);await MusicSystem.playSFXAndWait('board-piece',900);if(Math.random()<.45){this.state.scores[1]++;this.announce('AI pockets one coin.');}else this.announce('AI misses its Carrom strike.');this.render();},
 finish(message){this.state.winner=message;document.getElementById('hall-status').textContent=message;MusicSystem.playSFX('victory');this.render(false);this.syncOnline('finished');},
 render(sync=true){
  const b=document.getElementById('hall-board'),c=document.getElementById('hall-controls');if(!this.state)return;
  let controlsHtml='';
  if(this.type==='snakes'){
   b.innerHTML=`<p>${this.state.positions.map((p,i)=>`${esc(this.playerColoredName(i))}: square ${p}`).join('. ')}.</p>`;
   controlsHtml=this.state.winner?'':`<button onclick="GameHall.roll()" ${this.isAI(this.state.turn)?'disabled':''}>Roll Dice</button>`;
  }
  if(this.type==='ludo'){
   b.innerHTML=`<p>${this.state.tokens.map((tokens,i)=>`${esc(this.playerColoredName(i))} tokens: ${tokens.join(', ')}`).join('. ')}. ${this.state.roll!=null?`Rolled ${this.state.roll}.`:''}</p>`;
   controlsHtml=this.state.winner?'':this.state.roll==null?`<button onclick="GameHall.roll()" ${this.isAI(this.state.turn)?'disabled':''}>Roll Dice</button>`:this.isAI(this.state.turn)?`<p>${esc(this.playerColoredName(this.state.turn))} is choosing a token…</p>`:this.legalLudoTokens(this.state.turn,this.state.roll).map(t=>`<button onclick="GameHall.moveLudo(${t.index})">Move token ${t.index+1} from ${t.pos<0?'yard':t.pos}</button>`).join('');
  }
  if(this.type==='chess'){b.innerHTML=`<pre aria-label="Chess board">${esc(this.chess.ascii())}</pre>`;controlsHtml=this.state.winner?'':'<input id="chess-move" placeholder="e2e4" maxlength="5"><button onclick="GameHall.chessMove()">Move</button>';}
  if(this.type==='carrom'){b.innerHTML=`<p>Your coins: ${this.state.scores[0]}/9. Computer: ${this.state.scores[1]}/9. Queen: ${this.state.queen?'yours':'on board'}.</p>`;controlsHtml=this.state.winner?'':'<label>Angle 0–359 <input id="carrom-angle" type="number" min="0" max="359" value="45"></label><label>Power 1–10 <input id="carrom-power" type="number" min="1" max="10" value="5"></label><button onclick="GameHall.carromStrike()">Strike</button>';}
  if(this.type==='blackjack'){b.innerHTML=`<p>Your hand: ${this.state.player.join(', ')} — ${this.handValue(this.state.player)}. Dealer shows ${this.state.done?this.state.dealer.join(', '):this.state.dealer[0]}.</p>`;controlsHtml=this.state.winner?'':'<button onclick="GameHall.hit()">Hit</button><button onclick="GameHall.stand()">Stand</button>';}
  if(this.onlineSession && !this.state?.started){
    controlsHtml+=`<button onclick="GameHall.startOnlineChallenge()" class="action-btn" style="margin-left:10px;">⚔️ Start Challenge</button>`;
  }
  controlsHtml+=`<button onclick="GameHall.exitGameplayMode()" class="menu-btn" style="margin-left:10px;">Quit / Return to Setup</button>`;
  c.innerHTML=controlsHtml;
  if(sync)this.syncOnline();
 },
 async loadInvites(){if(!OnlineSystem.ready)return;const {data}=await OnlineSystem.client.from('game_hall_invites').select('id,session:game_hall_sessions(id,name,game_type,version,state,status),sender:profiles!game_hall_invites_sender_id_fkey(display_name)').eq('receiver_id',OnlineSystem.user.id).eq('status','pending');const list=document.getElementById('hall-game-list');if(data?.length)list.insertAdjacentHTML('beforeend',data.map(i=>`<button onclick="GameHall.acceptInvite('${i.id}','${i.session.id}')">Accept ${esc(i.session.name)} from ${esc(i.sender?.display_name||'Hero')}</button>`).join(''));},
 async acceptInvite(inviteId,sessionId){
  await OnlineSystem.client.from('game_hall_invites').update({status:'accepted'}).eq('id',inviteId).eq('receiver_id',OnlineSystem.user.id);
  const {error}=await OnlineSystem.client.rpc('join_game_hall_session',{sid:sessionId});
  if(error){Game.addNarrative(error.message,'system');return;}
  const {data}=await OnlineSystem.client.from('game_hall_sessions').select('*').eq('id',sessionId).single();
  this.onlineSession=sessionId;this.version=data.version;this.type=data.game_type;this.state=data.state;
  if(this.type==='chess')this.chess=new Chess(this.state.fen);
  this.subscribeOnline();
  document.getElementById('hall-start-online')?.classList.remove('hidden');
  if(this.state?.started){
   this.enterGameplayMode();
   this.announce(`⚔️ Connected! The match has already started. Both players can play.`);
  }else{
   this.announce(`⚔️ Joined ${data.name}. Click Start Challenge when both players are ready!`);
  }
  this.render(false);Game.addNarrative(`Joined ${data.name}.`,'treasure');
 },
 async createOnline(){
  if(!this.type){Game.addNarrative('Select a game first.','system');return;}
  if(!this.state)this.startLocal();
  const name=document.getElementById('hall-session-name').value.trim()||`${OnlineSystem.profile.display_name}'s ${this.type}`;
  const {data,error}=await OnlineSystem.client.rpc('create_game_hall_session',{kind:this.type,session_name:name,players:this.selectedCount(),initial_state:this.state});
  if(error){Game.addNarrative(error.message,'system');return;}
  this.onlineSession=data;this.version=0;
  document.getElementById('hall-start-online')?.classList.remove('hidden');
  this.subscribeOnline();Game.addNarrative(`Online ${this.type} match created. Invite a friend and click Start Challenge!`,'treasure');
 },
 async startOnlineChallenge(){
  if(!this.onlineSession||!this.state) return;
  this.state.status='playing';
  this.state.started=true;
  await this.syncOnline('playing');
  this.enterGameplayMode();
  this.announce(`⚔️ The match challenge has started! Both players can now play.`);
  this.render(false);
  this.announceTurn();
 },
 async invite(){if(!this.onlineSession){Game.addNarrative('Create an online match first.','system');return;}const target=await OnlineSystem.findProfile(document.getElementById('hall-invite-name').value);if(!target)return;const {error}=await OnlineSystem.client.from('game_hall_invites').insert({session_id:this.onlineSession,sender_id:OnlineSystem.user.id,receiver_id:target.id});Game.addNarrative(error?error.message:`Game invitation sent to ${target.display_name}.`,error?'system':'npc');},
 async syncOnline(status='playing'){if(!this.onlineSession||!this.state)return;const {data,error}=await OnlineSystem.client.rpc('update_game_hall_state',{sid:this.onlineSession,expected_version:this.version,new_state:this.state,new_status:status});if(!error)this.version=data;},
 subscribeOnline(){
  if(this.subscription)OnlineSystem.client.removeChannel(this.subscription);
  this.subscription=OnlineSystem.client.channel(`hall-${this.onlineSession}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'game_hall_sessions',filter:`id=eq.${this.onlineSession}`},p=>{
   if(p.new.version>this.version){
    const wasStarted=this.state?.started;
    this.version=p.new.version;
    this.state=p.new.state;
    if(this.type==='chess')this.chess=new Chess(this.state.fen);
    if(this.state?.started && !wasStarted){
     this.enterGameplayMode();
     this.announce(`⚔️ The match challenge has begun! Both players can now play.`);
    }
    this.render(false);
   }
  }).subscribe();
 }
};
GameHall.initWorld();GameHall.inject();window.GameHall=GameHall;
const oldHallCommand=Game.processCommand.bind(Game);Game.processCommand=function(cmd){const c=cmd.toLowerCase().trim();if(c==='game hall'||c==='board games'){GameHall.enterOrOpen();return;}oldHallCommand(cmd);};
