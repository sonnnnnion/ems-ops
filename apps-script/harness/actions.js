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

/* WHAT KEEPS COMING BACK.
   ---------------------------------------------------------------------------
   Counted from the ledger, because the Restock tab's "Times Asked" is reset to
   1 every time a row is ticked off — it answers "how many people asked this
   cycle", not "how often has this happened", and reading it as the latter would
   be inventing a fact. One completed restock is one occurrence. */
const {ctx:rc, sheets:rs}=fresh();
rc.PropertiesService.getScriptProperties().setProperty('PUBLISH_KEY','k');
const zz=n=>String(n).padStart(2,'0');
const dd=n=>{const x=new Date(Date.now()+n*864e5); return x.getFullYear()+'-'+zz(x.getMonth()+1)+'-'+zz(x.getDate());};
const cycle=(day,item,place)=>{
  post(rc,{form:'Bag Checks',date:day,sid:'r'+day+item+Math.random(),name:'A Member',andrew:'am',
    bagId:'jumpkit',subject:place,missing:item,missingCount:1,done:'',doneCount:0});
  post(rc,{form:'__restock',item:item,where:place,got:true,key:'k'});
};
cycle(dd(-60),'(1) small bottle of eyewash','Jumpkit A');
cycle(dd(-40),'(1) small bottle of eyewash','Jumpkit A');
cycle(dd(-20),'(1) small bottle of eyewash','Jumpkit A');
cycle(dd(-10),'(1) small bottle of eyewash','Jumpkit D');   // a DIFFERENT bag
cycle(dd(-8), '(1) stethoscope','Jumpkit A');               // a one-off
// undoing a tick is somebody correcting a mis-tap, not the item vanishing again
post(rc,{form:'__restock',item:'(1) stethoscope',where:'Jumpkit A',got:false,key:'k'});
const recur=()=>get(rc,{restock:'1'}).recur||{};
t('a thing replaced three times says three',
  recur()['(1) small bottle of eyewash|jumpkit a'].times, 3);
t('the same thing in another bag is counted separately, not merged',
  recur()['(1) small bottle of eyewash|jumpkit d'].times, 1);
t('a one-off stays a one-off', recur()['(1) stethoscope|jumpkit a'].times, 1);
t('un-ticking does not look like the item vanishing again',
  Object.keys(recur()).length, 3);
t('and it says when it was last replaced',
  /^\d{4}-\d{2}-\d{2}$/.test(recur()['(1) small bottle of eyewash|jumpkit a'].last), true);
t('the bike site keeps its own count', Object.keys(get(rc,{restock:'1',site:'bike'}).recur||{}), []);

/* THE BIKE JUMPKIT ON A POST-CALL.
   ---------------------------------------------------------------------------
   The bike site has two forms, both checks, and no post-call — so this is the
   only place a rider can record using something off that kit. What comes off it
   is shopped for on the BIKE list, by a different person, so it must not land on
   the Operations one. */
const {ctx:bc}=fresh();
bc.PropertiesService.getScriptProperties().setProperty('NAMES',
  JSON.stringify({items:{'c-gauze4':'Sterile gauze 4x4','c-coban':'Coban'},units:{'jk-a':'Jumpkit A'}}));
const bday=new Date().toISOString().slice(0,10);
post(bc,{form:'Post-Call',date:bday,sid:'bike-pc',name:'Ivy Chen',callnum:'2026-200',
  usageJson:JSON.stringify([
    {i:'c-gauze4',q:2,f:'bike-jumpkit'},        // off the bike kit
    {i:'c-coban', q:1,f:'jk-a'},                // off an ops jumpkit
    {i:'c-gauze4',q:1,f:'bike-jumpkit',r:1}     // off the bike kit, put straight back
  ]),usageCount:4,usageText:'x',missing:'',missingCount:0});
const opsList =()=>get(bc,{restock:'1'}).restock.map(r=>r.item);
const bikeList=()=>get(bc,{restock:'1',site:'bike'}).restock;
t('what came off an ops bag is on the ops list', opsList(), ['Coban']);
t('and the bike kit is not', opsList().indexOf('Sterile gauze 4x4'), -1);
t('what came off the bike kit is on the bike list', bikeList().map(r=>r.item), ['Sterile gauze 4x4']);
t('named as used on a call, not found missing on a check',
  /used on a call/.test(bikeList()[0].where), true);
t('and attributed to whoever filed the post-call', bikeList()[0].who, 'Ivy Chen');
/* Put back on the spot is not something to buy — on either list. */
t('a bike item the rider replaced themselves is on neither list',
  [opsList().length, bikeList().length], [1,1]);
/* A post-call that never touched the bike kit must not create a bike row. */
const {ctx:nc}=fresh();
post(nc,{form:'Post-Call',date:bday,sid:'no-bike',name:'Sam',callnum:'2026-201',
  usageJson:JSON.stringify([{i:'c-gauze4',q:1,f:'jk-a'}]),usageCount:1,usageText:'x',
  missing:'',missingCount:0});
t('a call that never opened the bike kit leaves the bike list alone',
  get(nc,{restock:'1',site:'bike'}).restock.length, 0);

console.log((fail?'*** '+fail+' FAILED ***':'ALL PASS')+'\n'+R.join('\n'));
process.exit(fail?1:0);
