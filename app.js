const KEY='ninku-v2';
const defaults={
  entries:[],
  sites:['現場A'],
  workers:['作業者A'],
  processes:['一般作業','組立','解体'],
  targets:[]
};

let data=JSON.parse(localStorage.getItem(KEY)||'null')||JSON.parse(JSON.stringify(defaults));
data={...defaults,...data,entries:data.entries||[],targets:data.targets||[]};

const state={supabase:null,useCloud:false};
const $=id=>document.getElementById(id);
const today=()=>new Date().toISOString().slice(0,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const key=(site,process)=>site+'|||'+process;
const fmt=n=>Number(n||0).toFixed(2).replace(/\.00$/,'');
const saveLocal=()=>localStorage.setItem(KEY,JSON.stringify(data));

function setNotice(message,type='warning'){
  const el=$('dbNotice');
  if(!el)return;
  el.textContent=message;
  el.className='notice '+type;
}

function showError(prefix,err){
  console.error(prefix,err);
  const msg=err?.message||String(err||'unknown error');
  setNotice(`${prefix}: ${msg}`,'warning');
}

function fill(id,values){
  $(id).innerHTML='<option value="">選択してください</option>'+
    values.map(v=>`<option>${esc(v)}</option>`).join('');
}

function getTarget(site,process){
  return data.targets.find(t=>t.site===site&&t.process===process);
}

function ninkuValue(item){
  return Number(item.ninku ?? ((Number(item.people)||0)*(Number(item.hours)||0)/7));
}

function used(site,process,ignore=''){
  return data.entries
    .filter(e=>e.site===site&&e.process===process&&e.id!==ignore)
    .reduce((s,e)=>s+ninkuValue(e),0);
}

function applySupabaseConfig(){
  const url=window.SUPABASE_URL||'';
  const anon=window.SUPABASE_ANON_KEY||'';
  if(url && anon && window.supabase){
    state.supabase=window.supabase.createClient(url,anon);
    state.useCloud=true;
    setNotice('Supabase共有モード：全員で同じデータを使用します。','success');
  }else{
    state.supabase=null;
    state.useCloud=false;
    setNotice('Supabaseが設定されていません。config.jsを確認してください。','warning');
  }
}

async function loadCloudData(){
  if(!state.useCloud)return;

  const [targetsRes,entriesRes,settingsRes]=await Promise.all([
    state.supabase.from('targets').select('*').order('site',{ascending:true}).order('process',{ascending:true}),
    state.supabase.from('entries').select('*').order('date',{ascending:false}).order('created_at',{ascending:false}),
    state.supabase.from('app_settings').select('*').eq('id',1).maybeSingle()
  ]);

  if(targetsRes.error)throw targetsRes.error;
  if(entriesRes.error)throw entriesRes.error;
  if(settingsRes.error)throw settingsRes.error;

  data.targets=targetsRes.data||[];
  data.entries=entriesRes.data||[];

  if(settingsRes.data){
    data.sites=Array.isArray(settingsRes.data.sites)?settingsRes.data.sites:defaults.sites;
    data.workers=Array.isArray(settingsRes.data.workers)?settingsRes.data.workers:defaults.workers;
    data.processes=Array.isArray(settingsRes.data.processes)?settingsRes.data.processes:defaults.processes;
  }else{
    // First device initializes the shared lists from its current local settings.
    await saveCloudSettings();
  }

  saveLocal();
}

async function saveCloudSettings(){
  if(!state.useCloud)return;
  const payload={
    id:1,
    sites:data.sites,
    workers:data.workers,
    processes:data.processes,
    updated_at:new Date().toISOString()
  };
  const {error}=await state.supabase.from('app_settings').upsert(payload,{onConflict:'id'});
  if(error)throw error;
}

async function saveCloudTarget(target){
  if(!state.useCloud)return;
  const payload={site:target.site,process:target.process,ninku:Number(target.ninku)};
  let res;
  if(target.id)res=await state.supabase.from('targets').update(payload).eq('id',target.id).select().single();
  else res=await state.supabase.from('targets').insert(payload).select().single();
  if(res.error)throw res.error;
}

async function saveCloudEntry(entry){
  if(!state.useCloud)return;
  const payload={
    date:entry.date,site:entry.site,worker:entry.worker,process:entry.process,
    people:Number(entry.people),hours:Number(entry.hours),ninku:Number(entry.ninku),note:entry.note||''
  };
  let res;
  if(entry.id)res=await state.supabase.from('entries').update(payload).eq('id',entry.id).select().single();
  else res=await state.supabase.from('entries').insert(payload).select().single();
  if(res.error)throw res.error;
}

async function deleteCloudTarget(id){
  if(!state.useCloud||!id)return;
  const {error}=await state.supabase.from('targets').delete().eq('id',id);
  if(error)throw error;
}

async function deleteCloudEntry(id){
  if(!state.useCloud||!id)return;
  const {error}=await state.supabase.from('entries').delete().eq('id',id);
  if(error)throw error;
}

function renderTargets(){
  $('targetsList').innerHTML=data.targets.map((t,i)=>
    `<li><span><b>${esc(t.site)}</b> / ${esc(t.process)}　目標 <b>${fmt(t.ninku)}人工</b></span>
    <button class="remove" data-target-remove="${i}">×</button></li>`).join('');
}

function renderRecent(){
  const a=[...data.entries].sort((x,y)=>y.date.localeCompare(x.date));
  $('recentEntries').innerHTML='<h3 class="recent-title">最近の記録</h3>'+
    (a.length?a.slice(0,5).map(e=>
      `<div class="recent-item"><div><strong>${esc(e.site)}　${esc(e.process)}</strong>
      <small>${e.date}　${esc(e.worker)}　使用 ${fmt(ninkuValue(e))}人工</small></div>
      <div class="recent-actions"><button class="action" data-edit="${e.id}">編集</button>
      <button class="action delete" data-delete="${e.id}">削除</button></div></div>`).join('')
      :'<div class="card empty">記録を保存すると、ここに表示されます。</div>');
}

function renderSummary(){
  const a=[...data.entries].sort((x,y)=>y.date.localeCompare(x.date));
  $('totalCount').textContent=a.length;
  $('totalManDays').textContent=fmt(a.reduce((s,e)=>s+ninkuValue(e),0));
  $('totalHours').textContent=fmt(a.reduce((s,e)=>s+(Number(e.people)||0)*(Number(e.hours)||0),0));
  $('summaryPeriod').textContent=a.length?`${a[a.length-1].date} ～ ${a[0].date}`:'記録を追加すると集計されます';

  const map={};
  data.entries.forEach(e=>{
    const k=key(e.site,e.process);
    map[k]??={site:e.site,process:e.process,used:0};
    map[k].used+=ninkuValue(e);
  });
  data.targets.forEach(t=>{
    const k=key(t.site,t.process);
    map[k]??={site:t.site,process:t.process,used:0};
  });

  const rows=Object.values(map);
  $('emptyUsage').classList.toggle('hidden',!!rows.length);
  $('usageTable').innerHTML=rows.map(x=>{
    const target=getTarget(x.site,x.process);
    const remain=target?Number(target.ninku)-x.used:null;
    const over=target&&remain<0;
    return `<tr class="${over?'over':''}"><td>${esc(x.site)}</td><td>${esc(x.process)}</td>
      <td>${target?fmt(target.ninku):'未設定'}</td><td>${fmt(x.used)}</td><td>${target?fmt(remain):'—'}</td>
      <td>${over?'<b class="warning">⚠ 目標超過</b>':target?'OK':'目標未設定'}</td></tr>`;
  }).join('');

  $('summaryAlerts').innerHTML=rows.filter(x=>{
    const target=getTarget(x.site,x.process);
    return target&&x.used>Number(target.ninku);
  }).map(x=>`<div class="alert">⚠ ${esc(x.site)} / ${esc(x.process)} の使用人工が目標を超えています。</div>`).join('');

  $('entriesTable').innerHTML=a.map(e=>
    `<tr><td>${e.date}</td><td><b>${esc(e.site)}</b><br><span class="muted">${esc(e.process)}</span></td>
    <td>${esc(e.worker)}</td><td>${fmt(ninkuValue(e))}人工</td>
    <td><button class="action" data-edit="${e.id}">編集</button>
    <button class="action delete" data-delete="${e.id}">削除</button></td></tr>`).join('');
}

function render(){
  ['sites','workers','processes'].forEach(k=>{
    $(k+'List').innerHTML=data[k].map((v,i)=>
      `<li>${esc(v)}<button class="remove" data-remove="${k}" data-index="${i}">×</button></li>`).join('');
  });
  fill('site',data.sites);
  fill('targetSite',data.sites);
  fill('worker',data.workers);
  fill('process',data.processes);
  fill('targetProcess',data.processes);
  renderTargets();
  renderRecent();
  renderSummary();
  saveLocal();
}

function resetEntryForm(){
  $('workForm').reset();
  $('date').value=today();
  $('people').value=1;
  $('hours').value=7;
  $('ninku').value='';
  $('editId').value='';
  $('cancelEdit').hidden=true;
  $('entryWarning').innerHTML='';
}

async function saveEntryData(item){
  if(state.useCloud){
    await saveCloudEntry(item);
    await loadCloudData();
  }else{
    const i=data.entries.findIndex(x=>x.id===item.id);
    if(i>=0)data.entries[i]=item;else data.entries.push(item);
    saveLocal();
  }
}

async function saveTargetData(target){
  if(state.useCloud){
    await saveCloudTarget(target);
    await loadCloudData();
  }else{
    const i=data.targets.findIndex(x=>x.id===target.id||(x.site===target.site&&x.process===target.process));
    if(i>=0)data.targets[i]=target;else data.targets.push(target);
    saveLocal();
  }
}

async function deleteEntryData(id){
  if(state.useCloud){
    await deleteCloudEntry(id);
    await loadCloudData();
  }else{
    data.entries=data.entries.filter(x=>x.id!==id);
    saveLocal();
  }
}

async function deleteTargetData(index){
  const target=data.targets[index];
  if(!target)return;
  if(state.useCloud){
    await deleteCloudTarget(target.id);
    await loadCloudData();
  }else{
    data.targets.splice(index,1);
    saveLocal();
  }
}

$('date').value=today();

$('workForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const id=$('editId').value||crypto.randomUUID();
  const item={
    id,
    date:$('date').value,
    site:$('site').value,
    worker:$('worker').value,
    process:$('process').value,
    people:Number($('people').value),
    hours:Number($('hours').value),
    ninku:$('ninku').value===''?Number($('people').value)*Number($('hours').value)/7:Number($('ninku').value),
    note:$('note').value
  };

  if(!item.site||!item.worker||!item.process){
    alert('現場・作業者・作業を選択してください。'); return;
  }

  const target=getTarget(item.site,item.process);
  const total=used(item.site,item.process,item.id)+item.ninku;
  $('entryWarning').innerHTML=target&&total>Number(target.ninku)?
    `<div class="alert">⚠ ${item.site} / ${item.process} の合計 ${fmt(total)}人工が目標 ${fmt(target.ninku)}人工を超えます。</div>`:'';

  try{
    await saveEntryData(item);
    resetEntryForm();
    render();
    alert('保存しました。');
  }catch(err){
    showError('保存に失敗しました',err);
    alert(`保存できませんでした。\n${err?.message||err}`);
  }
});

