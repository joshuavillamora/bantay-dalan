const PLACES = {
  "Plaza Libertad (City Proper)":[10.6963,122.5693],
  "Fort San Pedro / Ferry Terminal":[10.6935,122.5718],
  "Robinsons Place Iloilo":[10.6958,122.5655],
  "Molo Church":[10.6967,122.5444],
  "Jaro Cathedral":[10.7253,122.5662],
  "Iloilo Esplanade":[10.7075,122.5530],
  "SM City Iloilo":[10.7137,122.5518],
  "Smallville Complex":[10.7155,122.5465],
  "Iloilo Convention Center":[10.7105,122.5440],
  "Iloilo Airport (Cabatuan)":[10.8330,122.4930]
};

const map = L.map('map',{zoomControl:false}).setView([10.7050,122.5600],13);
L.control.zoom({position:'topright'}).addTo(map);   // the control panel covers the top-left corner
// Padding that keeps a fitted route clear of the floating control panel on wide screens.
const fitPad=()=>innerWidth>760?{paddingTopLeft:[document.getElementById('panel').offsetWidth+56,60],paddingBottomRight:[60,60]}:{padding:[40,40]};
// PLACE YOUR API KEY HERE
const CARTO_API_KEY = "";
if (CARTO_API_KEY) {
  L.tileLayer('https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=' + CARTO_API_KEY, {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }).addTo(map);
} else {
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Tiles &copy; Esri'
  }).addTo(map);
}



const $ = id => document.getElementById(id);
const ALGOS={
  astar:{name:'A*',info:'Adds the cost so far to a straight-line guess of what is left. Explores far fewer roads than Dijkstra and still finds the best route.'},
  dijkstra:{name:'Dijkstra',info:'Always explores the cheapest road next, so it spreads out in every direction. Guarantees the best route.'},
  greedy:{name:'Greedy best-first',info:'Only looks at the straight-line distance to the destination. Very focused, but the route it finds can be longer than the best one.'},
  bfs:{name:'Breadth-first',info:'Explores ring by ring, counting road segments and ignoring distance. Finds the fewest segments, not the shortest or fastest route.'},
  dfs:{name:'Depth-first',info:'Dives down one road as far as it can, then backs up. Finds a route, but usually a long and winding one.'},
  bidir:{name:'Bidirectional Dijkstra',info:'Runs Dijkstra from the start and from the destination at the same time, and stops when the two searches meet. Finds the same best route as Dijkstra but explores far fewer roads.'},
};
const fromIn=$('from'), toIn=$('to'), algoSel=$('algo');
algoSel.innerHTML=Object.entries(ALGOS).map(([k,v])=>`<option value="${k}">${v.name}</option>`).join('');
const showInfo=()=>$('info').textContent=ALGOS[algoSel.value].info;
algoSel.onchange=showInfo;showInfo();

let start=null,end=null,mode='fast',mS=null,mE=null,clickState=0,graph=null,loading=false,run=null,paused=false,raf=null,pathRaf=null,pathLine=null,pathCase=null,head=null,runId=0,results=[];
const names={s:'',e:''};   // the text shown in the From / To boxes for the chosen points
const icon=c=>L.divIcon({className:'',html:`<div class="dot" style="background:${c}"></div>`,iconSize:[16,16],iconAnchor:[8,8]});
const msg=t=>$('msg').textContent=t||'';
const fmtT=s=>s>=3600?`${Math.floor(s/3600)} h ${Math.round(s%3600/60)} min`:`${Math.max(1,Math.round(s/60))} min`;
const fmtD=m=>m>=1000?(m/1000).toFixed(1)+' km':Math.round(m)+' m';

function setPt(which,ll,name){
  if(which==='s'){start=ll;if(mS)mS.remove();mS=L.marker(ll,{icon:icon('#16a34a')}).addTo(map).bindTooltip('Start: '+name);fromIn.value=name;}
  else{end=ll;if(mE)mE.remove();mE=L.marker(ll,{icon:icon('#dc2626')}).addTo(map).bindTooltip('Destination: '+name);toIn.value=name;}
  names[which]=name;
  results=[];renderResults();
}
setPt('s',PLACES["Plaza Libertad (City Proper)"],"Plaza Libertad (City Proper)");
setPt('e',PLACES["SM City Iloilo"],"SM City Iloilo");

