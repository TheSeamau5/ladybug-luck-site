'use strict';

// Live counterpart of animate-puzzle-sunset.py. Cloud positions, generated
// wind poses, wildlife and reflected sunlight all share the approved clock.
class PuzzleSunset {
  static async load(canvas, base='assets/puzzle/') {
    const response=await fetch(base+'sunset.json');
    if(!response.ok)throw new Error('Puzzle scenery could not load');
    const data=await response.json(), images={};
    const names=[...data.imageNames,'lake-distance',...['breeze','gust','settling','bristle','turn'].map(n=>'wind-'+n+'-field')];
    await Promise.all(names.map(name=>new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>{images[name]=image;resolve();};image.onerror=reject;image.src=base+name+'.png';
    })));
    return new PuzzleSunset(canvas,data,images);
  }
  constructor(canvas,data,images) {
    this.canvas=canvas;this.g=canvas.getContext('2d');this.data=data;this.images=images;this.pixel={};this.large={};
    canvas.width=1320;canvas.height=2868;
    for(const [name,image] of Object.entries(images)){
      const c=this.surface(image.width,image.height),g=c.getContext('2d',{willReadFrequently:true});g.drawImage(image,0,0);
      this.pixel[name]={data:g.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height};
      if(['clear-sky-and-sun','upper-cloud-layer-v4','low-cloud-layer'].includes(name)){
        const big=this.surface(c.width*4,c.height*4),bg=big.getContext('2d');bg.imageSmoothingEnabled=false;bg.drawImage(c,0,0,big.width,big.height);this.large[name]=big;
      }
    }
    this.ground=this.surface(330,717);this.gg=this.ground.getContext('2d');this.groundFrame=this.gg.createImageData(330,717);
    this.plants=this.surface(330,250);this.pg=this.plants.getContext('2d');this.plantFrame=this.pg.createImageData(330,250);
    this.small=this.surface(330,717);this.sg=this.small.getContext('2d');this.antLayer=this.surface(330,717);this.ag=this.antLayer.getContext('2d');
    this.beeLayer=this.surface(330,717);this.bg=this.beeLayer.getContext('2d');
    this.mask=this.surface(330,717);const mg=this.mask.getContext('2d'),mask=mg.createImageData(330,717),rock=this.pixel['ant-rock-surface-v4'].data;
    for(let n=0;n<330*717;n++)mask.data[n*4+3]=rock[n*4];mg.putImageData(mask,0,0);
    this.field=new Float32Array(330*250*2);this.lastNative=-1;this.lake=[];
    const water=this.pixel['water-mask'].data,distance=this.pixel['lake-distance'].data;
    for(let n=0;n<330*717;n++)if(water[n*4])this.lake.push({n,x:n%330,y:Math.floor(n/330),edge:Math.min(1,distance[n*4]/96)});
  }
  surface(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  clamp(x,a=0,b=1){return Math.max(a,Math.min(b,x));}
  smooth(x){x=this.clamp(x);return x*x*(3-2*x);}
  curve(p,t){const q=1-t;return [0,1].map(k=>q*q*q*p[0][k]+3*q*q*t*p[1][k]+3*q*t*t*p[2][k]+t*t*t*p[3][k]);}
  cloud(name,offset,y){const im=this.large[name],period=im.width,x=-(offset*4%period);this.g.imageSmoothingEnabled=true;this.g.drawImage(im,x,y*4);this.g.drawImage(im,x+period,y*4);}
  sunlight(t){
    const out=new Float32Array(22*22*4);let sum=0,count=0;
    for(const [name,offset,origin] of [['upper-cloud-layer-v4',825+t*.4125,0],['low-cloud-layer',1100+t*2.2,300]]){
      const p=this.pixel[name];
      for(let y=0;y<22;y++)for(let x=0;x<22;x++){
        const px=(offset+218+x)%p.w,k=Math.floor(px),f=px-k,a=((415+y-origin)*p.w+k)*4,b=((415+y-origin)*p.w+(k+1)%p.w)*4,j=(y*22+x)*4;
        const aa=p.data[a+3]/255,ab=p.data[b+3]/255,alpha=aa*(1-f)+ab*f,under=out[j+3]/255,combined=alpha+under*(1-alpha);
        if(combined)for(let c=0;c<3;c++)out[j+c]=(p.data[a+c]*aa*(1-f)+p.data[b+c]*ab*f+out[j+c]*under*(1-alpha))/combined;
        out[j+3]=combined*255;
      }
    }
    for(let y=0;y<22;y++)for(let x=0;x<22;x++)if((x-10.5)**2+(y-10.5)**2<=10.5**2){sum+=out[(y*22+x)*4+3]/255;count++;}
    return {covered:sum/count,pixels:out};
  }
  reflected(cloud,x,y,c){
    x=this.clamp(x,0,21);y=this.clamp(y,0,21);const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(21,x0+1),y1=Math.min(21,y0+1),fx=x-x0,fy=y-y0;
    return (cloud[(y0*22+x0)*4+c]*(1-fx)+cloud[(y0*22+x1)*4+c]*fx)*(1-fy)+(cloud[(y1*22+x0)*4+c]*(1-fx)+cloud[(y1*22+x1)*4+c]*fx)*fy;
  }
  water(t,sun){
    const out=this.groundFrame.data,base=this.pixel['landscape-underpainting'].data,mask=this.pixel['water-mask'].data;
    out.set(this.pixel['foliage-underpainting-v4'].data);
    const tau=Math.PI*2;
    for(const {n,x,y,edge} of this.lake){
      const near=.25+.75*this.clamp((y-523)/80),dx=(2.7*Math.sin(y*.4+tau*t/10)+1.1*Math.sin(x*.055-y*.19+tau*t/15))*near*edge;
      const dy=(.75*Math.sin(x*.085+y*.23-tau*t/12)+.28*Math.sin(x*.15-y*.4+tau*t/20))*near*edge;
      const sx=this.clamp(Math.round(x+dx),0,329),sy=this.clamp(Math.round(y+dy),0,716),sn=sy*330+sx,k=(mask[sn*4]?sn:n)*4;
      const warm=this.clamp((base[k]-base[k+2]+15)/140),delta=(Math.sin(y*.62+x*.14-tau*t/10)+.55*Math.sin(y*.35-x*.1+tau*t/12))*(2.7+warm*4.8)*edge;
      for(let c=0;c<3;c++)out[n*4+c]=Math.round(this.clamp(base[k+c]+delta*[1,.76,.37][c],0,255));
    }
    for(const [px,py,phase,period,length,travel] of this.data.reflectionCrests){
      const life=(t/period+phase)%1,envelope=Math.sin(Math.PI*life)**4;if(envelope<.015)continue;
      const move=Math.round(travel*(life-.5));
      for(let o=0;o<length;o++){const x=px+move+o,k=(py*330+x)*4;if(x<0||x>=330||!mask[k])continue;
        const shine=envelope*Math.sin(Math.PI*(o+.5)/length)**.6*.24,light=out[k]>out[k+2]?[255,191,86]:[134,139,167];
        for(let c=0;c<3;c++)out[k+c]=Math.round(out[k+c]*(1-shine)+light[c]*shine);
      }
    }
    for(const {n,x,y} of this.lake){
      const near=this.clamp((y-538)/72),width=6+near*12,wave=(1.6*Math.sin(y*.4+tau*t/10)+.65*Math.sin(x*.055-y*.19+tau*t/15))*near;
      const across=(x-221-wave)/width,mx=10.5+across*10.5,my=21*(1-near)+.32*Math.sin(x*.085+y*.23-tau*t/12);
      const blocked=this.reflected(sun.pixels,mx,my,3)/255,k=n*4,corridor=Math.exp(-.5*(across/1.05)**2)*this.smooth((y-535)/8)*(1-this.smooth((y-610)/12));
      const gold=this.smooth((out[k]-out[k+2]-10)/100)*this.smooth((out[k]-105)/115),loss=.92*corridor*gold*(.78*blocked+.22*sun.covered);
      for(let c=0;c<3;c++){const shade=this.data.ambientWater[y][c]*(1-.3*blocked)+this.reflected(sun.pixels,mx,my,c)*.3*blocked;out[k+c]=Math.round(out[k+c]*(1-loss)+shade*loss);}
    }
    const alpha=this.pixel.terrain.data;for(let n=0;n<330*717;n++)out[n*4+3]=alpha[n*4+3];
    this.gg.putImageData(this.groundFrame,0,0);this.boat(t);
  }
  wind(t){
    const active=this.data.windGestures.filter(e=>e.start<=t&&t<=e.end),last=active.at(-1),blends=[];
    const add=(e,weight)=>{const phase=this.clamp((t-e.start)/(e.end-e.start))*31;blends.push({p:this.pixel['wind-'+e.gesture+'-field'],k:Math.floor(phase),f:phase%1,weight});};
    if(active.length>1){const previous=active.at(-2),f=this.smooth((t-last.start)/(previous.end-last.start));add(previous,1-f);add(last,f);}else add(last,1);
    this.field.fill(0);const closure=t>2398?this.smooth((2400-t)/2):1;
    for(const b of blends){const next=Math.min(31,b.k+1),x0=b.k%8*330,y0=Math.floor(b.k/8)*250,x1=next%8*330,y1=Math.floor(next/8)*250;
      for(let y=0;y<250;y++)for(let x=0;x<330;x++){const n=y*330+x,a=((y0+y)*b.p.w+x0+x)*4,z=((y1+y)*b.p.w+x1+x)*4;
        for(let c=0;c<2;c++)this.field[n*2+c]+=((b.p.data[a+c]*(1-b.f)+b.p.data[z+c]*b.f)-128)/32*b.weight*closure;
      }
    }
    const out=this.plantFrame.data;out.fill(0);
    for(const name of ['wind-trees-v4','wind-grasses-v4','wind-flowers-v4']){const source=this.pixel[name].data;
      for(let y=0;y<250;y++)for(let x=0;x<330;x++){const n=y*330+x,sx=this.clamp(Math.round(x+this.field[n*2]),0,329),sy=this.clamp(Math.round(y+this.field[n*2+1]),0,249),k=(sy*330+sx)*4;
        if(source[k+3])for(let c=0;c<4;c++)out[n*4+c]=source[k+c];
      }
    }this.pg.putImageData(this.plantFrame,0,0);
  }
  sprite(g,name,pose,cols,w,h,x,y,dw=w,dh=h){g.drawImage(this.images[name],pose%cols*w,Math.floor(pose/cols)*h,w,h,x,y,dw,dh);}
  boat(t){
    const tau=Math.PI*2;let lift=0,look=false;
    for(const e of this.data.fishingGestures){const local=t-e.start;if(local<0||local>e.duration)continue;const pulse=Math.sin(Math.PI*local/e.duration)**2;if(e.kind==='look')look=pulse>.55;else lift=pulse;}
    const pose=look?4:lift>.72?2:lift>.25?1:0,x=271+Math.round(.5*Math.sin(tau*t/30)+.18*Math.sin(tau*t/20)),y=552+Math.round(.48*Math.sin(tau*t/6)+.18*Math.sin(tau*t/10)),g=this.gg;
    g.imageSmoothingEnabled=false;g.save();g.globalAlpha=.21;g.translate(x,y+12);g.scale(1,-1);g.drawImage(this.images['boat-distant-0'+pose],0,0,12,3);g.restore();
    const fy=560+Math.round(.52*Math.sin(tau*t/6+1.2));g.strokeStyle='rgba(172,147,121,.41)';g.lineWidth=1;g.beginPath();g.moveTo(x+1,y+1-(pose===2?1:0));g.lineTo(x,fy);g.stroke();g.fillStyle='#e79e41';g.fillRect(x,fy,1,1);g.drawImage(this.images['boat-distant-0'+pose],x,y);
  }
  wildlife(t){
    const g=this.sg;g.clearRect(0,0,330,717);g.imageSmoothingEnabled=false;
    for(const e of this.data.birdFlights){const local=t-e.start;if(local<0||local>=e.duration)continue;const u=local/e.duration,x=e.direction>0?-20+370*u:350-370*u,y=e.height+e.rise*this.smooth(u)+1.5*Math.sin(local*.42+e.phase),beat=(local+e.phase)%(e.glide+e.flap),pose=beat<e.flap?Math.floor(beat*32)%16:16+Math.floor((beat-e.flap)*4)%16,h=Math.round(e.size*32/24);
      g.save();g.translate(x,y);if(e.direction<0)g.scale(-1,1);this.sprite(g,'distant-bird-poses',pose,8,24,32,-e.size/2,-h/2,e.size,h);g.restore();
    }
    const a=this.ag;a.clearRect(0,0,330,717);a.imageSmoothingEnabled=false;
    for(const e of this.data.antWalks){const local=t-e.start;if(local<0||local>=e.duration)continue;const duration=e.duration-e.pause,travelled=local-Math.min(e.pause,Math.max(0,local-e.pauseAt*duration)),u=travelled/duration,pos=this.curve(e.path,u),pa=this.curve(e.path,Math.max(0,u-.002)),pb=this.curve(e.path,Math.min(1,u+.002)),w=e.size===1?14:11,h=e.size===1?10:8;
      a.save();a.globalAlpha=Math.min(1,local/.7,(e.duration-local)/.7);a.translate(pos[0],pos[1]);a.rotate(Math.atan2(pb[1]-pa[1],pb[0]-pa[0]));this.sprite(a,'ant-walk-poses',Math.floor(travelled*7+e.phase)%8,8,14,10,-w/2,-h/2,w,h);a.restore();
    }a.save();a.globalCompositeOperation='destination-in';a.drawImage(this.mask,0,0);a.restore();
  }
  bees(t){
    const g=this.bg;g.clearRect(0,0,330,717);g.imageSmoothingEnabled=false;
    for(const e of this.data.beeVisits){const local=t-e.start,a=e.approach,h=e.hover,f=e.feed,d=e.depart;if(local<0||local>=a+h+f+d)continue;
      const sign=e.entry==='left'?1:-1,side=sign===1?'right':'left',j=((e.flower.y-467)*330+e.flower.x)*2,target=[e.flower.x-sign*6-this.field[j],e.flower.y-4.5-this.field[j+1]],phi=e.phase;let pos,feeding=false;
      if(local<a){const start=sign===1?-26:356;pos=this.curve([[start,e.height],[start+sign*72,e.height-13],[target[0]-sign*35,target[1]-38],target],this.smooth(local/a));}
      else if(local<a+h){const u=local-a,envelope=this.smooth(u/.5)*this.smooth((h-u)/.65);pos=[target[0]+envelope*1.8*Math.sin(u*2+phi),target[1]+envelope*(1.2*Math.sin(u*3.1)+.5*Math.sin(u*5.6))];}
      else if(local<a+h+f){const u=(local-a-h)/f,v=Math.sin(Math.PI*u)**2;feeding=u>.22&&u<.76;pos=[target[0]+sign*.7*v,target[1]+2.5*v];}
      else{const end=sign===1?356:-26;pos=this.curve([target,[target[0]+sign*30,target[1]-25],[end-sign*55,e.exitHeight-20],[end,e.exitHeight]],this.smooth((local-a-h-f)/d));}
      const x=Math.round(pos[0]-12),y=Math.round(pos[1]-21);this.sprite(g,'bee-'+side,feeding?5:Math.floor(t*190+phi*4)%32,8,24,32,x,y);this.sprite(g,'bee-feelers-'+side,Math.floor(t*17+phi*6)%32,8,24,32,x,y);
    }
  }
  draw(time){
    const t=(time%2400+2400)%2400,g=this.g,sun=this.sunlight(t);g.globalAlpha=1;g.imageSmoothingEnabled=false;g.drawImage(this.large['clear-sky-and-sun'],0,0);
    this.cloud('upper-cloud-layer-v4',825+t*.4125,0);this.cloud('low-cloud-layer',1100+t*2.2,300);
    const tick=Math.floor((t+1e-7)*30);if(tick!==this.lastNative){this.lastNative=tick;this.wind(t);this.water(t,sun);this.wildlife(t);this.bees(t);}
    g.imageSmoothingEnabled=false;g.drawImage(this.small,0,0,1320,2868);g.drawImage(this.ground,0,0,1320,2868);g.drawImage(this.antLayer,0,0,1320,2868);g.drawImage(this.plants,0,1868,1320,1000);
    g.drawImage(this.beeLayer,0,0,1320,2868);
    g.fillStyle='rgba(0,0,0,'+(sun.covered*.1)+')';g.fillRect(0,0,1320,2868);
    this.coverage=sun.covered;
  }
}
