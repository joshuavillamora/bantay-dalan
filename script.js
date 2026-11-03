// ---------- Data: generated dense street model of Iloilo City districts (approximate positions) ----------
const NODES=[],edges=[],nd={},adj={},eAt={};
let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const KLAT=110.6,KLON=109.4;
const hav=(a,b)=>{const R=6371,r=Math.PI/180,dl=(b.lat-a.lat)*r,dn=(b.lon-a.lon)*r,x=Math.sin(dl/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(x))};
const addNode=(id,name,lat,lon,t)=>{NODES.push([id,name,lat,lon,t]);nd[id]={id,name,lat,lon,t};adj[id]=[]};
const addEdge=(a,b,road,art)=>{const id=edges.length,w=hav(nd[a],nd[b])*1.1;edges.push({id,a,b,road,w,art:!!art});adj[a].push({to:b,id,w});adj[b].push({to:a,id,w});eAt[a+"-"+b]=id;eAt[b+"-"+a]=id};
const DIST=[["CP","City Proper",10.6975,122.5640,7,5,-8],["MO","Molo",10.6980,122.5420,7,5,10],["AR","Arevalo",10.6870,122.5290,5,4,-5],
 ["MA","Mandurriao",10.7150,122.5430,8,6,6],["LP","La Paz",10.7140,122.5690,7,6,-10],["JA","Jaro",10.7290,122.5590,8,6,4],["LA","Lapuz",10.6990,122.5780,4,5,0]];
const grid={},SP=0.24;
for(const[d,name,la,lo,C,R,rot]of DIST){grid[d]=[];const a=rot*Math.PI/180;
 for(let r=0;r<R;r++){grid[d][r]=[];for(let c=0;c<C;c++){const x=(c-(C-1)/2)*SP+(rnd()-.5)*SP*.4,y=(r-(R-1)/2)*SP+(rnd()-.5)*SP*.4;
  const rx=x*Math.cos(a)-y*Math.sin(a),ry=x*Math.sin(a)+y*Math.cos(a),id=`${d}${r}_${c}`;grid[d][r][c]=id;addNode(id,`${name} ${r}-${c}`,la-ry/KLAT,lo+rx/KLON,"j")}}
 for(let r=0;r<R;r++)for(let c=0;c<C;c++){const id=grid[d][r][c];
  if(c<C-1)addEdge(id,grid[d][r][c+1],`${name} St ${r+1}`);
  if(r<R-1)addEdge(id,grid[d][r+1][c],`${name} Rd ${c+1}`);
  if(r<R-1&&c<C-1&&rnd()<.14)addEdge(id,grid[d][r+1][c+1],`${name} Link`)}}
const gridIds=NODES.map(n=>n[0]),dOf=id=>id.match(/^[A-Z]+/)[0];
// arterials between districts: 3 well-spread shortest links per neighbouring pair
for(const[p,q,road]of[["CP","MO","Calle Real"],["CP","LA","Muelle Loney St"],["CP","LP","Gen. Luna St"],["MO","AR","Molo-Arevalo Rd"],["AR","CP","Mapa St"],["MO","MA","Delgado-Molo Rd"],["MA","LP","Diversion Rd"],["MA","JA","Jaro-Mandurriao Rd"],["JA","LP","Jaro-La Paz Rd"],["CP","MA","Lopez Jaena St"],["LA","LP","Jalandoni St"]]){
 const A=gridIds.filter(i=>dOf(i)===p),B=gridIds.filter(i=>dOf(i)===q),cand=[];
 for(const a of A)for(const b of B)cand.push([hav(nd[a],nd[b]),a,b]);cand.sort((x,y)=>x[0]-y[0]);
 const used=new Set(),picks=[];
 for(const[,a,b]of cand){if(picks.length>=3)break;if(used.has(a)||used.has(b))continue;
  const m={lat:(nd[a].lat+nd[b].lat)/2,lon:(nd[a].lon+nd[b].lon)/2};if(picks.some(k=>hav(k,m)<.55))continue;picks.push(m);used.add(a);used.add(b);addEdge(a,b,road,true)}}
