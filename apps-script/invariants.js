/* Paste-into-the-page invariant sweep.

   Every bug that has escaped this month was the same shape: two things that had
   to agree, didn't, and nothing checked. So rather than hunt one at a time, this
   asserts the agreements themselves.

   A. COLLAPSE — anything keyed by a derived value can silently merge two things
      into one. Duplicate ids, duplicate labels, duplicate case-folded keys.
   B. DANGLING — a reference to something that no longer exists is a silent no-op.
   C. ROUND TRIP — a value written and read back must come back the same.
   D. ENUM AGREEMENT — two places that map the same vocabulary must map it alike.
*/
window.__invariants=function(site){
  var bad=[], note=[];
  function fail(cls,msg){ bad.push(cls+': '+msg); }
  function dupes(list, keyOf, what, where){
    var c={}, out=[];
    (list||[]).forEach(function(x){ var k=keyOf(x); if(k===undefined||k===null) return;
      c[k]=(c[k]||0)+1; });
    Object.keys(c).forEach(function(k){ if(c[k]>1) out.push(k+' ×'+c[k]); });
    if(out.length) fail('COLLAPSE', where+' has duplicate '+what+': '+out.join(', '));
    return out;
  }

  // ---------- A. collapse -----------------------------------------------
  if(site==='ops'){
    dupes(DB.bags, function(b){return b.id;}, 'bag ids', 'DB.bags');
    dupes(DB.bagUnits, function(u){return u.id;}, 'unit ids', 'DB.bagUnits');
    dupes(DB.rooms, function(r){return r.id;}, 'room ids', 'DB.rooms');
    dupes(DB.consumables, function(c){return c.id;}, 'consumable ids', 'DB.consumables');
    dupes(DB.consumables, function(c){return String(c.name||'').toLowerCase();}, 'names (case-folded)', 'DB.consumables');
    (DB.bags||[]).forEach(function(b){
      var items=[]; (b.sections||[]).forEach(function(s){ (s.items||[]).forEach(function(i){ items.push(i); }); });
      dupes(items, function(i){return i.id;}, 'item ids', 'bag "'+b.name+'"');
      dupes(b.sections, function(s){return s.id;}, 'section ids', 'bag "'+b.name+'"');
    });
    (DB.rooms||[]).forEach(function(r){
      var items=[]; (r.sections||[]).forEach(function(s){ (s.items||[]).forEach(function(i){ items.push(i); }); });
      dupes(items, function(i){return i.id;}, 'item ids', 'room "'+r.name+'"');
    });
    /* Medications. The naive check here — "no two inventory rows may share a
       case-folded name" — fired on every run, because the same drug genuinely
       sits on three shelves and each shelf is its own row with its own id. That
       is the design, not a fault, and a checker that reports it as one every
       single time teaches whoever runs it to skim past real findings.

       The agreement that DOES have to hold: the post-call form offers drugs by
       lowercased name, so every medication row must reach exactly one offered
       entry, and no two offered entries may share a key. */
    var meds=(DB.inventory||[]).filter(function(r){return r.cat==='Medication';});
    var offered=medList();
    dupes(offered, function(m){return m.key;}, 'keys', 'the medication picker');
    var offeredKeys={}; offered.forEach(function(m){ offeredKeys[m.key]=1; });
    meds.forEach(function(m){
      if(!offeredKeys[String(m.item||'').toLowerCase()])
        fail('DANGLING','medication "'+m.item+'" is in inventory but the post-call form never offers it');
    });
    // ---------- B. dangling --------------------------------------------
    var bagIds={}; (DB.bags||[]).forEach(function(b){bagIds[b.id]=1;});
    (DB.bagUnits||[]).forEach(function(u){
      if(u.type && !bagIds[u.type]) fail('DANGLING','unit "'+u.name+'" is of type "'+u.type+'", which is not a bag type');
    });
    /* stockLink maps an INVENTORY ROW to the consumable it restocks — a shelf,
       and the thing that comes off it. This check had the direction backwards
       and tested the keys against consumable ids, so it reported all four links
       as dangling on every run while all four were correct. Both ends are
       checked now, each against the list it actually belongs to. */
    var consIds={}; (DB.consumables||[]).forEach(function(c){consIds[c.id]=1;});
    var invIds={}; (DB.inventory||[]).forEach(function(r){invIds[r.id]=1;});
    Object.keys(DB.stockLink||{}).forEach(function(k){
      if(!invIds[k])
        fail('DANGLING','stockLink is keyed on "'+k+'", which is not an inventory row');
      var v=DB.stockLink[k];
      if(v && !consIds[v])
        fail('DANGLING','stockLink sends "'+k+'" to consumable "'+v+'", which does not exist');
    });
    (DB.postCall&&DB.postCall.sections||[]).forEach(function(s){
      dupes(s.items, function(i){return i.id;}, 'item ids', 'post-call section "'+s.name+'"');
    });
    // ---------- D. enum agreement ---------------------------------------
    var navNeed={}, goNeed=MANAGER_VIEWS;
    [].slice.call(document.querySelectorAll('.sb-item[data-view]')).forEach(function(b){
      navNeed[b.getAttribute('data-view')]=b.getAttribute('data-need')||'';
    });
    Object.keys(navNeed).forEach(function(v){
      var a=navNeed[v]||'', c=goNeed[v]||'';
      if(a!==c) fail('ENUM','view "'+v+'": nav hides unless "'+(a||'none')+'" but go() blocks unless "'+(c||'none')+'"');
    });
  }

  if(site==='bike'){
    dupes(DB.bikes, function(b){return b.id;}, 'bike ids', 'DB.bikes');
    dupes(DB.bikes, function(b){return String(b.name||'').toLowerCase();}, 'bike names (case-folded)', 'DB.bikes');
    dupes(DB.bags, function(b){return b.id;}, 'bag ids', 'DB.bags');
    dupes(DB.bags, function(b){return String(b.label||'').toLowerCase();}, 'bag labels (case-folded)', 'DB.bags');
    Object.keys(DB.forms||{}).forEach(function(fid){
      var f=DB.forms[fid], items=[];
      (f.sections||[]).forEach(function(s){ (s.items||[]).forEach(function(i){ items.push(i); }); });
      dupes(items, function(i){return i.id;}, 'item ids', 'form "'+fid+'"');
      dupes(f.sections, function(s){return s.id;}, 'section ids', 'form "'+fid+'"');
      // labels may repeat in DATA; what must be unique is what the form RENDERS
      var lab=formLabels(f), vals=Object.keys(lab).map(function(k){return lab[k];});
      dupes(vals.map(function(v){return {v:v};}), function(x){return x.v;}, 'RENDERED labels', 'form "'+fid+'"');
    });
    dupes(DB.weather, function(w){return String(w.t||'').toLowerCase();}, 'condition text', 'DB.weather');
    dupes(DB.oos, function(o){return o.id;}, 'ids', 'DB.oos');
    dupes(DB.inventory, function(r){return String(r.item||'').toLowerCase();}, 'item names (case-folded)', 'DB.inventory');
    // ---------- D. enum agreement ---------------------------------------
    [].slice.call(document.querySelectorAll('.sb-item[data-view]')).forEach(function(b){
      var v=b.getAttribute('data-view');
      var webonly=b.classList.contains('webonly');
      var gated=MANAGER_VIEWS.indexOf(v)>=0;
      if(webonly!==gated) fail('ENUM','view "'+v+'": nav '+(webonly?'is':'is NOT')+' manager-only but go() '+(gated?'blocks':'allows')+' members');
    });
    // sev vocabularies must round-trip
    var toUrg={crit:'Blocking',warn:'Soon',minor:'Whenever'};
    Object.keys(toUrg).forEach(function(sev){
      var back=SEV_FROM_URGENCY[toUrg[sev]];
      if(back!==sev) fail('ROUND TRIP','severity "'+sev+'" becomes "'+toUrg[sev]+'" and comes back as "'+back+'"');
    });
  }
  return {site:site, failures:bad, notes:note};
};
'invariant sweep loaded';
