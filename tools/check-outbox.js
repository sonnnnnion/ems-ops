/* Does a submission survive having no signal?
   ---------------------------------------------------------------------------
   Forms POST fire-and-forget. Parts of campus have no usable signal in exactly
   the places somebody stands while counting what is in a bag, so the payload is
   written to the phone before it is sent and only dropped once a send has
   actually left the device.

   The half that could go badly wrong is the retry: a queue that re-sends is a
   duplicate-row machine unless the far end refuses repeats. It does — every
   payload carries a `sid` minted once with the submission, and the script drops
   a sid it has already written. That is asserted here against the REAL Apps
   Script, not assumed.

       node tools/check-outbox.js
*/
const fs=require('fs'), vm=require('vm'), path=require('path');
const REPO=path.join(__dirname,'..');
const {fresh,post,get}=require(path.join(REPO,'apps-script','harness','run.js'));

// ---- the site's real outbox, on a fake phone --------------------------------
function loadOutbox(file){
  const src=fs.readFileSync(file,'utf8');
  // Read the key out of the file rather than assuming it — the whole point of
  // the last assertion is that the two sites do NOT share one.
  const key=(src.match(/var LS_OUTBOX='([^']+)'/)||[])[1];
  if(!key) throw new Error('no LS_OUTBOX in '+file);
  const names=['outboxRead','outboxWrite','outboxAdd','outboxCount','drainOutbox'];
  let code='';
  for(const n of names){
    const i=src.indexOf('function '+n+'(');
    if(i<0) throw new Error('missing '+n+' in '+file);
    let d=0;
    for(let k=src.indexOf('{',i);k<src.length;k++){
      if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d){ code+=src.slice(i,k+1)+'\n'; break; }}
    }
  }
  const store={};
  const ctx=vm.createContext({
    localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}},
    JSON, Date, Math, console,
    document:{getElementById:()=>null},
    DB:{api:{url:'https://example/exec'}},
    paintOutbox(){}, fetch:null, Promise
  });
  vm.runInContext("var LS_OUTBOX='"+key+"', outboxBusy=false;\n"+code, ctx);
  return {ctx, store, key};
}

let fail=0; const R=[];
const t=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w); if(!ok)fail++;
  R.push((ok?'ok  ':'FAIL')+' '+n+(ok?'':'\n     got  '+JSON.stringify(g)+'\n     want '+JSON.stringify(w)));};

const {ctx,store}=loadOutbox(path.join(REPO,'index.html'));
const today=new Date().toISOString().slice(0,10);
const mk=sid=>({form:'Bag Checks',date:today,sid:sid,name:'A Member',andrew:'am',
  bagId:'jumpkit',subject:'Jumpkit',missing:'',missingCount:0,done:'',doneCount:0});

// 1. no signal: nothing leaves, nothing is lost
ctx.fetch=()=>Promise.reject(new TypeError('Failed to fetch'));
ctx.outboxAdd(mk('s1')); ctx.outboxAdd(mk('s2'));
return_ = null;
(async()=>{
  await ctx.drainOutbox();
  t('with no signal, both submissions are still on the phone', ctx.outboxCount(), 2);
  t('and in the order they were filed',
    ctx.outboxRead().map(q=>q.sid), ['s1','s2']);

  // 2. signal comes back
  const sentBodies=[];
  ctx.fetch=(u,o)=>{ sentBodies.push(JSON.parse(o.body)); return Promise.resolve({}); };
  await ctx.drainOutbox();
  t('when the signal returns everything goes', ctx.outboxCount(), 0);
  t('oldest first', sentBodies.map(b=>b.sid), ['s1','s2']);
  t('and the retry carries the SAME sid it was filed with',
    sentBodies.map(b=>b.sid), ['s1','s2']);

  // 3. a partial drain keeps the rest
  ctx.outboxAdd(mk('s3')); ctx.outboxAdd(mk('s4'));
  let n=0;
  ctx.fetch=()=>{ n++; return n===1?Promise.resolve({}):Promise.reject(new TypeError('dropped')); };
  await ctx.drainOutbox();
  t('a drain that dies halfway keeps what did not get out', ctx.outboxRead().map(q=>q.sid), ['s4']);

  // 4. the cap protects the phone's storage
  ctx.fetch=()=>Promise.reject(new TypeError('offline'));
  for(let i=0;i<80;i++) ctx.outboxAdd(mk('bulk'+i));
  t('the queue is capped', ctx.outboxCount(), 60);
  t('and it is the OLDEST that is dropped, never the one just filed',
    ctx.outboxRead()[ctx.outboxCount()-1].sid, 'bulk79');

  // 5. THE ONE THAT MATTERS: a retry must not write a second row.
  const {ctx:gas,sheets}=fresh();
  const body=JSON.stringify(mk('dup-1'));
  const send=()=>JSON.parse(gas.doPost({postData:{contents:body}})._t);
  const first=send(), again=send(), third=send();
  const rows=sheets.get('Bag Checks').rows.length-1;
  t('a submission sent three times — as an unsure queue would — writes one row', rows, 1);
  t('the first is saved and the repeats are named as duplicates, not errors',
    [first.result, again.result, third.result],
    ['saved','duplicate ignored','duplicate ignored']);

  // ---- the bike site's copy -------------------------------------------------
  const BIKE=path.join(REPO,'..','bike manager','index.html');
  if(fs.existsSync(BIKE)){
    const b=loadOutbox(BIKE);
    b.ctx.CONTENT_ENDPOINT=()=>'https://example/exec';
    b.ctx.fetch=()=>Promise.reject(new TypeError('offline'));
    b.ctx.outboxAdd({submissionId:'b1',form:'jumpkit'});
    await b.ctx.drainOutbox();
    t('bike: a check with no signal waits on the phone', b.ctx.outboxCount(), 1);
    const out=[];
    b.ctx.fetch=(u,o)=>{ out.push(JSON.parse(o.body)); return Promise.resolve({}); };
    await b.ctx.drainOutbox();
    t('bike: and goes when the signal returns', [b.ctx.outboxCount(), out[0].submissionId], [0,'b1']);
    /* The two sites share an origin. A shared queue would have whichever site
       opened first draining the other's writes to ITS endpoint. */
    t('bike keeps its own queue, so neither site posts the other\u2019s work',
      Object.keys(b.store).concat(Object.keys(store)).sort(),
      ['bikeops_outbox_v1','emsops_outbox_v1']);
  }

  console.log((fail?'*** '+fail+' FAILED ***':'ALL PASS')+'\n'+R.join('\n'));
  process.exit(fail?1:0);
})();
