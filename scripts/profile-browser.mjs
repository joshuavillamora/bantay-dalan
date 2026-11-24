import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

const root = process.env.PERF_ROOT || process.cwd();
const temp = await mkdtemp(join(tmpdir(), 'bantay-chrome-'));
const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json' };
const server = createServer(async (req,res) => {
  const path = new URL(req.url,'http://localhost').pathname;
  const file = join(root,path==='/' ? 'index.html' : path);
  try {
    let body = await readFile(file);
    if(path==='/js/graph/road-graph.js'){
      body=body.toString().replace('const data = ROADS_URL.endsWith', "performance.mark('decode-start'); const data = ROADS_URL.endsWith")
        .replace('graph = decodeRoadGraph(data);', "performance.measure('decompress+parse','decode-start'); performance.mark('build-start'); graph = decodeRoadGraph(data); performance.measure('graph build','build-start');")
        .replace('const { value: built } = await runInSlices', "performance.measure('decompress+parse','decode-start'); performance.mark('build-start'); const { value: built } = await runInSlices")
        .replace('await prepareRoadSpatialIndex(built);', "performance.measure('graph build wall time','build-start'); performance.mark('spatial-start'); await prepareRoadSpatialIndex(built); performance.measure('spatial index wall time','spatial-start');");
    }
    res.writeHead(200,{'Content-Type':types[extname(file)] || 'application/octet-stream'}); res.end(body);
  }
  catch { res.writeHead(404).end(); }
});
server.listen(0,'127.0.0.1');
await once(server,'listening');

