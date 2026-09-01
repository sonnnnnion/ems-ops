/* What we DID, not just what came up. Every manager action leaves a row, and
   the report can answer "what did we get through this month". */
const {fresh,post,get,dump}=require('./run.js');
let fail=0; const R=[];
const t=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)fail++;R.push((ok?'ok  ':'FAIL')+' '+n+(ok?'':'\n     got  '+JSON.stringify(g)+'\n     want '+JSON.stringify(w)));};
const today=new Date().toISOString().slice(0,10);
const {ctx,sheets}=fresh();
ctx.PropertiesService.getScriptProperties().setProperty('PUBLISH_KEY','k');
const call=p=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(Object.assign({key:'k'},p))}})._t);

// a week of reports
post(ctx,{form:'Checkouts',date:today,sid:'c1',name:'A Member',andrew:'x',radio:'P1',unitId:'jk-a',
  subject:'Jumpkit A',missing:'(1) stethoscope',missingCount:1,done:'',doneCount:0});
post(ctx,{form:'jumpkit',bag:'Bag 2',bagId:'bag2',firstName:'B',lastName:'Member',
  submissionId:'j1',verdict:'x',missing:['Roll of coban'],expiries:{},expiryById:{},notes:''});

t('nothing done yet', get(ctx,{report:'week'}).report.actions.length, 0);

// tick the ops report off, and resolve the concern
call({form:'__restock', site:'ops', item:'(1) stethoscope', where:'Jumpkit A', got:true});
call({form:'__resolve', site:'ops', sig:'(1) stethoscope missing|jumpkit a', resolved:true});
let a=()=>get(ctx,{report:'week'}).report.actions;
t('both are on the ledger', a().length, 2);
t('and say what was done', a().map(x=>x.did).sort(), ['Resolved','Restocked']);
t('naming the thing', a().map(x=>x.what).sort(), ['(1) stethoscope','(1) stethoscope missing']);
t('and where', a().filter(x=>x.did==='Restocked')[0].where, 'Jumpkit A');
t('and who', a().every(x=>x.who), true);

// undoing is an event too, not an erasure
call({form:'__restock', site:'ops', item:'(1) stethoscope', where:'Jumpkit A', got:false});
t('un-ticking is recorded, not erased', a().length, 3);
t('and says so', a()[0].did, 'Put back on the list');

// the bike list is its own, and is now tickable at all
t('the bike shopping list can be read', get(ctx,{restock:'1',site:'bike'}).restock.map(r=>r.item), ['Roll of coban']);
call({form:'__restock', site:'bike', item:'Roll of coban', got:true});
t('and ticked', get(ctx,{restock:'1',site:'bike'}).restock[0].got, true);
t('the bike action is on the bike ledger', actionsFor('bike').length, 1);
t('and not on the ops one', a().filter(x=>/coban/.test(x.what)).length, 0);
function actionsFor(site){
  return (dump(sheets,'Actions')||[]).slice(1).filter(r=>r[3]===site);
}
// an unsigned tick changes nothing and logs nothing
const before=(dump(sheets,'Actions')||[]).length;
const bad=JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({form:'__restock',site:'ops',item:'(1) stethoscope',got:true})}})._t);
t('an unsigned tick is refused', bad.ok, false);
t('and leaves no trace', (dump(sheets,'Actions')||[]).length, before);

console.log((fail?'*** '+fail+' FAILED ***':'ALL PASS')+'\n'+R.join('\n'));
process.exit(fail?1:0);