map.on('click',e=>{
  if(drawing){drawClick(e.latlng);return;}
  const ll=[e.latlng.lat,e.latlng.lng];
  if(clickState===0){setPt('s',ll,'Pinned point');clickState=1;}
  else{setPt('e',ll,'Pinned point');clickState=0;}
});

/* ---------- road closures: red lines drawn across roads ---------- */
let closures=[],drawing=false,corner=null,draft=null;
const HINT='Draw a red line across a road to close it. Click a line to reopen it.';
function closuresChanged(){
  cancel();clearDrawing();results=[];renderResults();msg('');
  $('closeClear').disabled=!closures.length;
  $('closeDraw').textContent='Close a road'+(closures.length?` (${closures.length})`:'');
}
function setDrawing(v){
  drawing=v;corner=null;if(draft){draft.remove();draft=null;}
  $('closeDraw').classList.toggle('on',v);$('closeDraw').setAttribute('aria-pressed',v);
  map.getContainer().classList.toggle('drawing',v);
  $('closeHint').textContent=v?'Click where the closure starts, then where it ends. Esc cancels.':HINT;
}
function drawClick(ll){
  if(!corner){
    corner=ll;
    draft=L.polyline([ll,ll],{className:'closure draft',interactive:false}).addTo(map);
    return;
  }
  const c=corner;setDrawing(false);
  const a=[c.lat,c.lng],b=[ll.lat,ll.lng];
  if(hav(a[0],a[1],b[0],b[1])<15){msg('That line is too short. Click further away.');return;}
  const line=L.polyline([a,b],{className:'closure'}).addTo(map).bindTooltip('Road closed · click to reopen',{sticky:true});
  const item={a,b,line};closures.push(item);
  line.on('click',ev=>{
    if(drawing)return;
    L.DomEvent.stopPropagation(ev);   // don't also drop a pin
    line.remove();closures=closures.filter(x=>x!==item);closuresChanged();
  });
  closuresChanged();
}
map.on('mousemove',e=>{if(drawing&&corner&&draft)draft.setLatLngs([corner,e.latlng]);});
$('closeDraw').onclick=()=>setDrawing(!drawing);
$('closeClear').onclick=()=>{closures.forEach(c=>c.line.remove());closures=[];closuresChanged();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drawing)setDrawing(false);});
setDrawing(false);   // set starting hint text

/*road segment is closed when it crosses a closure line */
const ccw=(a,b,c)=>(c[0]-a[0])*(b[1]-a[1])>(b[0]-a[0])*(c[1]-a[1]);
const crosses=(p,q,r,s)=>ccw(p,r,s)!==ccw(q,r,s)&&ccw(p,q,r)!==ccw(p,q,s);
function openRoads(g){
  if(!closures.length)return g;
  let removed=0;
  const adj=g.adj.map((list,u)=>{
    const p=[g.lat[u],g.lng[u]];
    return list.filter(e=>{
      const bad=closures.some(c=>crosses(p,[g.lat[e[0]],g.lng[e[0]]],c.a,c.b));
      if(bad)removed++;
      return !bad;
    });
  });
  console.log('closed road segments:',removed);
  return {lat:g.lat,lng:g.lng,adj,b:g.b,major:g.major};
}

$('swap').onclick=()=>{$('swap').classList.toggle('flipped');const a=start,an=names.s,b=end,bn=names.e;if(b)setPt('s',b,bn);if(a)setPt('e',a,an);};
$('gps').onclick=()=>{
  if(!navigator.geolocation){msg('Geolocation is not supported in this browser.');return;}
  navigator.geolocation.getCurrentPosition(p=>{setPt('s',[p.coords.latitude,p.coords.longitude],'My location');map.panTo([p.coords.latitude,p.coords.longitude]);},
    ()=>msg('Could not get your location. Allow location access and try again.'));
};
$('mFast').onclick=()=>{mode='fast';$('mFast').classList.add('on');$('mShort').classList.remove('on');};
$('mShort').onclick=()=>{mode='short';$('mShort').classList.add('on');$('mFast').classList.remove('on');};

