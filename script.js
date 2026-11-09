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

const map = L.map('map').setView([10.7050,122.5600],13);
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
  dfs:{name:'Depth-first',info:'Dives down one road as far as it can, then backs up. Finds a route, but usually a long and winding one.'}
};
const fromSel=$('from'), toSel=$('to'), algoSel=$('algo');
const opts=Object.keys(PLACES).map(k=>`<option>${k}</option>`).join('');
fromSel.innerHTML='<option value="">Choose start…</option>'+opts;
toSel.innerHTML='<option value="">Choose destination…</option>'+opts;
fromSel.value="Plaza Libertad (City Proper)";
toSel.value="SM City Iloilo";
algoSel.innerHTML=Object.entries(ALGOS).map(([k,v])=>`<option value="${k}">${v.name}</option>`).join('');
const showInfo=()=>$('info').textContent=ALGOS[algoSel.value].info;
algoSel.onchange=showInfo;showInfo();

let start=null,end=null,mode='fast',mS=null,mE=null,clickState=0,graph=null,loading=false,run=null,paused=false,raf=null,pathRaf=null,pathLine=null,pathCase=null,head=null,runId=0,results=[];
const icon=c=>L.divIcon({className:'',html:`<div class="dot" style="background:${c}"></div>`,iconSize:[16,16],iconAnchor:[8,8]});
const msg=t=>$('msg').textContent=t||'';
const fmtT=s=>s>=3600?`${Math.floor(s/3600)} h ${Math.round(s%3600/60)} min`:`${Math.max(1,Math.round(s/60))} min`;
const fmtD=m=>m>=1000?(m/1000).toFixed(1)+' km':Math.round(m)+' m';

function setPt(which,ll,name){
  if(which==='s'){start=ll;if(mS)mS.remove();mS=L.marker(ll,{icon:icon('#16a34a')}).addTo(map).bindTooltip('Start: '+name);}
  else{end=ll;if(mE)mE.remove();mE=L.marker(ll,{icon:icon('#dc2626')}).addTo(map).bindTooltip('Destination: '+name);}
  results=[];renderResults();
}
function fromSelects(){
  if(PLACES[fromSel.value])setPt('s',PLACES[fromSel.value],fromSel.value);
  if(PLACES[toSel.value])setPt('e',PLACES[toSel.value],toSel.value);
}
fromSel.onchange=toSel.onchange=fromSelects;
fromSelects();
map.on('click',e=>{
  const ll=[e.latlng.lat,e.latlng.lng];
  if(clickState===0){setPt('s',ll,'Pinned point');fromSel.value='';clickState=1;}
  else{setPt('e',ll,'Pinned point');toSel.value='';clickState=0;}
});
$('swap').onclick=()=>{[fromSel.value,toSel.value]=[toSel.value,fromSel.value];const a=start,b=end;if(b)setPt('s',b,'Start');if(a)setPt('e',a,'Destination');};
$('gps').onclick=()=>{
  if(!navigator.geolocation){msg('Geolocation is not supported in this browser.');return;}
  navigator.geolocation.getCurrentPosition(p=>{setPt('s',[p.coords.latitude,p.coords.longitude],'My location');fromSel.value='';map.panTo([p.coords.latitude,p.coords.longitude]);},
    ()=>msg('Could not get your location. Allow location access and try again.'));
};
$('mFast').onclick=()=>{mode='fast';$('mFast').classList.add('on');$('mShort').classList.remove('on');};
$('mShort').onclick=()=>{mode='short';$('mShort').classList.add('on');$('mFast').classList.remove('on');};

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
async function loadGraph(){
  const S=Math.min(start[0],end[0]),N=Math.max(start[0],end[0]),W=Math.min(start[1],end[1]),E=Math.max(start[1],end[1]);
  const span=Math.max(N-S,E-W),major=span>0.06,pad=Math.max(0.008,span*0.15);
  const inside=(g,p)=>p[0]>g.b[0]+.002&&p[0]<g.b[2]-.002&&p[1]>g.b[1]+.002&&p[1]<g.b[3]-.002;
  if(graph&&graph.major===major&&inside(graph,start)&&inside(graph,end))return graph;
  const b=[S-pad,W-pad,N+pad,E+pad];
  const types=Object.keys(SPEED).filter(t=>!major||!/residential|living_street|unclassified/.test(t)).join('|');
  const q=`[out:json][timeout:60];way["highway"~"^(${types})$"]["access"!~"private|no"](${b.join(',')});out geom;`;
  const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:'data='+encodeURIComponent(q)});
  if(!r.ok)throw new Error('road data server returned '+r.status);
  const d=await r.json();
  const idx=new Map(),lat=[],lng=[],adj=[];
  const node=(id,la,lo)=>{let i=idx.get(id);if(i===undefined){i=lat.length;idx.set(id,i);lat.push(la);lng.push(lo);adj.push([]);}return i;};
  for(const w of d.elements){
    if(w.type!=='way'||!w.geometry)continue;
    const t=w.tags||{},sp=SPEED[t.highway]||25;
    const ow=t.oneway==='-1'?-1:(['yes','true','1'].includes(t.oneway)||t.junction==='roundabout')?1:0;
    let prev=-1;
    for(let k=0;k<w.nodes.length;k++){
      const p=w.geometry[k];if(!p){prev=-1;continue;}
      const c=node(w.nodes[k],p.lat,p.lon);
      if(prev>=0){const dd=hav(lat[prev],lng[prev],lat[c],lng[c]);if(ow>=0)adj[prev].push([c,dd,sp]);if(ow<=0)adj[c].push([prev,dd,sp]);}
      prev=c;
    }
  }
  graph={lat,lng,adj,b,major};
  return graph;
}
function nearest(g,p){let best=-1,bd=Infinity;for(let i=0;i<g.lat.length;i++){if(!g.adj[i].length)continue;const d=hav(p[0],p[1],g.lat[i],g.lng[i]);if(d<bd){bd=d;best=i;}}return{i:best,d:bd};}

/* ---------- the algorithms, as one generator that yields one visited road at a time ---------- */
function* search(g,s,t,algo,mode){
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
  map.fitBounds([start,end],{padding:[70,70]});
  let g;
  try{g=await loadGraph();}
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
