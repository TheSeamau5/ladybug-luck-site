'use strict';

class LyricAssembly {
  static prepareSeams(catalog,art){
    const [width,height]=catalog.pageSize,owners=new Int16Array(width*height).fill(-1);
    for(const [index,p] of catalog.pieces.entries())for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){
      if(art[p.id].pixels[(y*p.width+x)*4+3])owners[(p.origin[1]+y)*width+p.origin[0]+x]=index;
    }
    // Trace only the real shared cuts. The outer tears and burnt holes stay
    // untouched; original ink and paper remain in their separate source images.
    for(const [index,p] of catalog.pieces.entries()){
      const edges=new Map(),pixels=art[p.id].pixels;art[p.id].seams={};
      for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){
        const k=(y*p.width+x)*4;if(!pixels[k+3])continue;
        for(const [dx,dy,dark] of [[1,0,true],[0,1,true],[-1,0,false],[0,-1,false]]){
          const nx=p.origin[0]+x+dx,ny=p.origin[1]+y+dy;
          if(nx<0||ny<0||nx>=width||ny>=height)continue;
          const other=owners[ny*width+nx];if(other<0||other===index)continue;
          if(!edges.has(other)){const canvas=document.createElement('canvas');canvas.width=p.width;canvas.height=p.height;const g=canvas.getContext('2d');edges.set(other,{canvas,g,frame:g.createImageData(p.width,p.height)});}
          const out=edges.get(other).frame.data,ink=pixels[k]<160,alpha=dark?(ink?42:100):(ink?0:65);
          if(alpha>out[k+3]){out[k]=dark?116:255;out[k+1]=dark?73:248;out[k+2]=dark?36:225;out[k+3]=alpha;}
        }
      }
      for(const [other,edge] of edges){edge.g.putImageData(edge.frame,0,0);art[p.id].seams[catalog.pieces[other].id]=edge.canvas;}
    }
    const paper=document.createElement('canvas');paper.width=width;paper.height=height;
    const g=paper.getContext('2d');let left=width,top=height,right=0,bottom=0;
    for(const p of catalog.pieces)g.drawImage(art[p.id].image,...p.origin);
    const material=g.getImageData(0,0,width,height).data;
    for(const p of catalog.pieces)for(const seam of Object.values(art[p.id].seams))g.drawImage(seam,...p.origin);
    const seams=new Map();
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x,owner=owners[i];if(owner<0)continue;
      left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
      if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{
        const nx=x+dx,ny=y+dy;return nx>=0&&nx<width&&ny>=0&&ny<height&&owners[ny*width+nx]>=0&&owners[ny*width+nx]!==owner;
      }))seams.set(i,{x,y});
    }
    // Light passes through the thin paper along every cut together. Spread it
    // into the surrounding fibres; keep opaque ink and charred holes intact.
    const distance=new Uint8Array(width*height).fill(255);
    for(const seam of seams.values())for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
      const x=seam.x+dx,y=seam.y+dy,d=dx*dx+dy*dy;
      if(x>=0&&x<width&&y>=0&&y<height&&d<=16){
        const i=y*width+x;if(owners[i]>=0)distance[i]=Math.min(distance[i],d);
      }
    }
    const glow=document.createElement('canvas');glow.width=width;glow.height=height;
    const light=glow.getContext('2d'),frame=light.createImageData(width,height);
    for(let i=0;i<distance.length;i++){
      if(distance[i]>16)continue;
      const k=i*4,heat=.85*Math.exp(-distance[i]/3.5)+.15*Math.exp(-distance[i]/10);
      const transmission=Math.max(0,Math.min(1,(material[k]-110)/80));
      frame.data[k]=material[k]*.5+112;
      frame.data[k+1]=material[k+1]*(.1+.2*(1-heat))+7;
      frame.data[k+2]=material[k+2]*(.04+.1*(1-heat))+3;
      frame.data[k+3]=material[k+3]*heat*.62*transmission;
    }
    light.putImageData(frame,0,0);
    const shadow=document.createElement('canvas');shadow.width=width;shadow.height=height;
    const shade=shadow.getContext('2d');shade.drawImage(paper,0,0);shade.globalCompositeOperation='source-in';shade.fillStyle='#061324';shade.fillRect(0,0,width,height);
    art.repair={paper,shadow,glow,
      centre:{x:(left+right)/2,y:(top+bottom)/2},bounds:{left,top,right,bottom}};
  }
  constructor(catalog,owned,saved={}) {
    saved=saved?.layout===4?saved:{};
    this.catalog=catalog;this.selected=null;this.solved=false;this.shine=-1;this.repair=null;this.repaired=false;
    // Uneven, overlapping handful of paper: deliberately no rows or columns.
    const scatter=[
      [97,346,-36],[214,292,151],[160,420,-102],[69,455,78],
      [199,492,-17],[240,390,113],[134,539,-137],[76,254,24],
      [176,230,-62],[253,484,168],[130,305,47],[150,377,-174],
      [81,568,101],[207,570,-44],[258,343,7]
    ];
    if(!saved.pieces)for(let i=scatter.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [scatter[i],scatter[j]]=[scatter[j],scatter[i]];
    }
    this.pieces=catalog.pieces.filter(p=>owned.includes(p.id)).map(p=>{
      const index=catalog.pieces.indexOf(p),[x,y,degrees]=scatter[index],angle=degrees*Math.PI/180;
      const radiusX=(Math.abs(Math.cos(angle))*p.width+Math.abs(Math.sin(angle))*p.height)/2;
      const prior=saved.pieces?.[p.id],valid=prior&&['x','y','angle'].every(k=>Number.isFinite(prior[k])&&Math.abs(prior[k])<10000);
      return {...p,cx:p.origin[0]+p.width/2,cy:p.origin[1]+p.height/2,
        x:valid?prior.x:Math.max(radiusX+8,Math.min(322-radiusX,x)),y:valid?prior.y:y,
        angle:valid?prior.angle:angle};
    });
    const savedOrder=Object.keys(saved.pieces||{}),layer=id=>savedOrder.includes(id)?savedOrder.indexOf(id):savedOrder.length+catalog.pieces.findIndex(p=>p.id===id);
    this.pieces.sort((a,b)=>layer(a.id)-layer(b.id));
    for(const p of this.pieces)this.constrain(p);
    this.solved=this.isSolved();
    this.repaired=this.solved&&saved.repaired===true;
  }
  isSolved(){
    if(this.pieces.length!==this.catalog.pieces.length)return false;
    // Compare a freely placed manuscript against its original geometry.
    // A shared overall tilt/position is fine; individual pieces need to agree.
    const angle=Math.atan2(this.pieces.reduce((sum,p)=>sum+Math.sin(p.angle),0),this.pieces.reduce((sum,p)=>sum+Math.cos(p.angle),0)),c=Math.cos(angle),s=Math.sin(angle);
    if(this.pieces.some(p=>Math.abs(this.angle(p.angle-angle))>9*Math.PI/180))return false;
    const offsets=this.pieces.map(p=>({x:p.x-p.cx*c+p.cy*s,y:p.y-p.cx*s-p.cy*c}));
    const translationX=offsets.reduce((sum,p)=>sum+p.x,0)/offsets.length,translationY=offsets.reduce((sum,p)=>sum+p.y,0)/offsets.length;
    // Remove the whole manuscript's translation: only each piece's relative
    // placement matters. The saved playtest measured 9.48 thixels / 6.96 degrees;
    // allow 25% more, rounded up to 12 thixels / 9 degrees, for the repair to close.
    return offsets.every(p=>Math.hypot(p.x-translationX,p.y-translationY)<=12);
  }
  turn(angle){if(this.solved)return;const p=this.pieces.find(p=>p.id===this.selected);if(p){p.angle+=angle;this.constrain(p);}}
  angle(a){return Math.atan2(Math.sin(a),Math.cos(a));}
  select(id){this.selected=id;const p=this.pieces.find(p=>p.id===id);if(p)this.pieces=this.pieces.filter(other=>other!==p).concat(p);}
  hit(x,y,art){for(const p of [...this.pieces].reverse()){const dx=x-p.x,dy=y-p.y,c=Math.cos(p.angle),s=Math.sin(p.angle),u=Math.floor(dx*c+dy*s+p.width/2),v=Math.floor(-dx*s+dy*c+p.height/2);if(u>=0&&v>=0&&u<p.width&&v<p.height&&art[p.id].pixels[(v*p.width+u)*4+3]>128)return p;}return null;}
  constrain(p){
    const c=Math.abs(Math.cos(p.angle)),s=Math.abs(Math.sin(p.angle)),rx=(p.width*c+p.height*s)/2,ry=(p.width*s+p.height*c)/2;
    p.x=Math.max(6+rx,Math.min(324-rx,p.x));p.y=Math.max(80+ry,Math.min(711-ry,p.y));
  }
  saved(){
    // Once the success animation starts, leaving midway preserves its finished
    // pose. Reopening cannot strand a half-repaired or partly centred page.
    const centre=this.repair?.centre;
    return {layout:4,repaired:this.repaired||!!this.repair,pieces:Object.fromEntries(this.pieces.map(p=>[p.id,
      centre?{x:165+p.cx-centre.x,y:358.5+p.cy-centre.y,angle:0}:{x:p.x,y:p.y,angle:p.angle}]))};
  }
  finish(time,art){
    if(this.repair||this.repaired||!this.isSolved())return;
    this.solved=true;this.selected=null;this.shine=time;
    const centre=art.repair.centre;
    const angle=Math.atan2(this.pieces.reduce((sum,p)=>sum+Math.sin(p.angle),0),this.pieces.reduce((sum,p)=>sum+Math.cos(p.angle),0));
    const c=Math.cos(angle),s=Math.sin(angle);
    const x=this.pieces.reduce((sum,p)=>sum+p.x-(p.cx-centre.x)*c+(p.cy-centre.y)*s,0)/this.pieces.length;
    const y=this.pieces.reduce((sum,p)=>sum+p.y-(p.cx-centre.x)*s-(p.cy-centre.y)*c,0)/this.pieces.length;
    const bounds=art.repair.bounds;
    this.repair={start:time,centre,angle,x,y,width:bounds.right-bounds.left,height:bounds.bottom-bounds.top,
      from:this.pieces.map(p=>({p,x:p.x,y:p.y,angle:p.angle}))};
  }
  ease(t){t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10);}
  repairPose(time){
    const r=this.repair;if(!r)return {x:165,y:358.5,angle:0,scale:1,seal:1,settled:true};
    const elapsed=Math.max(0,time-r.start),settle=this.ease((elapsed-2.2)/1.05);
    const seal=Math.max(0,Math.min(1,(elapsed-3.25)/3.1)),move=this.ease((elapsed-6.6)/1.8);
    const angle=r.angle*(1-move),c=Math.cos(angle),s=Math.sin(angle);
    // An upside-down solution may need a little room while turning upright.
    // Fit only the celebrating sheet; the interactive board never zooms.
    const width=r.width*Math.abs(c)+r.height*Math.abs(s),height=r.width*Math.abs(s)+r.height*Math.abs(c);
    const scale=Math.min(1,318/width,631/height),rx=width*scale/2,ry=height*scale/2;
    const x=Math.max(6+rx,Math.min(324-rx,r.x+(165-r.x)*move));
    const y=Math.max(80+ry,Math.min(711-ry,r.y+(358.5-r.y)*move));
    for(const from of r.from){
      const p=from.p,dx=(p.cx-r.centre.x)*scale,dy=(p.cy-r.centre.y)*scale;
      p.x=from.x+(x+dx*c-dy*s-from.x)*settle;p.y=from.y+(y+dx*s+dy*c-from.y)*settle;
      p.angle=from.angle+this.angle(r.angle-from.angle)*settle-r.angle*move;
      p.repairScale=1+(scale-1)*settle;
      if(settle<1){
        const pc=Math.abs(Math.cos(p.angle)),ps=Math.abs(Math.sin(p.angle)),px=(p.width*pc+p.height*ps)*p.repairScale/2,py=(p.width*ps+p.height*pc)*p.repairScale/2;
        p.x=Math.max(6+px,Math.min(324-px,p.x));p.y=Math.max(80+py,Math.min(711-py,p.y));
      }
    }
    if(elapsed>=8.4){this.repaired=true;for(const p of this.pieces){p.x=165+p.cx-r.centre.x;p.y=358.5+p.cy-r.centre.y;p.angle=0;}}
    return {x,y,angle,scale,seal,settle,settled:elapsed>=3.25};
  }
  drawRepair(g,art,pose){
    const {paper,shadow,glow,centre}=art.repair;
    g.save();g.translate(pose.x,pose.y);g.rotate(pose.angle);g.scale(pose.scale,pose.scale);g.translate(-centre.x,-centre.y);
    g.globalAlpha=.25;g.drawImage(shadow,1,1);g.globalAlpha=1;g.drawImage(paper,0,0);
    if(pose.seal>0&&pose.seal<1){
      g.globalAlpha=this.ease(pose.seal/.25)*(1-this.ease((pose.seal-.65)/.35));
      g.drawImage(glow,0,0);
    }
    g.restore();
  }
  draw(g,art,time=0,scale=1){
    g.clearRect(0,0,330*scale,717*scale);g.imageSmoothingEnabled=false;g.save();g.scale(scale,scale);
    const pose=this.repair||this.repaired?this.repairPose(time):null;
    if(pose?.settled){this.drawRepair(g,art,pose);g.restore();return;}
    if(pose?.settle){
      const {shadow,centre}=art.repair;g.save();g.translate(pose.x,pose.y);g.rotate(pose.angle);g.scale(pose.scale,pose.scale);
      g.globalAlpha=.25*pose.settle;g.drawImage(shadow,1-centre.x,1-centre.y);g.restore();
    }
    const selected=this.pieces.find(p=>p.id===this.selected);
    // Every fragment remains a separate sheet. Its original torn edges stay
    // legible even when another sheet is placed exactly beside them.
    for(const p of this.pieces){
      g.save();g.translate(p.x,p.y);g.rotate(p.angle);g.scale(p.repairScale||1,p.repairScale||1);
      g.globalAlpha=.25*(1-(pose?.settle||0));g.drawImage(art[p.id].shadow,-p.width/2+1,-p.height/2+(selected===p?3:1));
      g.globalAlpha=1;g.drawImage(art[p.id].image,-p.width/2,-p.height/2);
      for(const seam of Object.values(art[p.id].seams||{}))g.drawImage(seam,-p.width/2,-p.height/2);
      g.restore();
    }
    if(this.shine>=0&&time>=this.shine&&time-this.shine<2.2){const progress=(time-this.shine)/2.2;g.save();g.globalCompositeOperation='source-atop';g.globalAlpha=.65*Math.sin(Math.PI*progress);g.fillStyle='#fffbd6';const x=-160+progress*650;g.beginPath();g.moveTo(x,90);g.lineTo(x+19,90);g.lineTo(x+180,650);g.lineTo(x+161,650);g.closePath();g.fill();g.restore();}
    g.restore();
  }
}

