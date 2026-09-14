'use strict';
const held=new Set();
const PERCH_GESTURES=[{name:'left-listen',frames:101},{name:'right-check',frames:101},{name:'alternating-scan',frames:101},{name:'double-left-flick',frames:101},{name:'right-tremble',frames:101},{name:'wide-investigation',frames:201},{name:'forward-focus',frames:101},{name:'left-follow',frames:201},{name:'startle-recover',frames:101},{name:'idle-wander',frames:251},{name:'rapid-left-pulse',frames:101},{name:'alternating-buzz',frames:101},{name:'irregular-flutter',frames:101},{name:'lazy-swish',frames:226},{name:'tip-twitch',frames:151},{name:'curious-hook',frames:161},{name:'lash-and-settle',frames:151},{name:'alert-quiver',frames:141}];
let playState=null,editorView=null,lastTick=0,playFrame=0;
function makeStart(full){
 if(publicPlay&&full)return Campaign.startFor();
 if(state.mode==='flight'){
  let y=state.start.y;
  if(!full){const chosen=item();const candidates=state.objects.filter(o=>!o.hidden&&['bramble','bee','pod'].includes(o.type)).filter(o=>{const b=worldBounds(o);return b.y+b.h>=offset&&b.y<=offset+H;}).sort((a,b)=>worldBounds(a).y-worldBounds(b).y);
   const encounter=chosen&&['bramble','bee','pod'].includes(chosen.type)?chosen:candidates[0];
   const approach=encounter?encounter.type==='pod'&&encounter.falls?encounter.y-encounter.approach-90:worldBounds(encounter).y-105:offset+337;
   y=Math.max(state.start.y,approach);
  }
  return {x:full?state.start.x:165,y,offset:clamp(y-337,0,state.height-H),leaf:null};
 }
 const leaves=state.leaves.filter(l=>!l.hidden&&!state.vines.find(v=>v.id===l.vine)?.hidden);
 const leaf=full?leaves.find(l=>l.id===state.start.leafId):leaves.filter(l=>{const x=leafLandingX(l),top=leafSurface(l,x);return x>=40&&x<=W-40&&top>=offset&&top<=offset+H;}).sort((a,b)=>leafSurface(a,leafLandingX(a))-leafSurface(b,leafLandingX(b)))[0];
 if(!leaf){tell(full?'Choose a visible leaf as the level start.':'Bring a platform leaf into view before playing.');return null;}
 return {x:leafLandingX(leaf),y:leafSurface(leaf,leafLandingX(leaf)),offset:full?clamp(leaf.y-220,0,state.height-H):offset,leaf};
}
function restartPlay(){
 if(typeof hideControls==='function')hideControls();
 if(!editorView)return;held.clear();if(typeof releaseTouch==='function')releaseTouch();const s=editorView.start;
 if(publicPlay&&!Campaign.ready()){Campaign.pendingRestart=true;Campaign.prepareArt();return;}
 playState={x:s.x,y:s.y,maxY:s.y,vx:0,vy:0,tilt:0,ground:s.leaf,pose:'',perchTime:0,gesture:null,gestureCount:0,flightGesture:null,steerSide:0,time:0,paused:false,complete:false,collected:new Set(),pickups:[],displayedLyrics:0,counterPulse:0,falls:new Map(),contacts:new Set(),contactAt:-10,contactId:null};
 playState.brownLeaves=new Map();
 offset=s.offset;sceneClock=editorView.clock;inspectionClock=null;lastTick=0;botanyDirty=botanyDirty||!publicPlay||!editorView.full;
 for(const o of state.objects)if(o.type==='pod'&&o.falls&&s.y>=o.y-o.approach)playState.falls.set(o.id,sceneClock-(s.y-(o.y-o.approach))/state.speed);
 $('lyric-score').classList.remove('received');$('completion').hidden=true;$('pause-play').textContent='Pause · P';$('lyric-score').textContent='0 / '+state.objects.filter(o=>o.type==='lyric'&&!o.hidden).length+' lyrics';$('play-status').textContent='';Campaign.onStart();if(typeof updatePlayInterface==='function')updatePlayInterface();render();
}
function startPlay(full=false){
 for(const o of state.objects)if(o.type==='lyric')Art.image(EDITOR_LIBRARY.sprites[o.asset].src);
 if(colliderEdit)endColliderEdit();
 if(!imgs.left.complete||!imgs.right.complete){tell('The platform artwork is still loading. Try Preview once it appears.');return;}
 const start=makeStart(full);if(!start)return;editorView={offset,selection:[...selected],start,clock:full?(publicPlay?Campaign.menuTime:0):sceneClock,full};
 for(const name of (state.mode==='flight'?['rider-breeze','rider-listen','rider-regrip','rider-bristle','rider-gust','rider-left','rider-right']:['perch-left-listen-left','perch-left-listen-right','climb-ascend-straight','climb-glide-straight','climb-fall-straight']))Art.image(EDITOR_LIBRARY.sprites[name].src);
 preview=true;drag=null;inspectionClock=null;document.body.classList.add('preview');document.body.classList.remove('sheet-open','focus-mode');if(typeof focusMode!=='undefined')focusMode=false;$('restore-tools').hidden=true;$('placement-hint').hidden=true;for(const el of [$('tray'),$('inspector'),$('undo'),$('redo'),$('extend'),$('overview'),$('levels-toggle'),$('files-toggle'),$('motion-toggle')])el.inert=true;
 $('preview').textContent='Play';$('full-play').hidden=true;$('play-controls').hidden=false;$('game-hud').hidden=false;$('encounter-controls').hidden=true;
 $('keyboard-help').textContent=state.mode==='flight'?'← → / A D · STEER':'SPACE · JUMP / HOLD TO GLIDE   ← → / A D · STEER';
 syncColliderTools();restartPlay();canvas.focus({preventScroll:true});playFrame=requestAnimationFrame(tickPlay);
}
function stopPlay(){
 if(typeof hideControls==='function')hideControls();
 if(!preview)return;$('lyric-score').classList.remove('received');const reached=offset,contactId=playState?.contactId;preview=false;cancelAnimationFrame(playFrame);held.clear();playState=null;document.body.classList.remove('preview');$('editor-main').inert=false;$('play-controls').inert=false;if(typeof releaseTouch==='function')releaseTouch();$('pause-panel').hidden=true;$('mobile-pause').hidden=true;$('keyboard-help').hidden=true;
 for(const el of [$('tray'),$('inspector'),$('undo'),$('redo'),$('extend'),$('overview'),$('levels-toggle'),$('files-toggle'),$('motion-toggle')])el.inert=false;
 $('preview').textContent='Play';$('full-play').hidden=false;$('play-controls').hidden=true;$('game-hud').hidden=true;$('completion').hidden=true;offset=reached;selected=new Set(contactId?[contactId]:editorView.selection);selection=[...selected].at(-1)||null;if(typeof openPanel==='function')openPanel(selected.size?'selection':null);sync();syncScene();request();
}

