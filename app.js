const KEY='ninku-v1';
const defaults={entries:[],sites:['現場A'],workers:['作業者A'],processes:['一般作業','組立','解体'],targets:[]};
let data=JSON.parse(localStorage.getItem(KEY)||'null')||JSON.parse(JSON.stringify(defaults));
data.targets=data.targets||[];
const $=id=>document.getElementById(id),save=()=>localStorage.setItem(KEY,JSON.stringify(data)),today=()=>new Date().toISOString().slice(0,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const key=(site,process)=>site+'|||'+process,fmt=n=>Number(n).toFixed(2).replace(/\.00$/,'');

function loadLocalData(){
  const parsed=JSON.parse(localStorage.getItem(KEY)||'null');
  if(parsed){
    data={...defaults,...parsed,entries:parsed.entries||[],targets:parsed.targets||[]};
  } else {
    data=JSON.parse(JSON.stringify(defaults));
  }
}

function fill(id,values){
  $(id).innerHTML='<option value="">選択してください</option>'+values.map(v=>`<option>${esc(v)}</option>`).join('');
}

function getTarget(site,process){
  return data.targets.find(t=>t.site===site&&t.process===process);
}

function ninkuValue(item){
  return Number(item.ninku ?? ((Number(item.people)||0) * (Number(item.hours)||0) / 7));
}

function used(site,process,ignore=''){
  return data.entries.filter(e=>e.site===site&&e.process===process&&e.id!==ignore).reduce((s,e)=>s+ninkuValue(e),0);
}

function setNotice(message,type='warning'){
  const el=$('dbNotice');
  if(!el) return;
  el.textContent=message;
  el.className='notice '+type;
}

function applySupabaseConfig(){
  const url=window.SUPABASE_URL||'';
  const key=window.SUPABASE_ANON_KEY||'';
  const ready=Boolean(url && key && window.supabase);
  if(ready){
    state.supabase=window.supabase.createClient(url,key);
    state.useCloud=true;
    setNotice('Supabase public shared mode is active. Data syncs across all users.', 'success');
  } else {
    state.supabase=null;
    state.useCloud=false;
    setNotice('Supabase not configured yet. Update config.js with your project URL and anon key.', 'warning');
  }
}

async function loadCloudData(){
  if(!state.useCloud||!state.supabase) return;
  const [{data:targets=[]},{data:entries=[]}] = await Promise.all([
    state.supabase.from('targets').select('*').order('site',{ascending:true}).order('process',{ascending:true}),
    state.supabase.from('entries').select('*').order('date',{ascending:false})
  ]);
  data.targets=targets || [];
  data.entries=entries || [];
  save();
}

async function saveCloudTarget(target){
  if(!state.useCloud||!state.supabase) return;
  const payload={site:target.site,process:target.process,ninku:Number(target.ninku)};
  if(target.id){
    await state.supabase.from('targets').update(payload).eq('id',target.id);
  } else {
    await state.supabase.from('targets').insert(payload);
  }
}

async function saveCloudEntry(entry){
  if(!state.useCloud||!state.supabase) return;
  const payload={
    date:entry.date,
    site:entry.site,
    worker:entry.worker,
    process:entry.process,
    people:Number(entry.people),
    hours:Number(entry.hours),
    ninku:Number(entry.ninku),
    note:entry.note||''
  };
  if(entry.id){
    await state.supabase.from('entries').update(payload).eq('id',entry.id);
  } else {
    await state.supabase.from('entries').insert(payload);
  }
}

async function deleteCloudTarget(id){
  if(!state.useCloud||!state.supabase||!id) return;
  await state.supabase.from('targets').delete().eq('id',id);
}

async function deleteCloudEntry(id){
  if(!state.useCloud||!state.supabase||!id) return;
  await state.supabase.from('entries').delete().eq('id',id);
}

function renderTargets(){
  $('targetsList').innerHTML=data.targets.map((t,i)=>`<li><span><b>${esc(t.site)}</b> / ${esc(t.process)}　目標 <b>${fmt(t.ninku)}人工</b></span><button class="remove" data-target-remove="${i}">×</button></li>`).join('');
}

function renderRecent(){
  const a=[...data.entries].sort((x,y)=>y.date.localeCompare(x.date));
  $('recentEntries').innerHTML='<h3 class="recent-title">最近の記録</h3>'+(a.length?a.slice(0,5).map(e=>`<div class="recent-item"><div><strong>${esc(e.site)}　${esc(e.process)}</strong><small>${e.date}　${esc(e.worker)}　使用 ${fmt(ninkuValue(e))}人工</small></div><div class="recent-actions"><button class="action" data-edit="${e.id}">編集</button><button class="action delete" data-delete="${e.id}">削除</button></div></div>`).join(''):'<div class="card empty">記録を保存すると、ここに表示されます。</div>');
}

function renderSummary(){
  const a=[...data.entries].sort((x,y)=>y.date.localeCompare(x.date));
  $('totalCount').textContent=a.length;
  $('totalManDays').textContent=fmt(a.reduce((s,e)=>s+ninkuValue(e),0));
  $('totalHours').textContent=fmt(a.reduce((s,e)=>s+(Number(e.people)||0)*(Number(e.hours)||0),0));
  $('summaryPeriod').textContent=a.length?`${a[a.length-1].date} ～ ${a[0].date}`:'記録を追加すると集計されます';

  const map={};
  data.entries.forEach(e=>{const k=key(e.site,e.process); map[k] ??= {site:e.site,process:e.process,used:0}; map[k].used += ninkuValue(e);});
  data.targets.forEach(t=>{const k=key(t.site,t.process); map[k] ??= {site:t.site,process:t.process,used:0};});
  const rows=Object.values(map);
  $('emptyUsage').classList.toggle('hidden',!!rows.length);
  $('usageTable').innerHTML=rows.map(x=>{
    const target=getTarget(x.site,x.process);
    const remain = target ? Number(target.ninku) - x.used : null;
    const over = target && remain < 0;
    return `<tr class="${over?'over':''}"><td>${esc(x.site)}</td><td>${esc(x.process)}</td><td>${target?fmt(target.ninku):'未設定'}</td><td>${fmt(x.used)}</td><td>${target?fmt(remain):'—'}</td><td>${over?'<b class="warning">⚠ 目標超過</b>':target?'OK':'目標未設定'}</td></tr>`;
  }).join('');

  $('summaryAlerts').innerHTML=rows.filter(x=>{const target=getTarget(x.site,x.process); return target && x.used > Number(target.ninku);}).map(x=>`<div class="alert">⚠ ${esc(x.site)} / ${esc(x.process)} の使用人工が目標を超えています。</div>`).join('');

  $('entriesTable').innerHTML=a.map(e=>`<tr><td>${e.date}</td><td><b>${esc(e.site)}</b><br><span class="muted">${esc(e.process)}</span></td><td>${esc(e.worker)}</td><td>${fmt(ninkuValue(e))}人工</td><td><button class="action" data-edit="${e.id}">編集</button><button class="action delete" data-delete="${e.id}">削除</button></td></tr>`).join('');
}

function render(){
  ['sites','workers','processes'].forEach(k=>{
    $(k+'List').innerHTML=data[k].map((v,i)=>`<li>${esc(v)}<button class="remove" data-remove="${k}" data-index="${i}">×</button></li>`).join('');
  });
  fill('site',data.sites);
  fill('targetSite',data.sites);
  fill('worker',data.workers);
  fill('process',data.processes);
  fill('targetProcess',data.processes);
  renderTargets();
  renderRecent();
  renderSummary();
  save();
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
  if(state.useCloud && state.supabase){
    await saveCloudEntry(item);
    await loadCloudData();
    return;
  }
  const i=data.entries.findIndex(x=>x.id===item.id);
  if(i>=0){ data.entries[i]=item; } else { data.entries.push(item); }
  save();
}

async function saveTargetData(target){
  if(state.useCloud && state.supabase){
    await saveCloudTarget(target);
    await loadCloudData();
    return;
  }
  const i=data.targets.findIndex(x=>x.id===target.id || (x.site===target.site && x.process===target.process));
  if(i>=0){ data.targets[i]=target; } else { data.targets.push(target); }
  save();
}

async function deleteEntryData(id){
  if(state.useCloud && state.supabase){
    await deleteCloudEntry(id);
    await loadCloudData();
    return;
  }
  data.entries=data.entries.filter(x=>x.id!==id);
  save();
}

async function deleteTargetData(index){
  const target=data.targets[index];
  if(!target) return;
  if(state.useCloud && state.supabase && target.id){
    await deleteCloudTarget(target.id);
    await loadCloudData();
    return;
  }
  data.targets.splice(index,1);
  save();
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
    people:$('people').value,
    hours:$('hours').value,
    ninku:$('ninku').value==='' ? Number($('people').value)*Number($('hours').value)/7 : Number($('ninku').value),
    note:$('note').value
  };
  if(!item.site||!item.worker||!item.process){
    alert('現場・作業者・作業を選択してください。');
    return;
  }
  const target=getTarget(item.site,item.process);
  const total=used(item.site,item.process,item.id)+item.ninku;
  $('entryWarning').innerHTML = target && total > Number(target.ninku) ? `<div class="alert">⚠ ${item.site} / ${item.process} の合計 ${fmt(total)}人工が目標 ${fmt(target.ninku)}人工を超えます。</div>` : '';
  await saveEntryData(item);
  resetEntryForm();
  render();
  alert('保存しました。');
});

