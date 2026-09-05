/* Does one phone know who you are on both sites?
   ---------------------------------------------------------------------------
   Operations and Bike Ops are separate sites with separate code, but GitHub
   Pages serves both from sonnnnnion.github.io — one origin, one localStorage.
   They agree on the key `cmuems_me_v1` and on nothing else, so a rider types
   their name once per phone rather than once per site.

   An agreement between two codebases that never import each other is exactly
   the shape of thing that rots silently, so it is asserted here rather than
   assumed. This loads BOTH sites' real readMe/saveMe/forgetMe and runs them
   against a single shared store, in the order a person actually hits them.

   It caught the failure worth having: "Not you?" on the bike site cleared the
   shared key and bike's own, and the next read on Operations fell back to the
   key nobody had cleared and adopted the previous member straight back in.

       node tools/check-shared-identity.js

   Run it after touching readMe/saveMe/forgetMe on either site.
*/
const fs=require('fs'), vm=require('vm'), path=require('path');
const grab=(file,names)=>{
  const src=fs.readFileSync(file,'utf8');
  let out='';
  for(const n of names){
    const i=src.indexOf('function '+n+'(');
    if(i<0) throw new Error('no '+n+' in '+file);
    // brace-match to the end of the function
    let d=0,j=src.indexOf('{',i);
    for(let k=j;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d){ out+=src.slice(i,k+1)+'\n'; break; }} }
  }
  return out;
};
const store={};
const ls={ getItem:k=>k in store?store[k]:null, setItem:(k,v)=>{store[k]=String(v)}, removeItem:k=>{delete store[k]} };
const mk=(file,names,extra)=>{
  const ctx=vm.createContext({localStorage:ls,document:{getElementById:()=>null},console,esc:s=>s,jsq:s=>s});
  vm.runInContext(extra+'\n'+grab(file,names),ctx);
  return ctx;
};
const REPO=path.join(__dirname,'..');
const OPS=path.join(REPO,'index.html');
// The sibling checkout. Skipped rather than failed if it is not beside this one,
// so a clone of just this repo still runs its own half.
const BIKE=path.join(REPO,'..','bike manager','index.html');
if(!fs.existsSync(BIKE)){
  console.log('SKIPPED — no "bike manager" checkout beside this one, so the');
  console.log('cross-site half cannot be checked. Clone it as a sibling to run this.');
  process.exit(0);
}
const ops =mk(OPS ,['readMe','saveMe','forgetMe'],
  "var LS_ME='emsops_me_v1', LS_ME_SHARED='cmuems_me_v1';"+
  "var ME_KEYS=[LS_ME_SHARED,LS_ME,'bikeops_me_v1']; function renderWhoNote(){}");
const bike=mk(BIKE,['readMe','saveMe','forgetMe'],
  "var LS_ME='bikeops_me_v1', LS_ME_SHARED='cmuems_me_v1';"+
  "var ME_KEYS=[LS_ME_SHARED,LS_ME,'emsops_me_v1']; function renderWhoNote(){}");

let fail=0; const R=[];
const t=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w); if(!ok)fail++;
  R.push((ok?'ok  ':'FAIL')+' '+n+(ok?'':'\n     got  '+JSON.stringify(g)+'\n     want '+JSON.stringify(w)));};

// 1. a member fills in a form on Operations
ops.saveMe({first:'Alex',last:'Rivera',andrew:'arivera',callsign:'P1'});
t('ops knows them', ops.readMe(), {first:'Alex',last:'Rivera',andrew:'arivera',callsign:'P1'});
t('and so does bike, without them typing anything',
  {first:bike.readMe().first,last:bike.readMe().last,andrew:bike.readMe().andrew},
  {first:'Alex',last:'Rivera',andrew:'arivera'});

// 2. they then file a bike check. Bike has no concept of a callsign.
bike.saveMe('Alex','Rivera','arivera');
t('the callsign bike never asked about is still there afterwards',
  ops.readMe().callsign, 'P1');

// 3. they correct a typo in their Andrew ID on the bike site
bike.saveMe('Alex','Rivera','arivera2');
t('the correction reaches Operations', ops.readMe().andrew, 'arivera2');
t('and still keeps the callsign', ops.readMe().callsign, 'P1');

// 4. somebody else borrows the phone and presses "Not you?" on the bike site
bike.forgetMe('jumpkit');
t('bike forgets them', bike.readMe(), null);
t('and so does Operations — no stale Andrew ID one site away', ops.readMe(), null);
t('nothing is left in any key', Object.keys(store), []);

// 5. a phone that used the OLD site keeps working, and is adopted once
store['emsops_me_v1']=JSON.stringify({first:'Sam',last:'Doyle',andrew:'sdoyle',callsign:'P2'});
t('an existing member is not asked to introduce themselves again', ops.readMe().andrew, 'sdoyle');
t('and the adoption reaches the shared key', JSON.parse(store['cmuems_me_v1']).andrew, 'sdoyle');
t('so bike knows them too', bike.readMe().andrew, 'sdoyle');

// 6. half a record must never count as knowing somebody
store['cmuems_me_v1']=JSON.stringify({first:'Half'});
delete store['emsops_me_v1']; delete store['bikeops_me_v1'];
t('a record with no surname is not a person', ops.readMe(), null);
store['cmuems_me_v1']='{not json';
t('corrupt storage does not throw', ops.readMe(), null);

console.log((fail?'*** '+fail+' FAILED ***':'ALL PASS')+'\n'+R.join('\n'));
process.exit(fail?1:0);
