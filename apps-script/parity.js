/* Does the spreadsheet derive the SAME work from a submission as the site does?
   The two halves run in different languages on different machines and neither
   can see the other, so nothing keeps them honest but this. Every divergence
   found so far has been a real report going missing for somebody. */
/* Run from the harness directory (see HANDOFF): it needs `run.js` and
   `gasenv.js`, a stand-in for the Apps Script host. */
const {fresh,post,dump}=require('./run.js');
const cases=require('./parity.json');
let fail=0; const R=[];
// Sort by CONTENT. Array.sort on objects compares "[object Object]" and does
// nothing, which made two identical sets look like a divergence.
const norm=a=>JSON.stringify(a.map(x=>JSON.stringify(x)).sort());
for(const c of cases){
  const {ctx,sheets}=fresh();
  post(ctx,c.payload);
  const restock=(dump(sheets,'Restock')||[]).slice(1)
    .map(r=>({kind:String(r[9]||'buy'), name:String(r[1]), where:String(r[7]||'')}));
  const concerns=(dump(sheets,'Concerns')||[]).slice(1)
    .map(r=>({what:String(r[2]), where:String(r[3]||'')}));
  const cToGet=c.toGet.map(t=>({kind:t.kind, name:t.name, where:(t.wheres||[]).join(', ')}));
  const cIss=c.issues.map(i=>({what:i.what, where:i.where}));

  const a=norm(restock), b=norm(cToGet);
  if(a!==b){ fail++; R.push('FAIL '+c.name+'\n  restock — spreadsheet: '+a+'\n              site       : '+b); }
  else R.push('ok   '+c.name+' — restock lists match ('+restock.length+')');

  // The site turns "X" into "X missing" for an unticked box; the sheet says the
  // same thing in its own words. Compare the SET of subjects, not the wording.
  const strip=s=>String(s).replace(/ missing$/,'').trim();
  const a2=norm(concerns.map(x=>({what:strip(x.what),where:x.where})));
  const b2=norm(cIss.map(x=>({what:strip(x.what),where:x.where})));
  if(a2!==b2){ fail++; R.push('FAIL '+c.name+'\n  concerns — spreadsheet: '+a2+'\n               site       : '+b2); }
  else R.push('ok   '+c.name+' — problem lists match ('+concerns.length+')');
}
console.log((fail?'*** '+fail+' DIVERGENCE(S) ***':'ALL PARITY CHECKS PASS')+'\n'+R.join('\n'));
process.exit(fail?1:0);