$('saveTarget').onclick=async()=>{
  const site=$('targetSite').value;
  const process=$('targetProcess').value;
  const ninku=Number($('targetNinku').value);
  if(!site||!process||!Number.isFinite(ninku)||ninku<0){
    alert('現場・作業・目標人工を入力してください。');
    return;
  }
  const target=getTarget(site,process) || {id:(state.useCloud && state.supabase ? null : crypto.randomUUID())};
  const final={...target,site,process,ninku};
  await saveTargetData(final);
  $('targetNinku').value='';
  render();
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
    if(value && !data[add.dataset.add].includes(value)){
      data[add.dataset.add].push(value);
      input.value='';
      render();
    }
  }

  const rem=e.target.closest('[data-remove]');
  if(rem){
    data[rem.dataset.remove].splice(Number(rem.dataset.index),1);
    render();
  }

  const targetRemove=e.target.closest('[data-target-remove]');
  if(targetRemove){
    await deleteTargetData(Number(targetRemove.dataset.targetRemove));
    render();
  }

  const del=e.target.closest('[data-delete]');
  if(del && confirm('この記録を削除しますか？')){
    await deleteEntryData(del.dataset.delete);
    render();
  }

  const edit=e.target.closest('[data-edit]');
  if(edit){
    const item=data.entries.find(v=>v.id===edit.dataset.edit);
    if(!item) return;
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

$('clearData').onclick=()=>{
  if(confirm('すべてのデータを削除しますか？')){
    localStorage.removeItem(KEY);
    data=JSON.parse(JSON.stringify(defaults));
    render();
  }
};

$('exportCsv').onclick=()=>{
  if(!data.entries.length){
    alert('出力する記録がありません。');
    return;
  }
  const rows=[['日付','現場','作業者','作業','人数','作業時間','使用人工','備考'],...data.entries.map(e=>[e.date,e.site,e.worker,e.process,e.people,e.hours,fmt(ninkuValue(e)),e.note||''])];
  const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download=`作業日報_${today()}.csv`;
  a.click();
};

const state={supabase:null,useCloud:false};
applySupabaseConfig();
loadLocalData();
render();

if(window.supabase){
  applySupabaseConfig();
  if(state.useCloud){
    loadCloudData().catch(err=>{console.error(err); setNotice('Supabase connected but fetch failed. Please check the table names and policies.', 'warning');});
  }
}

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
}

