'use strict';
const $=id=>document.getElementById(id),W=330,H=717,SCALE=4;
const canvas=$('canvas'),ctx=canvas.getContext('2d'),backctx=$('backdrop').getContext('2d');
const clone=x=>JSON.parse(JSON.stringify(x));
function uid(){
 if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
 // Local Wi-Fi addresses can lack randomUUID; random bytes remain available.
 const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0'));
 return [hex.slice(0,4),hex.slice(4,6),hex.slice(6,8),hex.slice(8,10),hex.slice(10)].map(part=>part.join('')).join('-');
}
const STORE='ladybug-campaign-v2',LEGACY='ladybug-level-editor-v1';
const flags=()=>({clouds:true,terrain:true,water:true,trees:true,brush:true,birds:true,air:true,weather:true});
let saveBlocked=false;
let publicPlay=window.location.pathname.startsWith('/test')||window.location.pathname.startsWith('/puzzle');
let project,state,offset=0,selected=new Set(),selection=null,preview=false,drag=null,undo=[],redo=[],pending=false;
let sceneryMoving=true,sceneClock=0,inspectionClock=null,botanyDirty=true,botanyOffset=-1,thumbnailDirty=true;
let selectionHandles=[],drawnParts=[],lastEditorTick=0,loadMode='level',levelDrag=null;
const botany=document.createElement('canvas');botany.width=W;botany.height=H;const botctx=botany.getContext('2d');
const imgs={};for(const side of ['left','right']){imgs[side]=new Image();imgs[side].src='assets/leaf-'+side+'-joined.png?v=leaf-contrast-1';imgs[side].onload=()=>{botanyDirty=true;request();};}
const SURFACES={};
function gardenLevel(rain=false){
 const id=uid(),count=60;
 const level={id,name:rain?'Rain':'Garden climb',mode:'climb',theme:rain?'rain':'garden',width:W,viewportHeight:H,height:10800,forestArtwork:true,ending:{x:165,y:10370},vines:[],leaves:[],objects:[],sections:[],scenery:flags(),start:{x:75,y:220},speed:57,draft:rain};
 const vine={id:uid(),type:'vine',points:[]};for(let i=-3;i<count;i++){vine.points.push({x:165+Math.sin(i*.4)*48,y:Math.min(220+i*170,10205)});}vine.points.push({x:165+Math.sin(59.5*.4)*48,y:10290});level.vines.push(vine);
 for(let i=0;i<count;i++){const y=Math.min(220+i*170,10205),side=Math.floor(i/4)%2===0?(i%2?'right':'left'):(i%2?'left':'right');level.leaves.push({id:uid(),type:'leaf',x:Math.round(clamp(165+Math.sin(i*.4)*48+(side==='left'?-78:78),42,288)),y,side,vine:vine.id,...([6,17,26,38,49,56].includes(i)?{fragile:true}:{})});}
 level.start={x:level.leaves[0].x,y:220,leafId:level.leaves[0].id};
 for(const [i,n] of [9,21,32,40,55].entries()){const l=level.leaves[n],air=i>=3;level.objects.push({id:uid(),type:'lyric',asset:'lyric-fragment-'+String((rain?5:0)+i+1).padStart(2,'0'),x:l.x+(air?(l.x<165?92:-92):0),y:l.y+(air?205:28),text:'',final:i===4});}
 if(!rain)for(let i=0;i<30;i++){const n=i*2,y=220+n*170+70,x=165+Math.sin((n+.4)*.4)*48+(i%2?-28:28);level.objects.push({id:uid(),type:'scenery',asset:['flower-daisy','flower-bud','flower-pink','flower-bell'][i%4],x:Math.round(x),y,vine:vine.id,layer:'behind'});}
 if(!rain)addGardenFlowers(level);
 addForkLeaves(level);
 addForestFlowers(level);
 return level;
}
function addForestFlowers(level){
 // These coordinates are the actual nodes in the complete painted plants.
 level.objects=level.objects.filter(o=>!(o.vine&&o.asset.startsWith('flower-')));
 for(const [i,f] of EDITOR_LIBRARY.forestFlowers.entries()){
  if(f.section!==0||f.y>=717)continue;
  if(f.y>level.ending.y-30||f.x<-30||f.x>W+30)continue;
  level.objects.push({id:level.id+'-forest-flower-'+i,type:'scenery',asset:f.kind==='daisy'?'flower-daisy':'flower-pink',x:f.x,y:f.y,forestFlower:i,vine:level.vines[0].id,layer:'behind'});
 }
}
function addForkLeaves(level){
 const main=level.leaves.slice(0,60),vine=level.vines[0];
 if(main.length<60||!vine)return;
 const forks=[
  {start:13,end:18,left:[86,101,78,96],right:[241,253,232,246],rise:[18,-12,14,-8]},
  {start:35,end:39,left:[91,106,82],right:[247,232,252],rise:[16,-6,18]},
  {start:48,end:53,left:[84,102,79,108],right:[236,254,239,251],rise:[-10,18,-8,12]}
 ];
 for(const [forkIndex,fork] of forks.entries()){
  main[fork.start].x=165;main[fork.end].x=165;
  for(let i=fork.start+1;i<fork.end;i++){
   const k=i-fork.start-1,l=main[i],right=forkIndex===1;
   l.x=(right?fork.right:fork.left)[k];l.side=right?'right':'left';
   const id=level.theme+'-fork-'+forkIndex+'-leaf-'+k;
   if(!level.leaves.some(o=>o.id===id))level.leaves.push({id,type:'leaf',x:(right?fork.left:fork.right)[k],y:l.y+fork.rise[k],side:right?'left':'right',vine:vine.id});
  }
 }
}
function addGardenFlowers(level){
 const flowers=level.objects.filter(o=>o.vine&&o.asset.startsWith('flower-')&&!o.id.includes('-garden-bloom-'));
 for(const [i,o] of flowers.entries())for(const [j,dy] of [-96,104].entries()){
  const id=o.id+'-garden-bloom-'+j;if(level.objects.some(f=>f.id===id))continue;
  const y=o.y+dy,vine=level.vines.find(v=>v.id===o.vine),route=samples(vine),p=route.reduce((a,b)=>Math.abs(a.y-y)<Math.abs(b.y-y)?a:b);
  const side=(i+j)%2?1:-1,strand=gardenStrand({...p,y},side),direction=strand.x<p.x?-1:1;
  level.objects.push({...o,id,asset:['flower-bud','flower-daisy','flower-pink'][(i+j)%3],x:Math.round(clamp(strand.x+direction*(24+j*6),30,300)),y});
 }
}
function flightLevel(){const data=EDITOR_LIBRARY.flight,lyrics=data.lyrics.map((o,i)=>({...o,...(i===4?{x:82,y:10170}:{}),asset:'lyric-fragment-'+String(i+11).padStart(2,'0')}));return {id:uid(),name:'Dandelion flight',mode:'flight',theme:'sunset',width:W,viewportHeight:H,height:10800,ending:{x:165,y:10370},vines:[],leaves:[],objects:clone([...data.obstacles,...lyrics]),sections:[],scenery:flags(),start:{x:165,y:337},speed:54.5,draft:false};}
function newProject(){return {version:2,levels:[gardenLevel(),gardenLevel(true),flightLevel()],active:null,arrangements:[]};}
function entities(level=state){return [...level.vines,...level.leaves,...level.objects];}
function item(id=selection){return entities().find(o=>o.id===id);}
function selectedItems(){return entities().filter(o=>selected.has(o.id));}
function editable(o){return o&&!o.locked&&!o.hidden;}
function hasInputFocus(e){return ['INPUT','TEXTAREA','SELECT','BUTTON'].includes(e.target?.tagName)||e.target?.isContentEditable;}
let noticeTimer;
function tell(message){$('notice').textContent=message;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{$('notice').textContent='';},7000);}
function legacyValid(s){return s&&s.version===1&&s.width===330&&Number.isFinite(s.height)&&s.height>=H&&Array.isArray(s.vines)&&Array.isArray(s.leaves)&&s.vines.length<200&&s.leaves.length<5000&&s.vines.every(v=>Array.isArray(v.points)&&v.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))&&s.leaves.every(l=>Number.isFinite(l.x)&&Number.isFinite(l.y)&&['left','right'].includes(l.side)&&s.vines.some(v=>v.id===l.vine));}
function fromLegacy(old){const level=gardenLevel(),first=[...old.leaves].sort((a,b)=>a.y-b.y)[0];return {...level,name:'Your saved garden',height:old.height,vines:old.vines.map(o=>({...o,type:'vine'})),leaves:old.leaves.map(o=>({...o,type:'leaf'})),objects:[],sections:[],start:{x:first?.x??165,y:first?.y??220,leafId:first?.id},draft:true};}
function validateLevel(l){
 if(!l||typeof l.id!=='string'||typeof l.name!=='string'||l.name.length>120||!['climb','flight'].includes(l.mode)||!['garden','rain','sunset'].includes(l.theme)||l.width!==W||l.viewportHeight!==H||!Number.isFinite(l.height)||l.height<H||l.height>100000)return false;
 if(l.ending&&(!Number.isFinite(l.ending.x)||!Number.isFinite(l.ending.y)||Math.abs(l.ending.x)>100000||Math.abs(l.ending.y)>100000))return false;
 if(![l.vines,l.leaves,l.objects,l.sections].every(Array.isArray)||entities(l).length>6000)return false;
 const ids=new Set();for(const o of entities(l)){if((o.flipped!==undefined&&typeof o.flipped!=='boolean')||!validCollider(o.collider)||!validCollider(o.supportCollider))return false;if(typeof o.id!=='string'||ids.has(o.id))return false;ids.add(o.id);if(o.type==='vine'){if(!Array.isArray(o.points)||o.points.length<2||o.points.length>500||!o.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<100000&&Math.abs(p.y)<100000))return false;}else if(!Number.isFinite(o.x??165)||!Number.isFinite(o.y)||Math.abs(o.x??165)>100000||Math.abs(o.y)>100000)return false;}
 if(!l.vines.every(o=>o.type==='vine')||!l.leaves.every(o=>o.type==='leaf'&&['left','right'].includes(o.side)&&l.vines.some(v=>v.id===o.vine)))return false;
 if(!l.objects.every(o=>['bramble','bee','pod','lyric','scenery'].includes(o.type)&&EDITOR_LIBRARY.sprites[o.asset]&&(!o.falls||o.type==='pod'&&o.asset==='pod-tawny')&&(o.type!=='pod'||EDITOR_LIBRARY.supports[o.support])&&(o.type!=='bee'||Number.isFinite(o.left)&&Number.isFinite(o.right)&&o.left<=o.right&&o.left>=-660&&o.right<=660&&o.period>=1&&o.period<=30)&&(o.type!=='pod'||Number.isFinite(o.approach)&&o.approach>=40&&o.approach<=1000&&o.warning>=.3&&o.warning<=5)&&(!o.text||typeof o.text==='string'&&o.text.length<2000)))return false;
 if(!l.sections.every(s=>s.type==='section'&&typeof s.name==='string'&&s.name.length<120&&Number.isFinite(s.end)&&s.end>s.y&&s.weather>=0&&s.weather<=1&&s.wind>=0&&s.wind<=1))return false;
 return validCollider(l.playerCollider)&&l.start&&Number.isFinite(l.start.x)&&Number.isFinite(l.start.y)&&l.speed>=20&&l.speed<=120&&l.scenery&&Object.keys(flags()).every(k=>typeof l.scenery[k]==='boolean');
}
function validateProject(p){return p&&p.version===2&&Array.isArray(p.levels)&&p.levels.length<=60&&p.levels.every(validateLevel)&&new Set(p.levels.map(l=>l.id)).size===p.levels.length&&Array.isArray(p.arrangements)&&p.arrangements.length<=100&&p.arrangements.every(a=>typeof a.name==='string'&&a.name.length<120&&Array.isArray(a.items)&&a.items.length<=6000&&a.items.every(o=>o&&validCollider(o.collider)&&validCollider(o.supportCollider)&&typeof o.id==='string'&&['vine','leaf','bramble','bee','pod','lyric','section','scenery'].includes(o.type)));}
function preserveUnreadable(raw){try{localStorage.setItem(STORE+'-recovery-'+Date.now(),raw);}catch{saveBlocked=true;}}
function restore(){
 let message='';try{const raw=publicPlay?null:localStorage.getItem(STORE);if(raw){const saved=JSON.parse(raw);if(validateProject(saved))project=saved;else {preserveUnreadable(raw);message='Your previous saved data has been kept in a recovery copy. Open a valid exported project to continue it.';}}
 if(!project){project=newProject();const oldRaw=publicPlay?null:localStorage.getItem(LEGACY);if(oldRaw){const old=JSON.parse(oldRaw);if(legacyValid(old)){const saved=fromLegacy(old);project.levels.push(saved);project.active=saved.id;message='Your saved garden is preserved as its own level. The complete garden and flight layouts are also in Levels.';}}}
 }catch{try{const raw=localStorage.getItem(STORE);if(raw)preserveUnreadable(raw);}catch{}project=newProject();message='The previous save could not be opened. Its stored data has not been overwritten; use an exported project to recover your layout.';}
 project.active=project.active||project.levels[0]?.id;state=project.levels.find(l=>l.id===project.active)||project.levels[0]||gardenLevel();project.active=project.levels.length?state.id:null;if(message)tell(message);
}
function checkpoint(){undo.push({project:clone(project),offset,selected:[...selected]});if(undo.length>60)undo.shift();redo=[];}
function save(){LyricPaper.assign(project);project.active=project.levels.length?state.id:null;if(publicPlay){botanyDirty=true;thumbnailDirty=true;sync();request();return;}const startLeaf=state.leaves.find(l=>l.id===state.start.leafId);if(startLeaf){state.start.x=leafLandingX(startLeaf);state.start.y=leafSurface(startLeaf,state.start.x);}try{if(saveBlocked)throw Error('unreadable-save-preserved');localStorage.setItem(STORE,JSON.stringify(project));$('saved').textContent='Saved locally';}catch{$('saved').textContent='Export to keep changes';tell('Local storage could not save these changes. Use Files → Export all levels.');}botanyDirty=true;thumbnailDirty=true;sync();request();}
function change(fn){if(preview)return;checkpoint();fn();save();}
function select(ids){colliderEdit=null;colliderEditTime=null;selected=new Set(Array.isArray(ids)?ids:ids?[ids]:[]);selection=[...selected].at(-1)||null;inspectionClock=selected.size&&['bee','pod'].includes(item()?.type)?sceneClock:null;sync();request();}
function editHistory(back){const source=back?undo:redo,dest=back?redo:undo;if(!source.length)return;dest.push({project:clone(project),offset,selected:[...selected]});const old=source.pop();project=old.project;state=project.levels.find(l=>l.id===project.active)||project.levels[0]||state;offset=old.offset;selected=new Set(old.selected);selection=[...selected].at(-1)||null;save();buildPalette();buildCards();}
function switchLevel(id){if(preview)return;colliderEdit=null;colliderEditTime=null;const next=project.levels.find(l=>l.id===id);if(!next)return;state.view=offset;state=next;project.active=id;offset=clamp(state.view||0,0,state.height-H);selected.clear();selection=null;inspectionClock=null;sceneClock=0;save();buildPalette();buildCards();syncScene();}
function duplicateLevel(level){change(()=>{const copy=clone(level);copy.id=uid();copy.name=level.name+' copy';project.levels.splice(project.levels.indexOf(level)+1,0,copy);});switchLevel(project.levels[project.levels.indexOf(level)+1].id);}
function removeLevel(level){
 change(()=>{project.levels=project.levels.filter(l=>l.id!==level.id);if(state.id===level.id){state=project.levels[0]||state;project.active=project.levels[0]?.id||null;offset=0;selected.clear();selection=null;}});
 buildCards();buildPalette();syncScene();
}
function reorderLevel(from,to,after=false){
 if(from===to)return;
 change(()=>{const source=project.levels.find(l=>l.id===from);if(!source||!project.levels.some(l=>l.id===to))return;project.levels=project.levels.filter(l=>l.id!==from);const at=project.levels.findIndex(l=>l.id===to)+(after?1:0);project.levels.splice(at,0,source);});
 buildCards();
}
function sy(y){return H-y+offset;}
function coords(e,target=canvas){const r=target.getBoundingClientRect();return {x:(e.clientX-r.left)*W/r.width,y:H-(e.clientY-r.top)*H/r.height+offset};}
function samples(v){const out=[],ps=v.points;for(let k=0;k<ps.length-1;k++){const a=ps[Math.max(0,k-1)],b=ps[k],c=ps[k+1],d=ps[Math.min(ps.length-1,k+2)],steps=Math.max(10,Math.ceil(Math.hypot(c.x-b.x,c.y-b.y)/3));for(let j=0;j<steps;j++){const t=j/steps,t2=t*t,t3=t2*t;const f=n=>.5*(2*b[n]+(-a[n]+c[n])*t+(2*a[n]-5*b[n]+4*c[n]-d[n])*t2+(-a[n]+3*b[n]-3*c[n]+d[n])*t3);out.push({x:f('x'),y:f('y')});}}out.push(ps.at(-1));return out;}
function nearest(x,y,path){let best=path[0],dist=Infinity;for(const p of path){const d=(p.x-x)**2+(p.y-y)**2;if(d<dist){dist=d;best=p;}}return {...best,dist};}
let paths=[];
function leafArtworkSurface(leaf,x){const col=Math.round(x-(leaf.x-40));if(col<12||col>65)return null;if(!SURFACES[leaf.side]){if(!imgs[leaf.side].complete||!imgs[leaf.side].naturalWidth)return leaf.y+4;const c=document.createElement('canvas');c.width=80;c.height=33;const g=c.getContext('2d');g.drawImage(imgs[leaf.side],0,0,80,33);const d=g.getImageData(0,0,80,33).data;SURFACES[leaf.side]=Array.from({length:80},(_,x)=>{for(let y=0;y<33;y++)if(d[(y*80+x)*4+3]>128)return y;return 16;});}return leaf.y+16-SURFACES[leaf.side][col];}
function attachmentMaterial(o){
 const material=o.type==='leaf'?LEAF_MATERIAL[o.side]:EDITOR_LIBRARY.flowerRoots[o.asset];
 return o.type==='scenery'&&o.flipped?{...material,x:-material.x,tx:-material.tx,colors:[...material.colors].reverse()}:material;
}
// Authored, unequal bends: long forks, close wraps and short crossings.
// Coordinates stay in world space, so scrolling never changes a plant's shape.
const GARDEN_BENDS=[
 // height, first offset, second offset, first depth, second depth, radii
 [-340,-25,20,-.5,.6,17,14],[-150,-36,31,-.8,.7,18,14],
 [10,-21,28,-.7,.5,20,13],[155,14,-15,.8,-.7,19,15],
 [285,62,-28,.9,-.6,16,17],[385,40,-77,.5,-.1,14,19],
 [505,-27,-49,-.7,.8,18,17],[620,-70,11,-.8,.7,21,13],
 [790,-25,43,-.3,.5,17,16],[935,8,58,.6,-.6,16,18],
 [1040,58,3,.8,-.7,18,13],[1210,62,-58,.4,-.5,15,19],
 [1370,21,-66,-.7,.6,20,15],[1455,-20,-4,-.8,.7,17,18],
 [1610,-63,51,-.5,.6,14,20],[1840,-34,67,.7,-.4,18,17],
 [1935,25,6,.9,-.6,21,13],[2060,61,-26,.7,-.4,17,15],
 [2235,40,-58,-.3,.5,15,20],[2345,-20,-45,-.7,.8,19,16],
 [2490,-57,23,-.8,.6,18,14],[2700,-39,76,.1,.4,15,20],
 [2820,-5,43,.7,-.5,20,17],[2985,60,-18,.8,-.6,18,14],
 [3100,44,-69,.4,-.3,14,20],[3305,-18,-39,-.7,.7,20,15],
 [3420,-67,27,-.6,.8,18,13],[3660,-30,57,.3,.5,15,19],
 [3745,21,14,.8,-.7,19,16],[3935,68,-52,.6,-.3,17,20],
 [4120,29,-69,-.4,.7,21,16],[4225,-29,-20,-.7,.8,16,18],
 [4470,-61,63,-.4,.6,14,21],[4615,9,38,.7,-.6,20,16],
 [4755,63,-31,.8,-.7,18,14],[4985,35,-64,-.4,.8,16,20],
 [5110,-28,-14,-.8,.7,21,16],[5300,-59,61,-.3,.5,17,14],
 [5505,3,48,.8,-.7,15,20],[5660,55,-22,.7,-.6,19,15],
 [5880,24,-43,.2,.6,17,18],[6210,-21,32,-.6,.7,15,13],
 [6340,-62,53,-.8,.5,20,15],[6595,-44,72,-.3,.6,17,19],
 [6760,19,8,.7,-.5,15,21],[6875,64,-32,.8,-.7,19,16],
 [7100,46,-67,.2,-.3,21,14],[7310,-13,-42,-.6,.8,17,19],
 [7415,-54,17,-.8,.7,15,20],[7625,-72,62,-.5,.5,19,14],
 [7810,-31,48,.1,-.3,21,17],[7900,22,3,.8,-.6,16,20],
 [8065,61,-52,.7,-.5,18,14],[8320,39,-73,.2,.5,20,16],
 [8465,-20,-38,-.7,.8,15,21],[8670,-65,24,-.6,.7,19,17],
 [8840,-38,69,-.2,.4,21,14],[8965,7,43,.7,-.6,17,20],
 [9110,52,-18,.8,-.7,15,19],[9375,67,-64,.4,-.3,20,14],
 [9535,24,-45,-.5,.6,18,21],[9640,-27,11,-.8,.8,16,18],
 [9890,-57,64,-.3,.5,21,15],[10025,-9,49,.6,-.5,18,20],
 [10205,55,-17,.8,-.7,16,18],[10480,23,-42,.2,.6,20,14],
 [10800,-32,36,-.7,.8,17,19]
];
function gardenBend(y,column){
 let k=GARDEN_BENDS.findIndex(p=>p[0]>=y);if(k<=0)return GARDEN_BENDS[k<0?GARDEN_BENDS.length-1:0][column];
 const a=GARDEN_BENDS[Math.max(0,k-2)],b=GARDEN_BENDS[k-1],c=GARDEN_BENDS[k],d=GARDEN_BENDS[Math.min(k+1,GARDEN_BENDS.length-1)];
 const t=clamp((y-b[0])/(c[0]-b[0])),t2=t*t,t3=t2*t;
 const m1=(c[column]-a[column])/(c[0]-a[0])*(c[0]-b[0]);
 const m2=(d[column]-b[column])/(d[0]-b[0])*(c[0]-b[0]);
 return (2*t3-3*t2+1)*b[column]+(t3-2*t2+t)*m1+(-2*t3+3*t2)*c[column]+(t3-t2)*m2;
}
function gardenStrand(p,side){
 const first=side<0;
 return {x:p.x+gardenBend(p.y,first?1:2),y:p.y,depth:gardenBend(p.y,first?3:4),radius:gardenBend(p.y,first?5:6)};
}
function botanicalPaths(v){
 const route=samples(v),garden=state.theme==='garden';
 return {id:v.id,route,strands:garden?[-1,1].map(side=>route.map(p=>gardenStrand(p,side))):[route]};
}
function attachmentPath(l,path){
 const root=attachmentMaterial(l),x=l.x+root.x,y=l.y+root.y-24;
 return path.strands.reduce((best,points)=>nearest(x,y,points).dist<nearest(x,y,best).dist?points:best,path.strands[0]);
}
let growingBotany=null;
function renderBotany(growth=Infinity,record=false){botctx.clearRect(0,0,W,H);paths=state.vines.filter(v=>!v.hidden).map(botanicalPaths);const pixels=botctx.createImageData(W,H),trunk=new Float32Array(W*H),quality=new Float32Array(W*H).fill(-Infinity);
 const tracked=record?{key:state.id+':'+offset,stem:null,branch:new Uint8ClampedArray(W*H*4),stemBirth:new Float32Array(W*H).fill(Infinity),branchBirth:new Float32Array(W*H).fill(Infinity),leaves:[],frame:botctx.createImageData(W,H)}:null;
 function material(u,s){
  const profile=EDITOR_LIBRARY.growthStem;
  return profile[Math.min(profile.length-1,Math.round(clamp(u)*(profile.length-1)))];
 }
 function stemSilhouette(points,radius,identity){
  const art=[0,1,2,3].map(i=>Art.pixels('assets/campaign/stem-silhouette-'+i+'.png'));
  if(art.some(a=>!a))return;
  const order=[0,2,1,3,1,0,3,2,0,1,2,3,2,0,1,3,0,2,3,1,2,1,0,3,1,3,2,0,3,0,2,1];
  const layer=new Uint8ClampedArray(W*H*4),nearestDistance=new Float32Array(W*H).fill(Infinity),depths=new Float32Array(W*H),birth=new Float32Array(W*H);
  let along=identity*183;
  for(let k=0;k<points.length;k++){
   const p=points[k],prev=points[Math.max(0,k-1)],next=points[Math.min(points.length-1,k+1)];
   const scale=(p.radius??radius)/25,dx=next.x-prev.x,dy=next.y-prev.y,len=Math.hypot(dx,dy)||1,nx=dy/len,ny=dx/len,cy=sy(p.y),extent=43*scale+3;
   along+=Math.hypot(p.x-prev.x,p.y-prev.y)/scale;
   if(cy+extent<0||cy-extent>=H)continue;
   for(let y=Math.max(0,Math.floor(cy-extent));y<=Math.min(H-1,Math.ceil(cy+extent));y++)for(let x=Math.max(0,Math.floor(p.x-extent));x<=Math.min(W-1,Math.ceil(p.x+extent));x++){
    const ox=x-p.x,oy=y-cy,d=ox*ox+oy*oy,n=y*W+x;if(d>=nearestDistance[n])continue;
    nearestDistance[n]=d;
    const across=ox*nx+oy*ny,longitudinal=(ox*dx-oy*dy)/len,tex=along+longitudinal/scale;
    const section=Math.floor(tex/352),at=((tex%352)+352)%352;
    const column=Math.round(128+across/scale),row=Math.max(0,383-Math.round(at+32));
    const image=art[order[((section%order.length)+order.length)%order.length]];
    const z=n*4;layer[z+3]=0;if(column<0||column>=256)continue;
    const source=(row*256+column)*4;
    // The original alpha silhouette supplies every edge, hole and protrusion.
    // There is no cylinder mask and no per-row width normalization.
    let alpha=image.data[source+3],r=image.data[source],g=image.data[source+1],b=image.data[source+2];
    if(at>320){
     const nextImage=art[order[((section+1)%order.length+order.length)%order.length]],mix=smooth((at-320)/32),nextRow=383-Math.round(at-320),q=(nextRow*256+column)*4;
     const a0=alpha*(1-mix),a1=nextImage.data[q+3]*mix,total=a0+a1;
     if(total){r=(r*a0+nextImage.data[q]*a1)/total;g=(g*a0+nextImage.data[q+1]*a1)/total;b=(b*a0+nextImage.data[q+2]*a1)/total;}alpha=total;
    }
    if(alpha<128)continue;
    const light=.9+.1*clamp(((p.depth??1)+1)/2);
    layer[z]=r*light;layer[z+1]=g*light;layer[z+2]=b*light;layer[z+3]=255;
    depths[n]=p.depth??0;birth[n]=(p.birth??p.y)+longitudinal*dy/len+23*Math.abs(across)/(29*scale);
   }
  }
  for(let n=0;n<W*H;n++)if(layer[n*4+3]&&depths[n]>=quality[n]){
   pixels.data.set(layer.subarray(n*4,n*4+4),n*4);trunk[n]=1;quality[n]=depths[n];
   if(tracked)tracked.stemBirth[n]=birth[n];
  }
 }
 function ribbon(points,radius,branch=false,leafMaterial=null,origin=0){const best=new Float32Array(W*H);let distance=0;for(let k=0;k<points.length;k++){const p=points[k],prev=points[Math.max(0,k-1)],next=points[Math.min(points.length-1,k+1)];distance+=Math.hypot(p.x-prev.x,p.y-prev.y);const dx=next.x-prev.x,dy=next.y-prev.y,len=Math.hypot(dx,dy)||1,nx=dy/len,ny=dx/len,r0=p.radius??(typeof radius==='function'?radius(k/(points.length-1)):radius);const r=branch?r0:r0*clamp((growth-p.y)/26);if(r<=0)continue;const cy=sy(p.y);if(cy+r<0||cy-r>H)continue;
 const light=!branch&&p.depth!==undefined?.82+.18*clamp((p.depth+1)/2):1;
 const colours=Array.from({length:48},(_,column)=>material(column/47,branch?points[0].y+distance*.7:distance).map(v=>Math.round(v*light)));
 for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(H-1,Math.ceil(cy+r));y++)for(let x=Math.max(0,Math.floor(p.x-r));x<=Math.min(W-1,Math.ceil(p.x+r));x++){let ox=x-p.x,oy=y-cy,d=ox*ox+oy*oy;if(d>=r*r)continue;let n=y*W+x,q=1-d/(r*r);if(q<=best[n])continue;best[n]=q;const depth=(p.depth??0)+q*.001;if(!branch&&depth<quality[n])continue;const across=(ox*nx+oy*ny)/r,u=(across+1)/2;let c=colours[Math.max(0,Math.min(47,Math.round(u*47)))];
 if(branch){const t=k/(points.length-1);const profile=leafMaterial.colors;const pc=profile[Math.min(profile.length-1,Math.max(0,Math.round(u*(profile.length-1))))];const f=Math.min(1,t/.24);c=c.map((v,i)=>Math.round(v*(1-f)+pc[i]*f));if(trunk[n]){const blend=Math.min(.88,Math.max(0,t*2.6))*q;c=c.map((v,i)=>Math.round(pixels.data[n*4+i]*(1-blend)+v*blend));}}
 const z=n*4;pixels.data[z]=c[0];pixels.data[z+1]=c[1];pixels.data[z+2]=c[2];pixels.data[z+3]=255;if(!branch){trunk[n]=q;quality[n]=depth;}
 if(tracked){if(branch){tracked.branch.set([...c,255],n*4);tracked.branchBirth[n]=origin+90*k/(points.length-1);}else tracked.stemBirth[n]=(p.birth??p.y)+26*Math.abs(across);}
 }} }
 for(const path of paths)path.strands.forEach((strand,i)=>stemSilhouette(strand,state.theme==='garden'?17:15,i));
 // A raised crossing shades the stem behind it, following the actual overlap.
 if(state.theme==='garden'){
  const original=new Uint8ClampedArray(pixels.data);
  for(let y=3;y<H-3;y++)for(let x=3;x<W-3;x++){
   const n=y*W+x;if(!trunk[n])continue;let shadow=0;
   for(const [dx,dy,weight] of [[-1,-1,.32],[-2,-1,.24],[-2,-2,.16],[-3,-2,.09]]){
    const other=(y+dy)*W+x+dx;if(trunk[other]&&quality[other]>quality[n]+.28)shadow=Math.max(shadow,weight);
   }
   if(shadow)for(let c=0;c<3;c++)pixels.data[n*4+c]=Math.round(original[n*4+c]*(1-shadow));
  }
 }
 if(tracked)tracked.stem=new Uint8ClampedArray(pixels.data);
 for(const l of [...state.leaves,...state.objects.filter(o=>o.type==='scenery'&&o.vine&&o.asset.startsWith('flower-'))].filter(l=>!l.hidden)){const path=paths.find(p=>p.id===l.vine);if(!path)continue;const points=attachmentPath(l,path),lm=attachmentMaterial(l),end={x:l.x+lm.x,y:l.y+lm.y},base=nearest(end.x,end.y-24,points),idx=points.findIndex(p=>p.x===base.x&&p.y===base.y),a=points[Math.max(0,idx-2)],b=points[Math.min(points.length-1,idx+2)],len=Math.hypot(b.x-a.x,b.y-a.y)||1,span=Math.hypot(end.x-base.x,end.y-base.y),c1={x:base.x+(b.x-a.x)/len*Math.min(24,span*.35),y:base.y+(b.y-a.y)/len*Math.min(24,span*.35)},c2={x:end.x-lm.tx*Math.min(24,span*.4),y:end.y-lm.ty*Math.min(24,span*.4)},pts=[];for(let k=0;k<=80;k++){let t=k/80,q=1-t;pts.push({x:q*q*q*base.x+3*q*q*t*c1.x+3*q*t*t*c2.x+t*t*t*end.x,y:q*q*q*base.y+3*q*q*t*c1.y+3*q*t*t*c2.y+t*t*t*end.y});}const reach=clamp((growth-base.y)/90);if(reach>0)ribbon(pts.slice(0,Math.max(2,Math.ceil(pts.length*reach))),t=>(lm.radius+7.5*(1-t*reach)**3)*Math.min(1,(1-t)*12+reach),true,lm,base.y);}
 botctx.putImageData(pixels,0,0);botctx.imageSmoothingEnabled=false;
 for(const l of state.leaves){if(l.hidden||state.vines.find(v=>v.id===l.vine)?.hidden)continue;const im=imgs[l.side];if(!im.complete||!im.naturalWidth)continue;
  const path=paths.find(p=>p.id===l.vine),lm=attachmentMaterial(l),base=path?nearest(l.x+lm.x,l.y+lm.y-24,attachmentPath(l,path)):l;
  if(tracked){tracked.leaves.push({l,lm,base:base.y});continue;}
  const opened=smooth((growth-base.y-65)/205);if(opened<=0)continue;
  paintGrowingLeaf(botctx,l,opened);}
 if(tracked)growingBotany=tracked;
 botanyDirty=false;botanyOffset=offset;
}
function brownLeafState(leaf){return preview?playState?.brownLeaves?.get(leaf.id):null;}
function brownLeafFrame(leaf){return Math.min(10,Math.max(0,((brownLeafState(leaf)?.load||0)-.3)/2.3*10));}
function brownLeafOrigin(leaf){return {x:Math.round(leaf.x-(leaf.side==='left'?48:42)),y:Math.round(sy(leaf.y)-16)};}
const brownLeafSurfaces=new Map();
function brownLeafSurface(leaf,x){
 if(brownLeafState(leaf)?.released!==undefined)return null;
 const origin=brownLeafOrigin(leaf),col=Math.round(x-origin.x),frame=brownLeafFrame(leaf),a=Math.floor(frame),b=Math.min(10,a+1);
 // Keep the perch on the painted broad blade, excluding its narrow stem.
 if(col<(leaf.side==='left'?13:24)||col>(leaf.side==='left'?70:82))return null;
 function surface(f){
  const key=leaf.side+f;if(!brownLeafSurfaces.has(key)){
   const spec=EDITOR_LIBRARY.sprites['leaf-brown-'+leaf.side],pixels=Art.pixels(spec.src);if(!pixels)return null;
   const columns=Array(96).fill(null);
   for(let cx=0;cx<96;cx++)for(let row=0;row<64;row++)if(pixels.data[((Math.floor(f/4)*64+row)*pixels.w+(f%4)*96+cx)*4+3]>128){columns[cx]=row;break;}
   brownLeafSurfaces.set(key,columns);
  }
  return brownLeafSurfaces.get(key)[col];
 }
 const top=surface(a),next=surface(b);if(top===null)return null;
 return leaf.y+16-(top+((next??top)-top)*(frame-a));
}
function brownLeafContains(leaf,x,y){
 if(brownLeafState(leaf)?.released!==undefined)return false;
 const origin=brownLeafOrigin(leaf);
 return Art.opaque('leaf-brown-'+leaf.side,Math.round(brownLeafFrame(leaf)),x-origin.x,sy(y)-origin.y);
}
function paintBrownLeaf(g,leaf,opened=1){
 const motion=brownLeafState(leaf),origin=brownLeafOrigin(leaf),released=motion?.released!==undefined;
 g.save();
 if(opened<1){
  const root=leaf.side==='left'?82:13,reach=110*smooth(opened);
  g.beginPath();g.rect(origin.x+root-reach,origin.y+28-reach,reach*2,reach*2);g.clip();
 }
 if(released){
  Art.sprite(g,'leaf-brown-stump-'+leaf.side,0,origin.x,origin.y,96,64);
  const age=Math.max(0,playState.time-motion.released),direction=leaf.side==='left'?-1:1;
  const drift=direction*(14*age+18*(1-Math.cos(age*2))),fall=16*age+62*age*age;
  const y=origin.y+fall;if(y< -80||y>H+80){g.restore();return;}
  const frame=age<.85?11+age/.85*4:13+cycle((age-.85)*2,3);
  Art.pose(g,'leaf-brown-'+leaf.side,frame,Math.round(origin.x+drift),Math.round(y),96,64);
 }else Art.pose(g,'leaf-brown-'+leaf.side,brownLeafFrame(leaf),origin.x,origin.y,96,64,10);
 g.restore();
}
function paintGrowingLeaf(g,l,opened){
 if(l.fragile){paintBrownLeaf(g,l,opened);return;}
 if(opened>=1){g.drawImage(imgs[l.side],Math.round(l.x-40),Math.round(sy(l.y)-16),80,33);return;}
 const spec=EDITOR_LIBRARY.sprites['leaf-unfurl-'+l.side];if(!spec)return;
 const x=Math.round(l.x-48),y=Math.round(sy(l.y)-70);
 // The first shoot emerges at its petiole. It is never switched on whole.
 g.save();const reach=100*smooth(opened/.12),rx=l.side==='left'?82:19;
 g.beginPath();g.rect(x+rx-reach,y+82-reach,reach*2,reach*2);g.clip();
 Art.pose(g,'leaf-unfurl-'+l.side,opened*(spec.count-1),x,y,96,96);g.restore();
}
function paintGrowingTips(g,growth){
 if(state.mode!=='climb'||!Number.isFinite(growth))return;
 for(const path of paths){
  const y=growth-24;if(y>path.route.at(-1).y+35||y<path.route[0].y-35)continue;
  // Interpolate the advancing tip along the fixed path; sample-index jumps
  // used to make the shoot move in three-pixel steps.
  let i=path.route.findIndex(p=>p.y>=y);if(i<0)i=path.route.length-1;
  const a=path.route[Math.max(0,i-1)],b=path.route[i],f=clamp((y-a.y)/(b.y-a.y||1)),p={x:a.x+(b.x-a.x)*f,y};
  const tips=state.theme==='garden'?[-1,1].map(side=>({...gardenStrand(p,side),side})):[{...p,depth:1,side:-1}];
  for(const tip of tips.sort((a,b)=>a.depth-b.depth)){
   const shade=Math.round(clamp((tip.depth+1)/2)*15),frame=shade*8+cycle(playState.time*5+(tip.side===1?3:0),8);
   g.save();g.translate(Math.round(tip.x),Math.round(sy(y)));if(tip.side===1)g.scale(-1,1);
   Art.pose(g,'vine-growing-tip',frame,-40,-73,80,80,shade*8+7);g.restore();
  }
 }
}
const botanicalTiles=new Map();
function forestLeafOpened(leaf){
 return 1;
}
function paintForestBotany(g){
 const top=Campaign.ending().y+32;
 g.save();g.beginPath();g.rect(0,sy(top),W,top+100);g.clip();
 // Complete painted trunks stay in world space. Scrolling changes only the camera.
 for(const p of EDITOR_LIBRARY.forestTiles||EDITOR_LIBRARY.forestPlacements.map((p,i)=>({...p,name:'forest-trunk-'+i}))){
  const y=sy(p.base+p.h);if(y>H||y+p.h<0)continue;
  Art.sprite(g,p.name,0,p.x,y);
 }
 for(const o of state.leaves){
  if(o.hidden||o.y<offset-120||o.y>offset+H+120||state.vines.find(v=>v.id===o.vine)?.hidden)continue;
  paintGrowingLeaf(g,o,1);
 }
 g.restore();botanyDirty=false;botanyOffset=offset;
}
function paintBotany(g){
 if(state.forestArtwork&&state.mode==='climb'){paintForestBotany(g);return;}
 const growth=typeof Campaign==='undefined'?Infinity:Campaign.growthHeight(),view=offset;
 if(botanyDirty)botanicalTiles.clear();
 if(drag?.mutated){renderBotany();g.drawImage(botany,0,0);return;}
 for(const base of [Math.floor(view/H)*H,Math.floor(view/H)*H+H]){
  if(view-base+H<=0)continue;
  const key=state.id+':'+base;
  if(!botanicalTiles.has(key)){
   offset=base;renderBotany(Infinity,true);
   const a=growingBotany,tile=document.createElement('canvas');tile.width=W;tile.height=H;
   const tg=tile.getContext('2d');tg.imageSmoothingEnabled=false;tg.drawImage(botany,0,0);
   for(const {l} of a.leaves)if(!l.fragile)paintGrowingLeaf(tg,l,1);
   const growing=document.createElement('canvas');growing.width=W;growing.height=H;
   const cg=growing.getContext('2d');cg.imageSmoothingEnabled=false;
   const active=[];
   for(let n=0;n<W*H;n++)if(a.stem[n*4+3]||a.branch[n*4+3])active.push(n);
   a.active=new Uint32Array(active);
   a.stemWords=new Uint32Array(a.stem.buffer,a.stem.byteOffset,W*H);
   a.branchWords=new Uint32Array(a.branch.buffer,a.branch.byteOffset,W*H);
   a.frameWords=new Uint32Array(a.frame.data.buffer,a.frame.data.byteOffset,W*H);
   botanicalTiles.set(key,{tile,growing,cg,a});offset=view;
   if(botanicalTiles.size>16)botanicalTiles.delete(botanicalTiles.keys().next().value);
  }
  const entry=botanicalTiles.get(key);
  if(growth>=base+H+330){g.drawImage(entry.tile,0,view-base);continue;}
  const {a,cg,growing}=entry;
  // Empty sky pixels never participate in vine growth. Copy only the painted
  // silhouette, preserving every source colour and the original reveal timing.
  for(const n of a.active)a.frameWords[n]=a.branchBirth[n]<=growth?a.branchWords[n]:a.stemBirth[n]<=growth?a.stemWords[n]:0;
  cg.putImageData(a.frame,0,0);offset=base;
  for(const {l,base:birth} of a.leaves){const opened=smooth((growth-birth-65)/205);if(opened>0&&!l.fragile)paintGrowingLeaf(cg,l,opened);}
  offset=view;g.drawImage(growing,0,view-base);
 }
 for(const l of state.leaves)if(l.fragile&&!l.hidden&&!state.vines.find(v=>v.id===l.vine)?.hidden){
  const opened=smooth((growth-Campaign.attachmentBirth(l)-65)/205);if(opened>0)paintBrownLeaf(g,l,opened);
 }
 paintGrowingTips(g,growth);botanyOffset=view;
}
function worldBounds(o){
 if(o.type==='vine'){const xs=o.points.map(p=>p.x),ys=o.points.map(p=>p.y);return {x:Math.min(...xs)-12,y:Math.min(...ys)-12,w:Math.max(...xs)-Math.min(...xs)+24,h:Math.max(...ys)-Math.min(...ys)+24};}
 if(o.type==='leaf')return {x:o.x-40,y:o.y-17,w:80,h:33};
 if(o.type==='pod'){const socket=EDITOR_LIBRARY.supports[o.support],left=o.x-(o.flipped?56:40),right=o.x+(o.flipped?40:56);return {x:Math.min(o.x-socket[0],left),y:o.y-124,w:Math.max(o.x-socket[0]+160,right)-Math.min(o.x-socket[0],left),h:124+socket[1]};}
 const a=EDITOR_LIBRARY.sprites[o.asset];return {x:o.x-a.w/2,y:o.y-a.h/2,w:a.w,h:a.h};
}
function selectionWithAttachments(){const ids=new Set(selected);for(const o of selectedItems()){if(o.type==='vine')for(const l of [...state.leaves,...state.objects])if(l.vine===o.id)ids.add(l.id);}return entities().filter(o=>ids.has(o.id));}
function weatherAt(y=offset+H*.5){
 // Old saves retain their weather cues; they are not editable level objects.
 if(!state.sections.length){const progress=smooth(y/Math.max(H,state.height));return {rain:state.theme==='rain'?progress:0,wind:state.theme==='rain'?.25+progress*.64:.3};}
 const sections=[...state.sections].sort((a,b)=>a.y-b.y),active=state.sections.filter(s=>s.y<=y&&s.end>y);
 const s=active.at(-1)||sections.findLast(s=>s.y<=y)||sections[0]||{weather:0,wind:.3,y:0,end:H};
 const previous=active.length>1?active[0]:sections[Math.max(0,sections.indexOf(s)-1)]||s;
 let blend=smooth((y-s.y)/Math.min(220,Math.max(1,(s.end-s.y)*.4)));
 if(active.length>1)blend*=smooth((s.end-y)/Math.min(180,(s.end-s.y)*.3));
 return {rain:previous.weather*(1-blend)+s.weather*blend,wind:previous.wind*(1-blend)+s.wind*blend};
}
function clock(){return colliderEditTime??inspectionClock??sceneClock;}
function obstacleParts(o,t,fallTimes=null){
 const parts=[],add=(asset,frame,x,y,w,h,angle=0,pivot=null)=>parts.push({asset,frame,x,y,w,h,angle,pivot,id:o.id,type:o.type});
 if(o.type==='pod'){
  const socket=EDITOR_LIBRARY.supports[o.support],x=o.x,y=sy(o.y);add(o.support,0,x-socket[0],y-socket[1],160,160);
  const phase=cycle((t/(o.period||8)+(o.phase||0))*31),k=Math.floor(phase),blend=phase-k,angle=EDITOR_LIBRARY.podAngles[k]*(1-blend)+EDITOR_LIBRARY.podAngles[Math.min(31,k+1)]*blend;
  const start=fallTimes?.get(o.id);const age=start===undefined?-1:t-start;
  if(o.falls&&o.asset==='pod-tawny'&&age>=o.warning){const fallen=age-o.warning;add('pod-tawny-stalk',0,x-40,y-6,96,128,angle,[40,6]);add('pod-tawny-falling',0,x-40+(o.fallDrift||0)*fallen,y-6+18*fallen+52.5*fallen*fallen,96,128,clamp(fallen,0,4)*.075*(o.side==='left'?1:-1)*(o.flipped?-1:1),[40,80]);}
  else {const warning=o.falls&&age>=0?clamp(age/o.warning):null;add(warning===null?o.asset:o.asset+'-warning',warning===null?0:8+warning*11,x-40,y-6,96,128,angle+(warning===null?0:EDITOR_LIBRARY.warningAngles[Math.min(31,Math.floor(8+warning*11))]),[40,6]);}
 }else if(o.type==='bee'){
  const middle=(o.left+o.right)/2,amp=(o.right-o.left)/2*(o.flipped?-1:1),phase=(t/(o.period||7)+(o.phase||0))*Math.PI*2;
  const x=o.x+middle+amp*Math.sin(phase),velocity=Math.cos(phase)*(o.flipped?-1:1),side=velocity>=0?'right':'left',y=sy(o.y)+1.3*Math.sin(t*2.1+(o.phase||0)*8)+.5*Math.sin(t*4.1);
  if(Math.abs(velocity)<.13){const f=clamp((velocity+.13)/.26)*7;add('bee-turn-motion',velocity<0?7-f:f,x-24,y-32,48,64);}else {add('bee-'+side,Math.floor(t*83+(o.phase||0)*32)%32,x-24,y-32,48,64);const passage=Math.floor(t/1.5);add('bee-antennae-'+side,noise(passage+o.x)>.5?cycle(t*17):31-cycle(t*17),x-24,y-32,48,64);}
 }else if(o.type==='lyric'){
  const a=EDITOR_LIBRARY.sprites[o.asset],pose=LyricPaper.pose(o,t);
  add(o.asset,0,o.x+pose.x-a.w/2,sy(o.y)+pose.y-a.h/2,a.w,a.h);
  Object.assign(parts.at(-1),{paper:pose,flipped:!!o.flipped,alpha:publicPlay&&preview?Campaign.objectPresence(o):1});
 }else if(state.forestArtwork&&o.forestFlower!==undefined){
  const flower=EDITOR_LIBRARY.forestFlowers[o.forestFlower],spec=EDITOR_LIBRARY.sprites[flower.asset];
  add(flower.asset,spec.count-1,o.x-flower.anchor[0],sy(o.y)-flower.anchor[1],spec.w,spec.h);
  Object.assign(parts.at(-1),{paintedPose:true});
 }else if(publicPlay&&preview&&state.mode==='climb'&&o.vine&&o.asset.startsWith('flower-')){
  const age=playState.blooms.get(o.id)??0,root=attachmentMaterial(o);
  if(state.forestArtwork){
   const flower=EDITOR_LIBRARY.forestFlowers[o.forestFlower];
   if(flower&&playState.blooms.has(o.id)){
    const spec=EDITOR_LIBRARY.sprites[flower.asset],frame=smooth(age/3.6)*(spec.count-1);
    add(flower.asset,frame,o.x-flower.anchor[0],sy(o.y)-flower.anchor[1],spec.w,spec.h);
    Object.assign(parts.at(-1),{paintedPose:true,reveal:1});
   }
  }else if(age>0){
   const asset=o.asset==='flower-daisy'?'flower-daisy-bloom':'flower-pink-bloom';
   add(asset,smooth((age-.6)/2.6)*5,o.x+root.x-20,sy(o.y+root.y)-48,40,54);
   Object.assign(parts.at(-1),{paintedPose:true,reveal:smooth(age/.6)});
  }
 }else{const a=EDITOR_LIBRARY.sprites[o.asset];add(o.asset,o.type==='scenery'?t*8+(o.x%11):0,o.x-a.w/2,sy(o.y)-a.h/2,a.w,a.h);}
 if(o.flipped&&o.type!=='bee')for(const p of parts){
  if(p.asset.startsWith('support-'))continue;
  p.mirrorX=o.type==='pod'?Math.round(p.x)+40:Math.round(o.x);
 }
 return parts;
}
const rotatedSprites=new Map();
function paintPart(g,p,alpha=1){
 alpha*=p.alpha??1;
 if(alpha<=0)return;
 const reach=Math.hypot(p.w,p.h)+40;
 if(p.y+reach<0||p.y-reach>H)return;
 if(p.paper){g.save();g.globalAlpha*=alpha;LyricPaper.draw(g,p.asset,p.paper,p.x+p.w/2,p.y+p.h/2,1,-1,p.flipped);g.restore();return;}
 if(p.reveal!==undefined){g.save();g.beginPath();const h=Math.ceil(p.h*p.reveal);g.rect(p.x,p.y+p.h-h,p.w,h);g.clip();paintPart(g,{...p,reveal:undefined},alpha);g.restore();return;}
 if(p.paintedPose){g.save();g.globalAlpha*=alpha;Art.pose(g,p.asset,p.frame,Math.round(p.x),Math.round(p.y),p.w,p.h);g.restore();return;}
 if(p.mirrorX!==undefined){g.save();g.translate(2*p.mirrorX,0);g.scale(-1,1);paintPart(g,{...p,mirrorX:undefined},alpha);g.restore();return;}
 if(p.y+p.h<-10||p.y>H+10)return;
 if(p.angle){const spec=EDITOR_LIBRARY.sprites[p.asset],entry=Art.image(spec.src);if(!entry.ready)return;const angle=Math.round(p.angle*90)/90;const key=p.asset+':'+Math.floor(p.frame)+':'+angle;
  let c=rotatedSprites.get(key);if(!c){c=document.createElement('canvas');c.width=p.w+40;c.height=p.h+40;const k=c.getContext('2d');k.imageSmoothingEnabled=false;k.translate(20+p.pivot[0],20+p.pivot[1]);k.rotate(-angle);Art.sprite(k,p.asset,p.frame,-p.pivot[0],-p.pivot[1],p.w,p.h);rotatedSprites.set(key,c);if(rotatedSprites.size>160)rotatedSprites.delete(rotatedSprites.keys().next().value);}
  g.save();g.globalAlpha*=alpha;g.drawImage(c,Math.round(p.x)-20,Math.round(p.y)-20);g.restore();
 }else Art.sprite(g,p.asset,p.frame,Math.round(p.x),Math.round(p.y),p.w,p.h,alpha);
}
function previewFallTimes(){if(inspectionClock===null||!item()||item().type!=='pod')return null;return new Map([[item().id,1]]);}
function render(){
 if(publicPlay){
  if(typeof Campaign==='undefined')return;
  if(Campaign.screen){Campaign.drawWelcome();return;}
  // Public startup must never fall through to the editor's temporary project.
  if(!preview)return;
 }
 if(publicPlay&&typeof Campaign!=='undefined')Campaign.uiLayout();
 ctx.setTransform(SCALE,0,0,SCALE,0,0);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,W,H);
 const t=clock(),weather=publicPlay&&preview?Campaign.sceneWeather(playState.maxY):weatherAt(offset+H*.5);
 backctx.setTransform(SCALE,0,0,SCALE,0,0);backctx.imageSmoothingEnabled=false;
 Scene.paint(backctx,state,offset,t,weather);
 ctx.save();
 paintBotany(ctx);
 drawnParts=[];const falls=preview&&typeof playState!=='undefined'?playState?.falls:previewFallTimes();
 for(const o of [...state.objects].sort((a,b)=>(a.type==='scenery'&&a.layer==='behind'?-1:a.type==='scenery'?1:0)-(b.type==='scenery'&&b.layer==='behind'?-1:b.type==='scenery'?1:0))){if(o.hidden||o.vine&&state.vines.find(v=>v.id===o.vine)?.hidden)continue;if(preview&&o.type==='lyric'&&playState?.collected.has(o.id))continue;for(const p of obstacleParts(o,t,falls)){drawnParts.push(p);paintPart(ctx,p,o.locked&&!preview ? .75 : 1);}}
 ctx.restore();
 if(preview&&typeof Campaign!=='undefined')Campaign.drawWorld(ctx);
 if(preview&&typeof drawPlayer==='function')drawPlayer();
 if(state.theme==='rain')Campaign.shadeRain(ctx,weather.rain);
 if(preview){drawLyricPickups(ctx);Campaign.drawRain(ctx);if(publicPlay)Campaign.drawHUD(ctx);}
 if(!publicPlay&&!preview&&!(typeof focusMode!=='undefined'&&focusMode))drawEditing();
 if(!(typeof focusMode!=='undefined'&&focusMode))paintColliders();
 if(!publicPlay)drawOverview();
}
function handle(x,y,kind,data,color='#ad2d7b'){ctx.fillStyle='#fff9d8';ctx.strokeStyle=color;ctx.lineWidth=1;ctx.fillRect(x-3,sy(y)-3,6,6);ctx.strokeRect(x-3.5,sy(y)-3.5,7,7);selectionHandles.push({x,y,kind,...data});}
function line(x1,y1,x2,y2,color='#bb2b7a',dash=true){ctx.strokeStyle=color;ctx.lineWidth=1;ctx.setLineDash(dash?[3,3]:[]);ctx.beginPath();ctx.moveTo(x1,sy(y1));ctx.lineTo(x2,sy(y2));ctx.stroke();ctx.setLineDash([]);}
function label(text,x,y){ctx.font='5px Departure';const w=ctx.measureText(text).width;ctx.fillStyle='#253932';ctx.fillRect(x-2,sy(y)-8,w+4,9);ctx.fillStyle='#fff9d8';ctx.fillText(text,x,sy(y)-1);}
function drawEditing(){
 selectionHandles=[];if(colliderEdit)return;
 for(const o of selectedItems()){if(o.hidden)continue;const b=worldBounds(o);ctx.strokeStyle=o.locked?'#f5cd62':'#b62c7c';ctx.lineWidth=1;ctx.strokeRect(Math.round(b.x)-2.5,Math.round(sy(b.y+b.h))-2.5,Math.round(b.w)+5,Math.round(b.h)+5);
  if(o.type==='vine'&&!o.locked)o.points.forEach((p,i)=>handle(p.x,p.y,'bend',{id:o.id,index:i}));
  if(o.type==='leaf'){const v=state.vines.find(v=>v.id===o.vine);if(v){const p=nearest(o.x,o.y,samples(v));line(o.x,o.y,p.x,p.y,'#fcf4a5');handle(p.x,p.y,'support',{id:o.id},'#188052');}}
  if(o.type==='bee'){line(o.x+o.left,o.y,o.x+o.right,o.y);handle(o.x+o.left,o.y,'patrol-left',{id:o.id});handle(o.x+o.right,o.y,'patrol-right',{id:o.id});label('PATROL',o.x+o.left,o.y+7);}
  if(o.type==='pod'&&o.falls){const y=o.y-o.approach;line(0,y,W,y);handle(o.x,y,'warning',{id:o.id});label('WARNING STARTS HERE',5,y+4);line(o.x,o.y-25,o.x+(o.fallDrift||0)*2,o.y-265,'#f5cd62');}
 }
 const start=state.start;if(start.y>=offset&&start.y<=offset+H){label('START',clamp(start.x-10,0,280),start.y+30);if(!selected.size)handle(start.x,start.y+17,'start',{},'#347a68');}
 for(const o of state.objects.filter(o=>o.type==='lyric'&&o.final&&!o.hidden)){label('FINAL LYRIC',clamp(o.x-20,0,265),o.y+28);}
 if(drag?.kind==='marquee'){const a=drag.start,b=drag.current;ctx.strokeStyle='#a82775';ctx.fillStyle='rgba(255,244,169,.15)';const x=Math.min(a.x,b.x),y=sy(Math.max(a.y,b.y)),w=Math.abs(a.x-b.x),h=Math.abs(a.y-b.y);ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);}
}
function drawOverview(){const c=$('overview'),g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);g.fillStyle='#1e3533';g.fillRect(0,0,100,717);const y=v=>717-v/state.height*717;
 g.strokeStyle='#a6c06f';g.lineWidth=2;for(const v of state.vines){if(v.hidden)continue;g.beginPath();v.points.forEach((p,i)=>i?g.lineTo(p.x/W*100,y(p.y)):g.moveTo(p.x/W*100,y(p.y)));g.stroke();}
 for(const o of [...state.leaves,...state.objects]){if(o.hidden)continue;g.fillStyle=o.type==='lyric'?'#fff4ae':o.type==='leaf'?'#d1df79':'#f59b8a';g.fillRect(o.x/W*100-3,y(o.y)-2,6,o.type==='bramble'?7:3);}
 const top=y(offset+H),height=H/state.height*717;g.fillStyle='rgba(255,248,206,.16)';g.fillRect(0,top,100,height);g.strokeStyle='#fff9d8';g.lineWidth=3;g.strokeRect(1.5,top,97,height);
}
function request(){if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;render();});}}
function editorTick(now){const dt=lastEditorTick?Math.min((now-lastEditorTick)/1000,.05):0;lastEditorTick=now;if(!document.body.classList.contains('puzzle-open')&&(typeof page==='undefined'||!page.endsWith('levels'))&&!preview&&!colliderEdit&&sceneryMoving&&inspectionClock===null){sceneClock+=dt;request();}requestAnimationFrame(editorTick);}
function syncScene(){$('backdrop').hidden=false;}
function node(tag,options={}){const el=document.createElement(tag);for(const [k,v] of Object.entries(options)){if(k==='text')el.textContent=v;else if(k==='class')el.className=v;else el[k]=v;}return el;}
function button(text,action,parent,options={}){const b=node('button',{text,...options});b.onclick=action;if(parent)parent.append(b);return b;}
function property(label,value,action,options={}){const wrap=node('label',{text:label}),input=node(options.choices?'select':options.multiline?'textarea':'input');
 if(options.choices){for(const [value,text] of options.choices){const opt=node('option',{value,text});input.append(opt);}}else input.type=options.type||'text';
 if(options.min!==undefined)input.min=options.min;if(options.max!==undefined)input.max=options.max;if(options.step!==undefined)input.step=options.step;
 input.value=String(value??'');input.onchange=()=>{const v=['range','number'].includes(input.type)?Number(input.value):input.value;if(['range','number'].includes(input.type)&&!Number.isFinite(v))return;change(()=>action(v));};wrap.append(input);$('properties').append(wrap);return input;}