// communities: snapped to nearest unused street intersection
const taken=new Set(),snap=(la,lo)=>{let b=null,bd=1e9;for(const i of gridIds){if(taken.has(i))continue;const d=hav(nd[i],{lat:la,lon:lo});if(d<bd){bd=d;b=i}}taken.add(b);return b};
for(const[nm,la,lo]of[["City Proper",10.6969,122.5644],["Molo",10.6983,122.5430],["Arevalo",10.6860,122.5300],["Jaro",10.7290,122.5580],["La Paz",10.7125,122.5700],["Mandurriao",10.7150,122.5450],["Lapuz",10.6985,122.5770],["Tabuc Suba",10.7215,122.5630],["Calumpang",10.7080,122.5470],["Villa Arevalo",10.6900,122.5440]]){
 const i=snap(la,lo);nd[i].name=nm;nd[i].t="c";NODES.find(n=>n[0]===i)[1]=nm;NODES.find(n=>n[0]===i)[4]="c"}
// facilities attach to their 2 nearest intersections
for(const[id,nm,la,lo,t]of[["H1","St. Paul Hospital",10.6985,122.5620,"h"],["H2","Iloilo Doctors Hospital",10.7050,122.5480,"h"],["H3","WVSU Medical Center",10.7165,122.5535,"h"],["H4","Jaro Hospital",10.7285,122.5580,"h"],["H5","Iloilo Mission Hospital",10.7250,122.5610,"h"],
 ["E1","Iloilo Sports Complex",10.7090,122.5710,"e"],["E2","Molo Plaza Center",10.6960,122.5440,"e"],["E3","Jaro Cathedral Grounds",10.7270,122.5680,"e"],["E4","Mandurriao Gym",10.7180,122.5420,"e"],["E5","Arevalo Gym",10.6875,122.5320,"e"]]){
 addNode(id,nm,la,lo,t);const near=gridIds.map(i=>[hav(nd[i],nd[id]),i]).sort((x,y)=>x[0]-y[0]).slice(0,2);near.forEach(([,i])=>addEdge(id,i,"Access Rd"))}
// Iloilo River (approximate) and hazard presets
const RIVER=[[10.7330,122.5470],[10.7230,122.5500],[10.7150,122.5535],[10.7070,122.5560],[10.7010,122.5545],[10.6955,122.5530],[10.6900,122.5565]];
const kp=(la,lo)=>[lo*KLON,la*KLAT];
const segX=(p,q,r,s)=>{const c=(a,b,d)=>(b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]);return c(p,q,r)*c(p,q,s)<0&&c(r,s,p)*c(r,s,q)<0};
const pd=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)};
function floodIds(){const rv=RIVER.map(r=>kp(...r)),out=[];
 for(const e of edges){const a=kp(nd[e.a].lat,nd[e.a].lon),b=kp(nd[e.b].lat,nd[e.b].lon),m=[(a[0]+b[0])/2,(a[1]+b[1])/2];let hit=false,near=9;
  for(let i=1;i<rv.length;i++){if(segX(a,b,rv[i-1],rv[i]))hit=true;near=Math.min(near,pd(m,rv[i-1],rv[i]))}
  if(hit||(near<.4&&(e.id*37%100)<35))out.push(e.id)}return out}
const slideIds=()=>edges.filter(e=>e.art&&(e.id*53%100)<45).map(e=>e.id);
const river=()=>`<polyline points="${RIVER.map(r=>X2(r)).join(" ")}" fill="none" stroke="var(--bl)" opacity=".3" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><text class="lbl" x="${X2(RIVER[1]).split(",")[0]-62}" y="${X2(RIVER[1]).split(",")[1]}" fill="var(--bl)" style="fill:var(--bl)">Iloilo River (approx.)</text>`;
const X2=r=>((r[1]-122.515)/0.08*800)+","+((10.745-r[0])/0.067*680);

// ---------- Priority queue (binary min-heap) ----------
class PQ{constructor(){this.h=[]}get size(){return this.h.length}peek(){return this.h[0][0]}
push(k,v){const h=this.h;h.push([k,v]);let i=h.length-1;while(i>0){const p=i-1>>1;if(h[p][0]<=h[i][0])break;[h[p],h[i]]=[h[i],h[p]];i=p}}
pop(){const h=this.h,t=h[0],l=h.pop();if(h.length){h[0]=l;let i=0;for(;;){let a=2*i+1,b=a+1,m=i;if(a<h.length&&h[a][0]<h[m][0])m=a;if(b<h.length&&h[b][0]<h[m][0])m=b;if(m===i)break;[h[m],h[i]]=[h[i],h[m]];i=m}}return t}}

