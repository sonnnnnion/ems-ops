/* Does the spreadsheet derive the same problems from a bike check as the site
   does? The site builds the list for the phone that filed; this builds it for
   everybody else. Two spellings of one fault is one fault listed twice.

   Run from the harness directory — needs run.js and gasenv.js. */
const {fresh,post,get,dump}=require('./run.js');
const cases=require('./bikeparity.json');
const SEV={Blocking:'crit',Soon:'warn',Whenever:'minor'};
let fail=0; const R=[];
const norm=a=>JSON.stringify(a.map(x=>JSON.stringify(x)).sort());

for(const c of cases){
  const {ctx,sheets}=fresh();
  post(ctx,c.payload);
  const st=get(ctx,{state:'1',site:'bike'});
  const srvIssues=st.concerns.map(x=>({sig:x.sig, problem:x.what, sev:SEV[x.urgency]||'minor'}));
  const a=norm(srvIssues), b=norm(c.issues);
  if(a!==b){ fail++; R.push('FAIL '+c.name+'\n  spreadsheet: '+a+'\n  site       : '+b); }
  else R.push('ok   '+c.name+' — problem lists match ('+srvIssues.length+')');

  const srvExp={}; Object.keys(st.expiry||{}).forEach(k=>{ srvExp[k]=st.expiry[k].date; });
  if(JSON.stringify(srvExp)!==JSON.stringify(c.expiry)){
    fail++; R.push('FAIL '+c.name+'\n  expiry — spreadsheet: '+JSON.stringify(srvExp)+'\n           site       : '+JSON.stringify(c.expiry));
  } else R.push('ok   '+c.name+' — expiry dates match ('+Object.keys(srvExp).length+')');
}
console.log((fail?'*** '+fail+' DIVERGENCE(S) ***':'ALL BIKE PARITY CHECKS PASS')+'\n'+R.join('\n'));
process.exit(fail?1:0);
