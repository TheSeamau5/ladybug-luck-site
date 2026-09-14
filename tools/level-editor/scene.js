'use strict';
const Art = {
  images:new Map(), failures:new Set(), changed:()=>{}, owner:null,
  image(src){
    if(!this.images.has(src)){
      const image=new Image(); const entry={image,ready:false,pixels:null};this.images.set(src,entry);
      image.onload=()=>{entry.ready=true;this.changed();};
      image.onerror=()=>{this.failures.add(src);this.changed();};image.src=src+(src.includes('?')?'&':'?')+'v='+(EDITOR_LIBRARY.revision||'1');
    }
    const entry=this.images.get(src);entry.owner=this.owner;return entry;
  },
  pixels(src){
    const entry=this.image(src);if(!entry.ready)return null;
    if(!entry.pixels){const c=document.createElement('canvas');c.width=entry.image.naturalWidth;c.height=entry.image.naturalHeight;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(entry.image,0,0);entry.pixels={data:g.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height};}
    return entry.pixels;
  },
  sprite(g,name,frame,x,y,w,h,alpha=1){
    const spec=EDITOR_LIBRARY.sprites[name];if(!spec)return false;
    const entry=this.image(spec.src);if(!entry.ready)return false;
    const f=((Math.floor(frame)%spec.count)+spec.count)%spec.count;
    let image=entry.image,sx=(f%spec.cols)*spec.w,sy=Math.floor(f/spec.cols)*spec.h;
    if(spec.trim){
      // Restore the original registration before scaling. Drawing the crop
      // directly changes nearest-neighbour sampling at fractional player sizes.
      if(!this.spriteSurfaces)this.spriteSurfaces=new Map();
      const key=spec.w+':'+spec.h;let surface=this.spriteSurfaces.get(key);
      if(!surface){const c=document.createElement('canvas');c.width=spec.w;c.height=spec.h;surface={c,k:c.getContext('2d'),src:null,frame:-1};surface.k.imageSmoothingEnabled=false;this.spriteSurfaces.set(key,surface);}
      if(surface.src!==spec.src||surface.frame!==f){
        const [left,top,cw,ch]=spec.trim;surface.k.clearRect(0,0,spec.w,spec.h);
        surface.k.drawImage(image,(f%spec.cols)*cw,Math.floor(f/spec.cols)*ch,cw,ch,left,top,cw,ch);
        surface.src=spec.src;surface.frame=f;
      }
      image=surface.c;sx=sy=0;
    }
    g.save();g.globalAlpha*=alpha;g.drawImage(image,sx,sy,spec.w,spec.h,x,y,w??spec.w,h??spec.h);g.restore();return true;
  },
  // Blend registered painted cels in premultiplied colour. No shape warping,
  // duplicated opaque roots, or drop to a partly transparent shared silhouette.
  pose(g,name,frame,x,y,w,h,last=null){
    const spec=EDITOR_LIBRARY.sprites[name];if(!spec)return false;
    const entry=this.image(spec.src);if(!entry.ready)return false;
    const f=clamp(frame,0,last??spec.count-1),a=Math.floor(f),b=Math.min(last??spec.count-1,a+1),mix=f-a;
    if(!mix||a===b)return this.sprite(g,name,a,x,y,w,h);
    if(!this.poseSurfaces)this.poseSurfaces=new Map();
    const key=spec.w+':'+spec.h;let surface=this.poseSurfaces.get(key);
    if(!surface){const c=document.createElement('canvas');c.width=spec.w;c.height=spec.h;surface={c,k:c.getContext('2d')};surface.k.imageSmoothingEnabled=false;this.poseSurfaces.set(key,surface);}
    const {c,k}=surface;k.clearRect(0,0,spec.w,spec.h);k.globalCompositeOperation='source-over';
    k.globalAlpha=1-mix;this.sprite(k,name,a,0,0,spec.w,spec.h);
    k.globalCompositeOperation='lighter';k.globalAlpha=mix;this.sprite(k,name,b,0,0,spec.w,spec.h);
    g.drawImage(c,x,y,w,h);return true;
  },
  paint(g,src,x=0,y=0,w=330,h=717,alpha=1){const entry=this.image(src);if(!entry.ready)return false;g.save();g.globalAlpha*=alpha;g.drawImage(entry.image,x,y,w,h);g.restore();return true;},
  opaque(name,frame,x,y){
    const s=EDITOR_LIBRARY.sprites[name];if(!s||x<0||y<0||x>=s.w||y>=s.h)return false;
    const p=this.pixels(s.src);if(!p)return false;const f=((Math.floor(frame)%s.count)+s.count)%s.count;
    const [left,top,w,h]=s.trim||[0,0,s.w,s.h];x=Math.floor(x)-left;y=Math.floor(y)-top;
    if(x<0||y<0||x>=w||y>=h)return false;
    return p.data[((Math.floor(f/s.cols)*h+y)*p.w+(f%s.cols)*w+x)*4+3]>100;
  }
};
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
const noise=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const cycle=(t,n=32)=>{const p=((t%(2*(n-1)))+2*(n-1))%(2*(n-1));return p<n?p:2*(n-1)-p;};
const Scene = {
  sequences:new Map(), surfaces:new Map(), flash:0,
  scenerySources:new Map(),
  ready(level,t=0){
    let sources=this.scenerySources.get(level.theme);
    if(!sources){
      sources=[];const sprite=name=>sources.push(EDITOR_LIBRARY.sprites[name].src);
      if(level.theme==='garden'){
        for(const name of ['garden-sky','garden-lake','garden-land','garden-gentle-breeze-trees','garden-gentle-breeze-brush','rain-ripples'])sprite(name);
        for(const cloud of EDITOR_LIBRARY.gardenClouds)sprite(cloud.name);
      }else if(level.theme==='rain'){
        for(const light of ['shower','storm','flash'])for(const layer of ['rear-terrain','rear-water','rear-forest','near-terrain','near-forest'])sprite('rain-'+light+'-'+layer);
        for(const name of ['rain-rear-lake-mask','rain-ripples'])sprite(name);
        for(let i=0;i<4;i++){for(const light of ['shower','storm'])sources.push('/assets/scenes/rain-level/native/cloud-'+i+'-'+light+'.png');sources.push('/assets/scenes/rain-level/native/lightning-'+i+'.png');}
      }else{
        const base='/assets/scenes/dandelion-level/native/';
        for(const light of ['golden','late']){
          for(const layer of ['sky','terrain','water','distant-trees','grasses','flowers'])sources.push(base+light+'-'+layer+'.png');
          for(const cloud of EDITOR_LIBRARY.clouds)if(cloud.area>=100||cloud.id===7||cloud.id===12)sources.push(base+'clouds/'+String(cloud.id).padStart(2,'0')+'-'+light+'.png');
        }
        for(const name of ['sunset-water','birds','birds-late','air-trace','air-fluff','air-pollen'])sprite(name);
      }
      this.scenerySources.set(level.theme,sources);
    }
    let ready=true;for(const src of sources)if(!Art.image(src).ready)ready=false;
    if(level.theme==='garden'){
      const events=this.gardenEvents(level,t,{wind:.3}),current=events.findLast(e=>e.start<=t)||events[0],next=events.find(e=>e.start>t);
      for(const e of [current,next])if(e)for(const layer of ['trees','brush'])if(!Art.image(EDITOR_LIBRARY.sprites['garden-'+e.name+'-'+layer].src).ready)ready=false;
    }
    return ready;
  },
  fields:new Map(),
  fieldPixels(src){
    const cached=this.fields.get(src);if(cached)return cached;
    const pixels=Art.pixels(src);if(!pixels)return null;
    // These images encode horizontal and vertical displacement in red/green.
    // Preserve those exact bytes; the image and unused colour channels can go.
    const data=new Uint8Array(pixels.w*pixels.h*2);
    for(let i=0,j=0;i<pixels.data.length;i+=4,j+=2){data[j]=pixels.data[i];data[j+1]=pixels.data[i+1];}
    const field={data,w:pixels.w,h:pixels.h};this.fields.set(src,field);Art.images.delete(src);return field;
  },
  field(theme,t,strength,identity,visibleRows=Infinity){
    const key=theme+identity;let events=this.sequences.get(key);
    if(!events){events=[{name:'breeze',start:0,end:6.5}];this.sequences.set(key,events);}
    const names=['breeze','gust','recovery','bristle','crosswind'];
    while(events.at(-1).end<t+1){const n=events.length,prev=events.at(-1);let choices=names.filter(x=>x!==prev.name);if(strength<.4)choices=choices.filter(x=>x!=='crosswind');let name=choices[Math.floor(noise(n+[...identity].reduce((v,c)=>v*31+c.charCodeAt(0),0)%997)*choices.length)];if(strength>.65&&n%3===0)name=prev.name==='gust'?'bristle':'gust';const start=prev.end-.9;events.push({name,start,end:start+4.7+noise(n+71)*3.8});}
    let i=events.findLastIndex(e=>e.start<=t);i=Math.max(0,i);const e=events[i];const blends=[];
    const add=(ev,weight)=>{const phase=clamp((t-ev.start)/(ev.end-ev.start))*31,k=Math.floor(phase);const spec=EDITOR_LIBRARY.sprites[theme+'-'+ev.name+'-field'];if(!spec)return;const pixels=this.fieldPixels(spec.src);if(!pixels)return;blends.push({pixels,spec,k,f:phase-k,weight});};
    if(i&&t<events[i-1].end){const f=smooth((t-e.start)/(events[i-1].end-e.start));add(events[i-1],1-f);add(e,f);}else add(e,1);
    if(!blends.length)return null;const w=blends[0].spec.w,h=blends[0].spec.h;
    let surface=this.surfaces.get(key+'field');if(!surface){surface={data:new Float32Array(w*h*2),tick:-1};this.surfaces.set(key+'field',surface);}
    const rows=Math.max(0,Math.min(h,Math.ceil(visibleRows))),tick=Math.floor(t*30);
    if(surface.tick===tick&&rows<=(surface.rows||0))return surface.data;
    surface.tick=tick;surface.rows=rows;surface.data.fill(0,0,rows*w*2);
    for(const b of blends){const {pixels:p,spec:s,k,f,weight}=b;const k1=Math.min(31,k+1),x0=k%s.cols*w,x1=k1%s.cols*w,y0=Math.floor(k/s.cols)*h,y1=Math.floor(k1/s.cols)*h;
      for(let y=0;y<rows;y++)for(let x=0;x<w;x++){const a=((y+y0)*p.w+x+x0)*2,z=((y+y1)*p.w+x+x1)*2,j=(y*w+x)*2;surface.data[j]+=((p.data[a]*(1-f)+p.data[z]*f)-128)/16*weight;surface.data[j+1]+=((p.data[a+1]*(1-f)+p.data[z+1]*f)-128)/16*weight;}
    }return surface.data;
  },
  warped(g,key,srcA,srcB,srcFlash,light,flash,field,origin,drawY,amplitude,t){
    const a=Art.pixels(srcA),b=Art.pixels(srcB),f=srcFlash?Art.pixels(srcFlash):null;if(!a||!b)return;
    const h=a.h-origin,w=330;let s=this.surfaces.get(key);
    if(!s){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');s={c,ctx,frame:ctx.createImageData(w,h),tick:''};this.surfaces.set(key,s);}
    if(!s.alphaRows){let top=h,bottom=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(a.data[((y+origin)*w+x)*4+3]){top=Math.min(top,y);bottom=Math.max(bottom,y+1);}s.alphaRows=[top,bottom];}
    const maxRows=Math.max(0,Math.min(h,Math.ceil(717-drawY)));
    const tick=Math.floor(t*30)+':'+Math.round(light*128)+':'+Math.round(flash*64)+':'+Math.round(amplitude*32);
    if(s.tick!==tick||maxRows>(s.rows||0)){
      s.tick=tick;s.rows=maxRows;const out=s.frame.data,ad=a.data,bd=b.data,fd=f?.data,hasField=!!field,hasFlash=!!fd&&flash>0,still=1-light,dark=1-flash,ox=origin*w,round=Math.round;
      out.fill(0);const padding=Math.ceil(8*amplitude),row0=Math.max(0,s.alphaRows[0]-padding),row1=Math.min(maxRows,s.alphaRows[1]+padding);
      for(let y=row0;y<row1;y++)for(let x=0;x<w;x++){
        const n=y*w+x,j=n*2,z=n*4;
        let sx=x,sy=y;
        if(hasField){sx=round(x+field[j]*amplitude);sy=round(y+field[j+1]*amplitude);if(sx<0)sx=0;else if(sx>=w)sx=w-1;if(sy<0)sy=0;else if(sy>=h)sy=h-1;}
        const k=(sy*w+sx+ox)*4;
        if(hasFlash){out[z]=(ad[k]*still+bd[k]*light)*dark+fd[k]*flash;out[z+1]=(ad[k+1]*still+bd[k+1]*light)*dark+fd[k+1]*flash;out[z+2]=(ad[k+2]*still+bd[k+2]*light)*dark+fd[k+2]*flash;}
        else{out[z]=ad[k]*still+bd[k]*light;out[z+1]=ad[k+1]*still+bd[k+1]*light;out[z+2]=ad[k+2]*still+bd[k+2]*light;}
        out[z+3]=ad[k+3];
      }
      s.ctx.putImageData(s.frame,0,0);
    }g.drawImage(s.c,0,drawY,w,h);
  },
  blend(g,a,b,light,x=0,y=0,w=330,h=717){Art.paint(g,a,x,y,w,h);if(light>0)Art.paint(g,b,x,y,w,h,light);},
  paint(g,level,offset,t,weather){
    if(typeof Campaign!=='undefined')Campaign.matchSky(level.theme,level.theme==='rain'?weather.rain:level.theme==='sunset'?clamp(offset/Math.max(1,level.height-717))*.82:0);
    const flags=level.scenery;const rain=level.theme==='rain';this.flash=0;
    if(level.theme==='garden'){this.garden(g,level,offset,t,weather);return;}
    g.clearRect(0,0,330,717);
    if(rain){
      const n='/assets/scenes/rain-level/native/';const intensity=weather.rain;
      const strike=Math.floor(t/11),at=strike*11+2+noise(strike+5)*5,age=t-at;
      this.flash=flags.weather&&intensity>.42&&age>=0&&age<.7?(Math.exp(-age*16)+.55*Math.exp(-(((age-.105)/.025)**2)))*(.4+intensity*.55):0;
      const flash=clamp(this.flash,0,.92);const sky=g.createLinearGradient(0,0,0,717);const mix=(a,b)=>a.map((c,i)=>Math.round(c*(1-intensity)+b[i]*intensity+flash*72));sky.addColorStop(0,'rgb('+mix([106,140,186],[18,31,59]).join(',')+')');sky.addColorStop(1,'rgb('+mix([175,195,214],[62,83,118]).join(',')+')');g.fillStyle=sky;g.fillRect(0,0,330,717);
      if(flags.clouds){
        const clouds=this.maskSurface('rain-clouds'),cg=clouds.g,draws=[];
        // Overlapping, cropped storm masses form an unbroken overhead bank.
        // The lower clouds retain their separate drift and the scene's weather lighting.
        for(const [k,width,x,y,speed] of [[0,600,-270,-245,.10],[3,580,0,-216,.14],[1,480,-160,-103,.20]]){
          const h=Math.round(width*2/3),span=480,drift=t*(.5+intensity)*speed;
          const start=((x-drift)%span+span)%span-span;
          for(let xx=start-span;xx<330;xx+=span){
            draws.push([k,Math.round(xx),y,width,h,.48+intensity*.52]);
          }
        }
        const splitCount=draws.length;const cloudItems=[[1,370,-75,-50,.65],[0,230,-115,95,.46],[3,230,208,100,.54],[2,240,-50,310,.74],[3,265,145,310,.4],[2,320,-90,420,.32]];
        for(const [k,width,x,y,speed] of cloudItems){const entry=Art.image(n+'cloud-'+k+'-shower.png');const h=Math.round(entry.ready?width*entry.image.naturalHeight/entry.image.naturalWidth:width*.66);const drift=t*(.5+intensity)*speed;const px=x-drift%(width+360),py=Math.round(y+offset*(width>300?.01:.016+.01*y/717));for(const xx of [px,px+width+360])draws.push([k,Math.round(xx),py,width,h,intensity]);}

        const banks=[];
        for(const [group,items] of [['overhead',draws.slice(0,splitCount)],['lower',draws.slice(splitCount)]]){
          const shower=this.maskSurface('rain-cloud-bank-'+group+'-shower'),storm=this.maskSurface('rain-cloud-bank-'+group+'-storm');
          const key=items.map(item=>item.slice(0,5).join(':')).join(';');
          if(shower.paintKey!==key){
            shower.g.clearRect(0,0,330,717);storm.g.clearRect(0,0,330,717);let ready=true;
            for(const [k,x,y,w,h] of items){
              const a=n+'cloud-'+k+'-shower.png',b=n+'cloud-'+k+'-storm.png';
              Art.paint(shower.g,a,x,y,w,h);Art.paint(storm.g,b,x,y,w,h);
              ready=ready&&Art.image(a).ready&&Art.image(b).ready;
            }
            shower.paintKey=ready?key:null;
          }
          banks.push({shower,storm,light:items[0][5]});
        }
        const paintKey=banks.every(bank=>bank.shower.paintKey)?banks.map(bank=>bank.shower.paintKey+':'+bank.light).join('|')+':'+flash:null;
        if(!paintKey||clouds.paintKey!==paintKey){
          cg.clearRect(0,0,330,717);
          for(const {shower,storm,light} of banks){
            cg.drawImage(shower.c,0,0);cg.globalAlpha=light;cg.drawImage(storm.c,0,0);
            if(flash){cg.globalAlpha=flash*.9;cg.drawImage(shower.c,0,0);}cg.globalAlpha=1;
          }
          clouds.paintKey=paintKey;
        }
        g.drawImage(clouds.c,0,0);
      }
      if(flash&&flags.weather)Art.paint(g,n+'lightning-'+strike%4+'.png',50+noise(strike)*150,15,100,400,clamp(flash*2));
      // Match Dandelion's depth: distant landscape .024, nearby scenery 1.2.
      const travel=offset*.024,nearTravel=offset*1.2;
      const material=(layer,y)=>{const spec=name=>EDITOR_LIBRARY.sprites['rain-'+name+'-'+layer].src;this.blend(g,spec('shower'),spec('storm'),intensity,0,y);if(flash)Art.paint(g,spec('flash'),0,y,330,717,flash);};
      if(flags.terrain)material('rear-terrain',travel);
      if(flags.water)material('rear-water',travel);
      const field=this.field('rain-level',t,weather.wind,level.id,flags.trees?717-432-travel:0);
      const forest=(depth,y,amplitude)=>{if(432+y>=717)return;const spec=name=>EDITOR_LIBRARY.sprites['rain-'+name+'-'+depth+'-forest'].src;this.warped(g,'rain-'+depth+'-forest',spec('shower'),spec('storm'),spec('flash'),intensity,flash,field,0,432+y,amplitude,t);};
      if(flags.weather)this.rain(g,t,intensity,weather.wind,flags.water,travel,true);
      // Shoreline trees stand in front of the lake and its surface impacts.
      if(flags.trees)forest('rear',travel,.25+weather.wind*.35);
      if(432+nearTravel<717){
        if(flags.terrain)material('near-terrain',nearTravel);
        if(flags.trees)forest('near',nearTravel,.4+weather.wind*.8);
        if(flags.weather&&flags.terrain)this.rockRain(g,t,intensity,weather.wind,nearTravel);
      }
      if(flags.weather)this.rain(g,t,intensity,weather.wind,false);
    }else{
      const n='/assets/scenes/dandelion-level/native/';const light=clamp(offset/Math.max(1,level.height-717))*.82,travel=offset*.024;
      this.blend(g,n+'golden-sky.png',n+'late-sky.png',light,0,0,330,717);
      if(flags.clouds){for(const c of EDITOR_LIBRARY.clouds){if(c.area<100)continue;const depth=c.height>100?.01:.016+.01*c.y/717;const x=c.x+66*Math.tanh(t*(.13+.24*(1-c.y/717))/66),y=c.y+offset*depth;this.blend(g,n+'clouds/'+String(c.id).padStart(2,'0')+'-golden.png',n+'clouds/'+String(c.id).padStart(2,'0')+'-late.png',light,x,y,c.width,c.height);}for(const [id,x,y,depth] of [[7,42,-55,.03],[12,170,-145,.026],[7,-35,-260,.04],[12,35,-420,.047]]){const c=EDITOR_LIBRARY.clouds[id];this.blend(g,n+'clouds/'+String(id).padStart(2,'0')+'-golden.png',n+'clouds/'+String(id).padStart(2,'0')+'-late.png',light,x+t*.12,y+offset*depth,c.width,c.height);}}
      if(flags.birds)for(let k=0;k<3;k++){const q=Math.floor((t+k*9)/27),u=((t+k*9)%27)/27;const direction=noise(q+k+70)>.5?1:-1;const x=direction>0?-20+u*370:350-u*370,y=170+k*37+Math.sin(u*Math.PI)*12+offset*.014;g.save();g.translate(x,y);g.scale(direction,1);Art.sprite(g,light>.5?'birds-late':'birds',u<.2?Math.floor(t*12)%16:16+Math.floor(t*3)%16,-7,-10,14,19);g.restore();}
      if(flags.terrain)this.blend(g,n+'golden-terrain.png',n+'late-terrain.png',light,0,travel);
      if(flags.water){Art.sprite(g,'sunset-water',cycle(t*2.2),0,travel,330,717);if(light>0)Art.paint(g,n+'late-water.png',0,travel,330,717,light*.75);}
      const field=this.field('dandelion-level',t,weather.wind,level.id,717-467-(flags.trees?travel:flags.brush?offset*1.2:717));
      for(const layer of ['distant-trees','grasses','flowers']){if(layer==='distant-trees'?!flags.trees:!flags.brush)continue;const shift=layer==='distant-trees'?travel:offset*1.2;if(467+shift>717)continue;this.warped(g,'sunset-'+layer,n+'golden-'+layer+'.png',n+'late-'+layer+'.png',null,light,0,field,467,467+shift,.75+weather.wind*.45,t);}
      if(flags.air)this.air(g,t,weather.wind);
    }
  },
  gardenEvents(level,t,weather){
    const key='garden-'+level.id;let events=this.sequences.get(key);if(!events){events=[{name:'gentle-breeze',start:0,end:4}];this.sequences.set(key,events);}
    while(events.at(-1).end<=t+1){const prev=events.at(-1),n=events.length;let choices=weather.wind>.55?['passing-gust','bristling','direction-change']:['gentle-breeze','bristling','settling'];choices=choices.filter(k=>k!==prev.name);const name=choices[Math.floor(noise(n+14)*choices.length)];events.push({name,start:prev.end,end:prev.end+(32/EDITOR_LIBRARY.gardenGestures[name].framesPerSecond)*(.92+noise(n+7)*.28)});}
    return events;
  },
  garden(g,level,offset,t,weather){
    g.clearRect(0,0,330,717);Art.sprite(g,'garden-sky',0,0,0,330,717);
    const flags=level.scenery,travel=offset*.024,nearTravel=offset*1.2;
    if(flags.clouds)for(const c of EDITOR_LIBRARY.gardenClouds){const span=c.w+600,x=c.x-(t*c.speed*(.7+weather.wind*.65))%span,y=c.y+offset*(c.h>200?.01:.016+.01*c.y/717);Art.sprite(g,c.name,0,x,y,c.w,c.h);if(x+c.w<330)Art.sprite(g,c.name,0,x+span,y,c.w,c.h);}
    if(flags.water){g.save();g.translate(0,travel);Art.sprite(g,'garden-lake',0,0,0,330,717);const rings=this.maskSurface('garden-rings');rings.g.clearRect(0,0,330,717);for(let i=Math.floor(t/4.7)-1;i<=Math.floor(t/4.7);i++){const age=t-i*4.7;if(age<0||age>5.1)continue;const positions=[[201,646,127],[315,685,157],[130,700,142]],p=positions[((Math.floor(noise(i+12)*3)%3)+3)%3];Art.sprite(rings.g,'rain-ripples',age*6,p[0]-p[2]/2,p[1]-p[2]/6,p[2],p[2]/3,.5*clamp((5.1-age)/2));}this.masked(g,rings,'garden-lake');g.restore();}
    if(flags.terrain)Art.sprite(g,'garden-land',0,0,travel,330,717);
    const key='garden-'+level.id,events=this.gardenEvents(level,t,weather);
    const next=events.find(e=>e.start>t);if(next)for(const layer of ['trees','brush'])Art.image(EDITOR_LIBRARY.sprites['garden-'+next.name+'-'+layer].src);
    const e=events.findLast(e=>e.start<=t)||events[0];
    const available=['trees','brush'].every(layer=>Art.image(EDITOR_LIBRARY.sprites['garden-'+e.name+'-'+layer].src).ready);
    // Keep the last painted pair while a new gesture is loading, including on
    // slower phones. Never clear living foreground scenery for a missing sheet.
    const frame=clamp((t-e.start)/(e.end-e.start))*(EDITOR_LIBRARY.sprites['garden-'+e.name+'-trees'].count-1);
    if(available)this.surfaces.set(key+'-pose',{name:e.name,frame});
    const pose=this.surfaces.get(key+'-pose');
    if(549+nearTravel<717){
      if(pose&&flags.trees)Art.sprite(g,'garden-'+pose.name+'-trees',pose.frame,-91,549+nearTravel,269,179);
      if(pose&&flags.brush)Art.sprite(g,'garden-'+pose.name+'-brush',pose.frame,-91,549+nearTravel,269,179);
    }
  },
  rain(g,t,strength,wind,water,waterShift=0,impactsOnly=false){
    const speed=270+90*strength,lean=38+45*wind;
    if(water&&waterShift<717){
      const visible=Art.pixels(EDITOR_LIBRARY.sprites['rain-rear-lake-mask'].src);
      if(visible&&!this.rainImpactPoints){
        this.rainImpactPoints=[];
        for(let y=0;y<visible.h;y+=4)for(let x=(y%8)/2;x<visible.w;x+=4){
          if(visible.data[(y*visible.w+x)*4+3]>128)this.rainImpactPoints.push([x,y]);
        }
      }
      const ringsVisible=Math.round(waterShift)<179;const points=this.rainImpactPoints||[],rings=this.maskSurface('rain-rings'),streaks=this.maskSurface('rain-water-drops');
      if(ringsVisible)rings.g.clearRect(0,0,330,717);streaks.g.clearRect(0,0,330,717);
      for(let j=Math.floor(t*80)-132;j<Math.floor(t*80)+70&&points.length;j++){
        const [x,y]=points[Math.floor(noise(j+41)*points.length)],at=j/80,age=t-at,life=.85+noise(j+2)*.7,fall=.48+noise(j+3)*.37;
        if(noise(j+1)>.31+.69*strength)continue;
        if(age>=-fall&&age<0){const px=Math.round(x+lean*age),py=Math.round(y+speed*age);streaks.g.fillStyle='#a9cbe7';streaks.g.fillRect(px,py-3,1,3);}
        else if(ringsVisible&&age>=0&&age<life){const w=Math.round(18+(y-539)*.18),h=Math.max(5,Math.round(w*.3));
          Art.sprite(rings.g,'rain-ripples',age/life*31,Math.round(x-w/2),Math.round(y-h/2),w,h,.95*(1-age/life*.25));
        }
      }
      // Pale reflected light stays visible against the blue lake. The mask
      // confines every expanding ring to actual water pixels.
      if(ringsVisible){rings.g.save();rings.g.beginPath();rings.g.rect(0,538,330,179);rings.g.clip();rings.g.globalCompositeOperation='source-in';rings.g.fillStyle=this.flash>.1?'#effaff':'#c4e4f4';rings.g.fillRect(0,0,330,717);rings.g.restore();}
      g.save();g.translate(0,Math.round(waterShift));g.drawImage(streaks.c,0,0);if(ringsVisible)this.masked(g,rings,'rain-rear-lake-mask');g.restore();
    }
    if(impactsOnly)return;
    const air=this.maskSurface('rain-air'),paint=air.g;paint.clearRect(0,0,330,717);
    if(!this.airDrops)this.airDrops=Array.from({length:300},(_,i)=>{const depth=.5+noise(i+120)*.5;return {chance:noise(i+100),speed:150+noise(i+110)*160,depth,x:noise(i+130)*450,y:noise(i+140)*797,color:'rgba(151,179,217,'+(.2+.29*depth)+')'};});
    for(const drop of this.airDrops){
      if(drop.chance>.2+.75*strength)continue;
      const velocity=drop.speed*(.85+.35*strength),depth=drop.depth;
      const x=(drop.x+lean*depth*t)%450-60,y=(drop.y+velocity*t)%797-40,len=4+depth*9+5*strength;
      const tailX=x-lean*depth/velocity*len,tailY=y-len;
      // Keep the stroke's antialiasing margin. Fully off-canvas drops still
      // advance from their original time; they simply need no drawing command.
      if(Math.max(x,tailX)<-1||Math.min(x,tailX)>331||y<-1||tailY>718)continue;
      paint.strokeStyle=drop.color;paint.lineWidth=.5;paint.beginPath();paint.moveTo(tailX,tailY);paint.lineTo(x,y);paint.stroke();
    }
    g.drawImage(air.c,0,0);
  },
  rockRain(g,t,strength,wind,shift){
    const material=Art.pixels(EDITOR_LIBRARY.sprites['rain-shower-near-terrain'].src);if(!material)return;
    if(!this.rockImpactPoints){
      this.rockImpactPoints=[];
      // Scan the painted upper faces of the four foreground rocks, excluding
      // green foliage in front. No impact positions are guessed in open air.
      for(const [left,right,top,bottom] of [[12,64,587,628],[46,84,638,664],[97,147,624,650],[171,195,659,680]]){
        for(let x=left;x<=right;x+=2)for(let y=top;y<=bottom;y++){
          const k=(y*330+x)*4,r=material.data[k],green=material.data[k+1],b=material.data[k+2];
          if(material.data[k+3]>128&&r>60&&b>=green*.99){this.rockImpactPoints.push([x,y]);break;}
        }
      }
    }
    const points=this.rockImpactPoints;if(!points.length)return;
    const layer=this.maskSurface('rock-rain'),p=layer.g;p.clearRect(0,0,330,717);
    for(let i=Math.floor(t*24)-10;i<=Math.floor(t*24)+10;i++){
      if(noise(i+580)>.36+.64*strength)continue;
      const [x,y]=points[Math.floor(noise(i+911)*points.length)],age=t-i/24;
      if(age<0&&age>-.35){const distance=-age*290;p.fillStyle='#bcdcf0';p.fillRect(Math.round(x-distance*(.13+wind*.08)),Math.round(y-distance)-4,1,4);}
      else if(age>=0&&age<.32){const f=age/.32;p.globalAlpha=1-f*.8;p.fillStyle='#e2f2fb';p.fillRect(x-1,y-1,3,1);
        for(const [side,speed] of [[-1,1],[1,.7]])p.fillRect(Math.round(x+side*(1+f*8)*speed),Math.round(y-Math.sin(f*Math.PI)*6*speed),1,1);
        p.globalAlpha=1;
      }
    }
    g.drawImage(layer.c,0,Math.round(shift));
  },
  maskSurface(key){let s=this.surfaces.get(key);if(!s){const c=document.createElement('canvas');c.width=330;c.height=717;s={c,g:c.getContext('2d')};s.g.imageSmoothingEnabled=false;this.surfaces.set(key,s);}return s;},
  masked(g,s,mask){
    s.g.save();
    // Keep the original ripple grid while limiting composition to painted water.
    const lake=mask==='rain-rear-lake-mask';
    if(lake){s.g.beginPath();s.g.rect(0,538,330,179);s.g.clip();}
    s.g.globalCompositeOperation='destination-in';Art.sprite(s.g,mask,0,0,0,330,717);s.g.restore();
    if(lake)g.drawImage(s.c,0,538,330,179,0,538,330,179);else g.drawImage(s.c,0,0);
  },
  air(g,t,strength){
    for(let i=0;i<48;i++){const kind=i%9===0?'trace':i%5===0?'fluff':'pollen';if(kind==='trace'&&strength<.5)continue;const speed=kind==='trace'?135:52+noise(i+4)*24;const age=(t+noise(i)*22)%22,y=767-age*speed*(.85+strength*.3);if(y<-100)continue;const x=noise(i+1)*330+Math.sin(age*.5+i)*5+Math.sin(t*.1)*age*strength*2;Art.sprite(g,'air-'+kind,cycle(age*2+i,8),x-8,y,kind==='trace'?24:16,kind==='trace'?64:12,kind==='trace'?.16*strength:.42);}
  }
};