// ---------- Shortest-path algorithms (closed = Set of edge ids) ----------
const build=(prev,t)=>{const p=[];for(let c=t;c!==undefined;c=prev.get(c))p.unshift(c);return p};
function dijkstra(s,t,closed){const d=new Map([[s,0]]),prev=new Map(),done=new Set(),q=new PQ();q.push(0,s);let vis=0;
 while(q.size){const[du,u]=q.pop();if(done.has(u))continue;done.add(u);vis++;if(u===t)return{dist:du,path:build(prev,t),vis};
  for(const e of adj[u]){if(closed.has(e.id))continue;const nd2=du+e.w;if(nd2<(d.get(e.to)??Infinity)){d.set(e.to,nd2);prev.set(e.to,u);q.push(nd2,e.to)}}}
 return{dist:Infinity,path:[],vis}}
function astar(s,t,closed){const g=new Map([[s,0]]),prev=new Map(),done=new Set(),q=new PQ(),T=nd[t];q.push(hav(nd[s],T),s);let vis=0;
 while(q.size){const[,u]=q.pop();if(done.has(u))continue;done.add(u);vis++;if(u===t)return{dist:g.get(t),path:build(prev,t),vis};
  for(const e of adj[u]){if(closed.has(e.id))continue;const n2=g.get(u)+e.w;if(n2<(g.get(e.to)??Infinity)){g.set(e.to,n2);prev.set(e.to,u);q.push(n2+hav(nd[e.to],T),e.to)}}}
 return{dist:Infinity,path:[],vis}}
function bidir(s,t,closed){if(s===t)return{dist:0,path:[s],vis:1};
 const D=[new Map([[s,0]]),new Map([[t,0]])],P=[new Map(),new Map()],S=[new Set(),new Set()],Q=[new PQ(),new PQ()];Q[0].push(0,s);Q[1].push(0,t);
 let mu=Infinity,meet=null,vis=0;
 while(Q[0].size&&Q[1].size&&Q[0].peek()+Q[1].peek()<mu){const k=Q[0].peek()<=Q[1].peek()?0:1,o=1-k,[du,u]=Q[k].pop();if(S[k].has(u))continue;S[k].add(u);vis++;
  for(const e of adj[u]){if(closed.has(e.id))continue;const n2=du+e.w;if(n2<(D[k].get(e.to)??Infinity)){D[k].set(e.to,n2);P[k].set(e.to,u);Q[k].push(n2,e.to)}
   if(D[o].has(e.to)&&D[k].get(e.to)+D[o].get(e.to)<mu){mu=D[k].get(e.to)+D[o].get(e.to);meet=e.to}}}
 if(meet===null)return{dist:Infinity,path:[],vis};
 const a=build(P[0],meet),b=build(P[1],meet).reverse();return{dist:mu,path:a.concat(b.slice(1)),vis}}
const ALG={dij:["Dijkstra",dijkstra],ast:["A*",astar],bid:["Bidirectional Dijkstra",bidir]};

// ---------- State and helpers ----------
const closed=new Set(),$=id=>document.getElementById(id);
const comms=NODES.filter(n=>n[4]==="c").map(n=>n[0]),facs=t=>NODES.filter(n=>n[4]===t).map(n=>n[0]);
const none=new Set(),km=x=>isFinite(x)?x.toFixed(2):"—";
function nearest(o,type,cl,alg){let best={dist:Infinity,path:[],vis:0,f:null},vis=0;for(const f of facs(type)){const r=alg(o,f,cl);vis+=r.vis;if(r.dist<best.dist)best={...r,f}}best.vis=vis;return best}
const pathRoads=p=>{const r=[];for(let i=1;i<p.length;i++){const n=edges[eAt[p[i-1]+"-"+p[i]]].road;if(r[r.length-1]!==n)r.push(n)}return r};
const X=n=>(nd[n].lon-122.515)/0.08*800,Y=n=>(10.745-nd[n].lat)/0.067*680;
let rng=1;const rand=()=>(rng=(rng*16807)%2147483647)/2147483647;