let ws;
const browser = spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new','--remote-debugging-port=0','--disable-background-networking','--disable-component-update',
  '--disable-default-apps','--no-first-run','--no-default-browser-check','--disable-gpu',
  '--window-size=1440,900','--user-data-dir='+temp+'/chrome-'+process.pid,'about:blank'
], { stdio: ['ignore','ignore','pipe'] });
let stderr='';
browser.stderr.on('data',chunk=>{stderr+=chunk;});
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
async function until(read, test, label, timeout=12000) {
  for(const end=Date.now()+timeout; Date.now()<end;) {
    const val=await read();
    if(test(val)) return val;
    await sleep(45);
  }
  throw new Error(label+' timed out '+stderr.slice(-1500));
}
try {
  const port = (await until(()=>stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/),Boolean,'Chrome startup'))[1];
  const [tab] = await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json());
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await once(ws,'open');
  const pending=new Map(); let id=0;
  ws.addEventListener('message',({data})=>{
    const packet=JSON.parse(data);
    if(packet.id) {
      const actions=pending.get(packet.id);
      pending.delete(packet.id);
      if(packet.error) actions.reject(Error(packet.error.message));
      else actions.resolve(packet.result);
    }
  });
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{
    pending.set(++id,{resolve,reject}); ws.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{
    const reply=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(reply.exceptionDetails) throw Error(reply.exceptionDetails.exception?.description || reply.exceptionDetails.text);
    return reply.result.value;
  };
  const read = () => evaluate(`({places:[...document.querySelectorAll('#toList strong')].map(e=>e.textContent), heading:!document.querySelector('#toSuggestedHeading').hidden, status:document.querySelector('#toSearchStatus').textContent,name:document.querySelector('#to').value})`);
  await cdp('Page.enable');
  await cdp('Network.enable');
  await cdp('Performance.enable');
  await cdp('Network.setCacheDisabled',{cacheDisabled:true});
  const mobile=process.env.PERF_MOBILE==='1';
  await cdp('Emulation.setDeviceMetricsOverride',{width:mobile?390:1440,height:mobile?844:900,deviceScaleFactor:mobile?2:1,mobile});
  await cdp('Emulation.setCPUThrottlingRate',{rate:mobile?4:1});
  await cdp('Network.emulateNetworkConditions',{offline:false,latency:70,downloadThroughput:1250000,uploadThroughput:750000});
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:"window.measurements=[];new PerformanceObserver(list=>{for(const e of list.getEntries())measurements.push({start:e.startTime,duration:e.duration})}).observe({type:'longtask',buffered:true});"});
  await cdp('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  await until(()=>evaluate("document.querySelector('#lt')?.textContent"),s=>s==='Ready to route','graph ready',45000);
  const getHeap=async()=>{
    await cdp('HeapProfiler.collectGarbage');
    const {metrics}=await cdp('Performance.getMetrics');
    return +(metrics.find(m=>m.name==='JSHeapUsedSize').value/1048576).toFixed(1);
  };
  const startup=await evaluate("(()=>{const r=performance.getEntriesByType('resource').find(e=>e.name.includes('panay-roads'));return {ms:performance.now(),bytes:r.encodedBodySize,download:r.duration,stages:performance.getEntriesByType('measure').map(e=>[e.name,e.duration]),longTasks:measurements.map(e=>e.duration),tileSource:document.querySelector('#mapSource').textContent,tileCount:performance.getEntriesByType('resource').filter(e=>e.name.includes('tile.openstreetmap')).length}})()");
  console.log(JSON.stringify({mobile,startup,heap:await getHeap()}));
  await evaluate("document.querySelector('#welcome').close()");
  const selected="import('/js/state.js').then(({state})=>state.route!==null)";
  const timed=async(name,action,predicate)=>{
    const start=await evaluate('performance.now()');
    const sync=await evaluate("(async()=>{const b=performance.now();await ("+action+");return performance.now()-b})()");
    if(predicate) await until(()=>evaluate(predicate),Boolean,name,45000);
    await sleep(90);
    const times=await evaluate("(()=>{const t=measurements.filter(e=>e.start>="+start+");return {elapsed:performance.now()-"+start+"-90,maxTask:Math.max(0,...t.map(e=>e.duration)),longTasks:t.length,blocking:t.reduce((s,e)=>s+e.duration-50,0)}})()");
    console.log(JSON.stringify({name,sync,...times}));
  };
  const clickButton=id=>"document.querySelector('#"+id+"').click()";
  const dest=(ll,name)=>"import('/js/features/route-points.js').then(m=>m.setPoint('e',"+JSON.stringify(ll)+","+JSON.stringify(name)+"))";
  const short=[10.699222,122.561824], long=[11.708529,122.366856];
  for(const [ll,kind] of [[short,'urban'],[long,'long']]){
    await evaluate(dest(ll,kind));
    await timed(kind,clickButton('go'),selected);
  }
  const reverseBuffers = await evaluate("import('/js/graph/road-graph.js').then(async r=>{const g=await r.loadGraph();return g.radj?.offsets?Object.values(g.radj).reduce((n,a)=>n+a.byteLength,0):0;})");
  console.log(JSON.stringify({afterRoutingHeap:await getHeap(),reverseBuffers}));
  const roads="import('/js/graph/road-graph.js')";
  const mapMod="import('/js/map/map.js')";
  console.log(JSON.stringify({lookups:await evaluate(roads+".then(async m=>{const g=await m.loadGraph(),pts=Array.from({length:60},(_,i)=>[10.68+i*.001,122.55+i%7*.001]);return ['snapRoutePoint','nearestNode','nearestRoadVertex'].filter(k=>m[k]).map(k=>{const t=performance.now();for(const p of pts)m[k](g,p);return [k,(performance.now()-t)/pts.length]})})")}));
  await timed('pan-and-zoom',mapMod+".then(({map})=>{for(let i=0;i<8;i++)map.panBy([12,0],{animate:false});map.setZoom(map.getZoom()+1,{animate:false})})");
  await evaluate(dest(short,'Campus'));
  await evaluate("document.querySelector('#spd').value=100");
  await timed('visualization',clickButton('visualize'),selected);
  await timed('pan-with-search-history',mapMod+".then(({map})=>{map.panBy([60,0],{animate:false});map.setZoom(map.getZoom()+1,{animate:false})})");
  await timed('drawn-closure-lookup',"Promise.all([import('/js/graph/closure-filter.js'),"+roads+"]).then(async ([f,r])=>{const g=await r.loadGraph();window.closed=f.blockedEdges(g,[{a:[10.701,122.5609],b:[10.7005,122.5611]}]);})");
  const lpaSelect=await evaluate("[...document.querySelectorAll('select')].find(e=>[...e.options].some(x=>x.value==='lpa'))?.id");
  assert.ok(lpaSelect);
  await evaluate("(()=>{const e=document.getElementById("+JSON.stringify(lpaSelect)+");e.value='lpa';e.dispatchEvent(new Event('change'));})()");
  await evaluate(dest([10.8308758,122.4981721],'Airport'));
  await timed('lpa-initial',clickButton('go'),selected);
  await timed('lpa-close',"Promise.all([import('/js/features/closures.js'),"+roads+",import('/js/state.js')]).then(async ([c,r,{state}])=>{const g=await r.loadGraph(), p=state.route.path,i=p.length>>1,a=p[i-1],b=p[i],n=g.lat.length;c.addLinkClosure(new Set([a*n+b,b*n+a]),'Probe closure');})",selected);
  await timed('lpa-reopen',clickButton('closeClear'),selected);
  await timed('comparison',clickButton('compareBtn'),"document.querySelectorAll('#res tbody tr').length===4");
  await timed('chokepoint',clickButton('chokeBtn'),"document.querySelector('#chokeList').children.length>0&&!document.querySelector('#chokeBtn').disabled");
  await timed('chokepoint-repeat',clickButton('chokeBtn'),"document.querySelector('#chokeList').children.length>0&&!document.querySelector('#chokeBtn').disabled");
  const first='National Museum', remote='Duenas Municipal Hall';
  const fixture={features:[{geometry:{type:'Point',coordinates:[122.617462,11.064464]},properties:{name:remote,city:'Duenas',state:'Iloilo'}}]};
  await evaluate("(()=>{const real=fetch;window.onlineRequests=[];window.fetch=(url,opts)=>{if(!String(url).includes('geocoding/'))return real(url,opts);onlineRequests.push(performance.now());return new Promise(resolve=>setTimeout(()=>resolve(Response.json("+JSON.stringify(fixture)+")),120))}})()");
  await evaluate("document.querySelector('[data-mode=route]').click()");
  const localMs = await evaluate("(()=>{const e=document.querySelector('#to');e.focus();const t=performance.now();e.value="+JSON.stringify(first)+";e.dispatchEvent(new Event('input'));return performance.now()-t})()");
  console.log(JSON.stringify({localSearch:{ms:localMs,immediate:(await read()).places}}));
  await timed('online-search',"(()=>{const input=document.querySelector('#to');input.value="+JSON.stringify(remote)+";input.dispatchEvent(new Event('input'))})()", "document.querySelector('#toList strong')?.textContent==="+JSON.stringify(remote));
  console.log(JSON.stringify({onlineRequests:await evaluate('onlineRequests.length'),endHeap:await getHeap()}));
  if (process.env.PERF_SMOKE === '1') {
    const click = id => evaluate(clickButton(id));
    const input = query => evaluate("(()=>{const e=document.querySelector('#to');e.focus();e.value="+JSON.stringify(query)+";e.dispatchEvent(new Event('input'));})()");
    await evaluate("window.fetch=(previous=>function(url, options) {return String(url).includes('geocoding/') ? Promise.resolve(new Response('',{status:503})) : previous(url,options)})(fetch)");
    await input('National Museum of the Philippines Iloilo');
    await until(read, s=>s.places[0]?.includes('National Museum of the Philippines') && s.status.startsWith('Online place search is unavailable'), 'offline suggestions');
    if (mobile) {
      await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
      const [x,y]=await evaluate("(()=>{const e=document.querySelector('#toOpt0');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [Math.round(r.x+r.width/2),Math.round(r.y+r.height/2)];})()");
      const hit = await evaluate(`document.elementFromPoint(${x},${y})?.closest('#toOpt0')?.id`);
      assert.equal(hit, 'toOpt0', 'first city suggestion must be hittable on a touch viewport');
      await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      await sleep(60);
      await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } else {
      await evaluate("(()=>{const e=document.querySelector('#to');for(const key of ['ArrowDown','Enter'])e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));})()");
    }
    await until(read, s=>s.name==='National Museum of the Philippines - Iloilo', 'local selection');
    await evaluate(dest(short,'Campus')); await click('go'); await until(()=>evaluate(selected),Boolean,'campus trip');
    if (!mobile) {
      const [x,y] = await evaluate("(()=>{const r=document.querySelector('.endpoint-marker:has(.end)').getBoundingClientRect();return [Math.round(r.x+r.width/2),Math.round(r.y+r.height/2)]})()");
      await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
      await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+19,y:y+15,button:'left',buttons:1});
      await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+32,y:y+20,button:'left',buttons:1});
      await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+32,y:y+20,button:'left'});
      await until(read,s=>s.name==='Pinned point','dragging route marker');
    }
    await evaluate(dest(long,'Kalibo'));
    await evaluate("document.querySelector('#spd').value=0;document.querySelector('#visualize').click();document.querySelector('#pause').click()");
    await until(()=>evaluate("!document.querySelector('#step').disabled"),Boolean,'step available');
    const count=()=>evaluate("Number(document.querySelector('#sN').textContent.replaceAll(',',''))");
    const beforeStep=await count();
    await click('step'); assert.equal(await count(),beforeStep+1);
    await click('pause'); await click('skip');
    await until(()=>evaluate(selected),Boolean,'skip finishes full route');
    assert.ok(await count()>1000);
    await click('reset');
    assert.equal(await count(),0);
    await evaluate("document.querySelector('[data-mode=analyze]').click()");
    await click('chokeBtn');
    await until(()=>evaluate("document.querySelector('.choke-pin')!==null"),Boolean,'CHOKEPOINT highlight');
    await evaluate("document.querySelector('[data-mode=disrupt]').click()");
    await click('closeDraw');
    await evaluate(mapMod+".then(({map})=>{map.fire('click',{latlng:L.latLng(10.701,122.5609)});map.fire('click',{latlng:L.latLng(10.7005,122.5611)});})");
    assert.ok(await evaluate("document.querySelector('#closureList').children.length")>0);
    assert.match(await evaluate("document.querySelector('#chokeHint').textContent"),/Closures changed/);
    await click('closeClear');
    console.log(JSON.stringify({smoke:'offline lookup, selection, playback, CHOKEPOINT highlight/invalidation, drawn closure and reopening passed',mobile}));
    if (!mobile) {
      const statuses={};
      for (const mode of ['satellite','hybrid','streets']) {
        await evaluate("(()=>{const e=document.querySelector('#mapStyle');e.value="+JSON.stringify(mode)+";e.dispatchEvent(new Event('change'));})()");
        await sleep(100);
        statuses[mode]=await until(()=>evaluate("document.querySelector('#mapSource').textContent"),s=>!s.startsWith('Loading'), 'settled '+mode,20000);
      }
      await cdp('Network.setBlockedURLs',{urls:['*tile.openstreetmap.org/*','*tiles.stadiamaps.com/*']});
      await evaluate(mapMod+".then(({map})=>{map.setView([10.70,122.55],15,{animate:false});})");
      await until(()=>evaluate(mapMod+".then(({map})=>map.getContainer().classList.contains('needs-road-fallback')&&!!map.getPane('localRoads').querySelector('canvas'))"),Boolean,'tile failure road overlay',18000);
      console.log(JSON.stringify({basemapSmoke:statuses,fallback:true}));
    }
  }
} finally {
  ws?.close();
  browser.kill('SIGTERM');
  server.closeAllConnections();
  server.close();
  if (browser.exitCode === null) await once(browser, 'exit').catch(() => {});
  await rm(temp, { recursive: true, force: true, maxRetries: 3 });
}