function checkProperty(parent,text,value,action){const label=node('label',{class:'toggle-control check-row'}),input=node('input',{type:'checkbox',checked:!!value});input.setAttribute('role','switch');input.onchange=()=>change(()=>action(input.checked));label.append(input,document.createTextNode(text));parent.append(label);return input;}
function assetChoices(entries,current,action){
 const choices=node('div',{class:'asset-choices'});
 for(const entry of entries){const b=button('',()=>change(()=>action(entry)),choices,{class:'asset'+(entry.key===current?' active':''),title:entry.title});b.setAttribute('aria-pressed',String(entry.key===current));const c=node('canvas',{width:110,height:76});c.dataset.asset=entry.key;c.dataset.flipped=String(!!entry.flipped);b.append(c,node('span',{text:entry.title}));miniature(c,entry);}
 $('properties').append(choices);
}
function sync(){
 LyricPaper.assign(project);
 if(publicPlay)return;
 syncColliderTools();$('object-list').hidden=false;
 offset=clamp(offset,0,state.height-H);$('current-level').textContent=state.name;$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;
 const props=$('properties');props.replaceChildren();const list=selectedItems(),o=item();$('selection-actions').hidden=!list.length;$('flip').disabled=selectionWithAttachments().some(o=>!editable(o));
 $('selection-title').textContent=list.length>1?list.length+' objects':o?({vine:'Vine',leaf:'Leaf',bramble:'Bramble',bee:'Bee',pod:o.asset==='pod-olive'?'Green pod':'Brown pod',lyric:'Lyric',scenery:'Flower'}[o.type]):'Select an object';
 $('encounter-controls').hidden=preview||!o||!['bee','pod'].includes(o.type)||list.length>1;
 if(list.length===1&&o){
  if(o.type==='vine'){
   const bends=node('div',{class:'pair'});
   button('Add bend',()=>change(()=>{const y=offset+H/2;let index=1,best=Infinity;for(let i=1;i<o.points.length;i++){const a=o.points[i-1],b=o.points[i],distance=Math.abs((a.y+b.y)/2-y);if(distance<best){index=i;best=distance;}}const a=o.points[index-1],b=o.points[index];o.points.splice(index,0,{x:Math.round((a.x+b.x)/2),y:Math.round((a.y+b.y)/2)});selectedPoint={id:o.id,index};}),bends);
   button('Remove bend',()=>{if(selectedPoint?.id===o.id&&o.points.length>2)change(()=>{o.points.splice(selectedPoint.index,1);selectedPoint=null;});},bends,{disabled:selectedPoint?.id!==o.id||o.points.length<=2});props.append(bends);
  }
  if(o.type==='leaf'){
   button(state.start.leafId===o.id?'Start leaf':'Start here',()=>change(()=>{state.start={x:o.x,y:leafSurface(o,o.x),leafId:o.id};}),props,{disabled:state.start.leafId===o.id});
  }
  if(o.type==='bee'){
   const choices=node('div',{class:'speed-buttons'});for(const [name,period] of [['Slow',12],['Normal',7],['Fast',3.5]])button(name,()=>change(()=>{o.period=period;}),choices,{class:Math.abs((o.period||7)-period)<.1?'active':''});props.append(choices);
  }
  if(o.type==='pod'){
   if(o.asset==='pod-tawny'){checkProperty(props,'Falls',o.falls,v=>{o.falls=v;});if(o.falls)property('Warning · seconds',o.warning,v=>{o.warning=clamp(v,.3,5);},{type:'number',min:.3,max:5,step:.1});}
  }
  if(o.type==='bramble')assetChoices(paletteItems.obstacles.filter(e=>e.type==='bramble'&&e.side===o.side),o.asset,e=>{o.asset=e.key;o.side=e.side;const art=EDITOR_LIBRARY.sprites[o.asset];o.x=e.side==='left'?art.w/2-14:W-art.w/2+14;});
  if(o.type==='lyric'){property('Words',o.text||'',v=>{o.text=v.slice(0,1999);},{multiline:true});checkProperty(props,'Last lyric',o.final,v=>{if(v)for(const other of state.objects)if(other.type==='lyric')other.final=false;o.final=v;});}
  if(o.type==='scenery'){
   if(o.asset.startsWith('flower-'))assetChoices(paletteItems.scenery.filter(e=>e.key.startsWith('flower-')).map(e=>({...e,flipped:o.flipped})),o.asset,e=>{o.asset=e.key;});
   checkProperty(props,'In front',o.layer==='front',v=>{o.layer=v?'front':'behind';});
  }
  if(o.locked)button('Unlock',()=>change(()=>{o.locked=false;}),props);
  if(o.hidden)button('Show',()=>change(()=>{o.hidden=false;}),props);
 }
 buildObjectList();colliderInspector();if(typeof syncInterface==='function')syncInterface();
}
function buildObjectList(){const box=$('object-list');box.replaceChildren();for(const o of entities().filter(o=>o.locked||o.hidden)){const row=node('div',{class:'object-row'});button((o.hidden?'Show ':'Unlock ')+(o.name||o.type),()=>change(()=>{o.hidden=false;o.locked=false;}),row);box.append(row);}}
function focusItem(id){const o=item(id);if(!o)return;const b=worldBounds(o);offset=clamp(b.y+b.h/2-H/2,0,state.height-H);select(id);botanyDirty=true;}
const paletteItems={
 objects:[{key:'pod-tawny-right',asset:'pod-tawny',title:'Brown pod',type:'pod',side:'right'},{key:'pod-olive-right',asset:'pod-olive',title:'Green pod',type:'pod',side:'right'},{key:'bee-right',title:'Bee',type:'bee',side:'right'},{key:'long-bramble-left-s',title:'Bramble',type:'bramble',side:'left'},{key:'lyric-fragment-01',title:'Lyric',type:'lyric'}],
 platforms:[{key:'vine-sweep',title:'Curved',type:'vine'},{key:'vine-diagonal',title:'Diagonal',type:'vine'},{key:'leaf',title:'Leaf',type:'leaf',side:'left'}],
 obstacles:[...['left','right'].flatMap(side=>['s','arch'].map(form=>({key:'long-bramble-'+side+'-'+form,title:form==='s'?'Bend':'Arch',type:'bramble',side}))),...['left','right'].map(side=>({key:'bee-'+side,title:'Bee · '+side,type:'bee',side})),...['olive','tawny'].flatMap(color=>['left','right'].map(side=>({key:'pod-'+color+'-'+side,asset:'pod-'+color,title:(color==='olive'?'Green':'Brown')+' pod · '+side,type:'pod',side}))),...['left','right'].map(side=>({key:'bramble-'+side+'-rise',title:'Short',type:'bramble',side}))],
 lyrics:LyricPaper.names.map((key,i)=>({key,title:String(i+1),type:'lyric'})),
 scenery:[...['daisy','pink','bud','bell'].map(name=>({key:'flower-'+name,title:name==='pink'?'Pink flower':name[0].toUpperCase()+name.slice(1),type:'scenery'})),{key:'birds',title:'Distant bird',type:'scenery'},{key:'seeds',title:'Drifting seed',type:'scenery'}]
};
function paletteItem(key){return Object.values(paletteItems).flat().find(o=>o.key===key);}
const vineThumbnails=new Map();
function miniature(c,entry){const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.clearRect(0,0,c.width,c.height);if(entry.type==='leaf'){const im=imgs[entry.side];if(im.complete&&im.naturalWidth){const height=(c.width-10)*33/80;g.drawImage(im,5,(c.height-height)/2,c.width-10,height);};return;}
 if(entry.type==='vine'){
  if(!vineThumbnails.has(entry.key)){
   const previous=state,view=offset;
   const points=entry.key==='vine-diagonal'?[{x:65,y:-50},{x:160,y:350},{x:245,y:780}]:[{x:85,y:-50},{x:100,y:170},{x:230,y:450},{x:150,y:780}];
   state={...state,vines:[{id:'thumbnail',points}],leaves:[],objects:[]};offset=0;renderBotany();
   const copy=document.createElement('canvas');copy.width=330;copy.height=717;copy.getContext('2d').drawImage(botany,0,0);vineThumbnails.set(entry.key,copy);
   state=previous;offset=view;botanyDirty=true;
  }
  const w=c.height*250/717;g.drawImage(vineThumbnails.get(entry.key),40,0,250,717,(c.width-w)/2,0,w,c.height);return;
 }
 const name=entry.asset||entry.key,s=EDITOR_LIBRARY.sprites[name];if(!s)return;const scale=Math.min((c.width-6)/s.w,(c.height-6)/s.h);g.save();if(entry.flipped){g.translate(c.width,0);g.scale(-1,1);}Art.sprite(g,name,0,(c.width-s.w*scale)/2,(c.height-s.h*scale)/2,s.w*scale,s.h*scale);g.restore();
}
function buildPalette(){
 if(publicPlay)return;
 const box=$('palette');box.replaceChildren();
 const entries=[...(state.mode==='climb'?paletteItems.platforms:[]),...paletteItems.objects,...(state.mode==='climb'?[{...paletteItems.scenery[0],title:'Flower'}]:[])];
 for(const entry of entries){const b=button('',()=>choosePlacement(entry.key),box,{class:'asset',draggable:true,title:entry.title});b.dataset.kind=entry.type;b.dataset.key=entry.key;const c=node('canvas',{width:110,height:76});c.dataset.asset=entry.key;c.dataset.flipped=String(!!entry.flipped);b.append(c,node('span',{text:entry.title}));miniature(c,entry);b.ondragstart=e=>{choosePlacement(entry.key);e.dataTransfer.setData('application/ladybug-item',entry.key);};b.ondragend=()=>donePlacing();}
}
function buildCards(){
 if(publicPlay)return;
 const box=$('level-cards'),scroll=box.scrollLeft;box.replaceChildren();
 if(!project.levels.length){box.append(node('p',{text:'Your next adventure starts here. Add a new level.'}));return;}
 project.levels.forEach((l,i)=>{
  const card=node('article',{class:'level-card',draggable:true});card.dataset.id=l.id;card.setAttribute('aria-label',l.name);card.tabIndex=0;
  const c=node('canvas',{width:400,height:220});c.dataset.level=l.id;
  card.append(node('span',{class:'level-order',text:String(i+1).padStart(2,'0')+' / '+String(project.levels.length).padStart(2,'0')}),c);
  const name=node('label',{text:'Level name'}),input=node('input',{value:l.name,maxLength:120});input.setAttribute('aria-label','Level name');input.onchange=()=>{const value=input.value.trim();if(!value){input.value=l.name;return;}change(()=>{l.name=value;});card.setAttribute('aria-label',value);};name.append(input);card.append(name);
  const actions=node('div',{class:'card-actions'});
  button('Edit level',()=>openLevelEditor(l.id),actions,{class:'edit-level primary'});
  button('Play',()=>playLevelCard(l.id),actions);
  const remove=button('Delete',()=>{if(remove.dataset.confirm){removeLevel(l);tell('Level deleted. Undo is available in Files.');}else{remove.dataset.confirm='true';remove.textContent='Delete?';setTimeout(()=>{if(remove.isConnected){delete remove.dataset.confirm;remove.textContent='Delete';}},5000);}},actions);
  card.append(actions);box.append(card);drawCard(c,l);if(typeof bindLevelDrag==='function')bindLevelDrag(card,l);
 });box.scrollLeft=scroll;
}
const cardScenes=new WeakMap();
function drawCard(c,l){
 let scene=cardScenes.get(c);if(!scene){scene=document.createElement('canvas');scene.width=W;scene.height=H;cardScenes.set(c,scene);}
 const g=scene.getContext('2d');g.imageSmoothingEnabled=false;Scene.paint(g,l,0,0,{rain:l.theme==='rain'?.2:0,wind:.3});
 const out=c.getContext('2d');out.imageSmoothingEnabled=false;const crop=W*c.height/c.width;out.clearRect(0,0,c.width,c.height);out.drawImage(scene,0,H-crop,W,crop,0,0,c.width,c.height);
}
function addItem(key,p){if(colliderEdit)endColliderEdit();const entry=paletteItem(key);if(!entry)return;if(entry.type==='leaf'&&!state.vines.length){tell('Add a vine before attaching a leaf.');return;}change(()=>{
 const o={id:uid(),type:entry.type,x:Math.round(p.x),y:Math.round(p.y),asset:entry.asset||key};
 if(o.type==='vine'){delete o.asset;delete o.x;delete o.y;const points=key==='vine-diagonal'?[{x:-85,y:-410},{x:0,y:0},{x:80,y:415}]:[{x:-45,y:-410},{x:-65,y:-200},{x:55,y:90},{x:10,y:415}];o.points=points.map(q=>({x:clamp(q.x+p.x,12,318),y:Math.round(q.y+p.y)}));state.vines.push(o);}
 else if(o.type==='leaf'){delete o.asset;o.x=clamp(o.x,42,W-42);o.side=entry.side;const available=state.vines.filter(v=>!v.hidden);o.vine=(available.length?available:state.vines).map(v=>({id:v.id,d:nearest(o.x,o.y,samples(v)).dist})).sort((a,b)=>a.d-b.d)[0].id;state.leaves.push(o);}
 else{if(o.type==='bee')Object.assign(o,{left:-30,right:30,period:7,phase:entry.side==='left'?.5:0});if(o.type==='pod')Object.assign(o,{side:entry.side,support:'support-'+entry.side+'-low',falls:o.asset==='pod-tawny',approach:260,warning:1.4,period:8,phase:.1,fallDrift:entry.side==='left'?-5:5});if(o.type==='bramble'){o.side=entry.side;const s=EDITOR_LIBRARY.sprites[o.asset];o.x=entry.side==='left'?s.w/2-14:W-s.w/2+14;}if(o.type==='lyric')Object.assign(o,{asset:LyricPaper.next(project),text:'',final:!state.objects.some(o=>o.type==='lyric'&&o.final)});if(o.type==='scenery'){o.layer='behind';if(o.asset.startsWith('flower-')&&state.vines.length){o.vine=state.vines.filter(v=>!v.hidden).map(v=>({id:v.id,d:nearest(o.x,o.y,samples(v)).dist})).sort((a,b)=>a.d-b.d)[0]?.id;}}state.objects.push(o);}selected=new Set([o.id]);selection=o.id;
 });}