function pausePlay(){
 if(!$('controls-panel').hidden){dismissControls();return;}
 if(!playState||playState.complete||playState.failed||playState.intro)return;
 playState.paused=!playState.paused;held.clear();if(typeof releaseTouch==='function')releaseTouch();lastTick=0;
 $('pause-play').textContent=playState.paused?'Resume':'Pause';
 if(typeof updatePlayInterface==='function')updatePlayInterface();
 if(playState.paused)$('resume-play').focus({preventScroll:true});else canvas.focus({preventScroll:true});
}
function drawPlayer(){
 const p=playState;if(!p)return; if(p.failed&&p.defeat){Campaign.drawDefeat(ctx);return;}
 if(p.leafFall&&(p.ground||held.has('Space')))p.leafFall=null;
 if(p.leafFall){
  const fall=p.leafFall,age=Math.max(0,p.time-fall.started),part={...fall.part};
  part.x=Math.round(part.x+p.x-fall.x);part.y=Math.round(part.y+fall.y-p.y+offset-fall.offset);
  part.pivot=[fall.x-fall.part.x,sy(fall.y)-offset+fall.offset-fall.part.y-9];
  part.angle=fall.direction*smooth(age/1.1)*1.15;
  p.actorPart=part;p.actorAnchor={x:p.x,y:p.y,offset};paintPart(ctx,part);return;
 }
 if(state.mode==='flight'&&p.seedStage!=='flower'&&!(p.complete&&p.finishAge>1.4)){
  const direction=p.tilt<-.25?-1:p.tilt>.25?1:0;const now=sceneClock,wind=weatherAt(p.maxY).wind;
  if(!p.flightGesture||now>=p.flightGesture.end){
   let name=p.nextFlightGesture;
   if(!name){if(direction&&direction!==p.steerSide)name=direction<0?'rider-left':'rider-right';else{const choices=wind>.55?['rider-gust','rider-bristle','rider-regrip']:['rider-breeze','rider-listen','rider-regrip','rider-bristle'];const possible=choices.filter(n=>n!==p.flightGesture?.name);name=possible[Math.floor(noise(p.gestureCount+36)*possible.length)];}}
   const art=Art.image(EDITOR_LIBRARY.sprites[name].src);p.nextFlightGesture=name;
   if(art.ready){const entry=0;const count=EDITOR_LIBRARY.sprites[name].count;
    p.flightGesture={name,start:now,end:now+(3.8+noise(++p.gestureCount)*1.9)*(1-entry/count),entry};p.nextFlightGesture=null;p.steerSide=direction;}
  }
  const e=p.flightGesture;if(e){const count=EDITOR_LIBRARY.sprites[e.name].count,frame=e.entry+clamp((now-e.start)/(e.end-e.start))*(count-1-e.entry);e.frame=frame;
   const entry=p.seedStage==='boarding'?1:p.entryAngle===undefined?0:1-smooth((p.time-p.rideStarted)/.6),entryAngle=p.seedStage==='boarding'?Campaign.seedAt().angle:p.entryAngle||0;
   const angle=(-entryAngle*entry+p.tilt*.055*(1-entry))*(p.complete?1-smooth(p.finishAge/1.2):1);
   p.actorPart={asset:e.name,frame,x:Math.round(p.x-65),y:Math.round(sy(p.y)-65),w:128,h:176,angle:Math.round(angle*90)/90,pivot:[65,65]};
   const boarding=p.seedStage==='boarding'?smooth(p.boarding.age/.3):1;
   if(boarding<1){const seed=Campaign.seedAt(),x=p.boarding.x+(seed.x-5-p.boarding.x)*boarding,y=p.boarding.y+(seed.y-48-p.boarding.y)*boarding;Art.sprite(ctx,'climb-fold-straight',Math.floor(boarding*9),x-20,sy(y)-26,40,40,1-boarding);}
   const dismount=p.complete?smooth((p.finishAge-1.2)/.2):0;
   paintPart(ctx,p.actorPart,boarding*(1-dismount));
   if(dismount){
    const end=Campaign.ending(),feet=[[20,40],[22,46],[30,49],[44,51],[58,49],[61,45]];
    const y=Math.max(...feet.map(([fx,fy])=>sy(leafSurface(end,end.x-20+fx*.5))-fy*.5+1));
    Art.sprite(ctx,'perch-left-listen-left',0,end.x-20,Math.round(y),40,32,dismount);
   }}

 }else{
  let name,frame,x=p.x-20,y,w=40,h;
  if(p.ground){
   const facing=p.ground.side;
   if(!p.gesture){const choices=PERCH_GESTURES.filter(g=>g.name!==p.lastGesture);p.gesture=choices[Math.floor(noise(++p.gestureCount+17)*choices.length)];p.perchTime=0;}
   name='perch-'+p.gesture.name+'-'+facing;frame=Math.min(p.gesture.frames-1,Math.floor(p.perchTime*50));
   const feet=[[20,40],[22,46],[30,49],[44,51],[58,49],[61,45]];y=-Infinity;
   for(const [fx,fy] of feet){const surface=leafSurface(p.ground,p.x-20+(facing==='right'?79-fx:fx)*.5);if(surface!==null)y=Math.max(y,sy(surface)-fy*.5+1);}
   if(!Number.isFinite(y))y=sy(p.y)-25;h=EDITOR_LIBRARY.sprites[name].h*.5;
  }else{
   const wanted=p.vy>0?'ascend':held.has('Space')?'glide':'fall',facing=p.tilt<-.2?'left':p.tilt>.2?'right':'straight';
   if(!p.animation)p.animation={kind:wanted,next:wanted,start:p.time};
   if(p.animation.next!==wanted){const previous=p.animation.next,kind=wanted==='glide'&&previous!=='glide'?'open':wanted==='fall'&&previous==='glide'?'fold':wanted;p.animation={kind,next:wanted,start:p.time};}
   if(['open','fold'].includes(p.animation.kind)&&p.time-p.animation.start>=.2)p.animation={kind:p.animation.next,next:p.animation.next,start:p.time};
   name='climb-'+p.animation.kind+'-'+facing;const spec=EDITOR_LIBRARY.sprites[name];frame=(p.time-p.animation.start)*50;if(['ascend','open','fold'].includes(p.animation.kind))frame=Math.min(spec.count-1,frame);h=40*spec.h/spec.w;y=sy(p.y)-26;
  }
  p.actorPart={asset:name,frame,x:Math.round(x),y:Math.round(y),w,h};
  if(publicPlay&&p.ground?.opening){
   if(!Art.image(EDITOR_LIBRARY.sprites[name].src).ready){name='perch-left-listen-'+p.ground.side;frame=0;}
   p.actorPart=Campaign.openingPerchPart(state,name,frame,p.x,offset);paintPart(ctx,p.actorPart);
  }else if(!Art.sprite(ctx,name,frame,Math.round(x),Math.round(y),w,h)&&p.ground)Art.sprite(ctx,'perch-left-listen-'+p.ground.side,0,Math.round(x),Math.round(y),w,h);
 }
 p.actorAnchor={x:p.x,y:p.y,offset};
 if(!publicPlay&&p.contactId&&p.time-p.contactAt<.4){const o=item(p.contactId);if(o){const b=worldBounds(o);ctx.strokeStyle='#ff697d';ctx.lineWidth=1.5;ctx.strokeRect(b.x,sy(b.y+b.h),b.w,b.h);}}
}
function lyricCollectionPoint(p){return {x:p.x+(state.mode==='flight'?-4:0),y:p.y+(state.mode==='flight'?-40:12)};}
function beginLyricPickup(o){
 const p=playState,pose=LyricPaper.pose(o,sceneClock);
 if(publicPlay&&typeof PuzzleLevel!=='undefined')PuzzleLevel.collect(o.asset);
 p.pickups.push({asset:o.asset,pose,flipped:!!o.flipped,x:o.x+pose.x,y:sy(o.y)+pose.y,age:0,arrived:false});
}
function lyricCounterTarget(asset){
 if(publicPlay)return Campaign.slotTarget(asset);
 const view=canvas.getBoundingClientRect(),counter=$('lyric-score').getBoundingClientRect();
 return {x:(counter.left+counter.width/2-view.left)*W/view.width,y:(counter.top+counter.height/2-view.top)*H/view.height};
}
function advanceLyricPickups(dt){
 const p=playState;if(!p||p.paused&&!p.complete)return;
 p.counterPulse=Math.max(0,p.counterPulse-dt);
 for(const piece of p.pickups){
  piece.age+=dt;
  if(piece.age>=.66&&!piece.arrived){
   piece.arrived=true;p.displayedLyrics++;p.counterPulse=.26;
   const counter=$('lyric-score');
   counter.textContent=p.displayedLyrics+' / '+state.objects.filter(o=>o.type==='lyric'&&!o.hidden).length+' lyrics';
   counter.classList.remove('received');void counter.offsetWidth;counter.classList.add('received');
  }
 }
 p.pickups=p.pickups.filter(piece=>piece.age<.88);
 if(!p.counterPulse)$('lyric-score').classList.remove('received');
 if(!publicPlay&&p.complete&&!p.pickups.length&&$('completion').hidden){
  $('completion-score').textContent=p.collected.size+' / '+state.objects.filter(o=>o.type==='lyric'&&!o.hidden).length+' lyrics recovered';
  $('completion').hidden=false;$('play-status').textContent='Level complete';
  if(typeof updatePlayInterface==='function')updatePlayInterface();
 }
}
function drawLyricGlint(g,x,y,size){
 x=Math.round(x);y=Math.round(y);size=Math.round(size);if(size<1)return;
 g.fillStyle='#e6ad42';g.fillRect(x-size,y,2*size+1,1);g.fillRect(x,y-size,1,2*size+1);
 g.fillStyle='#fff9da';g.fillRect(x,y,1,1);if(size>1){g.fillRect(x-1,y,3,1);g.fillRect(x,y-1,1,3);}
}
function drawLyricPickups(g){
 const p=playState;if(!p?.pickups.length)return;
 for(const piece of p.pickups){
  const target=lyricCounterTarget(piece.asset);
  const t=piece.age,lift=smooth(t/.2),flight=smooth((t-.25)/.41);
  const x=piece.x+(target.x-piece.x)*flight+Math.sin(flight*Math.PI)*24;
  const y=piece.y-9*lift+(target.y-piece.y+9)*flight;
  if(t<.48){
   for(let i=0;i<5;i++){
    const age=t-.1-i*.017,life=clamp(age/.31);if(age<0||life>=1)continue;
    const angle=i*2.4+.7,radius=7+life*16;
    drawLyricGlint(g,piece.x+Math.cos(angle)*radius,piece.y-7+Math.sin(angle)*radius*.7,Math.sin(life*Math.PI)*(i%2?1.6:2.3));
   }
  }
  if(!piece.arrived){
   const pose={roll:piece.pose.roll*(1-lift)+Math.sin(flight*Math.PI)*.18,yaw:piece.pose.yaw*(1-lift),pitch:piece.pose.pitch*(1-lift),curl:piece.pose.curl*(1-lift)};
   const shine=t>=.08&&t<=.34?(t-.08)/.26:-1;
   LyricPaper.draw(g,piece.asset,pose,x,y,(1+.4*lift)*(1-.62*flight),shine,piece.flipped);
  }else{
   const life=clamp((t-.66)/.22);
   for(let i=0;i<3;i++)drawLyricGlint(g,target.x+(i-1)*(6+life*8),target.y+8+Math.sin(i*2)*5,Math.sin(life*Math.PI)*1.7);
  }
 }
}
function collectLyrics(){
 const p=playState,center=lyricCollectionPoint(p);
 for(const o of state.objects){
  if(o.type!=='lyric'||o.hidden||p.collected.has(o.id)||publicPlay&&Campaign.objectPresence(o)<.95)continue;
  if(!entityColliders(o,sceneClock,p.falls)[0].contains(center.x,sy(center.y)))continue;
  p.collected.add(o.id);beginLyricPickup(o);

 }
}
function inspectContacts(){
 const p=playState;if(!p||p.complete||p.failed||p.intro||!p.actorPart)return;
 const actor=playerCollision(p.actorPart);if(!actor)return;
 for(const o of state.objects){
  if(o.hidden||!['bramble','bee','pod'].includes(o.type))continue;
  for(const shape of entityColliders(o,sceneClock,p.falls)){
   const contact=colliderContact(actor,shape);if(!contact)continue;
   p.contacts.add(o.id);p.contactId=o.id;p.contactAt=p.time;
   if(publicPlay){Campaign.fail({...contact,kind:contact.part==='canopy'?'canopy':o.type});return;}
   $('play-status').textContent='Contact · '+o.type+' · P to inspect';return;
  }
 }
 if(p.time-p.contactAt>1.2)$('play-status').textContent=p.contacts.size?p.contacts.size+' contacts marked':'';
}
function advanceBrownLeaves(dt){
 const p=playState;
 if(p.ground?.fragile&&!p.brownLeaves.has(p.ground.id))p.brownLeaves.set(p.ground.id,{load:0});
 for(const [id,motion] of p.brownLeaves){
  if(motion.released!==undefined)continue;
  if(p.ground?.id===id){
   motion.load=Math.min(2.6,motion.load+dt);
   if(motion.load>=2.6){
    motion.released=p.time;
    if(p.actorPart)p.leafFall={part:{...p.actorPart},x:p.x,y:p.y,offset,started:p.time,direction:p.ground.side==='left'?-1:1};
    p.ground=null;p.gesture=null;p.animation=null;p.vy=-16;p.landingFoot=0;
   }
  }else motion.load=Math.max(0,motion.load-dt*1.7);
 }
}
function advancePlay(dt){
 const p=playState;if(!p)return;Campaign.advanceBlooms(dt);if(Campaign.advance(dt))return;if(p.paused||p.complete)return;p.time+=dt;sceneClock+=dt;
 const keyboard=Number(held.has('ArrowRight')||held.has('KeyD'))-Number(held.has('ArrowLeft')||held.has('KeyA')),target=keyboard||(typeof touchDirection==='function'?touchDirection():0);p.tilt+=(target-p.tilt)*(1-Math.exp(-dt*7));
 if(state.mode==='flight'){
  p.vx+=(p.tilt*118-p.vx)*(1-Math.exp(-dt*4));p.x=clamp(p.x+p.vx*dt,30,W-30);
  const ceiling=Campaign.ending().y+100;
  const ramp=editorView.full?smooth((p.time-(p.rideStarted||0))/2):1;p.y=Math.min(ceiling,p.y+state.speed*ramp*dt);
  offset=Math.max(offset,clamp(p.y-337,0,state.height-H));
 }else{
  advanceBrownLeaves(dt);
  const screenBottom=publicPlay?Campaign.visibleBottom():offset-32;
  if(p.ground){p.y=leafSurface(p.ground,p.x+(p.landingFoot||0))??p.y;p.perchTime+=dt;if(p.gesture&&p.perchTime>=p.gesture.frames/50){p.lastGesture=p.gesture.name;p.gesture=null;}}
  else{const oldX=p.x,oldY=p.y;p.vx+=(p.tilt*155-p.vx)*(1-Math.exp(-dt*6));p.x=clamp(p.x+p.vx*dt,7,W-7);p.vy-=500*dt;if(held.has('Space')&&p.vy<0)p.vy=Math.max(p.vy,-65);p.y+=p.vy*dt;
   if(p.vy<=0){
    let landing=null;
    for(const leaf of (publicPlay?Campaign.platforms():[...state.leaves,...Campaign.flowerPlatforms(),Campaign.ending()])){
     if(leaf.hidden||state.vines.find(v=>v.id===leaf.vine)?.hidden)continue;
     const centre=leafSurface(leaf,p.x);
     // A blade at the screen edge can sit beneath a real toe even when the
     // body's centre cannot move any farther. Keep contact on its painted edge.
     for(const foot of centre===null&&leaf.plant?[-9,9]:[0]){
      const top=foot?leafSurface(leaf,p.x+foot):centre,oldTop=leafSurface(leaf,oldX+foot);
      if(top!==null&&(!publicPlay||top>=screenBottom)&&oldY>=(oldTop??top)&&p.y<=top&&(!landing||top>landing.top))landing={leaf,top,foot};
     }
    }
    if(landing){p.y=landing.top;p.vy=0;p.vx=0;p.ground=landing.leaf;p.landingFoot=landing.foot;p.animation=null;}
   }
  }
  if(p.y-offset>430){const camera=clamp(p.y-260,offset,state.height-H);offset+= (camera-offset)*(1-Math.exp(-dt*5));}
  if(p.y<screenBottom){if(publicPlay)Campaign.fail();else restartPlay();return;}
 }
 p.maxY=Math.max(p.maxY,p.y);for(const o of state.objects)if(o.type==='pod'&&o.asset==='pod-tawny'&&o.falls&&!o.hidden&&!p.falls.has(o.id)&&p.y>=o.y-o.approach)p.falls.set(o.id,sceneClock);
 Campaign.advanceRain(dt);
 if(!p.failed)collectLyrics();
 Campaign.detectEnding();
}
function tickPlay(time){
 if(!preview)return;
 if(document.hidden||playState?.paused||document.body.classList.contains('puzzle-open')){
  lastTick=0;playFrame=requestAnimationFrame(tickPlay);return;
 }
 const dt=lastTick?Math.min((time-lastTick)/1000,.05):0;lastTick=time;
 for(let left=dt;left>0;){const step=Math.min(left,1/120);advancePlay(step);advanceLyricPickups(step);left-=step;}
 render();if(playState&&!playState.paused)inspectContacts();playFrame=requestAnimationFrame(tickPlay);
}
$('preview').onclick=()=>preview?stopPlay():startPlay(false);$('full-play').onclick=()=>startPlay(true);$('pause-play').onclick=pausePlay;$('restart').onclick=restartPlay;$('edit-here').onclick=stopPlay;$('completion-restart').onclick=restartPlay;$('completion-edit').onclick=stopPlay;
window.addEventListener('keydown',e=>{
 if(document.body.classList.contains('puzzle-open'))return;
 if(e.metaKey||e.ctrlKey||e.altKey)return;
 if(!$('controls-panel').hidden){
  if(['Escape','KeyP','Enter','Space'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)dismissControls();}
  else if(['ArrowLeft','ArrowRight','KeyA','KeyD','KeyR'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();}
  return;
 }
 if(!preview||e.metaKey||e.ctrlKey||e.altKey)return;if(playState?.paused&&hasInputFocus(e)&&!['Escape','KeyP','KeyR'].includes(e.code))return;if(!['Space','ArrowLeft','ArrowRight','KeyA','KeyD','KeyR','KeyP','Escape'].includes(e.code))return;e.preventDefault();e.stopImmediatePropagation();
 if(e.code==='Escape'){if(typeof page!=='undefined'&&page==='test')pausePlay();else stopPlay();return;}if(e.code==='KeyR'){if(!e.repeat)restartPlay();return;}if(e.code==='KeyP'){if(!e.repeat)pausePlay();return;}if(playState.paused||playState.failed||playState.complete||playState.intro)return;
 if(e.code==='Space'&&(state.mode==='climb'||playState.seedStage==='flower')&&!held.has('Space')&&playState.ground){playState.ground=null;playState.vy=470;}held.add(e.code);
},true);
window.addEventListener('keyup',e=>{if(preview&&held.has(e.code)){e.preventDefault();held.delete(e.code);}},true);
window.addEventListener('blur',()=>{held.clear();lastTick=0;if(preview&&playState&&!playState.paused)pausePlay();});document.addEventListener('visibilitychange',()=>{held.clear();lastTick=0;if(document.hidden&&preview&&playState&&!playState.paused)pausePlay();});