$('saveTarget').onclick=async()=>{
  const site=$('targetSite').value;
  const process=$('targetProcess').value;
  const ninku=Number($('targetNinku').value);
  if(!site||!process||!Number.isFinite(ninku)||ninku<0){
    alert('現場・作業・目標人工を入力してください。'); return;
  }

  const target=getTarget(site,process)||{};
  const final={...target,site,process,ninku};

  try{
    await saveTargetData(final);
    $('targetNinku').value='';
    render();
  }catch(err){
    showError('目標の保存に失敗しました',err);
    alert(`目標を保存できませんでした。\n${err?.message||err}`);
  }
};

document.addEventListener('click',async e=>{
  const tab=e.target.closest('[data-tab]');
  if(tab){
    document.querySelectorAll('.tab,.panel').forEach(x=>x.classList.remove('active'));
    tab.classList.add('active');
    $(tab.dataset.tab).classList.add('active');
  }

  const add=e.target.closest('[data-add]');
  if(add){
    const input=add.previousElementSibling;
    const value=input.value.trim();
    if(value&&!data[add.dataset.add].includes(value)){
      data[add.dataset.add].push(value);
      input.value='';
      try{
        if(state.useCloud)await saveCloudSettings();
        saveLocal();
        render();
      }catch(err){
        showError('設定の保存に失敗しました',err);
        alert(`設定を保存できませんでした。\n${err?.message||err}`);
      }
    }
  }

  const rem=e.target.closest('[data-remove]');
  if(rem){
    const list=rem.dataset.remove;
    const old=[...data[list]];
    data[list].splice(Number(rem.dataset.index),1);
    try{
      if(state.useCloud)await saveCloudSettings();
      saveLocal(); render();
    }catch(err){
      data[list]=old;
      render();
      showError('設定の削除に失敗しました',err);
      alert(`設定を削除できませんでした。\n${err?.message||err}`);
    }
  }

  const targetRemove=e.target.closest('[data-target-remove]');
  if(targetRemove&&confirm('この目標を削除しますか？')){
    try{await deleteTargetData(Number(targetRemove.dataset.targetRemove));render();}
    catch(err){showError('目標の削除に失敗しました',err);alert(`削除できませんでした。\n${err?.message||err}`);}
  }

  const del=e.target.closest('[data-delete]');
  if(del&&confirm('この記録を削除しますか？')){
    try{await deleteEntryData(del.dataset.delete);render();}
    catch(err){showError('記録の削除に失敗しました',err);alert(`削除できませんでした。\n${err?.message||err}`);}
  }

  const edit=e.target.closest('[data-edit]');
  if(edit){
    const item=data.entries.find(v=>v.id===edit.dataset.edit);
    if(!item)return;
    $('editId').value=item.id;
    $('date').value=item.date;
    $('site').value=item.site;
    $('worker').value=item.worker;
    $('process').value=item.process;
    $('people').value=item.people;
    $('hours').value=item.hours;
    $('ninku').value=item.ninku;
    $('note').value=item.note||'';
    $('cancelEdit').hidden=false;
    document.querySelector('[data-tab="entry"]').click();
    scrollTo(0,0);
  }
});