function remapCopies(items){const map=new Map(items.map(o=>[o.id,uid()])),groups=new Map();return items.map(o=>{const c=clone(o);c.id=map.get(o.id);c.hidden=false;c.locked=false;if(c.vine)c.vine=map.get(c.vine)||c.vine;if(c.group){if(!groups.has(c.group))groups.set(c.group,uid());c.group=groups.get(c.group);}if(c.type==='lyric')c.final=false;return c;});}
function translate(items,dx,dy){for(const o of items){if(o.type==='vine')o.points=o.points.map(p=>({x:Math.round(p.x+dx),y:Math.round(p.y+dy)}));else{o.x=Math.round(o.x+dx);o.y=Math.round(o.y+dy);}}}
function insertCopies(copies){for(const o of copies){if(o.type==='vine')state.vines.push(o);else if(o.type==='leaf'){if(!state.vines.some(v=>v.id===o.vine)){if(!state.vines.length)continue;o.vine=state.vines.map(v=>({id:v.id,d:nearest(o.x,o.y,samples(v)).dist})).sort((a,b)=>a.d-b.d)[0].id;}state.leaves.push(o);}else state.objects.push(o);}selected=new Set(copies.map(o=>o.id));selection=copies[0]?.id||null;}
function copySelection(){return clone(selectionWithAttachments());}
function moveSelection(dx,dy){translate(selectionWithAttachments().filter(editable),dx,dy);}
function flipSelection(){
 const objects=selectionWithAttachments();
 if(!objects.length||objects.some(o=>!editable(o)))return;
 const roots=selectedItems(),xs=roots.flatMap(o=>o.type==='vine'?o.points.map(p=>p.x):[o.x]);
 const axis=(Math.min(...xs)+Math.max(...xs))/2;
 const opposite=side=>side==='left'?'right':'left';
 change(()=>{
  for(const o of objects){
   if(o.type==='vine'){for(const p of o.points)p.x=2*axis-p.x;continue;}
   o.x=2*axis-o.x;
   if(o.type==='leaf')o.side=opposite(o.side);
   else if(o.type==='bramble'){
    const side=o.side;o.side=opposite(side);o.asset=o.asset.replace('-'+side+'-','-'+o.side+'-');
   }else{
    if(o.flipped)delete o.flipped;else o.flipped=true;
    if(o.type==='bee'){
     const left=o.left;o.left=-o.right;o.right=-left;
     o.asset=o.asset==='bee-left'?'bee-right':'bee-left';
    }
    if(o.type==='pod'){
     o.side=opposite(o.side);o.support='support-'+o.side+(o.support.endsWith('high')?'-high':'-low');
     if(o.fallDrift!==undefined)o.fallDrift=-o.fallDrift;
    }
   }
   for(const key of ['collider','supportCollider'])if(o[key])o[key].dx=-o[key].dx;
  }
 });
}
function duplicateSelection(){if(!selected.size)return;change(()=>{const copies=remapCopies(copySelection());translate(copies,12,80);insertCopies(copies);const max=Math.max(...copies.map(o=>o.type==='vine'?Math.max(...o.points.map(p=>p.y)):o.y+100));state.height=Math.max(state.height,max+80);});}
function removeSelection(){if(!selected.size)return;const locked=selectedItems().some(o=>o.locked);if(locked){tell('Unlock the selected objects before deleting them.');return;}change(()=>{const ids=new Set(selectionWithAttachments().map(o=>o.id));state.vines=state.vines.filter(o=>!ids.has(o.id));state.leaves=state.leaves.filter(o=>!ids.has(o.id)&&!ids.has(o.vine));state.objects=state.objects.filter(o=>!ids.has(o.id)&&!ids.has(o.vine));selected.clear();selection=null;});}
let selectedPoint=null;
function hit(p){
 for(const part of [...drawnParts].reverse()){const o=item(part.id);if(!editable(o))continue;let x=(part.mirrorX===undefined?p.x:2*part.mirrorX-p.x)-part.x,y=sy(p.y)-part.y;if(part.angle){const px=x-part.pivot[0],py=y-part.pivot[1],c=Math.cos(part.angle),s=Math.sin(part.angle);x=part.pivot[0]+c*px-s*py;y=part.pivot[1]+s*px+c*py;}if(Art.opaque(part.asset,part.frame,x,y))return o;}
 for(const l of [...state.leaves].reverse()){if(!editable(l)||state.vines.find(v=>v.id===l.vine)?.hidden)continue;const x=p.x-l.x+40,y=l.y-p.y+16;if(x>=0&&x<80&&y>=0&&y<33){const pixels=Art.pixels('assets/leaf-'+l.side+'-joined.png');if(!pixels||pixels.data[(Math.floor(y)*80+Math.floor(x))*4+3]>100)return l;}}
 for(const v of [...state.vines].reverse()){if(editable(v)&&nearest(p.x,p.y,samples(v)).dist<225)return v;}return null;
}
function beginMutation(){if(!drag.mutated){checkpoint();drag.mutated=true;}}
canvas.addEventListener('pointerdown',e=>{
 if(preview||!e.isPrimary||e.button!==0)return;canvas.focus({preventScroll:true});const p=coords(e),h=selectionHandles.find(h=>Math.hypot(h.x-p.x,h.y-p.y)<(e.pointerType==='touch'?17:8));
 if(colliderPointerDown(e,p))return;selectedPoint=null;if(h){if(h.id&&item(h.id)?.locked)return;drag={kind:h.kind,handle:h,start:p,original:h.id?clone(item(h.id)):clone(state.start)};if(h.kind==='bend')selectedPoint={id:h.id,index:h.index};sync();}
 else{const o=hit(p);if(o){if(e.shiftKey||multiSelectMode){const ids=new Set(selected);ids.has(o.id)?ids.delete(o.id):ids.add(o.id);select([...ids]);}else if(!selected.has(o.id))select(o.id);
  const originals=clone(selectionWithAttachments().filter(editable));
  drag={kind:'move',start:p,originals};
 }else{if(!e.shiftKey)select([]);drag=e.pointerType==='touch'&&!multiSelectMode?{kind:'pan',start:p,offset,clientY:e.clientY}:{kind:'marquee',start:p,current:p,previous:[...selected]};}}
 canvas.setPointerCapture(e.pointerId);request();
});
canvas.addEventListener('pointermove',e=>{
 if(!drag)return;if(drag.kind==='pan'){const r=canvas.getBoundingClientRect();offset=clamp(drag.offset+(e.clientY-drag.clientY)*H/r.height,0,state.height-H);request();return;}const p=coords(e);if(drag.kind.startsWith('collider-')){moveCollider(p);return;}const dx=Math.round(p.x-drag.start.x),dy=Math.round(p.y-drag.start.y);if(drag.kind==='marquee'){drag.current=p;request();return;}if(Math.abs(dx)+Math.abs(dy)<1&&!drag.mutated)return;
 beginMutation();const h=drag.handle,o=h?.id?item(h.id):null;
 if(drag.kind==='move'){
  const copies=clone(drag.originals);translate(copies,dx,dy);for(const c of copies){const dest=item(c.id);if(dest)Object.assign(dest,c);}
 }else if(drag.kind==='bend'){o.points[h.index]={x:Math.round(p.x),y:Math.round(p.y)};}
 else if(drag.kind==='patrol-left')o.left=Math.min(Math.round(p.x-o.x),o.right-4);
 else if(drag.kind==='patrol-right')o.right=Math.max(Math.round(p.x-o.x),o.left+4);
 else if(drag.kind==='warning')o.approach=clamp(Math.round(o.y-p.y),40,1000);
 else if(drag.kind==='start'){state.start={x:Math.round(p.x),y:Math.round(p.y)};}
 else if(drag.kind==='support'){const v=state.vines.filter(v=>!v.hidden).map(v=>({id:v.id,d:nearest(p.x,p.y,samples(v)).dist})).sort((a,b)=>a.d-b.d)[0];if(v){o.vine=v.id;tell('Connection preview: Vine '+(state.vines.findIndex(x=>x.id===v.id)+1)+'. Release to attach.');}}
 botanyDirty=true;request();
});
function endDrag(cancelled=false){if(!drag)return;if(drag.kind==='marquee'&&!cancelled){const {start:a,current:b}=drag,x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(a.x-b.x),h=Math.abs(a.y-b.y);if(w+h>4){const list=entities().filter(editable).filter(o=>{const box=worldBounds(o);return box.x<x+w&&box.x+box.w>x&&box.y<y+h&&box.y+box.h>y;});select([...new Set([...drag.previous,...list.map(o=>o.id)])]);}}
 if(drag.kind==='start'&&drag.mutated&&!cancelled&&state.mode==='climb'){const leaf=state.leaves.filter(l=>!l.hidden&&!state.vines.find(v=>v.id===l.vine)?.hidden).sort((a,b)=>Math.hypot(a.x-state.start.x,a.y-state.start.y)-Math.hypot(b.x-state.start.x,b.y-state.start.y))[0];if(leaf)state.start={x:leaf.x,y:leafSurface(leaf,leaf.x),leafId:leaf.id};}
 const mutated=drag.mutated;drag=null;if(mutated){if(cancelled){const previous=undo.pop();if(previous){project=previous.project;state=project.levels.find(l=>l.id===project.active)||project.levels[0];offset=previous.offset;}}save();}else request();}