const PuzzleLevel = {
  key:'ladybug-lyric-puzzle-v1',active:false,previewMode:false,art:{},pointers:new Map(),rotationKeys:new Set(),frameId:0,time:0,
  read(){try{const value=JSON.parse(localStorage.getItem(this.key)||'{}');return value&&typeof value==='object'?value:{};}catch{return {};}},
  owned(){const owned=this.read().owned;return Array.isArray(owned)?[...new Set(owned.filter(id=>LyricPaper.names.includes(id)))]:[];},
  collect(id){if(!LyricPaper.names.includes(id))return;const saved=this.read();saved.owned=[...new Set([...this.owned(),id])];this.persist(saved);this.updateEntries();},
  persist(saved){try{localStorage.setItem(this.key,JSON.stringify(saved));return true;}catch{if(this.active)$('puzzle-status').textContent='Keep this page open to preserve your arrangement.';return false;}},
  save(){if(!this.model)return;const saved=this.read();saved[this.previewMode?'previewArrangement':'arrangement']=this.model.saved();this.persist(saved);},
  async load(){
    if(this.loading)return this.loading;
    this.loading=(async()=>{
      const response=await fetch('assets/puzzle/pieces.json?v='+LyricPaper.revision);if(!response.ok)throw new Error('Puzzle artwork could not load');this.catalog=await response.json();
      await Promise.all(this.catalog.pieces.map(p=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{const c=document.createElement('canvas');c.width=p.width;c.height=p.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(image,0,0);const pixels=g.getImageData(0,0,c.width,c.height).data;g.globalCompositeOperation='source-in';g.fillStyle='#061324';g.fillRect(0,0,c.width,c.height);this.art[p.id]={image,pixels,shadow:c};resolve();};image.onerror=reject;image.src='assets/puzzle/'+p.image+'?v='+LyricPaper.revision;})));
      LyricAssembly.prepareSeams(this.catalog,this.art);
      this.sunset=await PuzzleSunset.load($('puzzle-background'));
    })().catch(error=>{this.loading=null;console.error('Puzzle artwork load failed',error);throw error;});return this.loading;
  },
  async open(options={}){
    const alreadyOpen=this.active;
    if(!alreadyOpen){
      this.model=null;cancelAnimationFrame(this.frameId);
      const canvas=$('puzzle-canvas');
      canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
      canvas.classList.remove('puzzle-restored');
    }
    this.active=true;this.previewMode=!!options.preview;if(!alreadyOpen){this.returnTo=options.returnTo||window.location.pathname+window.location.search;this.previousFocus=document.activeElement;this.previousTitle=document.title;}
    if(preview&&playState&&!playState.paused)pausePlay();
    document.body.classList.add('puzzle-open');$('puzzle-level').hidden=false;
    Campaign.matchSky('puzzle');
    for(const child of document.body.children)if(child!==$('puzzle-level')&&child.tagName!=='SCRIPT'){if(child.dataset.puzzleInert===undefined)child.dataset.puzzleInert=String(child.inert);child.inert=true;}
    $('puzzle-count').textContent=(this.previewMode?15:this.owned().length)+' / 15';
    $('puzzle-reset').hidden=!this.previewMode;$('puzzle-reset').disabled=true;
    if(options.route!==false)history.pushState({puzzle:true},'','/puzzle/'+(this.previewMode?'?preview=1':''));
    document.title='Ladybug Luck · Lost Lyrics';$('puzzle-back').focus({preventScroll:true});
    $('puzzle-status').textContent='';
    try{await this.load();}catch{if(this.active){$('puzzle-status').textContent='The artwork is arriving…';clearTimeout(this.retry);this.retry=setTimeout(()=>{if(this.active)this.open({...options,route:false});},2000);}return;}
    if(!this.active)return;
    const owned=this.previewMode?LyricPaper.names:this.owned(),saved=this.read();
    // Play always deals a new handful, including after a completed manuscript.
    // Fragment ownership remains saved independently of the new arrangement.
    this.model=new LyricAssembly(this.catalog,owned,this.previewMode?saved.previewArrangement:undefined);
    this.model.shine=-1;if(this.model.solved&&!this.model.repaired)this.finish();
    $('puzzle-reset').disabled=false;
    this.save();this.update();this.lastTime=0;cancelAnimationFrame(this.frameId);this.frameId=requestAnimationFrame(t=>this.tick(t));
  },
  reset(){
    if(!this.active||!this.previewMode||!this.model)return;
    const c=$('puzzle-canvas'),captured=[...this.pointers.keys()];
    this.pointers.clear();this.rotationKeys.clear();this.drag=null;this.gesture=null;
    for(const id of captured)if(c.hasPointerCapture(id))c.releasePointerCapture(id);
    this.model=new LyricAssembly(this.catalog,LyricPaper.names);
    $('puzzle-status').textContent='';this.save();this.update();this.draw();c.focus({preventScroll:true});
  },
  close(route=true){
    this.save();this.active=false;clearTimeout(this.retry);cancelAnimationFrame(this.frameId);this.pointers.clear();this.rotationKeys.clear();this.drag=null;this.gesture=null;this.model?.select(null);
    document.body.classList.remove('puzzle-open');$('puzzle-level').hidden=true;document.title=this.previousTitle||'Ladybug Luck';
    for(const child of document.body.children)if(child.dataset.puzzleInert!==undefined){child.inert=child.dataset.puzzleInert==='true';delete child.dataset.puzzleInert;}
    if(route){const target=this.returnTo?.startsWith('/puzzle')?'/test/?choose=1':this.returnTo||'/test/?choose=1';history.replaceState(null,'',target);if(target.startsWith('/test')&&!preview)routeFromLocation();}
    if(this.previousFocus?.isConnected)this.previousFocus.focus({preventScroll:true});if(preview)updatePlayInterface();
  },
  update(){if(this.model){$('puzzle-count').textContent=this.model.pieces.length+' / 15';$('puzzle-canvas').classList.toggle('puzzle-restored',this.model.solved);}},
  turnWhileHeld(dt){
    if(!this.model?.selected||!this.pointers.size)return;
    const left=this.rotationKeys.has('ArrowLeft')||this.rotationKeys.has('KeyA'),right=this.rotationKeys.has('ArrowRight')||this.rotationKeys.has('KeyD');
    const direction=Number(right)-Number(left);if(!direction)return;
    this.model.turn(direction*Math.PI*.65*dt);
    if(this.drag){this.drag.offset={x:this.drag.point.x-this.drag.piece.x,y:this.drag.point.y-this.drag.piece.y};}
  },
  tick(now){if(!this.active)return;const dt=this.lastTime?Math.min(.05,(now-this.lastTime)/1000):0;this.lastTime=now;if(!document.hidden){this.time+=dt;this.turnWhileHeld(dt);this.sunset.draw(this.time);this.draw();}this.frameId=requestAnimationFrame(t=>this.tick(t));},
  draw(){
    Campaign.fitSurface($('puzzle-view'));
    const g=$('puzzle-canvas').getContext('2d');
    // The repaired sheet moves at display resolution while its source pixels
    // remain exact 4x thixels. Ordinary piece interaction keeps its native grid.
    if(this.model.repaired||(this.model.repair&&this.time-this.model.repair.start>=6.6)){this.model.draw(g,this.art,this.time,4);return;}
    this.model.draw(this.paperContext,this.art,this.time);g.clearRect(0,0,1320,2868);g.imageSmoothingEnabled=false;g.drawImage(this.paperCanvas,0,0,1320,2868);
  },
  point(e){const r=$('puzzle-canvas').getBoundingClientRect();return {x:(e.clientX-r.left)*330/r.width,y:(e.clientY-r.top)*717/r.height};},
  down(e){
    if(!this.model||this.model.solved||e.button>0||this.pointers.size>=2)return;e.preventDefault();const c=$('puzzle-canvas');c.focus({preventScroll:true});c.setPointerCapture(e.pointerId);const point=this.point(e);this.pointers.set(e.pointerId,point);
    if(this.pointers.size===1){const hit=this.model.hit(point.x,point.y,this.art);this.model.select(hit?.id||null);this.drag=hit?{point,piece:hit,offset:{x:point.x-hit.x,y:point.y-hit.y}}:null;}
    if(this.pointers.size===2){const [a,b]=[...this.pointers.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},piece=this.model.pieces.find(p=>p.id===this.model.selected);this.gesture=piece?{angle:Math.atan2(b.y-a.y,b.x-a.x),offset:{x:mid.x-piece.x,y:mid.y-piece.y},piece}:null;this.drag=null;}
  },
  move(e){
    if(!this.model||!this.pointers.has(e.pointerId))return;e.preventDefault();const point=this.point(e);this.pointers.set(e.pointerId,point);
    if(this.pointers.size===2&&this.gesture){
      const [a,b]=[...this.pointers.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},angle=Math.atan2(b.y-a.y,b.x-a.x),gesture=this.gesture,piece=gesture.piece;
      piece.angle+=this.model.angle(angle-gesture.angle);gesture.angle=angle;piece.x=mid.x-gesture.offset.x;piece.y=mid.y-gesture.offset.y;this.model.constrain(piece);
    }else if(this.pointers.size===1&&this.drag){const piece=this.drag.piece;piece.x=point.x-this.drag.offset.x;piece.y=point.y-this.drag.offset.y;this.model.constrain(piece);this.drag.point=point;}
  },
  up(e){
    if(!this.pointers.has(e.pointerId))return;this.pointers.delete(e.pointerId);this.gesture=null;
    if(this.pointers.size===1){
      const point=[...this.pointers.values()][0],piece=this.model.pieces.find(p=>p.id===this.model.selected);
      this.drag=piece?{point,piece,offset:{x:point.x-piece.x,y:point.y-piece.y}}:null;
    }else this.drop();
  },
  drop(){
    this.pointers.clear();this.rotationKeys.clear();this.drag=null;this.gesture=null;
    if(!this.model)return;
    const wasSolved=this.model.solved;if(!wasSolved)this.model.solved=this.model.isSolved();
    if(this.model.solved&&!wasSolved)this.finish();
    this.model.select(null);this.save();this.update();
  },
  finish(){
    this.model.finish(this.time,this.art);
  },

  updateEntries(){const count=this.owned().length;for(const b of document.querySelectorAll('[data-open-puzzle]')){const author=b.dataset.openPuzzle==='preview';b.hidden=!author&&!count;b.textContent=author?'Playtest puzzle':'Lyric puzzle · '+count+'/15';}},
  init(){
    const section=document.createElement('section');section.id='puzzle-level';section.hidden=true;section.setAttribute('aria-label','Lost lyrics puzzle');
    section.innerHTML='<div id="puzzle-view"><canvas id="puzzle-background" width="1320" height="2868" aria-hidden="true"></canvas><canvas id="puzzle-canvas" width="1320" height="2868" tabindex="0" aria-label="Lyric puzzle. Drag pieces to move them. While holding a piece, turn it with Left/Right or A/D, or use two fingers."></canvas><div id="puzzle-heading"><div class="puzzle-top"><button id="puzzle-back">Back</button><button id="puzzle-reset" aria-label="Reset puzzle playtest" hidden disabled>Reset</button><span id="puzzle-count">0 / 15</span></div></div><div id="puzzle-bottom"><p id="puzzle-status" role="status" aria-live="polite"></p></div></div>';
    document.body.append(section);this.paperCanvas=document.createElement('canvas');this.paperCanvas.width=330;this.paperCanvas.height=717;this.paperContext=this.paperCanvas.getContext('2d');
    $('puzzle-back').onclick=()=>this.close();
    $('puzzle-reset').onclick=()=>this.reset();
    const c=$('puzzle-canvas');c.addEventListener('pointerdown',e=>this.down(e));c.addEventListener('pointermove',e=>this.move(e));for(const name of ['pointerup','pointercancel','lostpointercapture'])c.addEventListener(name,e=>this.up(e));
    for(const event of ['wheel','gesturestart','gesturechange'])c.addEventListener(event,e=>e.preventDefault(),{passive:false});
    window.addEventListener('keydown',e=>{
      if(!this.active)return;e.stopImmediatePropagation();
      if(e.code==='Tab'){
        const focusable=[...$('puzzle-level').querySelectorAll('button,[tabindex="0"]')].filter(el=>!el.disabled&&!el.closest('[hidden]'));
        const first=focusable[0],last=focusable.at(-1),current=document.activeElement;
        if(e.shiftKey&&(current===first||!focusable.includes(current))){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&(current===last||!focusable.includes(current))){e.preventDefault();first?.focus();}return;
      }
      if(e.target.tagName==='BUTTON'&&['Space','Enter'].includes(e.code))return;
      if(e.code==='Escape'){e.preventDefault();if(this.pointers.size)this.drop();else this.close();}
      if(this.pointers.size&&this.model?.selected&&['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)){e.preventDefault();this.rotationKeys.add(e.code);}
    },true);
    window.addEventListener('keyup',e=>{if(this.rotationKeys.delete(e.code)){e.preventDefault();e.stopImmediatePropagation();}},true);
    window.addEventListener('blur',()=>{if(this.active)this.drop();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.active)this.drop();});
    const entry=document.createElement('div');entry.id='level-puzzle-entry';$('level-drawer').insertBefore(entry,document.querySelector('.levels-footer'));
    for(const [parent,author] of [['pause-editor-actions',false],['level-puzzle-entry',false],['level-puzzle-entry',true]]){
      const target=document.querySelector('#'+parent),b=document.createElement('button');b.dataset.openPuzzle=author?'preview':'play';b.onclick=()=>this.open({preview:author});target.append(b);
      if(author)b.classList.add('primary');
    }
    window.addEventListener('storage',e=>{if(e.key===this.key)this.updateEntries();});window.addEventListener('pagehide',()=>this.save());this.updateEntries();
  }
};
PuzzleLevel.init();
