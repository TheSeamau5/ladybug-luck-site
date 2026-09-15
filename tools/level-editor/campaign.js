'use strict';

// Player progression and the approved scenic entrance, using the existing game
// simulation, scenery renderer, sprites and puzzle. Editor drafts stay separate.
const Campaign = {
  key:'ladybug-player-progress-v1', screen:null, menuTime:0, lastMenuTick:0,
  base:'assets/campaign/', progress:{playedOnce:false,controlsSeen:false,completed:{}}, visitors:[],
  layouts:new WeakMap(),
  observedLayouts:new WeakSet(),
  forestNames:['forest-trunk-0',...EDITOR_LIBRARY.forestTiles.map(p=>p.name),...EDITOR_LIBRARY.forestFlowers.filter(f=>f.section===0&&f.y<717).map(f=>f.asset)],
  fitSurface(view){
    const cached=this.layouts.get(view);if(cached)return cached;
    if(window.ResizeObserver&&!this.observedLayouts.has(view)){
      if(!this.layoutObserver)this.layoutObserver=new window.ResizeObserver(entries=>{for(const entry of entries)this.layouts.delete(entry.target);request();});
      this.layoutObserver.observe(view);this.observedLayouts.add(view);
    }
    const rect=view.getBoundingClientRect(),width=rect.width,height=rect.height;
    if(!width||!height)return {x:0,y:0,scale:1,bottomCrop:0};
    const style=window.getComputedStyle?.(view),inset=side=>parseFloat(style?.getPropertyValue('padding-'+side))||0;
    const top=inset('top'),right=inset('right'),bottom=inset('bottom'),left=inset('left');
    const key=[width,height,top,right,bottom,left].join(':');
    const previous=this.layouts.get(view);if(previous?.key===key)return previous;
    const sceneScale=Math.max(width/W,height/H),sceneWidth=W*sceneScale,sceneHeight=H*sceneScale;
    // Keep the lower entrance perch in view when browser chrome shortens a phone.
    const sceneX=(width-sceneWidth)/2,sceneY=(height-sceneHeight)*.66;
    const uiScale=Math.min((width-left-right)/W,(height-top-bottom)/H);
    const uiWidth=W*uiScale,uiHeight=H*uiScale,uiX=left+(width-left-right-uiWidth)/2,uiY=top+(height-top-bottom-uiHeight)/2;
    for(const [name,value] of Object.entries({'scene-x':sceneX,'scene-y':sceneY,'scene-width':sceneWidth,'scene-height':sceneHeight,'ui-x':uiX,'ui-y':uiY,'ui-width':uiWidth,'ui-height':uiHeight}))view.style.setProperty('--'+name,value+'px');
    const layout={key,x:(uiX-sceneX)/sceneScale,y:(uiY-sceneY)/sceneScale,scale:uiScale/sceneScale,bottomCrop:Math.max(0,H-(height-sceneY)/sceneScale)};
    this.layouts.set(view,layout);return layout;
  },
  uiLayout(){return this.fitSurface($('stage'));},
  visibleBottom(){return offset+this.uiLayout().bottomCrop;},
  placeUI(g){const view=this.uiLayout();g.translate(view.x,view.y);g.scale(view.scale,view.scale);},
  read(){
    try {
      const saved=JSON.parse(localStorage.getItem(this.key)||'{}');
      this.progress={playedOnce:saved.playedOnce===true,controlsSeen:saved.controlsSeen===true,completed:{}};
      for(const [id,result] of Object.entries(saved.completed||{})) {
        if(result&&Number.isFinite(result.best))this.progress.completed[id]={best:Math.max(0,result.best)};
      }
    } catch { this.progress={playedOnce:false,controlsSeen:false,completed:{}}; }
  },
  persist(){
    if(!publicPlay)return;
    try { localStorage.setItem(this.key,JSON.stringify(this.progress)); }
    catch { tell('Keep this page open to retain your progress.'); }
  },
  levels(){return project.levels;},
  current(){return this.levels().find(l=>!this.progress.completed[l.id])||null;},
  unlocked(level){
    const index=this.levels().indexOf(level);
    return index===0||!!this.progress.completed[level.id]||!!this.progress.completed[this.levels()[index-1]?.id];
  },
  theme(){return this.menuLevel?.theme||'puzzle';},
  matchSky(theme,light=0){
    if(!publicPlay)return;
    if(theme==='rain')light=clamp((light-.18)/.82);
    this.skyColors??=JSON.parse($('opening-colors').textContent);
    const colors=this.skyColors[theme];if(!colors)return;
    const a=colors[0],b=colors[1]||a,color='rgb('+a.map((v,i)=>Math.round(v*(1-light)+b[i]*light)).join(',')+')';
    if(color===this.skyColor)return;this.skyColor=color;
    document.documentElement.style.setProperty('--game-sky',color);
    document.querySelector('meta[name="theme-color"]').content=color;
  },
  lyrics(level=state){return level.objects.filter(o=>o.type==='lyric'&&!o.hidden).sort((a,b)=>a.asset.localeCompare(b.asset));},
  rewardPath(asset,size,status){return this.base+size+'/fragment-'+asset.slice(-2)+'-'+status+'.png?v='+LyricPaper.revision;},
  prepareArt(){
    const level=this.menuLevel||state,rain=level.theme==='rain',flight=level.mode==='flight';
    const previousOwner=Art.owner;Art.owner=level.id;
    try{
    Scene.ready(level,this.menuTime);
    if(rain||flight)for(const name of ['breeze','gust','recovery','bristle','crosswind'])Scene.fieldPixels(EDITOR_LIBRARY.sprites[(rain?'rain':'dandelion')+'-level-'+name+'-field'].src);
    if(level.theme==='garden')for(const [name,spec] of Object.entries(EDITOR_LIBRARY.sprites))if(name.startsWith('garden-')&&(spec.count===1||name.includes('gentle-breeze')))Art.image(spec.src);
    for(const name of ['title','title-without-g','letter-g','vine-0','vine-1','title-flowers','bee-left','bee-right','bee-feelers-left','bee-feelers-right','woodpecker-flight','woodpecker-perched',...(flight?['summit-garden','dandelion-head','seed-unoccupied']:rain?['welcome-rain-vine','summit-rain','rain-drop']:['welcome-garden-vine','summit-garden'])])Art.image(this.base+name+'.png');
    for(const {asset} of this.lyrics(level))for(const size of ['hud','completion'])for(const status of size==='hud'?['missing','previous','found']:['missing','found','arrival'])Art.image(this.rewardPath(asset,size,status));
    preparePlayerArt(level);
    if(level.forestArtwork)for(const name of this.forestNames)Art.image(EDITOR_LIBRARY.sprites[name].src);
    if(!flight){
      if(!level.forestArtwork){for(let i=0;i<4;i++)Art.image(this.base+'stem-silhouette-'+i+'.png');for(const name of ['flower-daisy-bloom','flower-pink-bloom','vine-growing-tip'])Art.image(EDITOR_LIBRARY.sprites[name].src);}
      for(const name of ['leaf-unfurl-left','leaf-unfurl-right'])Art.image(EDITOR_LIBRARY.sprites[name].src);
    }
    for(const side of ['left','right'])Art.image('assets/leaf-'+side+'-joined.png');
    for(const side of ['left','right'])for(const name of ['leaf-brown-','leaf-brown-stump-'])Art.image(EDITOR_LIBRARY.sprites[name+side].src);
    if(rain){Art.image(this.base+'wet-vine-base.png');for(const name of ['leaf','hanging','right'])for(const part of ['poses','drops'])Art.image(EDITOR_LIBRARY.sprites['wet-'+name+'-'+part].src);}
    }finally{Art.owner=previousOwner;}
  },
  ready(){
    if(this.fontReady===false)return false;
    const previousOwner=Art.owner;Art.owner=(this.menuLevel||state).id;
    try{
    const rain=this.theme()==='rain',flight=this.menuLevel?.mode==='flight';
    const fieldsReady=!(rain||flight)||['breeze','gust','recovery','bristle','crosswind'].every(name=>Scene.fieldPixels(EDITOR_LIBRARY.sprites[(rain?'rain':'dandelion')+'-level-'+name+'-field'].src));
    const names=['title-without-g','letter-g','vine-0','vine-1','title-flowers',...(this.menuLevel?.mode==='flight'?['summit-garden','dandelion-head','seed-unoccupied']:this.theme()==='rain'?['welcome-rain-vine','rain-drop']:['welcome-garden-vine'])];
    if(this.theme()==='rain')names.push('wet-vine-base',...['leaf','hanging','right'].flatMap(name=>['wet-'+name+'-poses','wet-'+name+'-drops']));
    if(this.menuLevel?.mode==='climb'){names.push('leaf-unfurl-left','leaf-unfurl-right');if(!this.menuLevel.forestArtwork)names.push('stem-silhouette-0','stem-silhouette-1','stem-silhouette-2','stem-silhouette-3','vine-growing-tip','flower-daisy-bloom','flower-pink-bloom');}
    if(this.menuLevel)for(const o of this.menuLevel.objects)names.push(o.asset);
    if(this.menuLevel?.forestArtwork)names.push(...this.forestNames);
    if(this.menuLevel?.leaves.some(leaf=>leaf.fragile))names.push('leaf-brown-left','leaf-brown-right','leaf-brown-stump-left','leaf-brown-stump-right');
    return fieldsReady&&(!this.menuLevel||Scene.ready(this.menuLevel,this.menuTime))&&names.every(name=>Art.image(EDITOR_LIBRARY.sprites[name]?.src||this.base+name+'.png').ready)&&imgs.left.naturalWidth&&imgs.right.naturalWidth&&preparePlayerArt(this.menuLevel||state).every(name=>Art.image(EDITOR_LIBRARY.sprites[name].src).ready);
    }finally{Art.owner=previousOwner;}
  },
  async ensureSunset(){
    if(this.sunset||this.sunsetLoading)return;
    this.sunsetLoading=true;
    try { this.sunset=await PuzzleSunset.load($('backdrop')); }
    catch(error){console.error('Welcome scenery could not load',error);setTimeout(()=>this.ensureSunset(),2000);}
    finally { this.sunsetLoading=false;this.updateReady(); }
  },
  showWelcome(id=null,route=true){
    this.pendingStart=null;this.pendingRestart=false;
    if(preview)stopPlay();
    const requested=id&&this.levels().find(l=>l.id===id);
    this.menuLevel=requested&&this.unlocked(requested)?requested:this.current();
    Art.owner=this.menuLevel?.id||null;
    if(this.menuLevel)switchLevel(this.menuLevel.id);
    this.screen='welcome';this.lastMenuTick=0;
    setRoute('test',route?'/test/'+(id?'?level='+(this.levels().indexOf(this.menuLevel)+1):''):null);
    document.title='Ladybug Luck';
    document.body.classList.add('campaign');document.body.classList.remove('levels-page','test-library','focus-mode','sheet-open');
    for(const id of ['level-drawer','test-start','pause-panel','completion','campaign-selector','campaign-retry','game-hud','mobile-pause'])$(id).hidden=true;
    $('campaign-menu').hidden=false;$('welcome-levels').hidden=!this.progress.playedOnce;
    $('editor-main').inert=false;$('play-controls').inert=false;
    offset=0;collidersVisible=false;selected.clear();selection=null;inspectionClock=null;
    this.prepareArt();if(!this.menuLevel)this.ensureSunset();this.updateReady();request();
  },
  updateReady(){
    if(this.pendingRestart&&this.ready()){this.pendingRestart=false;restartPlay();return;}
    if(this.pendingStart&&this.ready()){const level=this.pendingStart;this.pendingStart=null;this.begin(level);return;}
    if(this.screen!=='welcome')return;
    const ready=this.ready();
    if(ready&&this.menuLevel&&!state.forestArtwork&&state.mode==='climb'&&(botanyDirty||!botanicalTiles.has(state.id+':0'))){
      const view=offset,prepared=Scene.maskSurface('prepared-opening-botany').g;
      // Both full-length climbs fit in sixteen cached screens. Keep the first
      // screen resident too, so preparation cannot repeat on every menu frame.
      const height=Math.min(state.height,H*16);
      for(let base=0;base<height;base+=H){offset=base;paintBotany(prepared);}
      offset=view;
    }
    $('welcome-play').disabled=!ready||(!this.menuLevel&&!this.sunset);
  },
  begin(level=this.menuLevel){
    if(navigator.maxTouchPoints>0&&!tiltEnabled)enableTilt();
    this.pendingRestart=false;
    if(!level){
      if(PuzzleLevel.owned().length)PuzzleLevel.open({returnTo:'/test/'});
      else this.showLevels();
      return;
    }
    if(!this.unlocked(level))return;
    this.menuLevel=level;this.prepareArt();
    if(!this.ready()){this.pendingStart=level;return;}
    this.pendingStart=null;
    this.departingWelcome=this.screen==='welcome'?{playedOnce:this.progress.playedOnce}:null;
    if(preview)stopPlay();if(state.id!==level.id)switchLevel(level.id);this.screen=null;
    Art.owner=level.id;
    // The destination is fully loaded before removing references to the old
    // level. Retry keeps its own fully grown plant assets.
    if(this.artLevel!==level.id){
      this.artLevel=level.id;
      for(const [src,entry] of Art.images)if(entry.owner!==level.id)Art.images.delete(src);
      for(const src of Scene.fields.keys())if(!src.includes((level.theme==='rain'?'rain':level.mode==='flight'?'dandelion':'none')+'-level-'))Scene.fields.delete(src);
      Scene.surfaces.clear();colliderFrames.clear();LyricPaper.frames.clear();rotatedSprites.clear();
      this.openingLayers.clear();this.wetSurfaces.clear();this.plantPlatformCache=new WeakMap();
      if(!this.sunsetLoading)this.sunset=null;
    }
    $('campaign-menu').hidden=true;$('campaign-selector').hidden=true;$('campaign-retry').hidden=true;
    document.body.classList.add('campaign');
    setRoute('test','/test/?level='+(this.levels().indexOf(level)+1));
    startPlay(true);
  },
  opening(level=state){
    return level.mode==='flight'
      ? {id:'opening-flower',type:'leaf',x:85,y:153,side:'left',opening:true,radius:24}
      : {id:'opening-leaf',type:'leaf',x:180,y:this.openingSurface(level,180)??146,side:'left',opening:true,radius:37};
  },
  ending(level=state){
    if(level.ending)return {...level.ending,id:'summit',type:'leaf',side:'left',summit:true,radius:37};
    const y=level.mode==='flight'?level.height-230:Math.max(...level.leaves.filter(l=>!l.hidden).map(l=>l.y))+165;
    return {id:'summit',type:'leaf',x:165,y,side:'left',summit:true,radius:37};
  },
  startFor(level=state){
    const leaf=this.opening(level);
    return {x:leaf.x,y:leaf.y,offset:0,leaf};
  },
  openingLayers:new Map(),
  openingLayer(level=state){
    const rain=level.theme==='rain',flight=level.mode==='flight',name=flight?'dandelion-head':rain?'welcome-rain-vine':'welcome-garden-vine';
    if(rain&&!flight)return this.wetOpening(this.screen?this.menuTime:sceneClock);
    if(this.openingLayers.has(name))return this.openingLayers.get(name);
    const e=Art.image(this.base+name+'.png');if(!e.ready)return null;
    // Resample once onto the native grid. Rendering this layer at four times
    // size preserves a four-physical-pixel square for every painted pixel.
    const c=document.createElement('canvas');c.width=W;c.height=H;
    const g=c.getContext('2d');g.imageSmoothingEnabled=false;
    if(flight)g.drawImage(e.image,67,156,264,573.6);
    else g.drawImage(e.image,65,rain?171:136,267.3,580.77);
    const layer={canvas:c,pixels:g.getImageData(0,0,W,H).data};
    this.openingLayers.set(name,layer);return layer;
  },
  openingSurface(level,x){
    if(level.theme==='garden')return this.plantSurface({plant:'opening',bounds:this.plantLeaves.opening[3]},x,level);
    if(level.theme==='rain')return this.plantSurface({plant:'opening',wet:3},x,level);
    const layer=this.openingLayer(level);if(!layer)return null;
    const col=Math.round(x);if(col<143||col>222)return null;
    for(let row=level.theme==='rain'?553:558;row<615;row++)if(layer.pixels[(row*W+col)*4+3]>128)return H-row;
    return null;
  },
  openingPerchPart(level,name,frame,x,view=0){
    // Match the painted front and rear toes to the leaf. Rotating the whole
    // pose keeps the shell and legs intact instead of sinking the bug down.
    const right=name.endsWith('-right'),front=[right?57:22,46],rear=[right?21:58,49];
    const foot=([px,py])=>[px*.5,py*.5],a=foot(front),b=foot(rear),pivot=[20,24];
    const top=px=>H-(this.openingSurface(level,px)??this.opening(level).y)+view;
    let angle=Math.atan2(b[1]-a[1],b[0]-a[0])-Math.atan2(top(x-20+b[0])-top(x-20+a[0]),b[0]-a[0]);
    angle=Math.round(Math.atan2(Math.sin(angle),Math.cos(angle))*90)/90;
    const c=Math.cos(angle),s=Math.sin(angle);
    const turn=([px,py])=>[pivot[0]+(px-pivot[0])*c+(py-pivot[1])*s,pivot[1]-(px-pivot[0])*s+(py-pivot[1])*c];
    const f=turn(a),r=turn(b);
    const y=Math.round((top(x-20+f[0])-f[1]+top(x-20+r[0])-r[1])*.5);
    return {asset:name,frame,x:Math.round(x-20),y,w:40,h:32,angle,pivot};
  },
  openingSway(row,t){return (Math.sin(t*.72)*1.1+Math.sin(t*1.37+.8)*.5)*clamp((550-row)/360);},
  advancePerch(p,dt){
    p.perchTime+=dt;
    if(p.gesture&&p.perchTime>=p.gesture.frames/50){p.lastGesture=p.gesture.name;p.gesture=null;}
  },
  // These rectangles identify actual leaves in the separate plant artwork.
  // Within each rectangle the upper opaque pixel is the landing surface.
  plantLeaves:{
    opening:[[250,313,185,222],[251,305,279,325],[197,282,384,440],[72,200,530,578],[294,329,544,585],[251,307,614,651],[111,170,672,712],[226,246,527,543],[317,329,480,505],[181,202,596,617],[179,202,673,706],[236,269,690,714]],
    ending:[[73,157,262,303],[183,243,332,375],[42,99,384,421],[133,176,421,468],[11,39,478,492],[83,121,491,521],[0,31,558,581],[72,139,564,617],[53,96,608,650]]
  },
  rainPlantLeaves:{
    opening:[[320,329,64,89],[298,310,187,195],[315,329,281,297],[319,329,357,373],[184,208,625,641],[241,272,614,631],[244,276,636,654],[248,274,658,677]],
    ending:[[70,155,192,235],[167,247,260,306],[32,89,319,358],[101,173,367,404],[4,24,435,453],[70,120,447,476],[3,31,526,548],[67,149,539,584],[40,97,590,624],[10,53,634,660]]
  },
  wetSurfaces:new Map(),
  wetLeafSurface(index,x,level=state){
    const leaf=EDITOR_LIBRARY.wetLeaves[index],layer=this.openingLayer(level);if(!layer)return null;
    // Use the same two nearest-neighbour samples as the painted plant: first
    // the individual leaf cel, then the whole plant on the native scene grid.
    const column=Math.floor((Math.round(x)-65+.5)*W/267);
    if(column<0||column>=W||column<leaf.x||column>=leaf.x+leaf.w)return null;
    const col=Math.floor((column-leaf.x+.5)*128/leaf.w),frame=layer.poses?.[index]??0;
    const key=leaf.kind+':'+frame;
    let surface=this.wetSurfaces.get(key);
    if(!surface){
      const spec=EDITOR_LIBRARY.sprites['wet-'+leaf.kind+'-poses'],pixels=Art.pixels(spec.src);if(!pixels)return null;
      const ox=frame%spec.cols*128,oy=Math.floor(frame/spec.cols)*128;
      surface=new Int16Array(128).fill(-1);
      for(let x=0;x<128;x++)for(let y=0;y<128;y++){
        const n=((oy+y)*pixels.w+ox+x)*4,d=pixels.data;
        // Water can extend beyond the blade. Only the green leaf carries the
        // player; a dangling or detached drop never becomes a platform.
        if(d[n+3]>128&&d[n+1]>d[n]*.9&&d[n+1]>d[n+2]*1.05){surface[x]=y;break;}
      }
      this.wetSurfaces.set(key,surface);
    }
    if(surface[col]<0)return null;
    const row=leaf.y+Math.ceil(surface[col]*leaf.h/128-.5);
    return H-171-Math.ceil(row*581/H-.5);
  },
  plantPlatformCache:new WeakMap(),
  plantPlatforms(){
    if(state.mode!=='climb')return [];
    const rain=state.theme==='rain',leaves=[],end=this.ending(),key=state.theme+':'+end.x+':'+end.y;
    const cached=this.plantPlatformCache.get(state);if(cached?.key===key)return cached.leaves;
    if(!this.openingLayer()||!Art.pixels(this.base+(rain?'summit-rain.png':'summit-garden.png')))return leaves;
    if(rain)EDITOR_LIBRARY.wetLeaves.forEach((wet,i)=>{
      if(i===3)return; // The starting perch owns this same complete blade.
      const left=Math.max(0,65+wet.x*267/W),right=Math.min(W-1,65+(wet.x+wet.w)*267/W);
      const columns=[];
      for(let x=Math.ceil(left);x<=right;x++)if(this.wetLeafSurface(i,x)!==null)columns.push(x);
      if(!columns.length)return;
      const x=columns[Math.floor(columns.length/2)];
      leaves.push({id:'opening-wet-leaf-'+i,type:'leaf',plant:'opening',wet:i,x,y:this.wetLeafSurface(i,x),side:wet.kind==='right'?'right':'left'});
    });
    for(const [plant,rectangles] of Object.entries(rain?this.rainPlantLeaves:this.plantLeaves)){
      const end=this.ending(),sx=plant==='opening'?(rain?267:267.3)/W:1,ox=plant==='opening'?65:end.x-(rain?207:205);
      rectangles.forEach((bounds,i)=>{
        // The large opening leaf already owns the starting perch.
        if(!rain&&plant==='opening'&&i===3)return;
        const left=Math.max(0,ox+bounds[0]*sx),right=Math.min(W-1,ox+bounds[1]*sx);
        if(right<left)return;
        const leaf={id:plant+'-painted-leaf-'+i,type:'leaf',plant,bounds,x:0,y:0,side:'left'},columns=[];
        for(let x=Math.ceil(left);x<=right;x++)if(this.plantSurface(leaf,x)!==null)columns.push(x);
        if(!columns.length)return;
        leaf.x=columns[Math.floor(columns.length/2)];leaf.y=this.plantSurface(leaf,leaf.x);leaves.push(leaf);
      });
    }
    this.plantPlatformCache.set(state,{key,leaves});
    return leaves;
  },
  plantSurface(leaf,x,level=state){
    if(leaf.wet!==undefined)return this.wetLeafSurface(leaf.wet,x,level);
    const opening=leaf.plant==='opening',rain=level.theme==='rain',end=this.ending(level),scale=opening?(rain?267:267.3)/W:1,vertical=opening&&rain?581/H:scale;
    const ox=opening?65:end.x-(rain?207:205),oy=opening?(rain?171:136):0;
    if(x<ox+leaf.bounds[0]*scale||x>ox+leaf.bounds[1]*scale)return null;
    const pixels=opening?this.openingLayer(level)?.pixels:Art.pixels(this.base+(rain?'summit-rain.png':'summit-garden.png'))?.data;if(!pixels)return null;
    const first=Math.ceil(oy+leaf.bounds[2]*vertical),last=Math.floor(oy+leaf.bounds[3]*vertical),anchor=rain?118:214;
    for(let row=first;row<=last;row++){
      const sway=Math.round(opening?(rain?0:this.openingSway(row,sceneClock)):Math.sin(sceneClock*.7)*Math.max(0,(row-anchor)/500)*.8);
      const col=Math.round(x-(opening?0:ox))-sway;
      const n=(row*W+col)*4;
      if(col>=0&&col<W&&pixels[n+3]>128&&(!rain||(pixels[n+1]>pixels[n]*.9&&pixels[n+1]>pixels[n+2]*1.05)))return opening?H-row:end.y+anchor-row;
    }
    return null;
  },
  flowerPlatformCache:new WeakMap(),
  flowerPlatforms(){
    if(state.mode!=='climb')return [];
    let flowers=this.flowerPlatformCache.get(state);
    if(!flowers){
      flowers=[];
      for(const plant of ['forest','opening','ending']){
        if(plant==='forest'&&!state.forestArtwork)continue;
        const profiles=EDITOR_LIBRARY.flowerLandings[plant==='forest'?plant:state.theme+'-'+plant]||[];
        for(const [index,profile] of profiles.entries()){
          const end=this.ending(),rain=state.theme==='rain';
          const left=profile.x+(plant==='ending'?end.x-(rain?207:205):0);
          const top=plant==='forest'?profile.y:plant==='opening'?H-profile.y:end.y+(rain?118:214)-profile.y;
          if(left+profile.w<0||left>W||plant==='forest'&&top>end.y+32)continue;
          const columns=profile.columns.map((row,x)=>row===null?null:x).filter(x=>x!==null),middle=columns[Math.floor(columns.length/2)];
          const summit=plant==='ending'&&profile.x<=(rain?207:205)&&profile.x+profile.w>=(rain?207:205)&&profile.y<=(rain?118:214)&&profile.y+profile.h>=(rain?118:214);
          flowers.push({id:state.id+'-'+plant+'-flower-'+index,type:'leaf',flower:true,plant,profile,left,top,x:left+middle,y:top-profile.columns[middle],side:left+middle<W/2?'left':'right',summit});
        }
      }
      this.flowerPlatformCache.set(state,flowers);
    }
    return flowers;
  },
  flowerSurface(flower,x){
    const {profile,left,top,plant}=flower;
    let col=Math.round(x-left);
    // Use the same native row shift as the painted opening and summit plants.
    if(plant!=='forest'){
      const row=profile.y+(profile.columns[Math.max(0,Math.min(profile.w-1,col))]||0);
      const shift=plant==='opening'?(state.theme==='rain'?0:this.openingSway(row,sceneClock)):Math.sin(sceneClock*.7)*Math.max(0,(row-(state.theme==='rain'?118:214))/500)*.8;
      col=Math.round(x-left)-Math.round(shift);
    }
    const row=profile.columns[col];
    return row===undefined||row===null?null:top-row;
  },
  platforms(){return [...state.leaves,...this.plantPlatforms(),...this.flowerPlatforms(),this.opening(),this.ending()];},
  growthHeight(){
    // The beanstalk is established before the welcome scene and never grows in.
    return Infinity;
  },
  attachmentGrowth(o){return state.forestArtwork&&o.y>=EDITOR_LIBRARY.forestFirstTop?Infinity:this.growthHeight();},
  attachmentBirth(o){
    if(state.forestArtwork)return o.y;
    const path=paths.find(p=>p.id===o.vine);if(!path)return o.y;
    const cache=path.births||(path.births=new WeakMap()),prior=cache.get(o);
    if(prior&&prior.x===o.x&&prior.y===o.y&&prior.side===o.side&&prior.asset===o.asset&&prior.flipped===o.flipped)return prior.birth;
    const root=attachmentMaterial(o),birth=nearest(o.x+root.x,o.y+root.y-24,attachmentPath(o,path)).y;
    cache.set(o,{x:o.x,y:o.y,side:o.side,asset:o.asset,flipped:o.flipped,birth});return birth;
  },
  objectPresence(o){
    if(state.mode!=='climb')return smooth((playState.time-.2)/.8);
    const growth=this.attachmentGrowth(o);if(growth===Infinity)return 1;
    const leaf=state.leaves.reduce((best,l)=>Math.hypot(l.x-o.x,l.y+28-o.y)<Math.hypot(best.x-o.x,best.y+28-o.y)?l:best,state.leaves[0]);
    const birth=leaf?this.attachmentBirth(leaf):o.y;
    return smooth((growth-birth-275)/100);
  },
  sceneWeather(y=playState?.maxY||0){
    const target=weatherAt(y),f=playState?smooth(playState.time/3):0;
    return {rain:state.theme==='rain'?.18+(target.rain-.18)*f:target.rain,wind:.3+(target.wind-.3)*f};
  },
  shadeRain(g,rain){
    g.save();g.globalCompositeOperation='source-atop';g.fillStyle='rgba(28,49,79,'+rain*.52+')';g.fillRect(0,0,W,H);
    if(Scene.flash){g.fillStyle='rgba(207,227,255,'+clamp(Scene.flash*.75)+')';g.fillRect(0,0,W,H);}g.restore();
  },
  advanceBlooms(dt){
    const p=playState;if(!p||p.paused||p.failed||state.forestArtwork)return;
    for(const o of state.objects){
      if(!o.vine||!o.asset.startsWith('flower-'))continue;
      const birth=this.attachmentBirth(o);
      if(!p.blooms.has(o.id)&&Math.max(p.maxY,530)>=o.y-220&&this.attachmentGrowth(o)>birth+(state.forestArtwork?160:85))p.blooms.set(o.id,0);
      if(p.blooms.has(o.id))p.blooms.set(o.id,p.blooms.get(o.id)+dt);
    }
  },
  onStart(){
    const p=playState;
    p.rainDrops=[];p.rainSplashes=[];p.nextRain=3.2;p.rainIndex=0;
    p.blooms=new Map();
    if(!publicPlay||!editorView.full)return;
    p.departingWelcome=this.departingWelcome;this.departingWelcome=null;
    p.introDuration=state.mode==='flight'?1:(p.departingWelcome?.75:0);
    p.intro=p.introDuration?{age:0,duration:p.introDuration}:null;
    p.gesture={name:'left-listen',frames:101};
    p.perchTime=(editorView.clock*50%101)/50;
    p.seedOffset=editorView.clock;
    p.seedStage=state.mode==='flight'?'flower':null;p.failed=false;p.failureAge=0;p.finishAge=0;p.results=false;
    p.previousLyrics=new Set(PuzzleLevel.owned());
    p.controlsPending=!this.progress.controlsSeen;
    this.progress.playedOnce=true;this.persist();
    $('campaign-retry').hidden=true;$('campaign-menu').hidden=true;$('campaign-selector').hidden=true;
    $('keyboard-help').hidden=true;$('game-hud').hidden=true;
    $('canvas').setAttribute('aria-label','Ladybug Luck. Space jumps; Left and Right or A and D steer. On a phone move the phone to steer and hold the screen to jump and glide.');
  },
  canJump(){return playState&&!playState.intro&&!playState.failed&&!playState.complete&&!playState.paused&&(state.mode==='climb'||playState.seedStage==='flower');},
  seedAt(time=playState?playState.time+(playState.seedOffset||0):this.menuTime){
    const travel=smooth((time-.65)/2.4);
    return {x:261+(135-261)*travel+Math.sin(time*.8)*7*travel,y:230+52*travel+Math.sin(time*1.15)*4*travel,angle:.08+Math.sin(time*.72)*.13};
  },
  advance(dt){
    const p=playState;if(!p||!editorView.full)return false;
    if(p.paused)return true;
    if(p.failed){
      p.time+=dt;sceneClock+=dt;p.failureAge+=dt;
      this.advanceRain(dt);
      if(p.failureAge>=p.defeat.retryAt){$('campaign-retry').hidden=false;$('mobile-pause').hidden=true;}
      return true;
    }
    if(p.complete){
      p.time+=dt;sceneClock+=dt;p.finishAge+=dt;
      this.advanceRain(dt);
      const e=this.ending(),f=smooth(p.finishAge/1.5),perch=p.finishPerch;
      const perchY=perch?(this.flowerSurface(perch,e.x)??perch.y):e.y;
      const riding=state.mode==='flight'&&p.finishAge<=1.4;
      p.x=p.finishFrom.x+(e.x+(riding?9:0)-p.finishFrom.x)*f;p.y=p.finishFrom.y+(perchY+(riding?52:0)-p.finishFrom.y)*f;
      offset=p.finishFrom.offset+(Math.max(p.finishFrom.offset,e.y-365)-p.finishFrom.offset)*smooth(p.finishAge/2.2);
      if(p.finishAge>1.4){
        if(p.seedStage)p.departingSeedPose=p.actorPart&&{asset:p.actorPart.asset,frame:p.actorPart.frame};
        p.x=e.x;p.y=perchY;p.ground=perch||e;this.advancePerch(p,dt);p.seedStage=null;
      }
      if(p.finishAge>=2.5&&!p.results){p.results=true;$('completion').hidden=false;updatePlayInterface();}
      return true;
    }
    if(p.intro){
      p.time+=dt;sceneClock+=dt;p.intro.age+=dt;
      this.advancePerch(p,dt);
      if(p.intro.age>=p.intro.duration){
        p.intro=null;held.clear();releaseTouch();updatePlayInterface();
      }
      return true;
    }
    if(p.controlsPending){p.controlsPending=false;showControls(true);return true;}
    if(state.mode==='flight'&&p.seedStage==='flower'){
      p.time+=dt;sceneClock+=dt;
      const target=Number(held.has('ArrowRight')||held.has('KeyD'))-Number(held.has('ArrowLeft')||held.has('KeyA'))||touchDirection();
      p.tilt+=(target-p.tilt)*(1-Math.exp(-dt*7));
      if(p.ground){this.advancePerch(p,dt);return true;}
      p.vx+=(p.tilt*155-p.vx)*(1-Math.exp(-dt*6));p.x=clamp(p.x+p.vx*dt,8,W-8);p.vy-=500*dt;p.y+=p.vy*dt;
      const seed=this.seedAt(),grip={x:seed.x,y:seed.y-40};
      if(Math.hypot(p.x-grip.x,p.y+12-grip.y)<22){
        p.seedStage='boarding';p.boarding={age:0,x:p.x,y:p.y};p.ground=null;p.vx=0;p.vy=0;held.delete('Space');
        p.flightGesture={name:'rider-breeze',start:sceneClock,end:sceneClock+4.5,entry:0};
      }else if(p.vy<0&&p.y<=this.opening().y&&Math.abs(p.x-this.opening().x)<28){
        p.ground=this.opening();p.y=p.ground.y;p.vy=0;p.vx=0;
      }else if(p.y<this.visibleBottom())this.fail();
      return true;
    }
    if(state.mode==='flight'&&p.seedStage==='boarding'){
      p.time+=dt;sceneClock+=dt;p.boarding.age+=dt;const seed=this.seedAt(),f=smooth(p.boarding.age/.3);
      p.x=seed.x;p.y=seed.y;
      if(f===1){p.seedStage='riding';p.rideStarted=p.time;p.entryAngle=seed.angle;}
      return true;
    }
    return false;
  },
  detectEnding(){
    const p=playState;if(!p||p.complete||p.failed||p.intro)return;
    const e=this.ending();
    if(state.mode==='flight'?((!publicPlay||p.seedStage==='riding')&&p.y>=e.y+40&&Math.abs(p.x-e.x)<44):p.ground?.summit)this.finish();
  },
  finish(){
    const p=playState;if(!p||p.complete)return;
    p.complete=true;p.paused=false;p.finishAge=0;p.finishPerch=p.ground?.flower?p.ground:null;p.finishFrom={x:p.x,y:p.y,offset};held.clear();releaseTouch();
    if(state.mode==='flight'){p.gesture={name:'left-listen',frames:101};p.perchTime=0;}
    if(publicPlay){const previous=this.progress.completed[state.id]?.best||0;
      this.progress.completed[state.id]={best:Math.max(previous,p.collected.size)};this.persist();}
    $('mobile-pause').hidden=true;updatePlayInterface();
  },
  fail(hit={}){
    const p=playState;if(!p||p.failed||p.complete||p.intro)return;
    p.failed=true;p.failureAge=0;p.ground=null;held.clear();releaseTouch();$('mobile-pause').hidden=true;
    if(publicPlay)this.prepareArt();
    const part=p.actorPart,source=document.createElement('canvas');source.width=W;source.height=H;
    const g=source.getContext('2d');g.imageSmoothingEnabled=false;
    if(part)paintPart(g,part);
    const painted=g.getImageData(0,0,W,H),groups=new Map(),riding=part?.asset.startsWith('rider-');
    const angle=Math.round((part?.angle||0)*90)/90,c=Math.cos(angle),sn=Math.sin(angle),pivot=part?.pivot||[0,0];
    const local=(x,y)=>{const a=x-Math.round(part.x)-pivot[0],b=y-Math.round(part.y)-pivot[1];return {x:pivot[0]+c*a-sn*b,y:pivot[1]+sn*a+c*b};};
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const z=(y*W+x)*4;if(!painted.data[z+3])continue;
      const uv=local(x,y);let name='body';
      if(riding){
        if(uv.y<86){
          const sector=Math.max(0,Math.min(9,Math.floor((Math.atan2(uv.y-65,uv.x-65)+Math.PI)/Math.PI*10)));
          name=hit.kind==='canopy'?'tuft-'+sector:'seed';
        }else if(uv.x<49||uv.x>72||uv.y>130)name='seed';
      }
      let group=groups.get(name);if(!group){group={name,points:[],left:x,right:x,top:y,bottom:y};groups.set(name,group);}
      group.points.push(z);group.left=Math.min(group.left,x);group.right=Math.max(group.right,x);group.top=Math.min(group.top,y);group.bottom=Math.max(group.bottom,y);
    }
    const pieces=[];
    for(const group of groups.values()){
      const image=document.createElement('canvas');image.width=group.right-group.left+1;image.height=group.bottom-group.top+1;
      const cg=image.getContext('2d'),data=cg.createImageData(image.width,image.height);
      for(const z of group.points){const n=z/4,x=n%W-group.left,y=Math.floor(n/W)-group.top;data.data.set(painted.data.subarray(z,z+4),(y*image.width+x)*4);}
      cg.putImageData(data,0,0);
      pieces.push({image,name:group.name,x:group.left,y:group.top,cx:image.width/2,cy:image.height/2});
    }
    const body=pieces.find(p=>p.name==='body'),direction=(hit.x??p.x)>=p.x?-1:1;
    const kind=hit.kind||'fall';
    p.defeat={hit:{x:hit.x??p.x,y:hit.y??sy(p.y),kind},pieces,direction,retryAt:kind==='fall'?.55:clamp(Math.sqrt(Math.max(0,H+45-(body?.y??H))/245)+.35,1.4,2.35)};
  },
  drawDefeat(target){
    const p=playState,d=p.defeat,t=p.failureAge;if(!d)return;
    if(!d.canvas){d.canvas=document.createElement('canvas');d.canvas.width=W;d.canvas.height=H;d.context=d.canvas.getContext('2d');}
    const g=d.context;g.clearRect(0,0,W,H);g.imageSmoothingEnabled=false;
    for(const piece of d.pieces){
      let x=0,y=0,angle=0;
      if(piece.name==='body'){
        const fall=Math.max(0,t-.12),recoil=Math.sin(Math.min(1,t/.24)*Math.PI);
        x=d.direction*(7*recoil+22*fall);y=(d.hit.kind==='water'?24*t:-4*recoil)+245*fall*fall;
        angle=d.direction*(.2*recoil+Math.min(2.9,fall*2.4));
      }else if(piece.name.startsWith('tuft-')){
        const i=Number(piece.name.slice(5)),a=-Math.PI+(i+.5)*Math.PI/10,speed=35+noise(i+211)*57;
        x=Math.cos(a)*speed*t;y=Math.sin(a)*speed*t+88*t*t;angle=(i-4.5)*t*.23;
      }else{
        x=18*t;y=d.hit.kind==='canopy'?15*t+130*t*t:-36*t;angle=t*.16;
      }
      g.save();g.translate(piece.x+piece.cx+Math.round(x),piece.y+piece.cy+Math.round(y));g.rotate(angle);
      g.drawImage(piece.image,-piece.cx,-piece.cy);g.restore();
    }
    target.drawImage(d.canvas,0,0);
  },
  rainPlantPoint(x,y,nearby=null){
    for(const leaf of nearby?.leaves||state.leaves){
      if(leaf.fragile){
        if(!leaf.hidden&&(state.forestArtwork?forestLeafOpened(leaf)>=.98:this.attachmentGrowth(leaf)>=this.attachmentBirth(leaf)+230)&&brownLeafContains(leaf,x,y))return true;
        continue;
      }
      const column=Math.floor(x-Math.round(leaf.x-40)),row=Math.floor(sy(y)-Math.round(sy(leaf.y)-16));
      if(column<0||column>=80||row<0||row>=33)continue;
      if(!nearby&&(leaf.hidden||state.vines.find(v=>v.id===leaf.vine)?.hidden||(state.forestArtwork?forestLeafOpened(leaf)<.98:this.attachmentGrowth(leaf)<this.attachmentBirth(leaf)+230)))continue;
      const pixels=Art.pixels('assets/leaf-'+leaf.side+'-joined.png');
      if(pixels?.data[(Math.floor(row*pixels.h/33)*pixels.w+Math.floor(column*pixels.w/80))*4+3]>128)return true;
    }
    const row=Math.floor(H-y);
    if(publicPlay&&row>=0&&row<H){
      const layer=nearby?nearby.opening:this.openingLayer();
      const col=Math.floor(x)-(state.theme==='rain'?0:Math.round(this.openingSway(row,sceneClock)));
      if(layer&&col>=0&&col<W&&layer.pixels[(row*W+col)*4+3]>128)return true;
    }
    if(nearby&&!nearby.summit)return false;
    const end=nearby?.end||this.ending(),flowerRow=Math.floor(end.y-y+118),sway=Math.round(Math.sin(sceneClock*.7)*Math.max(0,(flowerRow-118)/500)*.8),column=Math.floor(x-end.x+207)-sway;
    if(column>=0&&column<W&&flowerRow>=0&&flowerRow<H){
      const pixels=Art.pixels(this.base+'summit-rain.png');
      if(pixels?.data[(flowerRow*W+column)*4+3]>128)return true;
    }
    return false;
  },
  dropPixels:null,
  rainPixels(){
    if(this.dropPixels)return this.dropPixels;
    const pixels=Art.pixels(this.base+'rain-drop.png');if(!pixels)return [];
    const points=[];
    for(let y=pixels.h-1;y>=0;y--)for(let x=0;x<pixels.w;x++)if(pixels.data[(y*pixels.w+x)*4+3]>128)points.push([x-5,12-y]);
    this.dropPixels=points;return points;
  },
  advanceRain(dt){
    const p=playState;if(state.theme!=='rain'||!p||p.intro)return;
    const alreadyFailed=p.failed;
    const strength=this.sceneWeather(p.maxY).rain;
    if(p.time>=p.nextRain){
      const index=p.rainIndex++,x=18+noise(index+401)*294;
      p.rainDrops.push({x,y:offset+H+24,vx:5+strength*10,vy:180+strength*65,age:0});
      p.nextRain=p.time+1.35-strength*.5+noise(index+407)*.8;
    }
    const anchor=p.actorAnchor,part=p.actorPart&&anchor?{...p.actorPart,x:p.actorPart.x+p.x-anchor.x,y:p.actorPart.y-p.y+anchor.y+offset-anchor.offset}:p.actorPart;
    const actor=p.rainDrops.length&&part&&!p.failed&&!p.complete?playerCollision(part):null,points=this.rainPixels();
    const plants=p.rainDrops.length?{
      leaves:state.leaves,opening:null,end:this.ending()
    }:null;
    for(const drop of p.rainDrops){
      if(drop.hit)continue;
      const oldX=drop.x,oldY=drop.y;drop.age+=dt;drop.vy=Math.min(310,drop.vy+55*dt);drop.y-=drop.vy*dt;drop.x+=drop.vx*dt;
      const nearby={...plants,leaves:plants.leaves.filter(leaf=>leaf.x+48>=Math.min(oldX,drop.x)-6&&leaf.x-48<=Math.max(oldX,drop.x)+6&&leaf.y+20>=drop.y-13&&leaf.y-(leaf.fragile?48:20)<=oldY+13&&!leaf.hidden&&(!leaf.fragile||brownLeafState(leaf)?.released===undefined)&&!state.vines.find(v=>v.id===leaf.vine)?.hidden&&(state.forestArtwork?forestLeafOpened(leaf)>=.98:this.attachmentGrowth(leaf)>=this.attachmentBirth(leaf)+230))};
      const dropTop=Math.max(oldY,drop.y)+13,dropBottom=Math.min(oldY,drop.y)-13,dropLeft=Math.min(oldX,drop.x)-6,dropRight=Math.max(oldX,drop.x)+6;
      nearby.opening=publicPlay&&dropTop>=0&&dropBottom<=H-171&&dropRight>=65&&dropLeft<W?this.openingLayer():null;
      const end=plants.end,canHitSummit=dropTop>=end.y+118-H&&dropBottom<=end.y+118&&dropRight>=end.x-208&&dropLeft<=end.x+124;
      nearby.summit=canHitSummit;
      const canHitActor=actor&&dropRight>=actor.box.x&&dropLeft<=actor.box.x+actor.box.w&&sy(dropBottom)>=actor.box.y&&sy(dropTop)<=actor.box.y+actor.box.h;
      if(!nearby.leaves.length&&!nearby.opening&&!canHitSummit&&!canHitActor)continue;
      // Sweep the painted drop pixels against the painted leaf and actor
      // pixels. Its first contact consumes the drop and locates the splash.
      const distance=Math.max(1,Math.ceil(oldY-drop.y));
      for(let step=0;step<=distance&&!drop.hit;step++){
        const x=oldX+(drop.x-oldX)*step/distance,y=oldY+(drop.y-oldY)*step/distance;
        for(const [dx,dy] of points){
          const px=x+dx,py=y+dy;
          if(this.rainPlantPoint(px,py,nearby)){drop.hit=true;p.rainSplashes.push({x:px,y:py,age:0});break;}
          if(canHitActor&&actor.contains(px,sy(py))){
            drop.hit=true;p.rainSplashes.push({x:px,y:py,age:0});
            if(publicPlay)this.fail({kind:actor.kindAt?.(px,sy(py))==='canopy'?'canopy':'water',x:px,y:sy(py)});else {p.contacts.add('raindrop');p.contactAt=p.time;$('play-status').textContent='Contact · raindrop · P to inspect';}
            break;
          }
        }
      }
      if(p.failed&&!alreadyFailed)break;
    }
    p.rainDrops=p.rainDrops.filter(d=>!d.hit&&d.y>offset-35&&d.x<350);
    for(const splash of p.rainSplashes)splash.age+=dt;
    p.rainSplashes=p.rainSplashes.filter(s=>s.age<.65);
  },
  drawRain(g){
    const p=playState;if(state.theme!=='rain'||!p?.rainDrops)return;
    for(const drop of p.rainDrops)this.image(g,'rain-drop',Math.round(drop.x)-5,Math.round(sy(drop.y))-12,10,24);
    for(const splash of p.rainSplashes){
      const t=splash.age,x=splash.x,y=sy(splash.y);
      g.save();g.globalAlpha=1-t/.65;
      g.fillStyle='#d9f2ff';g.fillRect(x-3-t*7,y-1,6+t*14,1);
      for(let i=0;i<7;i++){
        const vx=(i-3)*13,vy=-29-noise(i+221)*29;
        g.fillStyle=i%2?'#e6f7ff':'#8ebcdd';
        g.fillRect(Math.round(x+vx*t),Math.round(y+vy*t+75*t*t),i%3===0?2:1,2);
      }
      g.restore();
    }
  },
  next(){
    const index=this.levels().findIndex(l=>l.id===state.id),next=this.levels()[index+1];
    if(next)this.begin(next);
    else {if(preview)stopPlay();if(PuzzleLevel.owned().length)PuzzleLevel.open({returnTo:'/test/?choose=1'});else this.showLevels();}
  },
  showLevels(route=true){
    this.pendingStart=null;this.pendingRestart=false;
    if(preview)stopPlay();this.menuLevel=this.current();if(this.menuLevel)switchLevel(this.menuLevel.id);else this.ensureSunset();
    Art.owner=this.menuLevel?.id||null;
    this.screen='levels';offset=0;setRoute('test-levels',route?'/test/?choose=1':null);document.title='Ladybug Luck · Level select';
    document.body.classList.add('campaign');document.body.classList.remove('levels-page','test-library','sheet-open','focus-mode');
    for(const id of ['level-drawer','test-start','pause-panel','completion','campaign-menu','campaign-retry','mobile-pause'])$(id).hidden=true;
    $('editor-main').inert=false;$('campaign-selector').hidden=false;this.buildCards();request();
  },
  buildCards(){
    const container=$('campaign-cards'),owned=new Set(PuzzleLevel.owned());container.replaceChildren();
    for(const level of [...this.levels(),null]){
      const card=node('article',{class:'campaign-card'}),unlocked=level?this.unlocked(level):owned.size>0;
      const picture=node('canvas',{width:330,height:370});card.append(picture);card.dataset.level=level?.id||'puzzle';
      card.append(node('h2',{text:level?.name||'Lost Lyrics'}));
      if(level){
        const row=node('div',{class:'campaign-fragments'});row.setAttribute('aria-label',this.lyrics(level).filter(o=>owned.has(o.asset)).length+' of '+this.lyrics(level).length+' lyrics found');
        for(const o of this.lyrics(level)){const im=node('img',{src:this.rewardPath(o.asset,'hud',owned.has(o.asset)?'found':'missing'),alt:''});row.append(im);}card.append(row);
      }else card.append(node('p',{text:owned.size+' / 15'}));
      const previous=this.levels()[this.levels().indexOf(level)-1];
      button(unlocked?'Play':level?'Finish '+(previous?.theme==='rain'?'Rain':'Garden'):'Find a lyric',()=>level?this.begin(level):PuzzleLevel.open({returnTo:'/test/?choose=1'}),card,{disabled:!unlocked,class:'campaign-card-play'});
      container.append(card);
    }
    this.paintCards();
    const current=this.current(),index=current?Math.max(0,this.levels().indexOf(current)):this.levels().length;
    requestAnimationFrame(()=>{const card=container.children[index];if(card)container.scrollLeft=card.offsetLeft-(container.clientWidth-card.offsetWidth)/2;});
  },
  wireCards(){
    const cards=$('campaign-cards');let drag=null,wheelTimer=null,suppressClick=false;
    const centres=()=>Array.from(cards.children,card=>card.offsetLeft-(cards.clientWidth-card.offsetWidth)/2);
    const settle=(direction=0)=>{
      const positions=centres();if(!positions.length)return;
      let index=positions.reduce((best,x,i)=>Math.abs(x-cards.scrollLeft)<Math.abs(positions[best]-cards.scrollLeft)?i:best,0);
      index=Math.max(0,Math.min(positions.length-1,index+direction));
      cards.scrollTo({left:positions[index],behavior:'smooth'});
    };
    cards.addEventListener('pointerdown',e=>{
      if(e.button!==0||drag)return;
      clearTimeout(wheelTimer);suppressClick=false;drag={id:e.pointerId,x:e.clientX,start:cards.scrollLeft,moved:false};
    });
    cards.addEventListener('pointermove',e=>{
      if(!drag||drag.id!==e.pointerId)return;
      const dx=e.clientX-drag.x;
      if(!drag.moved&&Math.abs(dx)>6){drag.moved=true;cards.classList.add('dragging');cards.setPointerCapture(e.pointerId);}
      if(drag.moved){e.preventDefault();cards.scrollLeft=drag.start-dx;}
    });
    const release=e=>{
      if(!drag||drag.id!==e.pointerId)return;
      const moved=drag.moved,start=drag.start,distance=cards.scrollLeft-start;drag=null;cards.classList.remove('dragging');
      if(cards.hasPointerCapture(e.pointerId))cards.releasePointerCapture(e.pointerId);
      if(moved){
        const positions=centres(),nearest=left=>positions.reduce((best,x,i)=>Math.abs(x-left)<Math.abs(positions[best]-left)?i:best,0);
        const shortSwipe=nearest(start)===nearest(cards.scrollLeft)&&Math.abs(distance)>cards.clientWidth*.12;
        suppressClick=true;settle(shortSwipe?Math.sign(distance):0);setTimeout(()=>{suppressClick=false;},0);
      }
    };
    window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);
    cards.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation();}},true);
    cards.addEventListener('dragstart',e=>e.preventDefault());
    cards.addEventListener('wheel',e=>{
      if(e.ctrlKey||e.metaKey)return;
      e.preventDefault();e.stopPropagation();cards.classList.add('dragging');
      const unit=e.deltaMode===1?16:e.deltaMode===2?cards.clientWidth:1;
      cards.scrollLeft+=(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)*unit;
      clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>{cards.classList.remove('dragging');settle();},160);
    },{passive:false});
    window.addEventListener('keydown',e=>{
      if(this.screen!=='levels'||PuzzleLevel.active||!['ArrowLeft','ArrowRight'].includes(e.code))return;
      e.preventDefault();e.stopImmediatePropagation();settle(e.code==='ArrowLeft'?-1:1);
    },true);
  },
  paintCards(){
    for(const card of $('campaign-cards').children){
      const picture=card.querySelector('canvas'),level=this.levels().find(l=>l.id===card.dataset.level);
      const g=picture.getContext('2d');g.imageSmoothingEnabled=false;g.clearRect(0,0,330,370);
      if(level){
        Art.paint(g,this.base+'level-preview-'+level.theme+'.png',0,0,330,370);
      }else{
        g.fillStyle='#d76b19';g.fillRect(0,0,330,370);
        this.paintPuzzleCard(g);
      }
    }
    this.cardsDirty=false;
  },
  paintPuzzleCard(g){
    const owned=new Set(PuzzleLevel.owned());
    // This handful is independent of the solution and any saved arrangement.
    const pile=[
      [148,186,-31],[189,143,112],[204,233,-136],[98,239,24],[111,119,-78],
      [248,180,51],[82,179,159],[161,280,-54],[185,87,172],[68,95,63],
      [240,285,96],[236,79,-16],[69,293,-121],[274,246,-67],[141,62,139]
    ];
    LyricPaper.names.filter(id=>owned.has(id)).forEach((id,index)=>{
      const source=Art.pixels('assets/puzzle/fragment-'+id.slice(-2)+'.png?v='+LyricPaper.revision);if(!source)return;
      const [px,py,degrees]=pile[index],angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
      const w=Math.ceil(Math.abs(c)*source.w+Math.abs(s)*source.h),h=Math.ceil(Math.abs(s)*source.w+Math.abs(c)*source.h);
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const context=canvas.getContext('2d'),frame=context.createImageData(w,h);
      // Rotate the original cut and ink by sampling whole native thixels.
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const dx=x+.5-w/2,dy=y+.5-h/2;
        const u=Math.floor(dx*c+dy*s+source.w/2),v=Math.floor(-dx*s+dy*c+source.h/2);
        if(u<0||u>=source.w||v<0||v>=source.h)continue;
        const a=(v*source.w+u)*4,b=(y*w+x)*4;
        frame.data.set(source.data.subarray(a,a+4),b);
      }
      context.putImageData(frame,0,0);
      const x=Math.round(clamp(px-w/2,8,320-w)),y=Math.round(clamp(py-h/2,8,360-h));
      context.globalCompositeOperation='source-in';context.fillStyle='#061324';context.fillRect(0,0,w,h);
      g.save();g.globalAlpha=.28;g.drawImage(canvas,x+2,y+3);g.restore();
      context.putImageData(frame,0,0);g.drawImage(canvas,x,y);
    });
  },
  image(g,name,x=0,y=0,w=330,h=717,alpha=1){return Art.paint(g,this.base+name+'.png',x,y,w,h,alpha);},
  sprite(g,name,frame,w,h,cols,x,y,dw=w,dh=h){
    const entry=Art.image(this.base+name+'.png');if(!entry.ready)return;
    g.drawImage(entry.image,Math.floor(frame)%cols*w,Math.floor(Math.floor(frame)/cols)*h,w,h,x,y,dw,dh);
  },
  drawOpening(g,level,t,view=0){
    if(view>717)return;
    if(level.mode==='flight'){
      const layer=this.openingLayer(level);
      if(layer)g.drawImage(this.windImage(layer,'seed-head',t),-2,Math.round(view));
      this.flower(g,level,85,564+view,.55,false,t);
      if(!playState||['flower','boarding'].includes(playState.seedStage)){
        const seed=this.seedAt(playState?playState.time+(playState.seedOffset||0):t);
        const gesture=playState?.seedStage==='boarding'?playState.flightGesture:null;
        const pose=gesture&&{asset:gesture.name,frame:clamp((sceneClock-gesture.start)/(gesture.end-gesture.start))*(EDITOR_LIBRARY.sprites[gesture.name].count-1)};
        this.drawSeed(g,seed.x,H-seed.y+view,seed.angle,1,pose);
      }
    }else{
      // The launch leaf is held still under the feet; the upper runner flexes
      // independently in the same wind as the surrounding scene.
      const layer=level.theme==='rain'?this.wetOpening(t):this.openingLayer(level);if(!layer)return;
      if(level.theme==='rain')g.drawImage(layer.canvas,0,Math.round(view));
      else g.drawImage(this.windImage(layer,'opening',t),-2,Math.round(view));
    }
  },
  wetOpening(t){
    const base=Art.image(this.base+'wet-vine-base.png');
    if(!base.ready||!['leaf','hanging','right'].every(name=>['poses','drops'].every(part=>Art.image(EDITOR_LIBRARY.sprites['wet-'+name+'-'+part].src).ready)))return null;
    let layer=this.openingLayers.get('wet-rain');
    if(!layer||t<layer.time){
      const canvas=document.createElement('canvas'),source=document.createElement('canvas'),plantCanvas=document.createElement('canvas');canvas.width=source.width=plantCanvas.width=W;canvas.height=source.height=plantCanvas.height=H;
      layer={canvas,source,plantCanvas,plantContext:plantCanvas.getContext('2d'),g:source.getContext('2d'),events:EDITOR_LIBRARY.wetLeaves.map(()=>[]),drops:[],splashes:[],time:t,tick:-1};
      layer.g.imageSmoothingEnabled=false;canvas.getContext('2d').imageSmoothingEnabled=false;
      layer.plantContext.imageSmoothingEnabled=false;
      this.openingLayers.set('wet-rain',layer);
    }
    const tick=Math.floor(t*60+1e-6);if(layer.tick===tick)return layer;
    const dt=Math.min(.1,Math.max(0,t-layer.time));layer.time=t;layer.tick=tick;
    const g=layer.g;g.clearRect(0,0,W,H);
    const rain=this.screen ? .18 : this.sceneWeather().rain;
    const poses=[];
    EDITOR_LIBRARY.wetLeaves.forEach((leaf,index)=>{
      const events=layer.events[index];
      if(!events.length)events.push({start:-noise(index+96)*6,end:0,number:-1});
      while(events.at(-1).end<=t){
        const prior=events.at(-1),number=prior.number+1;
        const count=EDITOR_LIBRARY.sprites['wet-'+leaf.kind+'-poses'].count;
        const fps=12+noise(index*71+number*13+102)*1.5+rain*1.5,duration=count/fps;
        events.push({start:prior.number<0?prior.start:prior.end,end:(prior.number<0?prior.start:prior.end)+duration,number,released:false,secondaryReleased:false});
      }
      while(events.length>2)events.shift();
      const event=events.at(-1),count=EDITOR_LIBRARY.sprites['wet-'+leaf.kind+'-poses'].count;
      const frame=Math.min(count-1,Math.floor(clamp((t-event.start)/(event.end-event.start))*count));
      poses.push(frame);
      if(frame>=6&&!event.secondaryReleased){
        event.secondaryReleased=true;
        const bead=leaf.kind==='leaf'?[95,73]:leaf.kind==='hanging'?[77,64]:null;
        if(bead&&frame<18)layer.drops.push({kind:leaf.kind,x:leaf.x+bead[0]*leaf.w/128,y:leaf.y+bead[1]*leaf.h/128,vx:2,vy:10,age:0,sx:leaf.w/128*.5,sy:leaf.h/128*.5});
      }
      if(frame>=36&&!event.released){
        event.released=true;
        // Start from this drawing's detached droplet location; the painted
        // drop changes pose as its position falls under gravity.
        if(frame<40)layer.drops.push({kind:leaf.kind,x:leaf.x+leaf.release[0]*leaf.w/128,y:leaf.y+leaf.release[1]*leaf.h/128,vx:3+noise(index+event.number)*7,vy:18,age:0,sx:leaf.w/128,sy:leaf.h/128});
      }
    });
    const out=layer.canvas.getContext('2d'),poseKey=poses.join(':');
    if(layer.poseKey!==poseKey){
      const pg=layer.plantContext;pg.save();
      if(layer.poses){
        pg.beginPath();
        EDITOR_LIBRARY.wetLeaves.forEach((leaf,index)=>{
          if(poses[index]===layer.poses[index])return;
          const x=Math.floor(leaf.x)-1,y=Math.floor(leaf.y)-1;
          pg.rect(x,y,Math.ceil(leaf.x+leaf.w)+1-x,Math.ceil(leaf.y+leaf.h)+1-y);
        });
        pg.clip();
      }
      pg.clearRect(0,0,W,H);
      EDITOR_LIBRARY.wetLeaves.forEach((leaf,index)=>Art.sprite(pg,'wet-'+leaf.kind+'-poses',poses[index],leaf.x,leaf.y,leaf.w,leaf.h));
      // Stems cover the painted attachment ends. Read collision pixels only
      // when a painted cel changes; falling drops still advance every frame.
      pg.drawImage(base.image,0,0);pg.restore();
      out.clearRect(0,0,W,H);out.drawImage(layer.plantCanvas,65,171,267,581);
      if(!layer.plantPixels){
        layer.plantPixels=pg.getImageData(0,0,W,H).data;
        layer.pixels=out.getImageData(0,0,W,H).data;
      }else{
        // Only painted leaves whose cel changed can alter the contact mask.
        // Preserve the fixed stems and the rest of the previous mask verbatim.
        const copy=(context,target,x,y,r,b)=>{
          x=Math.max(0,Math.floor(x)-1);y=Math.max(0,Math.floor(y)-1);
          r=Math.min(W,Math.ceil(r)+1);b=Math.min(H,Math.ceil(b)+1);
          if(r<=x||b<=y)return;
          const width=r-x,data=context.getImageData(x,y,width,b-y).data;
          for(let row=0;row<b-y;row++)target.set(data.subarray(row*width*4,(row+1)*width*4),((y+row)*W+x)*4);
        };
        EDITOR_LIBRARY.wetLeaves.forEach((leaf,index)=>{
          if(poses[index]===layer.poses[index])return;
          const left=leaf.x,top=leaf.y,right=leaf.x+leaf.w,bottom=leaf.y+leaf.h;
          copy(pg,layer.plantPixels,left,top,right,bottom);
          copy(out,layer.pixels,65+left*267/W,171+top*581/H,65+right*267/W,171+bottom*581/H);
        });
      }
      layer.poseKey=poseKey;
    }
    g.drawImage(layer.plantCanvas,0,0);
    const plants=layer.plantPixels;
    for(const drop of layer.drops){
      const previous=drop.y;drop.age+=dt;drop.vy+=170*dt;drop.x+=drop.vx*dt;drop.y+=drop.vy*dt;
      if(drop.age>.08)for(let y=Math.ceil(previous);y<=drop.y;y++){
        const x=Math.round(drop.x);if(x<0||x>=W||y<0||y>=H)continue;
        const k=(y*W+x)*4;
        if(plants[k+3]>128&&plants[k+1]>plants[k]*1.13&&plants[k+1]>plants[k+2]*1.08){
          layer.splashes.push({x,y,age:0,size:Math.max(.4,drop.sx)});drop.hit=true;break;
        }
      }
      if(!drop.hit){const frame=drop.age<.08?0:drop.age<.2?1:drop.age<.55?2:3;
        Art.sprite(g,'wet-'+drop.kind+'-drops',frame,Math.round(drop.x-8*drop.sx),Math.round(drop.y-16*drop.sy),Math.max(3,Math.round(16*drop.sx)),Math.max(6,Math.round(32*drop.sy)));
      }
    }
    layer.drops=layer.drops.filter(drop=>!drop.hit&&drop.y<H+32&&drop.age<3);
    for(const splash of layer.splashes){splash.age+=dt;const f=splash.age/.35;g.fillStyle='#d8edf8';
      for(const side of [-1,1])g.fillRect(Math.round(splash.x+side*f*10*splash.size),Math.round(splash.y-Math.sin(f*Math.PI)*8*splash.size),1,1);
    }
    layer.splashes=layer.splashes.filter(splash=>splash.age<.35);
    out.clearRect(0,0,W,H);
    out.drawImage(layer.source,65,171,267,581);
    layer.poses=poses;
    return layer;
  },
  windImage(layer,kind,t,anchor=214){
    const w=layer.canvas.width,h=layer.canvas.height;
    if(!layer.motion){
      const canvas=document.createElement('canvas');canvas.width=w+4;canvas.height=h;
      layer.motion={canvas,ctx:canvas.getContext('2d'),frame:canvas.getContext('2d').createImageData(w+4,h),shifts:new Int8Array(h).fill(127)};
    }
    const motion=layer.motion;let changed=false;
    for(let row=0;row<h;row++){
      const amount=kind==='opening'?this.openingSway(row,t):kind==='seed-head'?Math.sin(t*.7)*clamp((H-row)/300)*.8:Math.sin(t*.7)*Math.max(0,(row-anchor)/500)*.8;
      const shift=Math.round(amount);if(shift===motion.shifts[row])continue;
      changed=true;motion.shifts[row]=shift;
      const start=row*(w+4)*4;motion.frame.data.fill(0,start,start+(w+4)*4);
      motion.frame.data.set(layer.pixels.subarray(row*w*4,(row+1)*w*4),start+(2+shift)*4);
    }
    if(changed)motion.ctx.putImageData(motion.frame,0,0);
    return motion.canvas;
  },
  flowerLayers:new Map(),
  flower(g,level,x,y,scale=1,shelter=level.theme==='rain',t=sceneClock){
    const name=shelter?'summit-rain':'summit-garden',anchor=shelter?[207,118]:[205,214];
    const e=Art.image(this.base+name+'.png');if(!e.ready)return;
    const key=name+':'+scale;
    if(!this.flowerLayers.has(key)){
      const c=document.createElement('canvas');c.width=Math.round(W*scale);c.height=Math.round(H*scale);const k=c.getContext('2d');k.imageSmoothingEnabled=false;k.drawImage(e.image,0,0,c.width,c.height);this.flowerLayers.set(key,{canvas:c,pixels:k.getImageData(0,0,c.width,c.height).data});
    }
    const layer=this.flowerLayers.get(key),ax=Math.round(anchor[0]*scale),ay=Math.round(anchor[1]*scale);
    g.drawImage(this.windImage(layer,'flower',t,ay),Math.round(x)-ax-2,Math.round(y)-ay);
  },
  drawSeed(g,x,y,angle,scale=1,pose=null){
    g.save();g.translate(Math.round(x),Math.round(y));g.rotate(Math.round(angle*90)/90);g.scale(scale,scale);
    if(pose){
      g.save();g.beginPath();g.rect(-65,-65,128,86);g.clip();Art.sprite(g,pose.asset,pose.frame,-65,-65,128,176);g.restore();
      g.beginPath();g.rect(-65,21,128,90);g.clip();
    }
    this.image(g,'seed-unoccupied',-65,-65,128,176);g.restore();
  },
  drawWorld(g){
    if(!preview)return;
    if(publicPlay&&editorView.full)this.drawOpening(g,state,sceneClock,offset);
    const end=this.ending(),anchorY=state.theme==='rain'?118:214,top=sy(end.y)-anchorY;
    if(top<H&&top+H>0)this.flower(g,state,end.x,sy(end.y),1,state.theme==='rain');
    const p=playState;
    if(p.complete&&state.mode==='flight'&&p.finishAge>=1.2&&p.finishAge<6){
      const age=Math.max(0,p.finishAge-1.4),leaving=p.finishAge>=1.4,pose=p.departingSeedPose||p.actorPart;
      this.drawSeed(g,leaving?end.x+9-age*22:p.x,leaving?sy(end.y)-52-age*35:sy(p.y),-age*.05,1,pose);
    }
  },
  titleBee(visitor,age){
    const duration=visitor.end-visitor.start,arrive=3.5,leave=duration-4;
    if(age<0||age>=duration)return null;
    const flowers=[[132,159],[166,149],[227,152]],flower=flowers[Math.floor(noise(visitor.start+217)*flowers.length)];
    const x=flower[0]-9,y=flower[1]-3,view=this.uiLayout();
    const left=-view.x/view.scale-40,right=(W-view.x)/view.scale+40;
    const curve=(points,f)=>{
      const u=1-f;
      return {x:u*u*u*points[0][0]+3*u*u*f*points[1][0]+3*u*f*f*points[2][0]+f*f*f*points[3][0],
        y:u*u*u*points[0][1]+3*u*u*f*points[1][1]+3*u*f*f*points[2][1]+f*f*f*points[3][1]};
    };
    if(age<arrive)return curve([[left,178],[30,54],[x-45,y-28],[x,y]],smooth(age/arrive));
    if(age<leave){
      const u=age-arrive,envelope=smooth(u/.7)*smooth((leave-age)/.7);
      return {x:x+envelope*(Math.sin(u*1.7)*1.6+Math.sin(u*3.1)*.5),y:y+envelope*(Math.sin(u*2.3)*1.3+Math.sin(u*4.7)*.5)};
    }
    return curve([[x,y],[x+18,y-46],[right-68,45],[right,24]],smooth((age-leave)/4));
  },
  titleBird(g,age){
    const view=this.uiLayout(),left=-view.x/view.scale-72,right=(W-view.x)/view.scale+72;
    const curve=(points,f)=>{
      const u=1-f;
      return [u*u*u*points[0][0]+3*u*u*f*points[1][0]+3*u*f*f*points[2][0]+f*f*f*points[3][0],
        u*u*u*points[0][1]+3*u*u*f*points[1][1]+3*u*f*f*points[2][1]+f*f*f*points[3][1]];
    };
    const flight=(position,frame,angle=0,alpha=1)=>{
      g.save();g.globalAlpha*=alpha;g.translate(Math.round(position[0]),Math.round(position[1]));g.rotate(angle*Math.PI/180);
      this.sprite(g,'woodpecker-flight',frame,64,64,4,-34,-28);g.restore();
    };
    const perched=(frame,alpha=1)=>{
      g.save();g.globalAlpha*=alpha;this.sprite(g,'woodpecker-perched',frame,64,64,8,242,95);g.restore();
    };
    if(age<0)return;
    if(age<3){
      const position=curve([[right,56],[321,72],[280,90],[279,120]],smooth(age/3));
      const settling=age>2.65,s=settling?smooth((age-2.65)/.35):0;
      const folded=smooth((age-2.78)/.22);
      flight(position,settling?3:Math.floor(age*10)%4,28*s,1-folded);
      if(folded)perched(0,folded);
    }else if(age<11){
      perched(Math.min(240,Math.floor((age-3)*30)));
    }else if(age<11.35){
      const opening=smooth((age-11)/.35),unfolded=smooth((age-11)/.22);
      if(unfolded<1)perched(240,1-unfolded);
      flight([279,120],unfolded<1?3:Math.floor(age*10)%4,28*(1-opening),unfolded);
    }else if(age<15){
      flight(curve([[279,120],[252,63],[149,35],[left,-5]],smooth((age-11.35)/3.65)),Math.floor(age*10)%4);
    }
  },
  drawTitle(g,t,rain){
    this.image(g,'title-without-g',2,13);
    // Start each visit only once its complete painted animation is available.
    // A late image decode must never introduce an animal halfway along a flight.
    const visitorsReady=['bee-right','bee-feelers-right','woodpecker-flight','woodpecker-perched'].every(name=>Art.image(this.base+name+'.png').ready);
    if(!visitorsReady){
      this.image(g,'letter-g',2,13);this.image(g,'vine-0',2,13);this.image(g,'vine-1',2,13);
      this.image(g,'title-flowers',47,85,235,125);if(rain)this.titleRain(g,t);return;
    }
    while(!this.visitors.length||this.visitors.at(-1).end<t+1){
      const previous=this.visitors.at(-1),i=this.visitors.length,start=previous?previous.end:t;
      const kind=previous?.kind==='bird'?'bee':noise(i+93)>.56?'bird':'bee';
      this.visitors.push({kind,start,end:start+(kind==='bird'?16:12)+noise(i+101)*9});
    }
    const visitor=this.visitors.findLast(v=>v.start<=t),age=t-visitor.start;
    let peck=0;if(visitor.kind==='bird'&&age>=3&&age<11)for(const strike of [1.5,1.79,4.3,4.59,4.92])if(age-3>=strike&&age-3<strike+.075)peck=-1;
    this.image(g,'letter-g',2+peck,13);
    this.image(g,'vine-0',2,13);this.image(g,'vine-1',2,13);
    this.image(g,'title-flowers',47,85,235,125);
    if(visitor.kind==='bee'){
      const bee=this.titleBee(visitor,age);
      if(bee){
        const x=Math.round(bee.x)-12,y=Math.round(bee.y)-21;
        this.sprite(g,'bee-right',Math.floor(t*190)%32,24,32,8,x,y);
        this.sprite(g,'bee-feelers-right',Math.floor(t*17)%32,24,32,8,x,y);
      }
    }else this.titleBird(g,age);
    if(rain)this.titleRain(g,t);
  },
  titleRain(g,t){
    const letter=Art.pixels(this.base+'title.png');if(!letter)return;
    const targets=[[76,92],[100,92],[130,92],[159,92],[192,92],[220,92],[254,92],[125,139],[149,139],[184,139],[219,139]];
    for(let i=Math.floor(t*4)-3;i<=Math.floor(t*4)+3;i++){
      const slot=targets[Math.floor(noise(i+71)*targets.length)],x=slot[0],at=i/4+noise(i+127)*.14,age=t-at;
      let y=slot[1];while(y<200&&!letter.data[(y*330+x)*4+3])y++;if(y===200)continue;
      const px=x+2,py=y+13;
      if(age<0&&age>-.27){const distance=-age*270;g.fillStyle='#b3cce9';g.fillRect(px-distance*.13,py-distance-5,1,5);}
      else if(age>=0&&age<.4){
        const f=age/.4;g.save();g.globalAlpha*=1-f;
        g.fillStyle='#e7f6fa';g.fillRect(px-1,py-1,3,1);
        for(const [side,speed] of [[-1,1],[1,.83]]){const dx=side*(1+f*6)*speed,dy=-Math.sin(f*Math.PI)*5*speed;g.fillRect(Math.round(px+dx),Math.round(py+dy)-1,1,1);}
        g.restore();
      }
    }
  },
  buttonRain(g,t){
    const surfaces=[[88,242,155,36],...(this.progress.playedOnce?[[88,286,155,35]]:[])];
    surfaces.forEach(([left,top,width,height],index)=>{
      for(let i=Math.floor(t*5)-3;i<=Math.floor(t*5)+3;i++){
        const x=left+5+Math.floor(noise(i+index*401+83)*(width-10)),age=t-i/5-noise(i+131)*.12;
        // The lower button receives runoff through the gap below Play.
        const fall=index?7:65;
        if(age<0&&age>-fall/270){const d=-age*270;g.fillStyle='#b3d8ef';g.fillRect(Math.round(x-d*.13),Math.round(top-d)-2,1,index?2:4);}
        else if(age>=0&&age<.38){
          const f=age/.38;g.save();g.globalAlpha*=1-f*.8;g.fillStyle='#8fc5e5';g.fillRect(x-1,top,3,1);g.fillStyle='#e6f7ff';
          for(const side of [-1,1])g.fillRect(Math.round(x+side*(1+f*7)),Math.round(top-Math.sin(f*Math.PI)*6)-1,1,1);
          g.restore();
        }
      }
      const age=(t*.65+index*.47)%1;
      g.fillStyle='#9acbe8';g.fillRect(left+width-2,Math.round(top+3+age*(height-6)),1,3);
    });
  },
  button(g,label,x,y,w,h,font=14){
    g.fillStyle='#050e22';g.fillRect(x+2,y,w-4,h);g.fillRect(x,y+2,w,h-4);
    g.fillStyle='#fff5d6';g.fillRect(x+3,y+3,w-6,h-6);
    g.fillStyle='#e7ddc2';g.fillRect(x+3,y+h-4,w-6,1);
    g.fillStyle='#061529';g.font=font+'px Departure';g.textAlign='center';g.textBaseline='middle';g.fillText(label,x+w/2,y+h/2+.5);g.textAlign='left';
  },
  drawWelcome(){
    if(this.fontReady===false||this.menuLevel&&(this.screen==='welcome'?!this.ready():!Scene.ready(this.menuLevel,this.menuTime))||!this.menuLevel&&!this.sunset)return false;
    const g=ctx,b=backctx,t=this.menuTime;
    this.uiLayout();
    g.setTransform(4,0,0,4,0,0);g.imageSmoothingEnabled=false;g.clearRect(0,0,W,H);
    b.setTransform(4,0,0,4,0,0);b.imageSmoothingEnabled=false;
    if(this.menuLevel){Scene.paint(b,this.menuLevel,0,t,{rain:this.theme()==='rain'?.18:0,wind:.3});
      if(this.menuLevel.mode==='climb'){
        paintBotany(g);
        for(const o of [...this.menuLevel.objects].sort((a,b)=>(a.type==='scenery'&&a.layer==='behind'?-1:a.type==='scenery'?1:0)-(b.type==='scenery'&&b.layer==='behind'?-1:b.type==='scenery'?1:0))){
          if(o.hidden||o.vine&&this.menuLevel.vines.find(v=>v.id===o.vine)?.hidden)continue;
          for(const part of obstacleParts(o,t))paintPart(g,part);
        }
      }
      if(this.menuLevel.mode==='flight')for(const o of this.menuLevel.objects){
        if(o.hidden||o.type==='lyric')continue;
        for(const part of obstacleParts(o,t))paintPart(g,part);
      }
      this.drawOpening(g,this.menuLevel,t);
      {
        const perch=this.opening(this.menuLevel),frame=Math.floor(t*50)%101;
        paintPart(g,this.openingPerchPart(this.menuLevel,'perch-left-listen-left',frame,perch.x));
      }
    }else if(this.sunset){this.matchSky('puzzle');b.setTransform(1,0,0,1,0,0);this.sunset.draw(t);}
    else {b.fillStyle='#ee9218';b.fillRect(0,0,W,H);}
    if(this.theme()==='rain')this.shadeRain(g,.18);
    if(this.screen==='welcome')this.drawMenu(g,t,this.progress.playedOnce);
    else{g.fillStyle='rgba(4,18,34,.42)';g.fillRect(0,0,W,H);}
    $('campaign-opening')?.remove();
    return true;
  },
  drawMenu(g,t,playedOnce){
    g.save();this.placeUI(g);
    this.drawTitle(g,t,this.theme()==='rain');
    this.button(g,'PLAY',88,242,155,36,18);
    if(playedOnce)this.button(g,'LEVEL SELECT',88,286,155,35,14);
    if(this.theme()==='rain')this.buttonRain(g,t);g.restore();
  },
  slotTarget(asset){const index=Math.max(0,this.lyrics().findIndex(o=>o.asset===asset)),view=this.uiLayout();return {x:view.x+(30+index*42)*view.scale,y:view.y+31*view.scale};},
  rewardLayers:new Map(),
  arrivalLayers:new Map(),
  rewardArrival(g,asset,age,x,y){
    const path=this.rewardPath(asset,'completion','arrival'),entry=Art.image(path);if(!entry.ready)return;
    if(!this.arrivalLayers.has(asset)){
      const frames=[];
      for(let i=0;i<20;i++){
        const c=document.createElement('canvas');c.width=52;c.height=83;const k=c.getContext('2d');k.imageSmoothingEnabled=false;
        k.drawImage(entry.image,i%5*80,Math.floor(i/5)*128,80,128,0,0,52,83);frames.push(c);
      }
      this.arrivalLayers.set(asset,frames);
    }
    g.drawImage(this.arrivalLayers.get(asset)[Math.min(19,Math.floor(age*30))],x,y-26);
  },
  reward(g,src,x,y,size,alpha){
    const entry=Art.image(src);if(!entry.ready)return;
    const key=src+':'+size;
    if(!this.rewardLayers.has(key)){
      const image=document.createElement('canvas');image.width=size;image.height=size;const k=image.getContext('2d');k.imageSmoothingEnabled=false;k.drawImage(entry.image,0,0,size,size);
      const shadow=document.createElement('canvas');shadow.width=size;shadow.height=size;const s=shadow.getContext('2d');s.drawImage(image,0,0);s.globalCompositeOperation='source-in';s.fillStyle='#061529';s.fillRect(0,0,size,size);this.rewardLayers.set(key,{image,shadow});
    }
    const layer=this.rewardLayers.get(key);g.save();g.globalAlpha*=alpha;
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]])g.drawImage(layer.shadow,x+dx,y+dy);
    g.drawImage(layer.image,x,y);g.restore();
  },
  drawRewards(g,completion=false){
    const p=playState,lyrics=this.lyrics();if(!p)return;
    let foundNumber=0;
    lyrics.forEach((o,i)=>{
      const found=p.collected.has(o.id),status=found?'found':!completion&&p.previousLyrics?.has(o.asset)?'previous':'missing';
      const size=completion?52:32,x=completion?(330-lyrics.length*59)/2+i*59:14+i*42,y=completion?87:15;
      const arriving=!completion&&p.pickups.some(piece=>piece.asset===o.asset&&!piece.arrived);
      if(completion&&found){
        const age=p.finishAge-2.9-foundNumber++*.75;
        if(age<20/30){this.reward(g,this.rewardPath(o.asset,'completion','missing'),Math.round(x),y,size,1);if(age>=0)this.rewardArrival(g,o.asset,age,Math.round(x),y);}
        else this.reward(g,this.rewardPath(o.asset,'completion','found'),Math.round(x),y,size,1);
      }else this.reward(g,this.rewardPath(o.asset,completion?'completion':'hud',arriving?'missing':status),Math.round(x),y,size,1);
    });
  },
  drawHUD(g){
    if(!publicPlay||!playState)return;const p=playState;
    if(p.departingWelcome&&p.time<.75){g.save();g.globalAlpha=1-smooth(p.time/.75);this.drawMenu(g,sceneClock,p.departingWelcome.playedOnce);g.restore();}
    if(p.failed){
      g.save();g.globalAlpha=1-smooth(p.failureAge/.25);this.placeUI(g);this.drawRewards(g);this.button(g,'Pause',270,17,47,21,8);g.restore();
      const fade=smooth((p.failureAge-(p.defeat.retryAt-.55))/.55);
      g.fillStyle='rgba(4,18,34,'+(.48*fade)+')';g.fillRect(0,0,W,H);
      if(fade>0){g.save();g.globalAlpha=fade;this.placeUI(g);this.heading(g,'TRY AGAIN',225);this.button(g,'RETRY',88,270,155,36);this.button(g,'LEVEL SELECT',88,317,155,35);g.restore();}
      return;
    }
    g.save();g.globalAlpha*=smooth((p.time-(p.introDuration-.65))/.65);this.placeUI(g);
    if(p.results){
      this.heading(g,'LEVEL COMPLETE',54);this.drawRewards(g,true);
      this.button(g,'CONTINUE',88,165,155,36);this.button(g,'LEVEL SELECT',104,211,123,29,11);
    }else if(!p.complete){this.drawRewards(g);this.button(g,'Pause',270,17,47,21,8);}
    g.restore();
  },
  heading(g,label,y){
    g.font='22px Departure';g.textAlign='center';g.textBaseline='middle';g.lineWidth=1.5;g.strokeStyle='#061529';g.strokeText(label,165,y);g.fillStyle='#fff5d6';g.fillText(label,165,y);g.textAlign='left';
  },
  tick(now){
    const dt=this.lastMenuTick?Math.min((now-this.lastMenuTick)/1000,.05):0;this.lastMenuTick=now;
    if(this.screen&&!PuzzleLevel.active&&!document.hidden){
      // The first complete frame starts at the beginning of every motion.
      if(this.drawWelcome())this.menuTime+=dt;
      this.updateReady();if(this.screen==='levels'&&this.cardsDirty)this.paintCards();
    }
    requestAnimationFrame(t=>this.tick(t));
  },
  init(){
    if(document.fonts){
      this.fontReady=false;
      const prepareFont=()=>document.fonts.load('18px Departure').then(()=>{this.fontReady=true;this.updateReady();request();}).catch(()=>setTimeout(prepareFont,1500));
      prepareFont();
    }
    this.read();
    const resize=()=>{this.layouts=new WeakMap();request();};
    window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
    if(!publicPlay)for(const name of ['summit-garden','summit-rain','rain-drop','seed-unoccupied'])Art.image(this.base+name+'.png');
    const changed=Art.changed;Art.changed=()=>{changed();this.cardsDirty=true;};
    const stage=$('stage');
    const menu=node('div',{id:'campaign-menu',hidden:true});
    menu.innerHTML='<button id="welcome-play" aria-label="Play" disabled></button><button id="welcome-levels" aria-label="Level select"></button>';
    stage.append(menu);
    const selector=node('section',{id:'campaign-selector',hidden:true});
    selector.innerHTML='<button id="campaign-back">Back</button><h1>LEVEL SELECT</h1><div id="campaign-cards"></div>';
    stage.append(selector);
    this.wireCards();
    const retry=node('div',{id:'campaign-retry',hidden:true});retry.innerHTML='<button id="retry-play" aria-label="Retry"></button><button id="retry-levels" aria-label="Level select"></button>';stage.append(retry);
    stage.append($('mobile-pause'));
    $('welcome-play').onclick=()=>this.begin();$('welcome-levels').onclick=()=>this.showLevels();$('campaign-back').onclick=()=>this.showWelcome();
    $('retry-play').onclick=restartPlay;$('retry-levels').onclick=()=>this.showLevels();
    window.addEventListener('keydown',e=>{
      if(!publicPlay||PuzzleLevel.active||!this.screen||e.target.tagName==='BUTTON')return;
      if(this.screen==='welcome'&&['Space','Enter'].includes(e.code)){e.preventDefault();if(!$('welcome-play').disabled)this.begin();}
      if(this.screen==='levels'&&e.code==='Escape'){e.preventDefault();this.showWelcome();}
    });
    for(const name of ['gesturestart','gesturechange'])stage.addEventListener(name,e=>{if(publicPlay)e.preventDefault();},{passive:false});
    window.addEventListener('storage',e=>{if(e.key===this.key){this.read();if(this.screen==='welcome')this.showWelcome(null,false);else if(this.screen==='levels')this.buildCards();}});
    requestAnimationFrame(t=>this.tick(t));
  }
};