canvas.addEventListener('pointerup',()=>endDrag());canvas.addEventListener('pointercancel',()=>endDrag(true));
canvas.addEventListener('dblclick',e=>{if(preview||colliderEdit)return;const p=coords(e),o=hit(p);if(o?.type!=='vine'||o.locked)return;change(()=>{const path=samples(o);const q=nearest(p.x,p.y,path);let k=1;let distance=Infinity;for(let i=1;i<o.points.length;i++){const a=o.points[i-1],b=o.points[i],d=Math.hypot(a.x-q.x,a.y-q.y)+Math.hypot(b.x-q.x,b.y-q.y);if(d<distance){distance=d;k=i;}}o.points.splice(k,0,{x:Math.round(q.x),y:Math.round(q.y)});selectedPoint={id:o.id,index:k};});});
$('stage').addEventListener('wheel',e=>{if(e.target.closest('#campaign-selector')||e.ctrlKey||e.metaKey)return;if(preview){e.preventDefault();return;}e.preventDefault();offset=clamp(offset-e.deltaY*.65,0,state.height-H);request();},{passive:false});
let navigating=false;function navigate(e){const r=$('overview').getBoundingClientRect(),y=(1-clamp((e.clientY-r.top)/r.height))*state.height;offset=clamp(y-H/2,0,state.height-H);sync();request();}
$('overview').onpointerdown=e=>{if(preview)return;navigating=true;$('overview').setPointerCapture(e.pointerId);navigate(e);};$('overview').onpointermove=e=>{if(navigating)navigate(e);};$('overview').onpointerup=()=>{navigating=false;};$('overview').onpointercancel=()=>{navigating=false;};
canvas.addEventListener('dragover',e=>{if(!preview&&!colliderEdit)e.preventDefault();});canvas.addEventListener('drop',e=>{if(preview||colliderEdit)return;e.preventDefault();const p=coords(e),key=e.dataTransfer.getData('application/ladybug-item');if(key)addItem(key,p);});
window.addEventListener('keydown',e=>{
 if(preview||hasInputFocus(e))return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();editHistory(!e.shiftKey);return;}
 if(e.code==='Escape'){if(colliderEdit){if(drag)endDrag(true);endColliderEdit();return;}select([]);selectedPoint=null;return;}
 if(colliderEdit){const v={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[e.code];if(v){e.preventDefault();change(()=>{const o=colliderOwner(),c=colliderConfig(o[colliderEdit.key]),n=e.shiftKey?10:1;c.dx=clamp(c.dx+v[0]*n,-660,660);c.dy=clamp(c.dy+v[1]*n,-660,660);o[colliderEdit.key]=c;});}return;}
 if(e.code==='Delete'||e.code==='Backspace'){e.preventDefault();if(selectedPoint){const {id,index}=selectedPoint,v=item(id);if(v?.type==='vine'&&!v.locked&&v.points.length>2){change(()=>v.points.splice(index,1));selectedPoint=null;}else tell('A vine needs at least two bend points.');}else removeSelection();return;}
 if((e.metaKey||e.ctrlKey)&&e.code==='KeyD'){e.preventDefault();duplicateSelection();return;}
 const vector={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[e.code];if(vector){e.preventDefault();if(selected.size){change(()=>moveSelection(vector[0]*(e.shiftKey?10:1),vector[1]*(e.shiftKey?10:1)));}else{offset=clamp(offset+vector[1]*(e.shiftKey?H:100),0,state.height-H);sync();request();}}
});
function exportFile(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=node('a',{href:url,download:name});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('file-menu').hidden=true;}
function importedFresh(level){const l=clone(level);l.id=uid();return l;}
$('export-game').onclick=()=>exportFile(project,'published-levels.json');$('export-level').onclick=()=>exportFile({version:2,level:state},'ladybug-'+state.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.json');
$('open-project').onclick=()=>{loadMode='project';$('file').click();};$('import-level').onclick=()=>{loadMode='level';$('file').click();};
$('file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>25*1024*1024)throw Error('size');const data=JSON.parse(await file.text());if(loadMode==='project'){if(!validateProject(data))throw Error('project');change(()=>{project=data;state=project.levels.find(l=>l.id===project.active)||project.levels[0]||gardenLevel();offset=0;selected.clear();selection=null;});}else{let l;if(legacyValid(data))l=fromLegacy(data);else if(data.version===2&&validateLevel(data.level))l=importedFresh(data.level);else if(validateLevel(data))l=importedFresh(data);else throw Error('level');change(()=>project.levels.push(l));switchLevel(l.id);}buildCards();buildPalette();syncScene();$('file-menu').hidden=true;tell('Opened your editable level data.');}catch{tell('This file could not be opened as a saved Ladybug project or level. Your current work is unchanged.');}e.target.value='';};
$('levels-toggle').onclick=()=>{const open=$('level-drawer').hidden;$('level-drawer').hidden=!open;$('asset-drawer').hidden=open;$('levels-toggle').setAttribute('aria-expanded',String(open));if(open)buildCards();};
$('files-toggle').onclick=()=>{const open=$('file-menu').hidden;$('file-menu').hidden=!open;$('files-toggle').setAttribute('aria-expanded',String(open));};
$('add-level').onclick=()=>{$('level-templates').hidden=!$('level-templates').hidden;};
for(const [name,factory] of [['Garden',()=>gardenLevel()],['Rain',()=>gardenLevel(true)],['Dandelion',flightLevel]])button(name,()=>{const l=factory();change(()=>project.levels.push(l));switchLevel(l.id);$('level-templates').hidden=true;if(typeof openLevelEditor==='function')openLevelEditor(l.id);},$('template-options'),{class:'template'});
$('undo').onclick=()=>editHistory(true);$('redo').onclick=()=>editHistory(false);$('duplicate').onclick=duplicateSelection;$('flip').onclick=flipSelection;$('delete').onclick=removeSelection;
$('extend').onclick=()=>change(()=>{state.height+=H;offset=state.height-H;const v=item();if(v?.type==='vine')v.points.push({x:v.points.at(-1).x,y:state.height+30});});
$('motion-toggle').onclick=()=>{sceneryMoving=!sceneryMoving;inspectionClock=null;$('motion-toggle').textContent=sceneryMoving?'Pause scenery':'Resume scenery';$('motion-toggle').setAttribute('aria-pressed',String(sceneryMoving));syncScene();request();};
$('encounter-time').oninput=e=>{inspectionClock=Number(e.target.value);request();};$('encounter-replay').onclick=()=>{inspectionClock=null;sceneClock=0;sceneryMoving=true;syncScene();request();};
Art.changed=()=>{if(!publicPlay){for(const c of document.querySelectorAll('canvas[data-asset]')){const entry=paletteItem(c.dataset.asset);if(entry)miniature(c,{...entry,flipped:c.dataset.flipped==='true'});}if(!$('level-drawer').hidden)for(const c of document.querySelectorAll('canvas[data-level]')){const l=project.levels.find(l=>l.id===c.dataset.level);if(l)drawCard(c,l);}if(colliderEdit)sync();}request();};
restore();sync();if(!publicPlay){initColliderTools();buildPalette();requestAnimationFrame(editorTick);}syncScene();request();
