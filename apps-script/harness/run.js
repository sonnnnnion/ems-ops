/* Loads Code.gs into the fake host and gives the tests three verbs. */
const fs=require('fs'), vm=require('vm'), path=require('path'), {makeEnv}=require('./gasenv.js');
const SRC=path.join(__dirname,'..','Code.gs');
function fresh(){
  const {g,ss,sheets}=makeEnv();
  const ctx=vm.createContext(Object.assign({console},g));
  vm.runInContext(fs.readFileSync(SRC,'utf8'),ctx,{filename:'Code.gs'});
  return {ctx,ss,sheets};
}
const post=(ctx,p)=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(p)}})._t);
const get =(ctx,q)=>JSON.parse(ctx.doGet({parameter:q})._t);
const dump=(sheets,name)=>{ const s=sheets.get(name); return s?s.rows.map(r=>r.slice()):null; };
module.exports={fresh,post,get,dump};
