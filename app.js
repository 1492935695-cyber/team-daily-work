const $=id=>document.getElementById(id);
const MEMBERS=['涛涛','蒙蒙','小小','和和'];
const STATUSES=['未安排','待开始','进行中','已完成','阻塞'];
const PROJECTS=[{id:'1A',code:'1A',name:'抖店童装',priority:1,label:'首要重点'},{id:'1B',code:'1B',name:'抖店女鞋',priority:2,label:'第二重点'},{id:'2C-douyin',code:'2C',name:'抖音达人',priority:3,label:'第三重点',primary:true},{id:'2C-weixin',code:'2C',name:'视频号达人',priority:3,label:'第三重点'},{id:'2C-xhs',code:'2C',name:'小红书达人',priority:3,label:'第三重点'},{id:'2A',code:'2A',name:'小红书童装',priority:4,label:'第四重点'}];
const localStore={get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{}},remove(k){try{localStorage.removeItem(k);}catch{}}};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const state={date:today(),person:localStore.get('team-person')||'',key:localStore.get('team-key')||'',view:'all',filter:'all',payload:null,online:false,loading:false,endpoint:location.hostname.endsWith('github.io')?'':location.origin,endpointAt:0,editing:null,busy:false,conflict:null,reportAll:true};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const project=id=>PROJECTS.find(p=>p.id===id)||PROJECTS[0];
const active=t=>t.status!=='未安排';
const statusClass=s=>({'进行中':'running','待开始':'waiting','已完成':'done','阻塞':'blocked'}[s]||'');
const time=s=>s?new Date(s).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'}):'';
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function setSync(ok,text){state.online=ok;$('sync').className='sync '+(ok?'':'offline');$('sync').textContent=text;}
function showDialog(id){if(!$(id).open)$(id).showModal();}
function closeDialog(id){$(id).close();}
function count(tasks){const planned=tasks.filter(active);return {planned:planned.length,done:planned.filter(t=>t.status==='已完成').length,blocked:planned.filter(t=>t.status==='阻塞').length};}
async function discover(force=false){
  if(!location.hostname.endsWith('github.io'))return;
  if(!force&&state.endpoint&&Date.now()-state.endpointAt<60000)return;
  const local=new URL('endpoint.json?t='+Date.now(),location.href).href;
  const raw='https://raw.githubusercontent.com/1492935695-cyber/team-daily-work/main/endpoint.json?t='+Date.now();
  for(const source of force?[raw,local]:[local,raw]){try{
    const r=await fetch(source,{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)continue;const d=await r.json();
    if(!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(d.endpoint||''))continue;
    state.endpoint=d.endpoint;state.endpointAt=Date.now();return;
  }catch{}}
  throw new Error('同步服务地址尚未就绪');
}
async function api(route,{method='GET',body}={}){
  await discover();
  const send=()=>fetch(state.endpoint+route,{method,headers:{Authorization:'Bearer '+state.key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(12000)});
  let r;try{r=await send();}catch(e){if(!location.hostname.endsWith('github.io'))throw e;await discover(true);r=await send();}
  if(r.status>=502&&location.hostname.endsWith('github.io')){await discover(true);r=await send();}
  let data;try{data=await r.json();}catch{throw new Error('同步服务暂时没有响应');}
  if(!r.ok){const e=new Error(data.error||'请求失败');e.status=r.status;e.current=data.current;throw e;}return data;
}
async function refresh({notify=false}={}){
  if(state.loading||!state.key)return;state.loading=true;const date=state.date;
  try{
    const payload=await api('/api/day?date='+encodeURIComponent(date));
    if(date!==state.date)return;
    state.payload=payload;setSync(true,'已同步 '+time(payload.serverTime));$('connection-note').classList.add('hidden');
    localStore.set('team-last-'+date,JSON.stringify(payload));render();
    if($('access-dialog').open)closeDialog('access-dialog');if(!state.person)showDialog('person-dialog');if(notify)toast('已刷新共用进度');
  }catch(e){
    if(date!==state.date)return;setSync(false,'未连接');
    if(e.status===401){$('access-error').textContent=e.message;showDialog('access-dialog');}
    else{
      $('connection-note').textContent='共用服务暂未连接。请确认提供服务的电脑开机联网；正在自动重试。未提交草稿会保留，页面不会显示为已保存。';$('connection-note').classList.remove('hidden');
      if(!state.payload){try{state.payload=JSON.parse(localStore.get('team-last-'+date));}catch{}if(state.payload)render();else $('tasks').innerHTML='<div class="empty"><b>正在等待同步服务</b><p>服务连接后会显示你们共同的任务和进度。</p><button class="primary" data-retry>重新连接</button></div>';}
    }
  }finally{state.loading=false;}
}
function render(){
  const opened=new Map(Array.from(document.querySelectorAll('details[data-group]')).map(d=>[d.dataset.group,d.open]));
  state.opened={...(state.opened||{}),...Object.fromEntries(opened)};
  $('identity').textContent=state.person?state.person+' ▾':'选择姓名';$('greeting').textContent=state.person?state.person+'，一起推进。':'今天，一起推进。';
  $('date').value=state.date;$('weekday').textContent=new Date(state.date+'T12:00:00+08:00').toLocaleDateString('zh-CN',{weekday:'long'});
  if(!state.payload)return;
  const daily=state.payload.tasks.filter(t=>t.kind!=='setup');const total=count(daily),percent=total.planned?Math.round(total.done/total.planned*100):0;
  $('done').innerHTML=total.done+' <em>/ '+total.planned+'</em>';$('percent').textContent=percent+'%';$('progress').value=percent;
  $('team').innerHTML=MEMBERS.map(n=>{const ts=daily.filter(t=>t.owner===n),c=count(ts);return `<button class="member ${n===state.person?'active':''}" data-member="${esc(n)}" aria-label="查看${esc(n)}的任务"><span class="avatar">${esc(n.slice(0,1))}</span><span><span class="member-name">${esc(n)}</span><span class="member-data">${c.done}/${c.planned} 已完成</span></span></button>`;}).join('');
  document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('selected',x.dataset.view===state.view));
  $('report').classList.toggle('hidden',state.view!=='report');$('tasks').classList.toggle('hidden',state.view==='report');$('filters').classList.toggle('hidden',['report','setup'].includes(state.view));$('add').classList.toggle('hidden',['report','setup'].includes(state.view));$('assign').classList.toggle('hidden',['report','setup'].includes(state.view));
  const unassigned=daily.filter(t=>!t.owner).length;
  const title={mine:'我的任务',all:'全部任务',setup:'抖店前期工作',report:'每日汇报'};
  const hint={mine:'日常负责人可沿用，完成后写一句结果',all:`1A → 1B → 2C → 2A${unassigned?' · '+unassigned+' 项待分配':''}`,setup:'每个店铺只做一次，已完成项目收进归档',report:'按人汇总当日安排、结果和卡点'};
  $('section-title').textContent=state.memberFilter?state.memberFilter+'的任务':title[state.view];$('section-hint').textContent=hint[state.view];
  document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('selected',x.dataset.filter===state.filter));
  if(state.view==='report'){renderReport();return;}
  let tasks=state.view==='setup'?state.payload.tasks.filter(t=>t.kind==='setup'):daily;
  if(state.view==='mine')tasks=tasks.filter(t=>t.owner===state.person);
  if(state.memberFilter)tasks=tasks.filter(t=>t.owner===state.memberFilter);
  if(state.filter==='unfinished'&&state.view!=='setup')tasks=tasks.filter(t=>t.status!=='已完成');
  if(state.filter==='unassigned'&&state.view!=='setup')tasks=tasks.filter(t=>!t.owner);
  if(!tasks.length){$('tasks').innerHTML=`<div class="empty"><b>${state.view==='mine'?'暂时没有分配给你的任务':'当前没有符合条件的任务'}</b><p>${state.view==='mine'?'去“待分配”中认领，或新增今日计划。':'换一个筛选条件查看。'}</p>${state.view==='mine'?'<button class="primary" data-unassigned>去认领任务</button>':''}</div>`;return;}
  if(state.view==='setup'){
    const unfinished=tasks.filter(t=>t.status!=='已完成'),done=tasks.filter(t=>t.status==='已完成');
    $('tasks').innerHTML=PROJECTS.slice(0,2).map(p=>group(p,unfinished.filter(t=>t.project_id===p.id))).join('')+(done.length?`<details class="task-group"><summary><span class="group-title">已完成归档</span><span class="group-count">${done.length} 项</span></summary>${done.map(taskRow).join('')}</details>`:'');return;
  }
  const fixed=tasks.filter(t=>t.kind!=='extra'),extra=tasks.filter(t=>t.kind==='extra');
  $('tasks').innerHTML=PROJECTS.map(p=>group(p,fixed.filter(t=>t.project_id===p.id))).join('')+(extra.length?`<details class="task-group primary-group" open><summary><span class="priority">＋</span><span class="group-title">当日新增计划</span><span class="group-count">${extra.length} 项</span></summary>${extra.map(taskRow).join('')}</details>`:'');
}
function group(p,ts){if(!ts.length)return '';const c=count(ts);return `<details data-group="${p.id}" class="task-group ${p.id==='1A'?'primary-group':''}" ${state.opened?.[p.id]===false?'':'open'}><summary><span class="priority p${p.priority}">${esc(p.code)}</span><span class="group-title">${esc(p.name)}${p.primary?'<span class="main-tag">主平台</span>':''}<span class="group-sub">${esc(p.label)}</span></span><span class="group-count">${c.done}/${ts.length}</span></summary>${ts.map(taskRow).join('')}</details>`;}
function taskRow(t){
  const preview=t.result?`结果：${t.result}`:t.plan||'点这里填写今日安排';
  const quick=!t.owner&&state.person&&t.status!=='已完成'?`<button class="quick" data-claim="${esc(t.id)}">我来做</button>`:t.owner===state.person&&t.status!=='已完成'?`<button class="quick" data-edit="${esc(t.id)}">报进度 →</button>`:'';
  const label=t.kind==='setup'?project(t.project_id).name+' · ':'';
  return `<article class="task-row ${t.status==='已完成'?'done':''}"><button class="task-main" data-edit="${esc(t.id)}" aria-label="编辑${esc(t.title)}"><span class="task-heading"><span class="task-name">${esc(label+t.title)}</span></span><span class="task-preview">${esc(preview)}</span><span class="task-meta"><span class="task-owner">${esc(t.owner||'待分配')}</span>${t.updated_by?`<span>· ${esc(t.updated_by)} ${time(t.updated_at)}</span>`:''}${t.kind==='extra'?'<span>· 新增</span>':''}</span></button><div class="task-side"><span class="status ${statusClass(t.status)}">${esc(t.status)}</span>${quick}</div></article>`;
}
function selectPerson(n){state.person=n;localStore.set('team-person',n);state.memberFilter='';state.view='mine';closeDialog('person-dialog');render();}
function ensurePerson(){if(state.person)return true;showDialog('person-dialog');return false;}
function draftKey(t){return 'team-draft:'+state.person+':'+(t?.id||'new:'+state.date);}
function readForm(){return {owner:$('edit-owner').value,status:$('edit-status').value,plan:$('edit-plan').value,result:$('edit-result').value,next_step:$('edit-next').value,...(state.editing?.kind==='setup'?{completed_date:$('edit-completed').value}:{}),...(!state.editing||state.editing.kind==='extra'?{title:$('edit-title').value,project_id:$('edit-project').value}:{})};}
function fillForm(data){for(const [field,id] of [['owner','edit-owner'],['status','edit-status'],['plan','edit-plan'],['result','edit-result'],['next_step','edit-next'],['title','edit-title'],['project_id','edit-project'],['completed_date','edit-completed']])$(id).value=data[field]??(field==='project_id'?'1A':field==='status'?'待开始':'');}
function openTask(id){
  if(!ensurePerson())return;state.editing=id?state.payload?.tasks.find(t=>t.id===id):null;
  if(id&&!state.editing)return;state.conflict=null;$('conflict').classList.add('hidden');$('form-error').textContent='';
  const t=state.editing,isExtra=!t||t.kind==='extra';
  $('task-project').textContent=t?project(t.project_id).code+' · '+project(t.project_id).name:'当日新增计划';$('task-title').textContent=t?.title||'新增一件事';
  $('extra-fields').classList.toggle('hidden',!isExtra);$('edit-title').required=isExtra;$('completed-label').classList.toggle('hidden',t?.kind!=='setup');
  $('owner-default-label').classList.toggle('hidden',!t?.template_id||state.date<today());$('owner-default').checked=true;
  fillForm(t||{owner:state.person,status:'待开始',project_id:'1A'});
  const saved=localStore.get(draftKey(t));if(saved){try{const d=JSON.parse(saved);fillForm({...readForm(),...d});$('draft-hint').textContent='已恢复本机未提交草稿';}catch{}}else $('draft-hint').textContent='未提交的草稿会保留在本机';
  showDialog('task-dialog');
}
async function saveTask(event){
  event.preventDefault();if(state.busy)return;state.busy=true;$('save-task').disabled=true;$('save-task').textContent='正在同步…';$('form-error').textContent='';
  const editing=state.editing,form=readForm();localStore.set(draftKey(editing),JSON.stringify(form));
  try{
    const patch=editing?Object.fromEntries(Object.entries(form).filter(([k,v])=>v!==editing[k])):form;
    if(editing&&!Object.keys(patch).length){localStore.remove(draftKey(editing));closeDialog('task-dialog');toast('内容没有变化');return;}
    const result=await api('/api/tasks'+(editing?'/'+encodeURIComponent(editing.id):''),{method:editing?'PATCH':'POST',body:{date:state.date,version:editing?.version,actor:state.person,patch,persistOwner:$('owner-default').checked}});
    localStore.remove(draftKey(editing));closeDialog('task-dialog');setSync(true,'已保存 '+time(result.task.updated_at));await refresh();toast('已保存，其他同事会自动看到');
  }catch(e){
    $('form-error').textContent=e.message||'未能连接，草稿已保留，请重试。';
    if(e.status===409&&e.current){state.conflict=e.current;$('conflict').classList.remove('hidden');$('conflict').innerHTML=`<b>${esc(e.current.updated_by||'同事')}刚刚更新了这件事</b><br>负责人：${esc(e.current.owner||'待分配')} · 状态：${esc(e.current.status)}<br>计划：${esc(e.current.plan||'尚未填写')}<br>结果：${esc(e.current.result||'尚未填写')}<br>卡点：${esc(e.current.next_step||'无')}<br><button type="button" class="text-btn" id="use-current">载入最新内容</button>`;}else if(!e.status)setSync(false,'草稿未提交');
  }finally{state.busy=false;$('save-task').disabled=false;$('save-task').textContent='保存并同步';}
}
async function claim(id){
  if(!ensurePerson())return;const t=state.payload.tasks.find(x=>x.id===id);if(!t||t.owner)return;
  try{await api('/api/tasks/'+encodeURIComponent(id),{method:'PATCH',body:{actor:state.person,version:t.version,patch:{owner:state.person,status:t.status==='未安排'?'待开始':t.status},persistOwner:t.day>=today()}});await refresh();toast('已由你负责，以后每天自动沿用');}catch(e){toast(e.message);await refresh();}
}
function reportTasks(){let ts=state.payload.tasks.filter(t=>t.kind!=='setup'&&active(t));if(!state.reportAll)ts=ts.filter(t=>t.owner===state.person);return ts;}
function links(text){const matches=String(text).match(/https?:\/\/[^\s<>"']+/g)||[];return matches.slice(0,5).map(x=>`<a href="${esc(x)}" target="_blank" rel="noopener noreferrer">打开结果链接 ↗</a>`).join('');}
function renderReport(){
 const tasks=reportTasks(),people=[...MEMBERS,''];
 $('report').innerHTML=`<div class="report-switch"><span>${state.date} · ${state.reportAll?'全员日报':state.person+'的日报'}</span><button id="report-toggle" class="text-btn">${state.reportAll?'只看我':'看全员'}</button></div><div class="report-actions"><button id="copy-report" class="primary small">复制日报</button><button id="export-csv" class="identity">导出当天表格</button></div>`+(tasks.length?people.map(person=>{const rows=tasks.filter(t=>t.owner===person);if(!rows.length)return '';const c=count(rows);return `<article class="report-card"><header><b>${esc(person||'待分配')}</b><small>完成 ${c.done}/${c.planned}${c.blocked?' · 阻塞 '+c.blocked:''}</small></header>${rows.map(t=>`<div class="report-item"><b>${esc(project(t.project_id).name+' · '+t.title)}</b> <span class="status ${statusClass(t.status)}">${esc(t.status)}</span>${t.plan?'<p>计划：'+esc(t.plan)+'</p>':''}<p>结果：${esc(t.result||(t.status==='已完成'?'已标完成，尚未填写结果':'尚未汇报'))}</p>${links(t.result)}${t.next_step?'<p>卡点 / 下一步：'+esc(t.next_step)+'</p>':''}</div>`).join('')}</article>`;}).join(''):'<div class="empty"><b>今天还没有安排工作</b><p>选择负责人和状态后，会自动出现在日报中。</p></div>')+'<article class="report-card"><header><b>最近更新</b><small>保留操作人和时间</small></header><ul id="activity" class="update-list"><li>加载中…</li></ul></article>';
 loadActivity();
}
async function loadActivity(){const date=state.date;try{const d=await api('/api/activity?date='+date);if(date!==state.date||!$('activity'))return;$('activity').innerHTML=d.items.length?d.items.map(a=>`<li><b>${esc(a.actor)}</b> · ${time(a.created_at)}<br>${esc(a.title)}：${esc(a.message)}</li>`).join(''):'<li>暂无更新记录</li>';}catch{if($('activity'))$('activity').innerHTML='<li>暂时未能连接</li>';}}
function reportText(){const tasks=reportTasks(),c=count(tasks);let lines=[state.date+' 工作日报',`已完成 ${c.done}/${c.planned} · 阻塞 ${c.blocked}`];for(const person of [...MEMBERS,'']){const ts=tasks.filter(t=>t.owner===person);if(!ts.length)continue;lines.push('',`【${person||'待分配'}】`);for(const t of ts){lines.push(`· ${project(t.project_id).name} / ${t.title}：${t.status}`);if(t.plan)lines.push('  计划：'+t.plan);lines.push('  结果：'+(t.result||'尚未汇报'));if(t.next_step)lines.push('  卡点/下一步：'+t.next_step);}}return lines.join('\n');}
async function copyReport(){const text=reportText();try{await navigator.clipboard.writeText(text);toast('日报已复制，可以发到工作群');}catch{$('copy-text').value=text;showDialog('copy-dialog');$('copy-text').focus();$('copy-text').select();}}
function csvCell(v){let x=String(v??'');if(/^[=+@\-\t\r]/.test(x))x="'"+x;return '"'+x.replace(/"/g,'""')+'"';}
function exportCsv(){const rows=[['日期','重点顺序','项目','事项','负责人','状态','今日要做','实际结果/链接','卡点/下一步','更新人','更新时间'],...state.payload.tasks.filter(t=>t.kind!=='setup').map(t=>[state.date,project(t.project_id).code,project(t.project_id).name,t.title,t.owner,t.status,t.plan,t.result,t.next_step,t.updated_by,t.updated_at])];const a=document.createElement('a'),u=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));a.href=u;a.download=state.date+'工作进度.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);}
async function changeDate(date){if(!/^20\d{2}-\d{2}-\d{2}$/.test(date))return;state.date=date;state.payload=null;render();$('tasks').innerHTML='<div class="empty">正在读取这一天的工作…</div>';while(state.loading)await new Promise(r=>setTimeout(r,60));await refresh();}
function openAssign(){if(!ensurePerson()||!state.payload)return;$('assign-fields').innerHTML=PROJECTS.map(p=>`<label>${esc(p.code+' · '+p.name+(p.primary?'（主）':''))}<select data-assign-project="${p.id}"><option value="">选择负责人（不改动）</option>${MEMBERS.map(n=>`<option>${n}</option>`).join('')}</select></label>`).join('');$('assign-error').textContent='';showDialog('assign-dialog');}
async function saveAssign(event){event.preventDefault();if(state.busy)return;state.busy=true;$('save-assign').disabled=true;let success=0,conflicts=0;try{for(const select of document.querySelectorAll('[data-assign-project]')){if(!select.value)continue;const tasks=state.payload.tasks.filter(t=>t.kind==='daily'&&t.project_id===select.dataset.assignProject&&(!$('only-unassigned').checked||!t.owner));for(const t of tasks){if(t.owner===select.value)continue;try{await api('/api/tasks/'+encodeURIComponent(t.id),{method:'PATCH',body:{actor:state.person,version:t.version,patch:{owner:select.value},persistOwner:state.date>=today()}});success++;}catch(e){if(e.status===409){conflicts++;continue;}throw e;}}}closeDialog('assign-dialog');toast(`已分配 ${success} 项${conflicts?'；'+conflicts+' 项有新修改，请核对':''}`);await refresh();}catch(e){$('assign-error').textContent=`已成功分配 ${success} 项。${e.message} 请重试剩余项目。`;await refresh();}finally{state.busy=false;$('save-assign').disabled=false;}}
function moveDay(delta){const d=new Date(state.date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);changeDate(d.toISOString().slice(0,10));}
$('person-options').innerHTML=MEMBERS.map(n=>`<button class="person-choice" data-person="${esc(n)}">${esc(n)}</button>`).join('');
$('edit-owner').innerHTML=['',...MEMBERS].map(n=>`<option value="${esc(n)}">${esc(n||'待分配')}</option>`).join('');$('edit-status').innerHTML=STATUSES.map(s=>`<option>${esc(s)}</option>`).join('');$('edit-project').innerHTML=PROJECTS.map(p=>`<option value="${esc(p.id)}">${esc(p.code+' · '+p.name+(p.primary?'（主）':''))}</option>`).join('');
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.close){closeDialog(b.dataset.close);return;}
  if(b.dataset.person){selectPerson(b.dataset.person);return;}
  if(b.dataset.view){state.view=b.dataset.view;state.memberFilter='';state.filter='all';if(state.view==='mine'&&!ensurePerson())state.view='all';render();return;}
  if(b.dataset.filter){state.filter=b.dataset.filter;state.memberFilter='';render();return;}
  if(b.dataset.member){state.memberFilter=state.memberFilter===b.dataset.member?'':b.dataset.member;state.view='all';state.filter='all';render();return;}
  if(b.hasAttribute('data-unassigned')){state.view='all';state.filter='unassigned';render();return;}
  if(b.dataset.edit){openTask(b.dataset.edit);return;}
  if(b.dataset.claim){claim(b.dataset.claim);return;}
  if(b.hasAttribute('data-retry')){refresh({notify:true});return;}
  if(b.id==='use-current'&&state.conflict){state.editing=state.conflict;fillForm(state.conflict);$('conflict').classList.add('hidden');$('form-error').textContent='';$('draft-hint').textContent='已载入最新内容，请核对后再修改';localStore.remove(draftKey(state.editing));return;}
  if(b.id==='report-toggle'){state.reportAll=!state.reportAll;renderReport();}
  if(b.id==='copy-report')copyReport();if(b.id==='export-csv')exportCsv();
});
$('identity').onclick=()=>showDialog('person-dialog');$('add').onclick=()=>openTask();$('task-form').onsubmit=saveTask;$('assign').onclick=openAssign;$('assign-form').onsubmit=saveAssign;
$('task-form').addEventListener('input',()=>{if($('task-dialog').open){localStore.set(draftKey(state.editing),JSON.stringify(readForm()));$('draft-hint').textContent='本机草稿已保留，等待提交';}});
$('date').onchange=e=>changeDate(e.target.value);$('previous').onclick=()=>moveDay(-1);$('next').onclick=()=>moveDay(1);$('today').onclick=()=>changeDate(today());$('refresh').onclick=()=>refresh({notify:true});
$('access-form').onsubmit=async event=>{event.preventDefault();state.key=$('access-code').value.trim();localStore.set('team-key',state.key);$('access-error').textContent='连接中…';await refresh();if(state.online)$('access-error').textContent='';};
const hash=new URLSearchParams(location.hash.slice(1));if(hash.get('join')){state.key=hash.get('join');localStore.set('team-key',state.key);history.replaceState(null,'',location.pathname+location.search);}
render();if(!state.key)showDialog('access-dialog');else refresh();
setInterval(()=>{if(!document.hidden&&!state.busy)refresh();},5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});window.addEventListener('online',()=>refresh());window.addEventListener('offline',()=>setSync(false,'离线 · 草稿保留'));