// ---------- Rendering ----------
function pline(p,color,w,dash){return `<polyline points="${p.map(n=>X(n)+","+Y(n)).join(" ")}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${dash?`stroke-dasharray="${dash}"`:""}/>`}
function render(){
 const alg=ALG[$("alg").value][1],o=$("org").value,ty=$("ft").value;
 const base=nearest(o,ty,none,alg),aft=nearest(o,ty,closed,alg);
 let s=river()+edges.map(e=>`<g><line class="road ${closed.has(e.id)?"closed":""}" style="${e.art&&!closed.has(e.id)?"stroke:var(--mu);stroke-width:2.8":""}" x1="${X(e.a)}" y1="${Y(e.a)}" x2="${X(e.b)}" y2="${Y(e.b)}"/><line class="hit" data-e="${e.id}" x1="${X(e.a)}" y1="${Y(e.a)}" x2="${X(e.b)}" y2="${Y(e.b)}"><title>${e.road} (${km(e.w)} km) — click to ${closed.has(e.id)?"reopen":"close"}</title></line></g>`).join("");
 if(base.path.length)s+=pline(base.path,"var(--am)",5,"2 7");
 if(aft.path.length)s+=pline(aft.path,"var(--bl)",5);
 for(const n of NODES){const id=n[0],x=X(id),y=Y(id),t=n[4];
  if(t==="j")s+=`<circle cx="${x}" cy="${y}" r="1.5" fill="var(--rt)"><title>${n[1]}</title></circle>`;
  else{const col=t==="c"?"var(--ac)":t==="h"?"var(--rd)":"var(--gn)",r=t==="c"?11:9;
   s+=`<g><circle cx="${x}" cy="${y}" r="${r}" fill="${col}" stroke="${id===o?"var(--tx)":"var(--sf)"}" stroke-width="${id===o?3:2}"/>${t!=="c"?`<text x="${x}" y="${y+3.5}" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">${t==="h"?"H":"E"}</text>`:""}<text class="lbl" x="${x+r+4}" y="${y+4}">${n[1]}</text><title>${n[1]}</title></g>`}}
 $("map").innerHTML=s;
 // route panel
 const fn=r=>r.f?nd[r.f].name:"none reachable";
 $("route").innerHTML=`<table><tr><th></th><th>Normal network</th><th>After closures</th></tr>
 <tr><td>Destination</td><td>${fn(base)}</td><td>${fn(aft)}</td></tr>
 <tr><td>Distance</td><td>${km(base.dist)} km</td><td>${isFinite(aft.dist)?km(aft.dist)+" km"+(isFinite(base.dist)?` (${aft.dist>=base.dist?"+":""}${((aft.dist/base.dist-1)*100).toFixed(0)}%)`:""):"<b style='color:var(--rd)'>Inaccessible</b>"}</td></tr>
 <tr><td>Nodes visited</td><td>${base.vis}</td><td>${aft.vis}</td></tr>
 <tr><td>Via</td><td>${pathRoads(base.path).join(" → ")||"—"}</td><td>${pathRoads(aft.path).join(" → ")||"—"}</td></tr></table>
 <p class="note">Closed roads: ${closed.size} of ${edges.length}. Algorithm: ${ALG[$("alg").value][0]} (destination = nearest of all ${facs(ty).length} facilities by road distance).</p>`;
 // communities
 let rows="",iso=0,part=0,ok=0,sb=0,sa=0,nb=0,na=0,unreach=0;
 for(const c of comms){const R={};for(const t of["h","e"]){R[t]=[nearest(c,t,none,dijkstra),nearest(c,t,closed,dijkstra)]}
  const fl=t=>!isFinite(R[t][1].dist),inc=t=>isFinite(R[t][1].dist)&&R[t][1].dist>R[t][0].dist*1.25+1e-9;
  let st=fl("h")&&fl("e")?"iso":(fl("h")||fl("e")||inc("h")||inc("e"))?"part":"ok";
  st==="iso"?iso++:st==="part"?part++:ok++;
  for(const t of["h","e"]){if(isFinite(R[t][0].dist)){sb+=R[t][0].dist;nb++}if(isFinite(R[t][1].dist)){sa+=R[t][1].dist;na++}else unreach++}
  const cell=t=>`${km(R[t][0].dist)} → ${isFinite(R[t][1].dist)?km(R[t][1].dist):"<b style='color:var(--rd)'>✕</b>"}`;
  rows+=`<tr><td>${nd[c].name}</td><td>${cell("h")}</td><td>${cell("e")}</td><td><span class="tag ${st}">${{iso:"Isolated",part:"Partial",ok:"OK"}[st]}</span></td></tr>`}
 $("ct").innerHTML=`<tr><th>Community</th><th>Hospital</th><th>Evac center</th><th>Status</th></tr>`+rows;
 $("kpi").innerHTML=[["Isolated communities",iso],["Partially affected",part],["Unaffected",ok],["Avg distance before",km(sb/nb)+" km"],["Avg distance after",km(sa/na)+" km"],["Unreachable community–facility links",unreach]].map(k=>`<div class="k"><b>${k[1]}</b><span>${k[0]}</span></div>`).join("");
}

// ---------- Benchmark ----------
function bench(){
 const pairs=[];for(const c of comms)for(const f of[...facs("h"),...facs("e")])pairs.push([c,f]);
 const REP=8;let html=`<tr><th>Algorithm</th><th>Network</th><th>Avg time/query (µs)</th><th>Avg nodes visited</th><th>Reachable pairs</th><th>Avg distance (km)</th></tr>`,mism=0;
 const ref={};
 for(const [scn,cl] of [["Normal",none],["After closures",closed]]){
  for(const k of Object.keys(ALG)){const f=ALG[k][1];let vis=0,reach=0,ds=0;
   pairs.forEach(([a,b],i)=>{const r=f(a,b,cl);vis+=r.vis;if(isFinite(r.dist)){reach++;ds+=r.dist}
    const key=scn+i;if(ref[key]===undefined)ref[key]=r.dist;else if(!(Math.abs(ref[key]-r.dist)<1e-9||ref[key]===r.dist))mism++});
   const t0=performance.now();for(let r=0;r<REP;r++)for(const[a,b]of pairs)f(a,b,cl);
   const us=(performance.now()-t0)*1000/(REP*pairs.length);
   html+=`<tr><td>${ALG[k][0]}</td><td>${scn}</td><td>${us.toFixed(1)}</td><td>${(vis/pairs.length).toFixed(1)}</td><td>${reach}/${pairs.length}</td><td>${km(ds/reach)}</td></tr>`}}
 $("bt").innerHTML=html;
 $("bn").textContent=mism?`Warning: ${mism} distance mismatches between algorithms.`:`${pairs.length} pairs × ${REP} reps. All three algorithms returned identical shortest distances (correctness check passed).`}

// ---------- Events ----------
const closeKeys=ks=>ks.forEach(k=>closed.add(eAt[k.split("-").join("-")]));
document.querySelectorAll("[data-sc]").forEach(b=>b.onclick=()=>{const s=b.dataset.sc;
 if(s==="clear")closed.clear();
 else if(s==="flood"){closed.clear();floodIds().forEach(i=>closed.add(i))}
 else if(s==="slide"){closed.clear();slideIds().forEach(i=>closed.add(i))}
 else{closed.clear();rng=Math.floor(Math.random()*1e6)+1;const n=Math.max(1,Math.round(edges.length*$("pct").value/100));const ids=edges.map(e=>e.id);
  while(closed.size<n){closed.add(ids[Math.floor(rand()*ids.length)])}}
 render()});
$("map").onclick=e=>{const id=e.target.dataset?.e;if(id===undefined)return;const i=+id;closed.has(i)?closed.delete(i):closed.add(i);render()};
$("pct").oninput=e=>$("pv").textContent=e.target.value+"%";
["org","ft","alg"].forEach(id=>$(id).onchange=render);
$("bench").onclick=bench;
$("org").innerHTML=comms.map(c=>`<option value="${c}">${nd[c].name}</option>`).join("");$("org").value=comms.find(c=>nd[c].name==="Jaro");
floodIds().forEach(i=>closed.add(i));render();bench();
