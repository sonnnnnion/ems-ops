/* A stand-in for the Apps Script host — enough of Sheets to exercise the column
   arithmetic, which is the part that silently corrupts data when it is wrong.

   Two deliberate strictnesses, both of which have caught real bugs:
     - a range with a row or column below 1 throws, like the real API, so a -1
       sentinel leaking into getRange is caught rather than writing somewhere odd
     - every destructive call throws, so "this script never deletes anything"
       is proved rather than asserted
*/
function makeEnv(){
  const sheets=new Map();
  const pad=(a,n)=>{const o=(a||[]).slice(); while(o.length<n) o.push(''); return o;};
  const DESTRUCTIVE=new Set(['deleteRow','deleteRows','deleteColumn','deleteColumns',
    'clear','clearContents','clearContent','deleteSheet','removeSheet']);
  const wrapRange=o=>new Proxy(o,{get(t,k){
    if(k in t) return t[k];
    if(typeof k!=='string') return undefined;
    if(['clear','clearContent','clearContents','deleteCells'].includes(k))
      return ()=>{ throw new Error('range.'+k+' called'); };
    return function(){ return wrapRange(t); };
  }});
  const wrap=obj=>new Proxy(obj,{get(o,k){
    if(k in o) return o[k];
    if(typeof k!=='string') return undefined;
    if(DESTRUCTIVE.has(k)) return ()=>{ throw new Error(k+' called'); };
    return function(){ return wrap(o); };
  }});

  class Sheet{
    constructor(name){ this.name=name; this.rows=[]; }
    getName(){ return this.name; } setName(n){ this.name=n; return this; }
    getLastRow(){ return this.rows.length; }
    getLastColumn(){ return this.rows.reduce((m,r)=>Math.max(m,r.length),0); }
    getMaxColumns(){ return Math.max(30,this.getLastColumn()); }
    getMaxRows(){ return Math.max(1000,this.rows.length); }
    appendRow(r){ this.rows.push(r.slice()); return this; }
    getRange(r,c,nr,nc){
      nr=nr===undefined?1:nr; nc=nc===undefined?1:nc;
      const sh=this;
      const api={
        getValues(){
          if(r<1||c<1) throw new Error('range outside the sheet: row '+r+', col '+c);
          const out=[];
          for(let i=0;i<nr;i++) out.push(pad(sh.rows[r-1+i],c-1+nc).slice(c-1,c-1+nc));
          return out;
        },
        getValue(){ return this.getValues()[0][0]; },
        setValues(v){
          if(r<1||c<1) throw new Error('range outside the sheet: row '+r+', col '+c);
          for(let i=0;i<v.length;i++){
            while(sh.rows.length < r-1+i+1) sh.rows.push([]);
            const row=pad(sh.rows[r-1+i], c-1+nc);
            for(let j=0;j<v[i].length;j++) row[c-1+j]=v[i][j];
            sh.rows[r-1+i]=row;
          }
          return this;
        },
        setValue(v){ return this.setValues([[v]]); }
      };
      return wrapRange(api);
    }
    getDataRange(){ return this.getRange(1,1,Math.max(this.rows.length,1),Math.max(this.getLastColumn(),1)); }
    getIndex(){ return [...sheets.values()].indexOf(this)+1; }
  }

  const ss={
    getName:()=>'CMU EMS Operations',
    getSheets:()=>[...sheets.values()],
    getSheetByName:n=>sheets.get(n)||null,
    insertSheet:n=>{ const s=wrap(new Sheet(n)); sheets.set(n,s); return s; },
    deleteSheet:()=>{ throw new Error('deleteSheet called'); },
    setActiveSheet:s=>s, moveActiveSheet:()=>{}, getActiveSheet:()=>null
  };
  const props=new Map();
  const g={
    SpreadsheetApp:{
      WrapStrategy:{CLIP:'CLIP',WRAP:'WRAP',OVERFLOW:'OVERFLOW'},
      BorderStyle:{SOLID:'SOLID',SOLID_THICK:'SOLID_THICK',DASHED:'DASHED',DOTTED:'DOTTED'},
      DataValidationCriteria:{VALUE_IN_LIST:'VALUE_IN_LIST'},
      Dimension:{COLUMNS:'COLUMNS',ROWS:'ROWS'},
      getActiveSpreadsheet:()=>ss,
      newDataValidation:()=>({requireValueInList(){return this;},setAllowInvalid(){return this;},build(){return {};}}),
      newConditionalFormatRule:()=>({whenFormulaSatisfied(){return this;},setBackground(){return this;},setRanges(){return this;},build(){return {};}})
    },
    Utilities:{ formatDate:(d,tz,f)=>{
        const p=n=>String(n).padStart(2,'0');
        if(f==='yyyy-MM-dd') return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
        if(f==='HH:mm') return p(d.getHours())+':'+p(d.getMinutes());
        return d.toISOString();
      }, sleep:()=>{}, computeDigest:()=>[], base64Encode:s=>Buffer.from(String(s)).toString('base64') },
    Session:{ getScriptTimeZone:()=>'America/New_York', getActiveUser:()=>({getEmail:()=>''}) },
    PropertiesService:{ getScriptProperties:()=>({
      getProperty:k=>props.get(k)||null,
      setProperty:(k,v)=>{props.set(k,v);},
      deleteProperty:k=>{props.delete(k);} }) },
    ContentService:{ createTextOutput:t=>({ setMimeType(){return this;}, getContent:()=>t, _t:t }),
                     MimeType:{JSON:'json'} },
    UrlFetchApp:{ fetch:()=>({ getResponseCode:()=>200, getContentText:()=>'{}' }) },
    Logger:{ log:()=>{} }
  };
  return {g, ss, sheets};
}
module.exports={makeEnv};
