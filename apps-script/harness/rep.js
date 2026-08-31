const {fresh,post,get}=require('./run.js');
const {ctx}=fresh();
const today=new Date().toISOString().slice(0,10);
post(ctx,{form:'Checkouts',date:today,sid:'c1',name:'Test Member',andrew:'x',radio:'P1',
  unitId:'jk-a',subject:'Jumpkit A',missing:'(1) stethoscope | (2) Jr. Epi-Pens',missingCount:2,
  done:'',doneCount:0,expired:'',expiringSoon:'',detail:''});
post(ctx,{form:'Bag Checks',date:today,sid:'b1',name:'Another Member',andrew:'x',
  bagId:'jumpkit',subject:'Jumpkit',missing:'(1) small bottle of eyewash',missingCount:1,
  done:'',doneCount:0,expired:'',expiringSoon:''});
post(ctx,{form:'Room Checks',date:today,sid:'r1',name:'Third Member',andrew:'x',callsign:'P1',
  roomId:'equipment',subject:'Equipment Room',missing:'Restock the blue bins',missingCount:1,
  done:'',doneCount:0,restock:'We are out of paper towels',maint:''});
console.log('THE CONCERNS TAB HOLDS:');
get(ctx,{state:'1',site:'ops'}).concerns.forEach(c=>console.log('   ['+c.urgency+'] '+c.what+' — '+c.where));
const rep=get(ctx,{report:'week'}).report;
console.log('\nTHE REPORT SAYS:');
console.log('   items used   :', Object.keys(rep.used).length);
console.log('   calls logged :', rep.calls);
console.log('   concerns     :', rep.concerns.length);
rep.concerns.forEach(c=>console.log('      - '+c.what+'  ('+c.source+')'));