$('cancelEdit').onclick=resetEntryForm;

$('clearData').onclick=async()=>{
  if(!confirm('すべてのデータを削除しますか？'))return;
  try{
    if(state.useCloud){
      const a=await state.supabase.from('entries').delete().neq('id','00000000-0000-0000-0000-000000000000');
      if(a.error)throw a.error;
      const b=await state.supabase.from('targets').delete().neq('id','00000000-0000-0000-0000-000000000000');
      if(b.error)throw b.error;
      await loadCloudData();
    }else{
      data={...defaults,entries:[],targets:[]};
      saveLocal();
    }
    render();
  }catch(err){
    showError('データ削除に失敗しました',err);
    alert(`削除できませんでした。\n${err?.message||err}`);
  }
};

$('exportCsv').onclick=()=>{
  if(!data.entries.length){alert('出力する記録がありません。');return;}
  const rows=[['日付','現場','作業者','作業','人数','作業時間','使用人工','備考'],
    ...data.entries.map(e=>[e.date,e.site,e.worker,e.process,e.people,e.hours,fmt(ninkuValue(e)),e.note||''])];
  const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download=`作業日報_${today()}.csv`;
  a.click();
};

applySupabaseConfig();
render();

if(state.useCloud){
  loadCloudData()
    .then(()=>render())
    .catch(err=>{
      showError('Supabase接続/読込に失敗しました',err);
      // Keep local data visible; never overwrite it with empty cloud data on failure.
      render();
    });
}

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
}
