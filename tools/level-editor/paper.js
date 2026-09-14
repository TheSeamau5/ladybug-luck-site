'use strict';

// The miniature and the puzzle piece share their original, unaltered ink.
const LyricPaper = {
  names: Array.from({length:15}, (_,i)=>'lyric-fragment-'+String(i+1).padStart(2,'0')),
  frames: new Map(),
  seed(id){let n=2166136261;for(const c of id)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0)%10007;},
  drift(t,seed,period){
    const k=Math.floor(t/period),f=smooth(t/period-k);
    return (noise(seed+k)*2-1)*(1-f)+(noise(seed+k+1)*2-1)*f;
  },
  assign(project){
    const objects=project.levels.flatMap(l=>l.objects).filter(o=>o.type==='lyric');
    const used=new Set(objects.map(o=>o.asset));
    for(const o of objects)if(!this.names.includes(o.asset)){
      o.asset=this.names.find(name=>!used.has(name))||this.names[this.seed(o.id)%15];
      used.add(o.asset);
    }
  },
  next(project){
    const used=new Set(project.levels.flatMap(l=>l.objects).filter(o=>o.type==='lyric').map(o=>o.asset));
    return this.names.find(name=>!used.has(name))||this.names[0];
  },
  pose(o,t){
    const s=this.seed(o.id),phase=s*.071;
    return {
      x:2.8*this.drift(t+phase,s,2.7),
      y:2.3*Math.sin(t*1.13+phase)+.7*Math.sin(t*2.31+phase*.7),
      roll:.17*this.drift(t+phase,s+30,2.1)+.035*Math.sin(t*2.2+phase),
      yaw:.52*this.drift(t+phase,s+70,3.3),
      pitch:.28*Math.sin(t*1.21+phase),
      curl:1.5*Math.sin(t*2.1+phase)+.7*this.drift(t+phase,s+90,1.7)
    };
  },
  raster(asset,pose,scale=1,shine=-1,flipped=false){
    const spec=EDITOR_LIBRARY.sprites[asset];if(!spec)return null;
    const source=Art.pixels(spec.src);if(!source)return null;
    const q=v=>Math.round(v*50)/50;
    const values=[pose.roll,pose.yaw,pose.pitch,pose.curl,scale,shine].map(q);
    const key=asset+':'+values.join(',')+':'+flipped;
    if(this.frames.has(key))return this.frames.get(key);
    const [roll,yaw,pitch,curl,size,sheen]=values;
    const c=document.createElement('canvas');c.width=64;c.height=64;
    const g=c.getContext('2d'),pixels=g.createImageData(64,64);
    const co=Math.cos(roll),si=Math.sin(roll),cx=Math.cos(yaw),cy=Math.cos(pitch);
    const halfW=spec.w/2,halfH=spec.h/2,shear=Math.sin(yaw)*.16;
    const lightBase=1+Math.sin(yaw)*.08-Math.sin(pitch)*.07,white=[255,252,219];
    const boundU=halfW*Math.abs(cx)+halfH*Math.abs(shear),boundV=halfH*Math.abs(cy)+Math.abs(curl)*.87;
    const boundX=(Math.abs(co)*boundU+Math.abs(si)*boundV)*Math.abs(size)+4,boundY=(Math.abs(si)*boundU+Math.abs(co)*boundV)*Math.abs(size)+4;
    const left=Math.max(0,Math.floor(32-boundX)),right=Math.min(64,Math.ceil(32+boundX)),top=Math.max(0,Math.floor(32-boundY)),bottom=Math.min(64,Math.ceil(32+boundY));
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
      const dx=(x+.5-32)/size,dy=(y+.5-32)/size;
      const px=dx*co+dy*si,py=-dx*si+dy*co;
      let u=px/cx,v=py/cy;
      // Inverse of a gently curled sheet. Corners move after its center;
      // ink, holes, and singed edges are sampled together, exactly once.
      for(let i=0;i<3;i++){
        u=(px-v*shear)/cx;
        v=(py-curl*(u*u/(halfW*halfW)-.33)-curl*.2*u*v/(halfW*halfH))/cy;
      }
      const sx=Math.floor((flipped?-u:u)+halfW),sy=Math.floor(v+halfH);
      if(sx<0||sy<0||sx>=spec.w||sy>=spec.h)continue;
      const a=(sy*source.w+sx)*4;if(source.data[a+3]<128)continue;
      const b=(y*64+x)*4;
      const light=lightBase-curl*u/(halfW*halfW)*.28;
      const band=sheen<0?0:Math.max(0,1-Math.abs((u/halfW+v/halfH*.55)-(sheen*3.8-1.9))/.22)*.9;
      for(let k=0;k<3;k++)pixels.data[b+k]=Math.round(clamp(source.data[a+k]*light,0,255)*(1-band)+white[k]*band);
      pixels.data[b+3]=255;
    }
    g.putImageData(pixels,0,0);this.frames.set(key,c);
    if(this.frames.size>256)this.frames.delete(this.frames.keys().next().value);
    return c;
  },
  draw(g,asset,pose,x,y,scale=1,shine=-1,flipped=false){
    const frame=this.raster(asset,pose,scale,shine,flipped);if(!frame)return;
    g.drawImage(frame,Math.round(x)-32,Math.round(y)-32);
  }
};
