/* The raw trail, read across the tabs that already hold it. */
const {fresh,post,get}=require('./run.js');
let fail=0; const R=[];
const t=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)fail++;R.push((ok?'ok  ':'FAIL')+' '+n+(ok?'':'\n     got  '+JSON.stringify(g)+'\n     want '+JSON.stringify(w)));};
const today=new Date().toISOString().slice(0,10);
const old=new Date(Date.now()-400*864e5).toISOString().slice(0,10);

const {ctx,sheets}=fresh();
ctx.PropertiesService.getScriptProperties().setProperty('NAMES',
  JSON.stringify({items:{'c-gauze4':'Sterile gauze 4x4'},units:{'jk-a':'Jumpkit A'}}));

post(ctx,{form:'Checkouts',date:today,sid:'a1',name:'Ava Barnes',andrew:'avabarne',radio:'P1',
  unitId:'jk-a',subject:'Jumpkit A',missing:'(1) stethoscope',missingCount:1,done:'',doneCount:0,detail:''});
post(ctx,{form:'Bag Checks',date:today,sid:'a2',name:'Sadie M',andrew:'sm',bagId:'jumpkit',
  subject:'Jumpkit',missing:'',missingCount:0,done:'',doneCount:0});
post(ctx,{form:'Room Checks',date:today,sid:'a3',name:'Lindsay Z',andrew:'lz',callsign:'P1',
  roomId:'equipment',subject:'Equipment Room',missing:'Blue bins',missingCount:1,done:'',doneCount:0,
  restock:'Paper towels',maint:''});
post(ctx,{form:'Post-Call',date:today,sid:'a4',name:'Omar Reed',callnum:'2026-114',
  usageJson:JSON.stringify([{i:'c-gauze4',q:2,f:'jk-a'}]),usageCount:2,
  usageText:'2x Sterile gauze 4x4 (Jumpkit A)',missing:'',missingCount:0});
post(ctx,{form:'Reports',date:today,sid:'a5',name:'Nina Patel',area:'Equipment',
  urgency:'Blocking',what:'Cot strap is torn',where:'Squad car'});
post(ctx,{form:'jumpkit',bag:'Bag 2',bagId:'bag2',firstName:'Bike',lastName:'Rider',
  andrewId:'br',submissionId:'a6',verdict:'Bag complete',missing:[],expiries:{},expiryById:{},notes:''});
post(ctx,{form:'Checkouts',date:old,sid:'a7',name:'Ancient Member',andrew:'am',radio:'P1',
  unitId:'jk-a',subject:'Jumpkit A',missing:'',missingCount:0,done:'',doneCount:0});

const ops=()=>get(ctx,{activity:'1',site:'ops'});
t('every ops submission is on the trail', ops().total, 6);
t('one row per submission, none invented',
  ops().activity.map(a=>a.form).sort(), ['Checkout','Checkout','Contents check','Post-call','Report','Room check']);
t('a post-call names the bag it opened, so usage is filterable by kit',
  ops().activity.filter(a=>a.kind==='usage')[0].subject, 'Jumpkit A');
t('each is attributed to who filed it',
  ops().activity.filter(a=>a.who==='Ava Barnes').map(a=>[a.form,a.subject,a.summary]),
  [['Checkout','Jumpkit A','1 missing']]);
t('and carries their Andrew ID', ops().activity.filter(a=>a.who==='Ava Barnes')[0].andrew, 'avabarne');
t('a clean check reads as complete',
  ops().activity.filter(a=>a.who==='Sadie M')[0].summary, 'Complete');
t('a post-call says what came out of the bag',
  ops().activity.filter(a=>a.kind==='usage')[0].summary, '2x Sterile gauze 4x4 (Jumpkit A)');
t('a report says what was reported',
  ops().activity.filter(a=>a.kind==='report')[0].summary, 'Cot strap is torn');
t('kinds are tagged', [...new Set(ops().activity.map(a=>a.kind))].sort(), ['check','report','usage']);
t('newest first', ops().activity[0].date >= ops().activity[ops().activity.length-1].date, true);

// the bike trail is its own
const bike=()=>get(ctx,{activity:'1',site:'bike'});
t('the bike site has its own trail', bike().total, 1);
t('and it is the bike check', bike().activity[0].form, 'Bike Jumpkit Check');
t('ops does not see it', ops().activity.filter(a=>/Bike/.test(a.form)).length, 0);

// the period cut
t('since excludes last term', get(ctx,{activity:'1',site:'ops',since:today}).total, 5);
t('and keeps everything without one', ops().total, 6);

// pagination must not drop or duplicate
const p1=get(ctx,{activity:'1',site:'ops',limit:'2',offset:'0'});
const p2=get(ctx,{activity:'1',site:'ops',limit:'2',offset:'2'});
const p3=get(ctx,{activity:'1',site:'ops',limit:'2',offset:'4'});
t('pages are the size asked for', [p1.activity.length,p2.activity.length,p3.activity.length], [2,2,2]);
t('more is honest', [p1.more,p2.more,p3.more], [true,true,false]);
const paged=[...p1.activity,...p2.activity,...p3.activity].map(a=>a.date+a.time+a.form+a.who);
const whole=ops().activity.map(a=>a.date+a.time+a.form+a.who);
t('paging loses nothing and repeats nothing', paged, whole);
t('an absurd limit is clamped', get(ctx,{activity:'1',site:'ops',limit:'9999'}).activity.length, 6);

// legacy and malformed rows must never throw
const sh=sheets.get('Checkouts');
sh.appendRow(['','','','']);                                   // no date at all
sh.appendRow([today,'09:00','Short Row']);                     // truncated
let threw=null;
try{ var after=ops(); }catch(e){ threw=e.message; }
t('a malformed row does not throw', threw, null);
t('a row with no date is left off the timeline rather than mis-placed', after.total, 7);
t('a truncated row still reads', after.activity.filter(a=>a.who==='Short Row').length, 1);

console.log((fail?'*** '+fail+' FAILED ***':'ALL PASS')+'\n'+R.join('\n'));
process.exit(fail?1:0);
