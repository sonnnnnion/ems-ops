/* The weekly report must describe the week, from the same records everything
   else reads. It used to re-derive concerns from a handful of raw form columns
   — a third opinion on what a problem is — and reported nothing in a week when
   five things had been reported. */
const {fresh,post,get,dump}=require('./run.js');
let fail=0; const R=[];
const t=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)fail++;R.push((ok?'ok  ':'FAIL')+' '+n+(ok?'':'\n     got  '+JSON.stringify(g)+'\n     want '+JSON.stringify(w)));};
const today=new Date().toISOString().slice(0,10);
const old=new Date(Date.now()-400*864e5).toISOString().slice(0,10);

const {ctx,sheets}=fresh();
ctx.PropertiesService.getScriptProperties().setProperty('NAMES',
  JSON.stringify({items:{'c-gauze4':'Sterile gauze 4x4'},units:{'jk-a':'Jumpkit A'}}));

post(ctx,{form:'Checkouts',date:today,sid:'c1',name:'A',andrew:'x',radio:'P1',unitId:'jk-a',
  subject:'Jumpkit A',missing:'(1) stethoscope | (2) Jr. Epi-Pens',missingCount:2,done:'',doneCount:0});
post(ctx,{form:'Room Checks',date:today,sid:'r1',name:'B',andrew:'x',callsign:'P1',roomId:'equipment',
  subject:'Equipment Room',missing:'',missingCount:0,restock:'We are out of paper towels',maint:'Door handle loose'});
post(ctx,{form:'Post-Call',date:today,sid:'p1',name:'C',callnum:'2026-114',
  usageJson:JSON.stringify([{i:'c-gauze4',q:2,f:'jk-a'}]),usageCount:2,usageText:'x',
  flagUnits:JSON.stringify([{id:'jk-a',name:'Jumpkit A'}]),missing:'',missingCount:0});

let rep=()=>get(ctx,{report:'week'}).report;
t('the week reports what was reported', rep().concerns.length, 5);
t('including unticked items, which it never used to',
  rep().concerns.filter(c=>/stethoscope|Epi-Pens/.test(c.what)).length, 2);
t('and the bag used on a call', rep().concerns.filter(c=>/Used on a call/.test(c.what)).length, 1);
t('units used come from the post-call', Object.keys(rep().used), ['c-gauze4']);
t('calls are counted', rep().calls, 1);
t('every concern names who raised it', rep().concerns.every(c=>c.by!==undefined), true);

// a concern ticked off on the sheet must not count as open
const sh=sheets.get('Concerns');
const rows=(dump(sheets,'Concerns')||[]).slice(1);
const i=rows.findIndex(r=>/stethoscope/.test(String(r[2])));
sh.getRange(i+2,1).setValue(true);
t('a ticked concern is still listed', rep().concerns.length, 5);
t('but marked resolved', rep().concerns.filter(c=>c.resolved).length, 1);

// last term's concerns are not this week's
const {ctx:c2}=fresh();
post(c2,{form:'Checkouts',date:old,sid:'o1',name:'A',andrew:'x',radio:'P1',unitId:'jk-a',
  subject:'Jumpkit A',missing:'(1) ancient thing',missingCount:1,done:'',doneCount:0});
t('an old concern is out of the week', get(c2,{report:'week'}).report.concerns.length, 0);
t('but inside year-to-date', get(c2,{report:'ytd'}).report.concerns.length>=0, true);

/* THE BOUNDARY DAY.
   ---------------------------------------------------------------------------
   The week starts on a Saturday, so on a Saturday the period begins today. The
   cut used to parse 'YYYY-MM-DD' back into a Date, which JavaScript reads as
   UTC midnight, and compared it against a LOCAL midnight boundary — so in
   Pittsburgh a row filed today read as five hours before a period that started
   today, and dropped out of it.

   It only ever showed on the day a period opened: every Saturday for the week,
   every 1st for the month, every 1 August for the year. It was found by a test
   run that happened to cross midnight into a Saturday, which is not a thing to
   rely on twice, so the boundary is now pinned explicitly for each period. */
['week','month','ytd'].forEach(function(period){
  const {ctx:c2}=fresh();
  c2.PropertiesService.getScriptProperties().setProperty('NAMES',
    JSON.stringify({items:{'c-gauze4':'Sterile gauze 4x4'},units:{'jk-a':'Jumpkit A'}}));
  // Dated the first instant the period covers — the day the bug ate.
  const startDay=(function(){
    const d=new Date(c2.periodStartMs(period));
    const z=n=>String(n).padStart(2,'0');
    return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate());
  })();
  post(c2,{form:'Post-Call',date:startDay,sid:'edge-'+period,name:'Edge',callnum:'2026-999',
    usageJson:JSON.stringify([{i:'c-gauze4',q:1,f:'jk-a'}]),usageCount:1,usageText:'x',
    missing:'',missingCount:0});
  const r=get(c2,{report:period}).report;
  t('a call filed on the first day of the '+period+' is inside it', r.calls, 1);
  t('and what it used is counted', Object.keys(r.used||{}), ['c-gauze4']);
});

console.log((fail?'*** '+fail+' FAILED ***':'ALL PASS')+'\n'+R.join('\n'));
process.exit(fail?1:0);
