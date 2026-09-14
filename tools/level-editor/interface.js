'use strict';
// The same editor and game are served at /levels, /tools/level-editor and /test.
let page='edit',panel=null,placement=null,focusMode=false,multiSelectMode=false;
let lastSelection='',selectionUIFrame=0,levelPointer=null,reorderFrame=0;
let inputMode='none',tiltSteering=0,tiltZero=null,tiltEnabled=false,tiltSample=null,tiltLastSignal=0;
let controlsFirstPlay=false,controlsDismissTimer=0;
const touchPoints=new Map(),editPointers=new Set();
const isPhone=()=>window.matchMedia('(max-width:760px)').matches;
const uiButton=(id,fn)=>{$(id).onclick=fn;};
function openPanel(next){
 panel=next;focusMode=false;document.body.classList.remove('focus-mode');$('restore-tools').hidden=true;
 layoutPanels();
 requestAnimationFrame(()=>{if(next==='selection')revealSelection();});
}
function layoutPanels(){
 const phone=isPhone();
 $('tray').hidden=phone&&panel!=='assets';$('inspector').hidden=phone&&panel!=='selection'&&panel!=='settings';
 document.body.classList.toggle('sheet-open',phone&&!!panel);
}
function revealSelection(){
 if(!isPhone()||drag||preview||!item())return;
 const r=canvas.getBoundingClientRect(),top=$('editor-header').getBoundingClientRect().bottom+20,bottom=$('inspector').getBoundingClientRect().top-20;
 if(bottom<=top||!r.height)return;
 const o=item(),b=colliderEdit?editingColliderShape()?.box:null;
 const y=b?b.y+b.h/2:sy(o.y??worldBounds(o).y+worldBounds(o).h/2);
 const screen=r.top+y*r.height/H;
 if(screen<top||screen>bottom){offset=clamp(offset+((top+bottom)/2-screen)*H/r.height,0,state.height-H);request();}
}
function syncInterface(){
 $('placement-actions').hidden=!placement;$('select-several').setAttribute('aria-pressed',String(multiSelectMode));
 const o=item(),has=selected.size===1&&hasCollider(o),key=[...selected].join(',')+(colliderEdit?.id==='player'?':player':'');
 $('selection-tabs').hidden=!has&&!colliderEdit;
 $('motion-tab').textContent=['bee','pod'].includes(o?.type)?'Motion':'Object';
 $('motion-tab').classList.toggle('active',!colliderEdit);$('collider-tab').classList.toggle('active',!!colliderEdit);
 if(colliderEdit){$('selection-title').textContent=colliderEdit.id==='player'?'Player':o?.type==='pod'?(o.asset==='pod-tawny'?'Brown pod':'Green pod'):o?.type==='bee'?'Bee':o?.type==='leaf'?'Leaf':o?.type==='bramble'?'Bramble':'Lyric';}
 if(o?.type==='bee'&&!colliderEdit)$('selection-title').textContent='Bee';
 if(key!==lastSelection){
  cancelAnimationFrame(selectionUIFrame);
  selectionUIFrame=requestAnimationFrame(()=>{
   if(drag)return;
   lastSelection=key;
   if(key){if(['bee','pod'].includes(item()?.type)&&inspectionClock===null)inspectionClock=sceneClock;if(!placement&&page==='edit'&&!focusMode)openPanel('selection');}
   else if(panel==='selection')openPanel(null);
  });
 }
 if(preview){$('play-title').textContent=state.name;updatePlayInterface();}
}
function choosePlacement(key){
 if(preview)return;if(colliderEdit)endColliderEdit();
 select([]);placement=key;openPanel('assets');
 for(const b of document.querySelectorAll('.asset[data-key]'))b.classList.toggle('active',b.dataset.key===key);
 $('placement-hint').hidden=false;$('placement-hint').textContent=isPhone()?'Tap to place':'Click to place';
 $('placement-actions').hidden=false;
}
function donePlacing(){placement=null;$('placement-actions').hidden=true;$('placement-hint').hidden=true;for(const b of document.querySelectorAll('.asset.active'))b.classList.remove('active');openPanel(selected.size?'selection':null);}
function focusScene(){focusMode=true;document.body.classList.add('focus-mode');$('restore-tools').hidden=false;request();}
function setRoute(next,url,replace=false){page=next;if(url)window.history[replace?'replaceState':'pushState']({page:next},'',url);document.title=next==='levels'?'Ladybug Luck · Levels':next.startsWith('test')?'Ladybug Luck · Playtest':state.name+' · Editor';}
function openLevelEditor(id,route=true){
 if(preview)stopPlay();
 Campaign.screen=null;document.body.classList.remove('campaign');
 for(const key of ['campaign-menu','campaign-selector','campaign-retry'])$(key).hidden=true;
 if(publicPlay){publicPlay=false;project=null;restore();offset=clamp(state.view||0,0,state.height-H);botanyDirty=true;syncScene();}
 if(id&&id!==state.id)switchLevel(id);if(!project.levels.length){showLevels(route);return;}
 setRoute('edit',route?'/tools/level-editor/?level='+encodeURIComponent(state.id):null);
 document.body.classList.remove('levels-page','test-library','focus-mode');focusMode=false;
 $('level-drawer').hidden=true;$('test-start').hidden=true;$('restore-tools').hidden=true;
 placement=null;$('placement-hint').hidden=true;select([]);openPanel(null);buildPalette();sync();request();
}
function showLevels(route=true,testOnly=false){
 if(testOnly&&publicPlay){Campaign.showLevels(route);return;}
 if(!testOnly){
  if(preview)stopPlay();
  if(publicPlay){publicPlay=false;project=null;restore();offset=clamp(state.view||0,0,state.height-H);botanyDirty=true;syncScene();}
  Campaign.screen=null;document.body.classList.remove('campaign');
  for(const key of ['campaign-menu','campaign-selector','campaign-retry'])$(key).hidden=true;
 }
 if(preview)stopPlay();setRoute(testOnly?'test-levels':'levels',route?(testOnly?'/test/?choose=1':'/levels/'):null);
 document.body.classList.add('levels-page');document.body.classList.toggle('test-library',testOnly);document.body.classList.remove('focus-mode','sheet-open');
 focusMode=false;placement=null;$('placement-hint').hidden=true;$('restore-tools').hidden=true;$('test-start').hidden=true;$('pause-panel').hidden=true;
 $('level-drawer').hidden=false;buildCards();
 if(testOnly){for(const card of $('level-cards').children){const l=project.levels.find(l=>l.id===card.dataset.id);if(!l)continue;card.draggable=false;const title=node('h2',{text:l.name});card.querySelector('label')?.replaceWith(title);const actions=card.querySelector('.card-actions');actions.replaceChildren();button('Play',()=>showTestStart(l.id),actions,{class:'primary edit-level'});}}
}
function playLevelCard(id){switchLevel(id);if(page==='test-levels'){showTestStart(id);return;}openLevelEditor(id);startPlay(true);}
function testInstructions(){return state.mode==='flight'?'Press the screen to jump from the flower onto the seed. Move your phone left or right to steer.':'Press the screen to jump. Keep holding to glide. Move your phone left or right to steer.';}
function preparePlayerArt(level=state){
 const names=['perch-left-listen-left','perch-left-listen-right',...(level.mode==='flight'?['climb-fold-straight','rider-breeze','rider-listen','rider-regrip','rider-bristle','rider-gust','rider-left','rider-right']:Object.keys(EDITOR_LIBRARY.sprites).filter(name=>name.startsWith('climb-')))];
 for(const name of names)Art.image(EDITOR_LIBRARY.sprites[name].src);
 return names;
}
function showTestStart(id,route=true){
 if(publicPlay){Campaign.showWelcome(id,route);return;}
 if(preview)stopPlay();if(id)switchLevel(id);if(!project.levels.length){showLevels(route,true);return;}
 const index=project.levels.findIndex(l=>l.id===state.id);
 setRoute('test',route?'/test/?level='+(index+1):null);document.body.classList.remove('levels-page','test-library','focus-mode','sheet-open');
 $('level-drawer').hidden=true;openPanel(null);$('test-start').hidden=false;$('test-level-name').textContent=state.name;
 $('test-help').textContent=testInstructions()+' On a keyboard, use '+(state.mode==='flight'?'A/D or the arrow keys.':'Space to jump and A/D or arrows to steer.');
 offset=0;selected.clear();selection=null;collidersVisible=false;preparePlayerArt();updateTestReady();request();
}
function updateTestReady(){
 if(publicPlay){Campaign.updateReady();return;}
 if($('test-start').hidden)return;const names=preparePlayerArt();
 const ready=imgs.left.complete&&imgs.right.complete&&names.every(n=>Art.image(EDITOR_LIBRARY.sprites[n].src).ready);
 $('test-begin').disabled=!ready;$('test-begin').textContent=ready?'Play':'Loading artwork…';
}
function clearDropMarkers(){for(const c of document.querySelectorAll('.level-card'))c.classList.remove('drop-before','drop-after');}
function levelDropAt(x,y,source){
 clearDropMarkers();let best=null,distance=Infinity;
 for(const c of document.querySelectorAll('.level-card')){if(c.dataset.id===source)continue;const r=c.getBoundingClientRect();const d=Math.abs(x-(r.left+r.width/2));if(d<distance){distance=d;best={card:c,after:x>r.left+r.width/2};}}
 if(best)best.card.classList.add(best.after?'drop-after':'drop-before');return best;
}
function endLevelDrag(cancel=false){
 if(!levelPointer)return;const p=levelPointer;clearTimeout(p.timer);cancelAnimationFrame(reorderFrame);levelPointer=null;
 if(p.active&&!cancel&&p.target)reorderLevel(p.id,p.target.card.dataset.id,p.target.after);
 for(const c of document.querySelectorAll('.level-card')){c.classList.remove('dragging');c.style.transform='';}clearDropMarkers();document.body.classList.remove('reordering');
 $('reorder-status').textContent=p.active?(cancel?'Reorder cancelled.':'Level order saved.') : '';
}
function bindLevelDrag(card,level){
 card.ondragstart=e=>{if(e.target.closest('input,button')||page==='test-levels'){e.preventDefault();return;}levelDrag=level.id;e.dataTransfer.setData('application/ladybug-level',level.id);e.dataTransfer.effectAllowed='move';card.classList.add('dragging');document.body.classList.add('reordering');};
 card.ondragover=e=>{if(!levelDrag)return;e.preventDefault();levelDropAt(e.clientX,e.clientY,levelDrag);};
 card.ondrop=e=>{if(!levelDrag)return;e.preventDefault();const target=levelDropAt(e.clientX,e.clientY,levelDrag);if(target)reorderLevel(levelDrag,target.card.dataset.id,target.after);levelDrag=null;clearDropMarkers();document.body.classList.remove('reordering');};
 card.ondragend=()=>{levelDrag=null;card.classList.remove('dragging');clearDropMarkers();document.body.classList.remove('reordering');};
 card.addEventListener('touchstart',e=>{
  if(e.touches.length!==1||e.target.closest('input,button')||page==='test-levels'){endLevelDrag(true);return;}
  const touch=e.touches[0];if(levelPointer)endLevelDrag(true);
  const p=levelPointer={id:level.id,x:touch.clientX,y:touch.clientY,startX:touch.clientX,startY:touch.clientY,startScroll:$('level-cards').scrollLeft,active:false,target:null};
  p.timer=setTimeout(()=>{if(levelPointer!==p)return;p.active=true;card.classList.add('dragging');document.body.classList.add('reordering');$('reorder-status').textContent='Moving '+level.name;
   const scroll=()=>{if(levelPointer!==p)return;const r=$('level-cards').getBoundingClientRect();if(p.x<r.left+44)$('level-cards').scrollLeft-=8;else if(p.x>r.right-44)$('level-cards').scrollLeft+=8;card.style.transform='translate('+(p.x-p.startX+$('level-cards').scrollLeft-p.startScroll)+'px,'+(p.y-p.startY-5)+'px)';p.target=levelDropAt(p.x,p.y,p.id);reorderFrame=requestAnimationFrame(scroll);};scroll();
  },400);
 },{passive:true});
 card.addEventListener('touchmove',e=>{
  const p=levelPointer;if(!p)return;if(e.touches.length!==1){endLevelDrag(true);return;}
  p.x=e.touches[0].clientX;p.y=e.touches[0].clientY;
  if(!p.active&&Math.hypot(p.x-p.startX,p.y-p.startY)>8){endLevelDrag(true);return;}
  if(p.active){e.preventDefault();p.target=levelDropAt(p.x,p.y,p.id);}
 },{passive:false});
 card.addEventListener('touchend',()=>endLevelDrag());card.addEventListener('touchcancel',()=>endLevelDrag(true));
 card.addEventListener('contextmenu',e=>{if(levelPointer?.active)e.preventDefault();});
 card.addEventListener('keydown',e=>{if(e.key==='Escape')endLevelDrag(true);});
}
// Let the browser handle a second finger and its native page/pinch zoom.
canvas.addEventListener('pointerdown',e=>{
 if(preview)return;editPointers.add(e.pointerId);if(editPointers.size>1){endDrag(true);e.stopImmediatePropagation();return;}
 if(focusMode&&e.isPrimary){e.stopImmediatePropagation();drag={kind:'pan',offset,clientY:e.clientY};canvas.setPointerCapture(e.pointerId);return;}
 if(!panel&&selected.has(hit(coords(e))?.id))lastSelection='';
 if(placement&&e.isPrimary&&e.button===0){
  e.stopImmediatePropagation();canvas.setPointerCapture(e.pointerId);const p=coords(e);
  addItem(placement,p);
  request();
 }
},true);
for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,e=>{editPointers.delete(e.pointerId);requestAnimationFrame(syncInterface);},true);
uiButton('levels-toggle',()=>showLevels());uiButton('add-objects',()=>{placement=null;select([]);openPanel('assets');buildPalette();});
uiButton('tray-hide',()=>openPanel(null));uiButton('inspector-hide',()=>openPanel(null));uiButton('place-done',donePlacing);
uiButton('selection-done',()=>{if(colliderEdit){endColliderEdit();return;}multiSelectMode=false;select([]);openPanel(null);});
uiButton('focus-view',focusScene);uiButton('restore-tools',()=>{focusMode=false;document.body.classList.remove('focus-mode');$('restore-tools').hidden=true;openPanel(selected.size?'selection':null);request();});
uiButton('motion-tab',()=>endColliderEdit());uiButton('collider-tab',()=>{if(item())editCollider(item().id);});
uiButton('go-start',()=>{offset=clamp(state.start.y-220,0,state.height-H);select([]);request();});
uiButton('go-end',()=>{offset=Math.max(0,state.height-H);select([]);request();});
uiButton('files-close',()=>{$('file-menu').hidden=true;});uiButton('templates-close',()=>{$('level-templates').hidden=true;});
uiButton('campaign-play',()=>{window.location.href='/test/';});uiButton('copy-test-link',async()=>{
 const url=new URL('/test/',window.location.origin).href;
 try{await navigator.clipboard.writeText(url);tell('Test link copied. New visitors play the levels included in your deployment.');}catch{const a=node('a',{href:url,text:url});$('notice').replaceChildren(a);}
});
uiButton('test-begin',()=>{$('test-start').hidden=true;startPlay(true);});uiButton('test-levels',()=>showLevels(true,true));
uiButton('select-several',()=>{placement=null;$('placement-actions').hidden=true;$('placement-hint').hidden=true;for(const b of document.querySelectorAll('.asset.active'))b.classList.remove('active');multiSelectMode=!multiSelectMode;$('select-several').setAttribute('aria-pressed',String(multiSelectMode));});
const undoLevels=button('Undo',()=>{editHistory(true);buildCards();},$('file-menu'));undoLevels.id='levels-undo';
// Controls affect the existing movement simulation; touch never reserves screen space.
function touchDirection(){return inputMode==='tilt'&&performance.now()-tiltLastSignal<500?tiltSteering:0;}
function releaseTouch(){touchPoints.clear();held.delete('Space');tiltSteering=0;tiltZero=null;tiltSample=null;}
function hideControls(){
 clearTimeout(controlsDismissTimer);controlsDismissTimer=0;controlsFirstPlay=false;
 $('controls-panel').hidden=true;$('controls-panel').classList.remove('closing');
}
function showControls(firstPlay=false){
 const p=playState;if(!p||p.complete||p.failed)return;
 hideControls();controlsFirstPlay=firstPlay;p.paused=true;held.clear();releaseTouch();lastTick=0;
 const phone=navigator.maxTouchPoints>0;
 $('controls-jump').textContent=phone?'Tap to jump':'Space to jump';
 $('controls-hover').textContent=phone?'Hold to hover':'Hold Space to hover';
 $('controls-steer').textContent=phone?'Sway left / right':'Left / Right or A / D';
 $('controls-panel').hidden=false;updatePlayInterface();
 requestAnimationFrame(()=>{if(!$('controls-panel').hidden)$('controls-dismiss').focus({preventScroll:true});});
}
function dismissControls(){
 if($('controls-panel').hidden||controlsDismissTimer)return;
 const firstPlay=controlsFirstPlay;
 if(firstPlay){Campaign.progress.controlsSeen=true;Campaign.persist();}
 $('controls-panel').classList.add('closing');
 controlsDismissTimer=setTimeout(()=>{
  hideControls();if(!playState)return;
  playState.paused=!firstPlay;held.clear();releaseTouch();lastTick=0;updatePlayInterface();
  (firstPlay?canvas:$('pause-controls')).focus({preventScroll:true});
 },160);
}
function jumpPress(){if((publicPlay?Campaign.canJump():state.mode==='climb'&&playState&&!playState.paused)){if(playState.ground){playState.ground=null;playState.vy=470;}held.add('Space');}}
canvas.addEventListener('pointerdown',e=>{
 if(!preview||playState?.paused||playState?.intro||playState?.failed||playState?.complete||e.pointerType==='mouse')return;
 e.preventDefault();e.stopImmediatePropagation();window.getSelection?.()?.removeAllRanges();touchPoints.set(e.pointerId,true);canvas.setPointerCapture(e.pointerId);
 if(touchPoints.size===1)jumpPress();
},true);
canvas.addEventListener('pointermove',e=>{if(preview&&touchPoints.has(e.pointerId))e.preventDefault();},true);
for(const event of ['touchstart','touchmove'])canvas.addEventListener(event,e=>{if(preview)e.preventDefault();},{passive:false});
for(const event of ['pointerup','pointercancel','lostpointercapture'])window.addEventListener(event,e=>{if(touchPoints.delete(e.pointerId)&&!touchPoints.size)held.delete('Space');},true);
for(const event of ['selectstart','contextmenu','dragstart'])document.addEventListener(event,e=>{if(document.body.classList.contains('campaign'))e.preventDefault();});
function updatePlayInterface(){
 const p=playState;if(!p)return;
 const controlsOpen=!$('controls-panel').hidden;
 $('pause-panel').hidden=!p.paused||p.complete||p.failed||controlsOpen;$('editor-main').inert=p.paused&&!p.complete;$('play-controls').inert=p.paused&&!p.complete;$('mobile-pause').hidden=!preview||p.complete||p.failed||!!p.intro||controlsOpen;$('keyboard-help').hidden=!preview||publicPlay;
 $('pause-editor-details').hidden=publicPlay;$('pause-editor-actions').hidden=publicPlay;$('pause-main-menu').hidden=!publicPlay;
 $('pause-restart').textContent=publicPlay?'Restart':'Restart level';
 $('pause-level').textContent=state.name;$('touch-help').textContent=testInstructions();
 $('tilt-mode').textContent='Centre phone';$('tilt-mode').disabled=!window.isSecureContext||!window.DeviceOrientationEvent;
 if(!window.isSecureContext)$('control-notice').textContent='Phone steering needs a secure game link.';
 $('tilt-mode').setAttribute('aria-pressed',String(inputMode==='tilt'));
 $('completion-next').hidden=!publicPlay&&project.levels.findIndex(l=>l.id===state.id)>=project.levels.length-1;
 if(publicPlay){$('completion-next').textContent='Continue';$('completion-restart').hidden=true;$('completion-edit').textContent='Level select';$('game-hud').hidden=true;}
 $('completion-edit').textContent=page==='test'?'Level select':'Back to editor';
 $('pause-edit').hidden=page==='test';$('full-play').hidden=page==='test'||editorView?.full!==false;
}
uiButton('mobile-pause',pausePlay);uiButton('resume-play',pausePlay);uiButton('pause-restart',restartPlay);
uiButton('pause-controls',()=>showControls());uiButton('controls-dismiss',dismissControls);
uiButton('pause-main-menu',()=>Campaign.showWelcome());
uiButton('pause-edit',stopPlay);uiButton('pause-levels',()=>showLevels(true,page==='test'));
uiButton('full-play',()=>{stopPlay();startPlay(true);});
uiButton('completion-edit',()=>page==='test'?showLevels(true,true):stopPlay());
uiButton('completion-next',()=>{if(publicPlay){Campaign.next();return;}const index=project.levels.findIndex(l=>l.id===state.id),next=project.levels[index+1];if(!next)return;const test=page==='test';stopPlay();if(test)showTestStart(next.id);else{openLevelEditor(next.id);startPlay(true);}});
async function enableTilt(){
 const orientation=window.DeviceOrientationEvent;
 if(!window.isSecureContext||!orientation){inputMode='none';tiltEnabled=false;releaseTouch();updatePlayInterface();return false;}
 try{
  if(typeof orientation.requestPermission==='function'&&await orientation.requestPermission()!=='granted'){inputMode='none';tiltEnabled=false;releaseTouch();$('control-notice').textContent='Allow phone movement to steer.';updatePlayInterface();return false;}
  inputMode='tilt';tiltZero=null;releaseTouch();tiltEnabled=true;$('control-notice').textContent='Hold your phone comfortably to centre steering.';updatePlayInterface();
  // Permission can resolve before iOS resumes sensor delivery. Keep listening;
  // missing readings already produce neutral steering in touchDirection().
  return true;
 }catch{inputMode='none';tiltEnabled=false;releaseTouch();$('control-notice').textContent='Allow phone movement to steer.';updatePlayInterface();return false;}
}
uiButton('tilt-mode',enableTilt);
window.addEventListener('deviceorientation',e=>{
 if(!tiltEnabled||inputMode!=='tilt'||!Number.isFinite(e.gamma)||!Number.isFinite(e.beta))return;
 const radians=Math.PI/180,angle=(window.screen?.orientation?.angle??window.orientation??0)*radians;
 const beta=e.beta*radians,gamma=e.gamma*radians;
 // Project gravity onto the screen's right axis. Raw gamma reverses across
 // an upright pitch; physical clockwise lean must keep steering right.
 // https://www.w3.org/TR/orientation-event/#worked-example
 const right=Math.cos(beta)*Math.sin(gamma)*Math.cos(angle)+Math.sin(beta)*Math.sin(angle);
 const value=Math.asin(Math.max(-1,Math.min(1,right)))/radians;
 const now=performance.now();tiltLastSignal=now;
 if(tiltZero===null){
  if(!tiltSample)tiltSample={start:now,mean:value,count:1};
  else{tiltSample.count++;tiltSample.mean+=(value-tiltSample.mean)/tiltSample.count;}
  tiltSteering=0;if(now-tiltSample.start<250)return;
  tiltZero=tiltSample.mean;$('control-notice').textContent='Tilt is centred. Lean left or right to steer.';
 }
 const lean=value-tiltZero;
 tiltSteering=Math.sign(lean)*clamp((Math.abs(lean)-2.5)/15.5);
});
window.addEventListener('orientationchange',releaseTouch);
window.addEventListener('blur',releaseTouch);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseTouch();});
window.addEventListener('resize',()=>{if(!isPhone()){focusMode=false;document.body.classList.remove('focus-mode');$('restore-tools').hidden=true;}layoutPanels();if(!preview)requestAnimationFrame(revealSelection);});
window.addEventListener('keydown',e=>{if(e.code==='Escape'&&!preview){if(placement)donePlacing();else if(focusMode)$('restore-tools').click();else openPanel(null);}},true);
async function routeFromLocation(){
 const path=window.location.pathname,query=new URLSearchParams(window.location.search);
 if((path.startsWith('/test')||path.startsWith('/puzzle'))&&!publicPlay){
  publicPlay=true;
  try{
   const response=await fetch('published-levels.json',{cache:'no-cache'});if(!response.ok)throw Error('publish-file');
   const data=await response.json();if(!validateProject(data))throw Error('publish-data');
   project=data;state=project.levels.find(l=>l.id===project.active)||project.levels[0];offset=0;
  }catch{project=newProject();state=project.levels[0];tell('The saved level file could not load. The starter levels are available.');}
  botanyDirty=true;sync();buildPalette();syncScene();
 }
 if(path.startsWith('/puzzle')){await PuzzleLevel.open({preview:query.get('preview')==='1',route:false,returnTo:'/test/?choose=1'});}
 else if(path.startsWith('/test')){const index=Math.max(0,Number(query.get('level')||1)-1);if(query.has('choose'))showLevels(false,true);else Campaign.showWelcome(query.has('level')?project.levels[index]?.id:null,false);}
 else if(path.startsWith('/levels'))showLevels(false);
 else openLevelEditor(query.get('level')||state.id,false);
}
window.addEventListener('popstate',()=>{if(PuzzleLevel.active&&!location.pathname.startsWith('/puzzle')){PuzzleLevel.close(false);if(preview)return;}if(preview)stopPlay();routeFromLocation();});
const artChanged=Art.changed;Art.changed=()=>{artChanged();updateTestReady();};
Campaign.init();
(async()=>{
 // Existing local work wins. The shipped file supplies the same levels to new browsers.
 let hasSavedProject=false;try{hasSavedProject=!!localStorage.getItem(STORE);}catch{}
 if(publicPlay||!hasSavedProject){
  try{const response=await fetch('published-levels.json',{cache:'no-cache'});if(!response.ok)throw Error('publish-file');const data=await response.json();if(!validateProject(data))throw Error('publish-data');project=data;state=project.levels.find(l=>l.id===project.active)||project.levels[0]||state;project.active=project.levels.length?state.id:null;offset=0;sync();buildPalette();syncScene();}
  catch{tell('The saved level file could not load. The starter levels are available.');}
 }
 await routeFromLocation();document.documentElement.dataset.ready='true';syncInterface();
})();

for(const event of ['pointerup','pointercancel'])window.addEventListener(event,e=>editPointers.delete(e.pointerId));
window.addEventListener('keydown',e=>{
 if(e.key!=='Tab')return;const modal=!$('controls-panel').hidden?$('controls-panel'):!$('pause-panel').hidden?$('pause-panel'):!$('test-start').hidden?$('test-start'):!$('completion').hidden?$('completion'):null;
 if(!modal)return;const focusable=[...modal.querySelectorAll('button,input,select,textarea,a')].filter(el=>!el.hidden&&!el.disabled);if(!focusable.length)return;
 const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
});