/* ---------- location search with suggestions ----------
   Preset places match instantly. Other places in and around Iloilo come from Photon
   (photon.komoot.io), a free OpenStreetMap search service that supports search-as-you-type. */
const SEARCH_BOX='122.38,10.62,122.66,10.88';   // west,south,east,north: Iloilo City out to the airport
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function placeSearch(input,which){
  const list=$(input.id+'List');let items=[],active=-1,timer=null,ctrl=null,seq=0;
  const open=v=>{list.hidden=!v;input.setAttribute('aria-expanded',v);if(!v){active=-1;input.removeAttribute('aria-activedescendant');}};
  const render=(loading)=>{
    if(!items.length&&!loading){list.innerHTML=input.value.trim()?'<li class="empty">No places found in Iloilo.</li>':'';open(!!input.value.trim());return;}
    list.innerHTML=items.map((p,i)=>`<li role="option" id="${input.id}Opt${i}" class="opt${i===active?' active':''}" aria-selected="${i===active}" data-i="${i}">
      <span class="ico ${p.preset?'star':'pin'}" aria-hidden="true"></span><span><b>${esc(p.name)}</b><small>${esc(p.detail)}</small></span></li>`).join('')
      +(loading?'<li class="empty">Searching…</li>':'');
    open(true);
  };
  const local=q=>Object.entries(PLACES).filter(([n])=>!q||n.toLowerCase().includes(q)).map(([n,ll])=>({name:n,ll,detail:'Popular place',preset:true}));
  const remote=async q=>{
    if(ctrl)ctrl.abort();ctrl=new AbortController();
    const r=await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=7&lat=10.71&lon=122.56&bbox=${SEARCH_BOX}`,{signal:ctrl.signal});
    if(!r.ok)throw new Error(r.status);
    const d=await r.json();
    return d.features.filter(f=>f.properties.name||f.properties.street).map(f=>{
      const p=f.properties,c=f.geometry.coordinates;
      const name=p.name||[p.housenumber,p.street].filter(Boolean).join(' ');
      const detail=[p.name&&p.street,p.locality||p.district,p.city||p.county].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ');
      return {name,ll:[c[1],c[0]],detail:detail||'Iloilo'};
    });
  };
  const update=()=>{
    const q=input.value.trim().toLowerCase(),my=++seq;
    items=local(q);active=items.length?0:-1;
    clearTimeout(timer);
    if(q.length<3){render(false);return;}
    render(true);
    timer=setTimeout(async()=>{
      try{
        const found=await remote(q);
        if(my!==seq)return;
        const seen=new Set(items.map(p=>p.name.toLowerCase()));
        items=items.concat(found.filter(p=>!seen.has(p.name.toLowerCase()))).slice(0,8);
      }catch(e){if(e.name==='AbortError'||my!==seq)return;}
      if(active<0&&items.length)active=0;
      render(false);
    },300);
  };
  const choose=i=>{
    const p=items[i];if(!p)return;
    setPt(which,p.ll,p.name);open(false);
    if(!map.getBounds().contains(p.ll))map.panTo(p.ll);
  };
  const move=d=>{if(!items.length)return;active=(active+d+items.length)%items.length;render(false);
    const el=$(input.id+'Opt'+active);if(el){input.setAttribute('aria-activedescendant',el.id);el.scrollIntoView({block:'nearest'});}};
  input.addEventListener('focus',()=>{input.select();seq++;clearTimeout(timer);items=local('');active=-1;render(false);});
  input.addEventListener('input',update);
  input.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'){e.preventDefault();list.hidden?update():move(1);}
    else if(e.key==='ArrowUp'){e.preventDefault();move(-1);}
    else if(e.key==='Enter'){if(!list.hidden&&active>=0){e.preventDefault();choose(active);}}
    else if(e.key==='Escape'){open(false);input.value=names[which];}
  });
  input.addEventListener('blur',()=>setTimeout(()=>{open(false);input.value=names[which];},150));
  list.addEventListener('mousedown',e=>{const li=e.target.closest('[data-i]');if(li){e.preventDefault();choose(+li.dataset.i);input.blur();}});
}
placeSearch(fromIn,'s');
placeSearch(toIn,'e');

/* ---------- canvas layer: explored roads (lines) and found roads (dots) ---------- */
const Explore=L.Layer.extend({
  initialize(){this.e=[];},
  onAdd(m){this.c=document.createElement('canvas');this.c.style.pointerEvents='none';m.getPanes().overlayPane.appendChild(this.c);m.on('moveend zoomend resize',this.reset,this);this.reset();},
  onRemove(m){this.c.remove();m.off('moveend zoomend resize',this.reset,this);},
  reset(){const m=this._map,s=m.getSize();L.DomUtil.setPosition(this.c,m.containerPointToLayerPoint([0,0]));this.c.width=s.x;this.c.height=s.y;this.ctx=this.c.getContext('2d');this.redraw();},
  draw(a){
    const m=this._map,x=this.ctx,p=m.latLngToContainerPoint([a[0],a[1]]);
    if(a.length===2){x.fillStyle='rgba(34,184,207,.9)';x.beginPath();x.arc(p.x,p.y,2.6,0,6.3);x.fill();return;}
    const q=m.latLngToContainerPoint([a[2],a[3]]);
    x.strokeStyle='rgba(240,140,0,.85)';x.lineWidth=1.8;x.lineCap='round';
    x.beginPath();x.moveTo(p.x,p.y);x.lineTo(q.x,q.y);x.stroke();
  },
  add(a){this.e.push(a);this.draw(a);},
  redraw(){this.ctx.clearRect(0,0,this.c.width,this.c.height);this.e.forEach(a=>this.draw(a));},
  clear(){this.e=[];if(this.ctx)this.redraw();}
});
const layer=new Explore().addTo(map);

/* ---------- geometry, heap ---------- */
const R=6371000,rad=Math.PI/180;
const hav=(a,b,c,d)=>R*Math.hypot((d-b)*rad*Math.cos((a+c)*rad/2),(c-a)*rad);
class Heap{
  constructor(){this.k=[];this.v=[];}
  get size(){return this.k.length;}
  push(v,k){let i=this.k.length;this.k.push(k);this.v.push(v);while(i>0){const p=(i-1)>>1;if(this.k[p]<=k)break;this.k[i]=this.k[p];this.v[i]=this.v[p];i=p;}this.k[i]=k;this.v[i]=v;}
  pop(){const top=this.v[0],lk=this.k.pop(),lv=this.v.pop(),n=this.k.length;
    if(n){let i=0;for(;;){let c=2*i+1;if(c>=n)break;if(c+1<n&&this.k[c+1]<this.k[c])c++;if(this.k[c]>=lk)break;this.k[i]=this.k[c];this.v[i]=this.v[c];i=c;}this.k[i]=lk;this.v[i]=lv;}
    return top;}
}

/* ---------- road network from OpenStreetMap (Overpass) ---------- */
const SPEED={motorway:80,trunk:60,primary:50,secondary:40,tertiary:35,unclassified:30,residential:25,living_street:15,motorway_link:40,trunk_link:35,primary_link:30,secondary_link:30,tertiary_link:30};
let graphPromise = null;
async function loadGraph() {
  if (graph) return graph;
  if (!graphPromise) graphPromise = (async () => {
    const r = await fetch('iloilo-roads.json');
    if (!r.ok) throw new Error('iloilo-roads.json not found (' + r.status + ')');
    const d = await r.json();
    const idx = new Map(), lat = [], lng = [], adj = [];
    const node = (id, la, lo) => { let i = idx.get(id); if (i === undefined) { i = lat.length; idx.set(id, i); lat.push(la); lng.push(lo); adj.push([]); } return i; };
    for (const w of d.elements) {
      if (w.type !== 'way' || !w.geometry) continue;
      const t = w.tags || {}, sp = SPEED[t.highway] || 25;
      const ow = t.oneway === '-1' ? -1 : (['yes', 'true', '1'].includes(t.oneway) || t.junction === 'roundabout') ? 1 : 0;
      let prev = -1;
      for (let k = 0; k < w.nodes.length; k++) {
        const p = w.geometry[k]; if (!p) { prev = -1; continue; }
        const c = node(w.nodes[k], p.lat, p.lon);
        if (prev >= 0) { const dd = hav(lat[prev], lng[prev], lat[c], lng[c]); if (ow >= 0) adj[prev].push([c, dd, sp]); if (ow <= 0) adj[c].push([prev, dd, sp]); }
        prev = c;
      }
    }
    graph = { lat, lng, adj, b: null, major: false };
    return graph;
  })();
  try { return await graphPromise; } catch (e) { graphPromise = null; throw e; }
}
function nearest(g,p){let best=-1,bd=Infinity;for(let i=0;i<g.lat.length;i++){if(!g.adj[i].length)continue;const d=hav(p[0],p[1],g.lat[i],g.lng[i]);if(d<bd){bd=d;best=i;}}return{i:best,d:bd};}

/* Bidirectional Dijkstra: forward search from s, backward search from t over reversed roads. */
function buildRadj(g){
  if(g.radj)return g.radj;
  const r=g.adj.map(()=>[]);
  g.adj.forEach((list,u)=>list.forEach(([v,d,sp])=>r[v].push([u,d,sp])));
  return g.radj=r;
}
function* bidir(g,s,t,mode){
  if(s===t)return [s];
  const n=g.lat.length,adjs=[g.adj,buildRadj(g)],w=(d,sp)=>mode==='fast'?d/(sp/3.6):d;
  const dist=[new Float64Array(n).fill(Infinity),new Float64Array(n).fill(Infinity)];
  const prev=[new Int32Array(n).fill(-1),new Int32Array(n).fill(-1)];
  const done=[new Uint8Array(n),new Uint8Array(n)],heap=[new Heap(),new Heap()];
  dist[0][s]=0;dist[1][t]=0;heap[0].push(s,0);heap[1].push(t,0);
  const top=k=>{const h=heap[k];while(h.size&&done[k][h.v[0]])h.pop();return h.size?h.k[0]:Infinity;};
  let mu=Infinity,meet=-1;
  for(;;){
    const tf=top(0),tb=top(1);
    if(tf===Infinity||tb===Infinity||tf+tb>=mu)break;
    const k=tf<=tb?0:1,o=1-k,u=heap[k].pop();
    done[k][u]=1;
    if(dist[o][u]<Infinity&&dist[k][u]+dist[o][u]<mu){mu=dist[k][u]+dist[o][u];meet=u;}
    const found=[];
    for(const [v,d,sp] of adjs[k][u]){
      if(done[k][v])continue;
      const nc=dist[k][u]+w(d,sp);
      if(nc<dist[k][v]){if(dist[k][v]===Infinity)found.push(v);dist[k][v]=nc;prev[k][v]=u;heap[k].push(v,nc);}
      if(dist[o][v]<Infinity&&dist[k][v]+dist[o][v]<mu){mu=dist[k][v]+dist[o][v];meet=v;}
    }
    yield{u,p:prev[k][u],found,q:heap[0].size+heap[1].size};
  }
  if(meet<0)return null;
  const path=[];
  for(let v=meet;v>=0;v=prev[0][v])path.push(v);
  path.reverse();
  for(let v=prev[1][meet];v>=0;v=prev[1][v])path.push(v);
  return path;
}

/* ---------- the algorithms, as one generator that yields one visited road at a time ---------- */
function* search(g,s,t,algo,mode){
  if(algo==='bidir')return yield* bidir(g,s,t,mode);
  const n=g.lat.length,cost=new Float64Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1),done=new Uint8Array(n),seen=new Uint8Array(n);
  const hv=v=>hav(g.lat[v],g.lng[v],g.lat[t],g.lng[t])/(mode==='fast'?80/3.6:1);
  const key=(v,c)=>algo==='dijkstra'?c:algo==='astar'?c+hv(v):hv(v);
  const useHeap=algo==='astar'||algo==='dijkstra'||algo==='greedy',isBfs=algo==='bfs';
  const heap=useHeap?new Heap():null,fifo=isBfs?[s]:null,stack=(!useHeap&&!isBfs)?[s]:null;
  let fh=0;cost[s]=0;if(useHeap)heap.push(s,0);if(isBfs)seen[s]=1;
  for(;;){
    let u;
    if(useHeap){if(!heap.size)break;u=heap.pop();}
    else if(isBfs){if(fh>=fifo.length)break;u=fifo[fh++];}
    else{if(!stack.length)break;u=stack.pop();}
    if(done[u])continue;done[u]=1;
    const found=[];
    if(u!==t)for(const [v,d,sp] of g.adj[u]){
      if(done[v])continue;
      const nc=cost[u]+(mode==='fast'?d/(sp/3.6):d);
      if(useHeap){
        if(nc<cost[v]&&(algo!=='greedy'||cost[v]===Infinity)){if(cost[v]===Infinity)found.push(v);cost[v]=nc;prev[v]=u;heap.push(v,key(v,nc));}
      }else if(isBfs){
        if(!seen[v]){seen[v]=1;cost[v]=nc;prev[v]=u;fifo.push(v);found.push(v);}
      }else{
        if(cost[v]===Infinity)found.push(v);cost[v]=nc;prev[v]=u;stack.push(v);
      }
    }
    yield{u,p:prev[u],found,q:useHeap?heap.size:isBfs?fifo.length-fh:stack.length};
    if(u===t){const path=[];for(let v=t;v>=0;v=prev[v])path.push(v);return path.reverse();}
  }
  return null;
}

/* ---------- controls ---------- */
const spf=()=>Math.pow(10,(+$('spd').value-25)/25);   // steps per frame: 0.1 … 1000
function ui(){
  $('go').disabled=loading;$('pause').disabled=!run;$('skip').disabled=!run;$('step').disabled=!run||!paused;
  $('pause').textContent=paused?'Resume':'Pause';
}
function cancel(){runId++;cancelAnimationFrame(raf);cancelAnimationFrame(pathRaf);run=null;paused=false;loading=false;ui();}
function clearDrawing(){
  layer.clear();[pathLine,pathCase,head].forEach(x=>x&&x.remove());pathLine=pathCase=head=null;
  $('sN').textContent='0';$('sQ').textContent='0';$('sD').textContent='–';$('sT').textContent='–';$('lt').textContent='Ready';
}
$('reset').onclick=()=>{cancel();clearDrawing();msg('');};
$('pause').onclick=()=>{
  if(!run)return;
  paused=!paused;
  if(paused){cancelAnimationFrame(raf);$('lt').textContent='Paused';}else{$('lt').textContent=ALGOS[run.algo].name+' is searching…';frame();}
  ui();
};
$('step').onclick=()=>{if(run&&paused)advance(1);};
$('skip').onclick=()=>{if(run){cancelAnimationFrame(raf);paused=false;advance(Infinity);}};

$('go').onclick=async()=>{
  cancel();clearDrawing();msg('');
  if(!start||!end){msg('Choose both a start and a destination.');return;}
  const my=runId,algo=algoSel.value,md=mode;
  loading=true;ui();$('lt').textContent='Downloading road network…';
  map.fitBounds([start,end],fitPad());
  let g;
  try{g=openRoads(await loadGraph());}
  catch(e){if(my===runId){msg('Could not load road data ('+e.message+'). Check your connection and try again in a moment.');$('lt').textContent='Ready';loading=false;ui();}return;}
  if(my!==runId)return;
  loading=false;
  const a=nearest(g,start),b=nearest(g,end);
  if(a.i<0||b.i<0||Math.min(a.d,b.d)>1500){msg('No road found near one of the points. Move the pin closer to a road.');$('lt').textContent='Ready';ui();return;}
  head=L.marker([g.lat[a.i],g.lng[a.i]],{icon:L.divIcon({className:'',html:'<div class="head"></div>',iconSize:[14,14],iconAnchor:[7,7]}),interactive:false}).addTo(map);
  run={g,it:search(g,a.i,b.i,algo,md),count:0,acc:0,algo,mode:md,my};
  paused=false;$('lt').textContent=ALGOS[algo].name+' is searching…';ui();frame();
};
function frame(){
  raf=null;if(!run||paused)return;
  run.acc+=spf();const n=Math.floor(run.acc);run.acc-=n;
  if(n>0)advance(n);
  if(run&&!paused)raf=requestAnimationFrame(frame);
}
function advance(n){
  const r0=run,g=r0.g;let r=null,last=null;
  for(let i=0;i<n;i++){
    r=r0.it.next();if(r.done)break;
    const {u,p,found}=r.value;r0.count++;last=r.value;
    for(const f of found)layer.add([g.lat[f],g.lng[f]]);
    if(p>=0)layer.add([g.lat[p],g.lng[p],g.lat[u],g.lng[u]]);
  }
  if(last){head.setLatLng([g.lat[last.u],g.lng[last.u]]);$('sQ').textContent=last.q.toLocaleString();}
  $('sN').textContent=r0.count.toLocaleString();
  if(r&&r.done){run=null;paused=false;ui();finish(g,r.value,r0);}
}

/* ---------- result ---------- */
function finish(g,path,r0){
  if(head){head.remove();head=null;}
  if(!path){$('lt').textContent='No route found';msg('These points are not connected by the downloaded roads. Try points closer together or nearer a main road.');return;}
  const pts=path.map(i=>[g.lat[i],g.lng[i]]);
  let dist=0,time=0;
  for(let k=1;k<path.length;k++){const e=g.adj[path[k-1]].find(x=>x[0]===path[k]);if(e){dist+=e[1];time+=e[1]/(e[2]/3.6);}}
  $('sD').textContent=fmtD(dist);$('sT').textContent=fmtT(time);$('lt').textContent='Route found';
  results.push({name:ALGOS[r0.algo].name,mode:r0.mode,n:r0.count,dist,time});renderResults();
  pathCase=L.polyline([],{color:'#fff',weight:10,opacity:.9}).addTo(map);
  pathLine=L.polyline([],{color:getComputedStyle(document.documentElement).getPropertyValue('--best').trim()||'#0f766e',weight:6}).addTo(map);
  const total=pts.length,per=Math.max(1,Math.ceil(total/70));let k=0;
  const draw=()=>{
    if(r0.my!==runId)return;
    k=Math.min(total,k+per);const seg=pts.slice(0,k);pathCase.setLatLngs(seg);pathLine.setLatLngs(seg);
    if(k<total)pathRaf=requestAnimationFrame(draw);
  };
  draw();
}
function renderResults(){
  $('resBox').hidden=!results.length;
  const metric=r=>r.mode==='fast'?r.time:r.dist;
  const best={};results.forEach(r=>{best[r.mode]=Math.min(best[r.mode]??Infinity,metric(r));});
  $('res').innerHTML=results.map(r=>`<tr><td>${r.name}<br><small>${r.mode==='fast'?'fastest':'shortest'}</small></td><td>${r.n.toLocaleString()}</td><td>${fmtD(r.dist)}</td><td>${fmtT(r.time)}${metric(r)<=best[r.mode]*1.0001?' ✓':''}</td></tr>`).join('');
}

/* ---------- welcome card: shown on first visit, reopened with the ? button ---------- */
const welcome=$('welcome');
const showWelcome=v=>{welcome.hidden=!v;if(v)$('wGo').focus();};
$('wGo').onclick=()=>{showWelcome(false);try{localStorage.setItem('bd-welcomed','1');}catch(e){}};
$('help').onclick=()=>showWelcome(welcome.hidden);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!welcome.hidden)$('wGo').click();});
let seen=false;try{seen=localStorage.getItem('bd-welcomed')==='1';}catch(e){}
showWelcome(!seen);
