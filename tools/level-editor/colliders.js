'use strict';

// Collision edits transform the existing mask; the artwork and its animation stay intact.
let collidersVisible=false,colliderEdit=null,colliderEditTime=null;
const colliderDefaults=()=>({sx:1,sy:1,dx:0,dy:0});
const colliderConfig=value=>({...colliderDefaults(),...value});
function validCollider(c){return c===undefined||!!c&&typeof c==='object'&&!Array.isArray(c)&&['sx','sy'].every(k=>Number.isFinite(c[k])&&c[k]>=.05&&c[k]<=4)&&['dx','dy'].every(k=>Number.isFinite(c[k])&&Math.abs(c[k])<=660);}
function hasCollider(o){return !!o&&['leaf','lyric','bee','pod','bramble'].includes(o.type);}
const colliderFrames=new Map();
function collisionFrame(part){
 const spec=EDITOR_LIBRARY.sprites[part.asset],pixels=spec&&Art.pixels(spec.src);if(!pixels)return null;
 const role=part.collisionRole||'paint',f=role==='body'&&Number.isInteger(spec.bodyFrame)?spec.bodyFrame:((Math.floor(part.frame)%spec.count)+spec.count)%spec.count,key=part.asset+':'+f+':'+role;
 let frame=colliderFrames.get(key);
 if(!frame){
  const [trimX,trimY,cellW,cellH]=spec.trim||[0,0,spec.w,spec.h],ox=f%spec.cols*cellW,oy=Math.floor(f/spec.cols)*cellH,mask=new Uint8Array(spec.w*spec.h);
  const pixel=(x,y,c)=>x<trimX||y<trimY||x>=trimX+cellW||y>=trimY+cellH?0:pixels.data[((oy+y-trimY)*pixels.w+ox+x-trimX)*4+c];
  let red={left:spec.w,right:0,top:spec.h,bottom:0};
  if(role==='body')for(let y=0;y<spec.h;y++)for(let x=0;x<spec.w;x++){
   const r=pixel(x,y,0),g=pixel(x,y,1),b=pixel(x,y,2);
   if(pixel(x,y,3)>200&&r>90&&r>g*1.55&&r>b*1.3){red.left=Math.min(red.left,x);red.right=Math.max(red.right,x);red.top=Math.min(red.top,y);red.bottom=Math.max(red.bottom,y);}
  }
  let left=spec.w,right=0,top=spec.h,bottom=0;
  const bee=part.asset.startsWith('bee-');
  for(let y=0;y<spec.h;y++)for(let x=0;x<spec.w;x++){
   if(pixel(x,y,3)<200)continue;
   if(role==='body'&&(x<red.left-3||x>red.right+3||y<red.top-6||y>red.bottom+1))continue;
   if(role==='canopy'&&y>68)continue;
   if(role==='solid'&&bee){
    const r=pixel(x,y,0),g=pixel(x,y,1),b=pixel(x,y,2);
    // Pale wings and separate antenna artwork aren't the bee's body.
    if(part.asset.includes('antennae')||y<spec.h*.49||b>r*.72&&g>75)continue;
   }
   if(role!=='paint'){
    let neighbours=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(pixel(x+dx,y+dy,3)>200)neighbours++;
    // Trim soft borders and isolated one-pixel hairs without filling gaps.
    if(neighbours<(role==='canopy'?5:7))continue;
   }
   mask[y*spec.w+x]=1;left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);
  }
  frame={pixels,spec,ox,oy,left,right,top,bottom,mask};colliderFrames.set(key,frame);
 }
 return frame.right>frame.left?frame:null;
}
function collisionPart(part){
 if(part.mirrorX!==undefined){
  const source=collisionPart({...part,mirrorX:undefined});if(!source)return null;
  return {box:{...source.box,x:2*part.mirrorX-source.box.x-source.box.w},contains(x,y){return source.contains(2*part.mirrorX-x,y);}};
 }
 const f=collisionFrame(part);if(!f)return null;
 const x=Math.round(part.x),y=Math.round(part.y),angle=Math.round((part.angle||0)*90)/90,c=Math.cos(angle),s=Math.sin(angle),px=part.pivot?.[0]||0,py=part.pivot?.[1]||0;
 const toScene=(u,v)=>{const a=u*part.w/f.spec.w-px,b=v*part.h/f.spec.h-py;return {x:x+px+c*a+s*b,y:y+py-s*a+c*b};};
 const corners=[[f.left,f.top],[f.right,f.top],[f.left,f.bottom],[f.right,f.bottom]].map(([u,v])=>toScene(u,v));
 const left=Math.min(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y));
 return {box:{x:left,y:top,w:Math.max(...corners.map(p=>p.x))-left,h:Math.max(...corners.map(p=>p.y))-top},contains(u,v){
  const a=u-x-px,b=v-y-py,xx=Math.floor((px+c*a-s*b)*f.spec.w/part.w),yy=Math.floor((py+s*a+c*b)*f.spec.h/part.h);
  return xx>=0&&yy>=0&&xx<f.spec.w&&yy<f.spec.h&&f.mask[yy*f.spec.w+xx]===1;
 }};
}
function unionCollisionBoxes(boxes){
 if(!boxes.length)return null;const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
 return {x,y,w:Math.max(...boxes.map(b=>b.x+b.w))-x,h:Math.max(...boxes.map(b=>b.y+b.h))-y};
}
function transformedCollider(base,contains,config){
 const c=colliderConfig(config),cx=base.x+base.w/2,cy=base.y+base.h/2;
 const box={x:cx+c.dx-base.w*c.sx/2,y:cy-c.dy-base.h*c.sy/2,w:base.w*c.sx,h:base.h*c.sy};
 return {base,box,config:c,contains(x,y){return x>=box.x&&x<box.x+box.w&&y>=box.y&&y<box.y+box.h&&contains(cx+(x-cx-c.dx)/c.sx,cy+(y-cy+c.dy)/c.sy);}};
}
function maskCollider(parts,config){
 const masks=parts.map(p=>{const mask=collisionPart(p);return mask?{...mask,role:p.collisionRole}:null;}).filter(Boolean),base=unionCollisionBoxes(masks.map(p=>p.box));
 if(!base)return null;
 const shape=transformedCollider(base,(x,y)=>masks.some(p=>p.contains(x,y)),config),c=shape.config,cx=base.x+base.w/2,cy=base.y+base.h/2;
 shape.kindAt=(x,y)=>masks.find(p=>p.contains(cx+(x-cx-c.dx)/c.sx,cy+(y-cy+c.dy)/c.sy))?.role;
 return shape;
}
function leafColliderBase(leaf){
 const heights=Array.from({length:54},(_,i)=>leafArtworkSurface(leaf,leaf.x-28+i));
 const top=Math.min(...heights.map(sy)),bottom=Math.max(...heights.map(sy));
 return {x:leaf.x-28.5,y:top,w:54,h:Math.max(1,bottom-top)};
}
function leafSurface(leaf,x){
 if(leaf.flower)return Campaign.flowerSurface(leaf,x);
 if(state.forestArtwork&&leaf.type==='leaf'&&!leaf.plant&&!leaf.opening&&!leaf.summit&&publicPlay&&preview&&forestLeafOpened(leaf)<.98)return null;
 if(leaf.fragile)return brownLeafSurface(leaf,x);
 if(leaf.plant)return Campaign.plantSurface(leaf,x);
 if(leaf.opening&&state.mode!=='flight')return Campaign.openingSurface(state,x);
 if(leaf.opening||leaf.summit)return Math.abs(x-leaf.x)<=leaf.radius?leaf.y-((x-leaf.x)/leaf.radius)**2*2:null;
 if(!leaf.collider)return leafArtworkSurface(leaf,x);
 const c=colliderConfig(leaf.collider),b=leafColliderBase(leaf),cx=b.x+b.w/2,cy=b.y+b.h/2;
 const source=leafArtworkSurface(leaf,cx+(x-cx-c.dx)/c.sx);if(source===null)return null;
 return H+offset-(cy-c.dy+(sy(source)-cy)*c.sy);
}
function leafLandingX(leaf){return leaf.x+(leaf.collider?.dx||0);}
function entityColliders(o,t,falls){
 const make=(shape,key,color)=>shape?{...shape,id:o.id,key,color,type:o.type}:null;
 if(o.type==='leaf'){
  const b=leafColliderBase(o),shape=transformedCollider(b,()=>false,o.collider);
  shape.surface=x=>{const top=leafSurface(o,x);return top===null?null:sy(top);};
  return [make(shape,'collider',[255,230,80])];
 }
 if(o.type==='lyric')return [make(transformedCollider({x:o.x-22,y:sy(o.y)-26,w:44,h:52},()=>true,o.collider),'collider',[255,230,80])];
 if(!hasCollider(o))return [];
 const parts=obstacleParts(o,t,falls).map(p=>({...p,collisionRole:'solid'})),color=[255,94,165];
 if(o.type==='pod'){
  const support=p=>p.asset.startsWith('support-')||p.asset.endsWith('-stalk');
  return [make(maskCollider(parts.filter(p=>!support(p)),o.collider),'collider',color),make(maskCollider(parts.filter(support),o.supportCollider),'supportCollider',color)].filter(Boolean);
 }
 return [make(maskCollider(parts,o.collider),'collider',color)].filter(Boolean);
}
function playerCollision(part){
 if(!part)return null;
 const parts=part.asset.startsWith('rider-')?[{...part,collisionRole:'body'},{...part,collisionRole:'canopy'}]:[{...part,collisionRole:'body'}];
 const shape=maskCollider(parts,state.playerCollider);
 return shape?{...shape,id:'player',key:'playerCollider',type:'player',color:[92,244,255]}:null;
}
function colliderContact(a,b){
 const left=Math.max(a.box.x,b.box.x),right=Math.min(a.box.x+a.box.w,b.box.x+b.box.w),top=Math.max(a.box.y,b.box.y),bottom=Math.min(a.box.y+a.box.h,b.box.y+b.box.h);
 for(let y=Math.ceil(top);y<bottom;y++)for(let x=Math.ceil(left);x<right;x++)if(a.contains(x,y)&&b.contains(x,y))return {x,y,part:a.kindAt?.(x,y)||'body'};
 return null;
}
function collidersOverlap(a,b){return !!colliderContact(a,b);}
function colliderGhost(){
 if(state.mode==='flight')return {asset:'rider-breeze',frame:0,x:100,y:290,w:128,h:176,angle:0,pivot:[65,65]};
 const leaf=state.leaves.filter(l=>!l.hidden&&!state.vines.find(v=>v.id===l.vine)?.hidden&&l.y>offset+55&&l.y<offset+H-60).sort((a,b)=>Math.abs(a.y-offset-300)-Math.abs(b.y-offset-300))[0];
 const facing=leaf?.side||'right',x=(leaf?leafLandingX(leaf):165)-20,name='perch-left-listen-'+facing;
 let y=320;
 if(leaf){y=-Infinity;for(const [fx,fy] of [[20,40],[22,46],[30,49],[44,51],[58,49],[61,45]]){const top=leafSurface(leaf,x+(facing==='right'?79-fx:fx)*.5);if(top!==null)y=Math.max(y,sy(top)-fy*.5+1);}if(!Number.isFinite(y))y=sy(leaf.y)-25;}
 return {asset:name,frame:0,x:Math.round(x),y:Math.round(y),w:40,h:EDITOR_LIBRARY.sprites[name].h*.5};
}
function currentColliders(){
 const t=clock(),falls=preview?playState?.falls:previewFallTimes(),list=[];
 for(const o of [...state.leaves,...state.objects]){
  if(o.hidden||o.vine&&state.vines.find(v=>v.id===o.vine)?.hidden||preview&&o.type==='lyric'&&playState?.collected.has(o.id))continue;
  // Falling pods can move far beyond their authored bounds.
  if(o.type!=='pod'&&Math.abs(o.y-(offset+H/2))>H/2+700)continue;
  list.push(...entityColliders(o,t,falls));
 }
 const player=playerCollision(preview?playState?.actorPart:colliderEdit?.id==='player'?colliderGhost():null);if(player)list.push(player);
 return list;
}
const colliderOverlay=document.createElement('canvas');colliderOverlay.width=330;colliderOverlay.height=717;
const colliderOverlayContext=colliderOverlay.getContext('2d');
function paintColliders(){
 if(!collidersVisible)return;
 if(!preview&&colliderEdit?.id==='player')paintPart(ctx,colliderGhost(),.9);
 const list=currentColliders(),g=colliderOverlayContext,pixels=g.createImageData(W,H),data=pixels.data;
 for(const shape of list){
  const b=shape.box;if(b.x>W||b.x+b.w<0||b.y>H||b.y+b.h<0)continue;
  const left=Math.max(0,Math.floor(b.x)),right=Math.min(W,Math.ceil(b.x+b.w)),top=Math.max(0,Math.floor(b.y)-1),bottom=Math.min(H,Math.ceil(b.y+b.h)+2);
  const mask=new Uint8Array((right-left)*(bottom-top));
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
   const surface=shape.surface?.(x),inside=shape.surface?surface!==null&&Math.abs(y-surface)<1:shape.contains(x,y);
   if(inside)mask[(y-top)*(right-left)+x-left]=1;
  }
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
   const i=(y-top)*(right-left)+x-left;if(!mask[i])continue;
   const edge=x===left||x===right-1||y===top||y===bottom-1||!mask[i-1]||!mask[i+1]||!mask[i-(right-left)]||!mask[i+(right-left)],k=(y*W+x)*4;
   data[k]=shape.color[0];data[k+1]=shape.color[1];data[k+2]=shape.color[2];data[k+3]=edge?255:72;
  }
 }
 g.putImageData(pixels,0,0);ctx.drawImage(colliderOverlay,0,0);
 if(preview&&playState){const point=lyricCollectionPoint(playState);ctx.fillStyle='#142331';ctx.fillRect(Math.round(point.x)-2,Math.round(sy(point.y))-2,5,5);ctx.fillStyle='#ffe650';ctx.fillRect(Math.round(point.x)-1,Math.round(sy(point.y))-1,3,3);}
 if(!preview&&colliderEdit){
  const shape=list.find(s=>s.id===colliderEdit.id&&s.key===colliderEdit.key);if(!shape)return;
  const b=shape.box,top=H+offset-b.y,bottom=top-b.h,left=b.x,right=b.x+b.w;
  ctx.strokeStyle='#141e35';ctx.lineWidth=3;ctx.strokeRect(left,b.y,b.w,b.h);ctx.strokeStyle='#fff5c7';ctx.lineWidth=1;ctx.setLineDash([3,2]);ctx.strokeRect(left,b.y,b.w,b.h);ctx.setLineDash([]);
  for(const [edge,x,y] of [['nw',left,top],['n',(left+right)/2,top],['ne',right,top],['e',right,(top+bottom)/2],['se',right,bottom],['s',(left+right)/2,bottom],['sw',left,bottom],['w',left,(top+bottom)/2]])handle(x,y,'collider-resize',{id:shape.id,key:shape.key,edge},'#243541');
  label('COLLIDER · '+Math.round(b.w)+' × '+Math.round(b.h),clamp(left,2,210),top+12);
 }
}
function colliderOwner(target=colliderEdit){return target?.id==='player'?state:item(target?.id);}
function editingColliderShape(){return colliderEdit&&currentColliders().find(s=>s.id===colliderEdit.id&&s.key===colliderEdit.key);}
function endColliderEdit(){if(drag?.kind.startsWith('collider-'))endDrag();colliderEdit=null;colliderEditTime=null;sync();request();}
function editCollider(id,key='collider'){
 if(preview)return;const owner=id==='player'?state:item(id);if(!owner||owner.locked||owner.hidden)return;
 if(id!=='player'){selected=new Set([id]);selection=id;}
 colliderEditTime=clock();colliderEdit={id,key};collidersVisible=true;selectedPoint=null;sync();canvas.focus({preventScroll:true});request();
}
function syncColliderTools(){
 if(colliderEdit&&(!colliderOwner()||colliderOwner().locked||colliderOwner().hidden)){colliderEdit=null;colliderEditTime=null;}
 $('colliders-toggle').checked=collidersVisible;
 $('collider-tools').hidden=!collidersVisible;$('player-collider').hidden=preview||!!colliderEdit||selected.size>0;
 $('motion-toggle').disabled=!!colliderEdit;document.body.classList.toggle('editing-collider',!!colliderEdit);
}
function colliderInspector(){
 const props=$('properties'),o=item();
 if(!colliderEdit)return;
 props.replaceChildren();$('selection-actions').hidden=true;$('object-list').hidden=true;$('encounter-controls').hidden=true;
 const owner=colliderOwner(),shape=editingColliderShape();
 $('selection-title').textContent=colliderEdit.id==='player'?'PLAYER COLLIDER':owner.type==='leaf'?'LEAF LANDING':owner.type==='lyric'?'LYRIC COLLECTION':owner.type.toUpperCase()+' COLLIDER';
 if(owner.type==='pod'){
  const input=property('Part',colliderEdit.key,()=>{}, {choices:[['collider','Pod'],['supportCollider','Stem']]});
  input.onchange=()=>{colliderEdit.key=input.value;sync();request();};
 }
 if(!shape){props.append(node('p',{text:'Loading…'}));return;}
 const config=colliderConfig(owner[colliderEdit.key]);
 const update=(key,value)=>{owner[colliderEdit.key]={...colliderConfig(owner[colliderEdit.key]),[key]:value};};
 const fields=[['Width',shape.box.w,'sx',shape.base.w],['Height',shape.box.h,'sy',shape.base.h],['X offset',config.dx,'dx',1],['Y offset',config.dy,'dy',1]];
 for(const [text,value,key,base] of fields){const size=key==='sx'||key==='sy',input=property(text,Math.round(value*10)/10,v=>update(key,clamp(v/base,size?.05:-660,size?4:660)),{type:'number',step:size?.5:1,min:size?base*.05:-660,max:size?base*4:660});input.dataset.colliderField=key;}
 const dimensions=node('div',{class:'collider-fields'});for(const input of props.querySelectorAll('[data-collider-field]'))dimensions.append(input.parentElement);props.append(dimensions);
 button('Reset shape',()=>change(()=>{delete owner[colliderEdit.key];}),props);
}
function colliderPointerDown(e,p){
 if(!colliderEdit)return false;
 const shape=editingColliderShape();if(!shape)return true;
 const h=selectionHandles.filter(h=>h.kind==='collider-resize').sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)).find(h=>Math.hypot(h.x-p.x,h.y-p.y)<(e.pointerType==='touch'?17:8)),b=shape.box,y=sy(p.y);
 if(!h&&(p.x<b.x-3||p.x>b.x+b.w+3||y<b.y-3||y>b.y+b.h+3))return true;
 drag={kind:h?'collider-resize':'collider-move',handle:h,start:p,collider:clone(colliderEdit),original:colliderConfig(colliderOwner()[colliderEdit.key]),box:{...b},base:{...shape.base}};
 canvas.setPointerCapture(e.pointerId);return true;
}
function moveCollider(p){
 const dx=Math.round(p.x-drag.start.x),dy=Math.round(p.y-drag.start.y);if(!drag.mutated&&!dx&&!dy)return;
 beginMutation();const c={...drag.original},b=drag.box,base=drag.base;
 if(drag.kind==='collider-move'){c.dx=clamp(c.dx+dx,-660,660);c.dy=clamp(c.dy+dy,-660,660);}
 else{
  const edge=drag.handle.edge;let left=b.x,right=b.x+b.w,top=b.y,bottom=b.y+b.h;
  if(edge.includes('w'))left=clamp(b.x+dx,right-base.w*4,right-base.w*.05);
  if(edge.includes('e'))right=clamp(b.x+b.w+dx,left+base.w*.05,left+base.w*4);
  if(edge.includes('n'))top=clamp(b.y-dy,bottom-base.h*4,bottom-base.h*.05);
  if(edge.includes('s'))bottom=clamp(b.y+b.h-dy,top+base.h*.05,top+base.h*4);
  c.sx=clamp((right-left)/base.w,.05,4);c.sy=clamp((bottom-top)/base.h,.05,4);
  c.dx=clamp(drag.original.dx+(left+right-b.x*2-b.w)/2,-660,660);c.dy=clamp(drag.original.dy-(top+bottom-b.y*2-b.h)/2,-660,660);
 }
 colliderOwner(drag.collider)[drag.collider.key]=c;request();
}
function initColliderTools(){
 $('colliders-toggle').onchange=()=>{collidersVisible=$('colliders-toggle').checked;if(!collidersVisible&&colliderEdit)endColliderEdit();syncColliderTools();request();};
 $('player-collider').onclick=()=>editCollider('player','playerCollider');
}
