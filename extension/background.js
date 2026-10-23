'use strict';
importScripts('core.js');
let activeRun=null;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const TIMEOUTS={tabUpdate:8000,tabGet:3000,navigationCommit:30000,openConfirmation:15000,readCall:5000,openCall:5000,sendCall:18000,diagnosticCall:3000};
function failure(code,message,details={}){const error=Error(message);error.code=code;error.details=details;return error;}
function ensureCancellation(run){
 if(!run.cancelled)run.cancelled=new Promise(resolve=>{run.cancel=()=>resolve();});
 return run.cancelled;
}
function cancel(run){if(!run||run.cancelledFlag)return;run.running=false;run.cancelledFlag=true;ensureCancellation(run);run.cancel();}
function cancelContent(run){try{Promise.resolve(chrome.tabs.sendMessage(run.tab,{command:'cancel',runId:run.id})).catch(()=>{});}catch{}}
async function bounded(run,promise,ms,code,label){
 ensureCancellation(run);let timer;
 const operation=Promise.resolve(promise).then(value=>({kind:'value',value}),error=>({kind:'error',error}));
 const timeout=new Promise(resolve=>{timer=setTimeout(()=>resolve({kind:'timeout'}),ms);});
 const stopped=run.cancelled.then(()=>({kind:'stopped'}));
 const outcome=await Promise.race([operation,timeout,stopped]);clearTimeout(timer);
 if(outcome.kind==='stopped')throw failure('STOPPED','已停止');
 if(outcome.kind==='timeout')throw failure(code,`${label}超时（${Math.ceil(ms/1000)} 秒），已停止`,{timeoutMs:ms});
 await check(run);
 if(outcome.kind==='error')throw outcome.error;
 return outcome.value;
}
async function passiveBounded(promise,ms,label){
 let timer;const operation=Promise.resolve(promise).then(value=>({ok:true,value}),error=>({ok:false,error}));
 const timeout=new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false,error:failure('TIMEOUT',`${label}超时`)}),ms);});
 const outcome=await Promise.race([operation,timeout]);clearTimeout(timer);if(!outcome.ok)throw outcome.error;return outcome.value;
}
async function log(text){const {logs=[]}=await chrome.storage.local.get('logs');logs.push({time:new Date().toLocaleTimeString(),text});await chrome.storage.local.set({logs:logs.slice(-500)});}
function safePath(value){try{const url=new URL(String(value||''));return url.origin==='https://www.zhipin.com'?url.pathname:null;}catch{return null;}}
function runDiagnostic(run,extra={}){
 const read=run?.lastRead?{command:run.lastRead.command,attempt:run.lastRead.attempt,maxAttempts:run.lastRead.maxAttempts,budgetMs:run.lastRead.budgetMs||null,elapsedMs:run.lastRead.elapsedMs||null,lastWaitReason:run.lastRead.lastWaitReason||null}:null;
 return {version:'0.1.10',phase:run?.phase||null,phaseElapsedMs:run?.phaseStarted?Math.max(0,Date.now()-run.phaseStarted):null,expectedChatPath:run?.expectedChatPath||null,currentPath:run?.currentPath||null,lastRead:read,navigation:run?.navigation?{...run.navigation}:null,contentRecovery:run?.contentRecovery?{command:run.contentRecovery.command,method:run.contentRecovery.method}:null,scanPartial:run?.scanPartial?{...run.scanPartial}:null,...extra};
}
async function status(label,running=true,run=null){await chrome.storage.local.set({state:{running,label,updated:Date.now(),diagnostic:run?runDiagnostic(run):null}});}
async function phase(run,name,label){run.phase=name;run.phaseStarted=Date.now();await status(label,true,run);}
async function records(){return (await chrome.storage.local.get('records')).records||{};}
async function put(key,value){const r=await records();r[key]={...r[key],...value,time:new Date().toISOString()};await chrome.storage.local.set({records:r});}
function validUrl(url,prefix){try{const u=new URL(url);return u.origin==='https://www.zhipin.com'&&u.pathname.startsWith(prefix);}catch{return false;}}
async function check(run){if(activeRun!==run||!run.running)throw failure('STOPPED','已停止');}
async function wait(run,ms){for(let n=0;n<ms;n+=250){await check(run);await pause(Math.min(250,ms-n));}}
// BOSS is a streaming SPA and its tab can remain "loading" after the usable DOM
// is ready. Navigation only selects the route; the subsequent read command owns
// bounded DOM readiness. This also prevents a false timeout before chat sending.
function sameNavigationTarget(actual,target){
 try{
  const a=new URL(actual),t=new URL(target);if(a.origin!==t.origin||a.pathname!==t.pathname)return false;
  for(const [key,value] of t.searchParams)if(!a.searchParams.getAll(key).includes(value))return false;
  return true;
 }catch{return false;}
}
async function waitForCommittedNavigation(run,target,label){
 const started=Date.now();let tab;
 while(Date.now()-started<TIMEOUTS.navigationCommit){
  await check(run);tab=await currentTab(run);
  // pendingUrl is deliberately insufficient: sending messages to the old
  // document while a new navigation is pending caused stale-city reads and
  // could make a recovery reload cancel the intended destination.
  if(sameNavigationTarget(tab.url,target)){run.currentPath=safePath(tab.url);await wait(run,300);return tab;}
  await wait(run,250);
 }
 throw failure('NAVIGATION_COMMIT_TIMEOUT',`${label}未在 ${Math.ceil(TIMEOUTS.navigationCommit/1000)} 秒内提交目标页面，已停止；没有读取或刷新旧页面`,{targetPath:safePath(target),currentPath:safePath(tab?.url),pendingPath:safePath(tab?.pendingUrl)});
}
async function page(run,url){await check(run);run.emptyScanRecoveryUsed=false;await bounded(run,chrome.tabs.update(run.tab,{url,active:true}),TIMEOUTS.tabUpdate,'TAB_NAVIGATION_TIMEOUT','页面导航');await waitForCommittedNavigation(run,url,'页面导航');}
async function scanPage(run,url){
 if(!run.initialScanUrlUsed&&run.initialScanUrl===url){run.initialScanUrlUsed=true;run.emptyScanRecoveryUsed=false;await waitForCommittedNavigation(run,url,'首个搜索页');return;}
 await page(run,url);
}
function rememberSafety(run,safety){
 if(!safety?.source)return;
 run.lastSafety={...safety};run.lastSafetyCandidate=run.currentJob?{jobPath:run.currentJob.key,title:run.currentJob.title}:null;
}
async function call(run,command,data={},timeoutMs=TIMEOUTS.readCall){await check(run);const result=await bounded(run,chrome.tabs.sendMessage(run.tab,{command,...data}),timeoutMs,'MESSAGE_TIMEOUT',`${command} 页面响应`);rememberSafety(run,result?.safety);return result;}
async function captureSafetyContext(run){
 if(!run?.tab)return null;
 try{
  const job=run.currentJob||run.pending;
  const result=await passiveBounded(chrome.tabs.sendMessage(run.tab,{command:'safetyDiagnostic',candidate:job?{jobPath:job.key,title:job.title}:null}),TIMEOUTS.diagnosticCall,'安全诊断');
  if(result?.safety?.source){rememberSafety(run,result.safety);return {...result,candidate:run.lastSafetyCandidate||result.candidate};}
  return null;
 }catch{return null;}
}
async function recoverMissingContent(run,command,error,attempt){
 if(attempt<5||!['scan','detail'].includes(command)||run.pending||run.contentRecoveryUsed||!/Receiving end does not exist|Could not establish connection/i.test(error?.message||''))return false;
 run.contentRecoveryUsed=true;
 run.contentRecovery={command,method:'single-safe-tab-reload',time:new Date().toISOString()};
 await status(`页面脚本尚未连接；正在安全刷新当前${command==='scan'?'列表':'详情'}页一次\n尚未建立沟通或发送消息`,true,run);
 await bounded(run,chrome.tabs.reload(run.tab),TIMEOUTS.tabUpdate,'CONTENT_RECOVERY_TIMEOUT','页面脚本恢复刷新');
 await wait(run,1200);
 return true;
}
async function recoverEmptyScanShell(run,result,attempt){
 const kind=result?.scanState?.kind;
 if(attempt<5||run.pending||run.emptyScanRecoveryUsed||!result?.wait||!['empty-shell','all-other-city'].includes(kind))return false;
 run.emptyScanRecoveryUsed=true;
 run.contentRecovery={command:'scan',method:kind==='all-other-city'?'single-stale-city-reload':'single-empty-shell-reload',time:new Date().toISOString()};
 await status(`${kind==='all-other-city'?'列表仍显示上一城市的陈旧岗位':'列表页只加载了空外壳'}；正在安全刷新当前列表一次\n尚未建立沟通或发送消息`,true,run);
 await bounded(run,chrome.tabs.reload(run.tab),TIMEOUTS.tabUpdate,'EMPTY_SCAN_RECOVERY_TIMEOUT','空列表外壳恢复刷新');
 await wait(run,1200);
 return true;
}
// A completed tab only means the document finished loading. BOSS renders the job
// cards afterwards, so give a list page a bounded hydration window. Detail/chat
// reads keep their shorter window; sending is never retried after a port error.
const READ_ATTEMPTS={scan:50,detail:25,chatReady:40};
const READ_BUDGET_MS={scan:45000,detail:20000,chatReady:35000};
async function read(run,command,data={}){
 let result,lastConnectionError;const attempts=READ_ATTEMPTS[command]||12,budgetMs=READ_BUDGET_MS[command]||20000,started=Date.now();let completedAttempts=0;
 for(let n=0;n<attempts;n++){
  await check(run);const elapsedMs=Math.max(0,Date.now()-started);let remainingMs=budgetMs-elapsedMs;if(remainingMs<=0)break;completedAttempts=n+1;run.lastRead={command,attempt:n+1,maxAttempts:attempts,budgetMs,elapsedMs,lastWaitReason:result?.reason||null};
  if(command==='chatReady')await status(`等待该岗位聊天页就绪：${n+1}/${attempts}\n本阶段总上限 ${Math.ceil(budgetMs/1000)} 秒；不会切换已有聊天标签`,true,run);
  remainingMs=budgetMs-Math.max(0,Date.now()-started);if(remainingMs<=0)break;
  result=undefined;
  try{result=await call(run,command,data,Math.min(TIMEOUTS.readCall,remainingMs));}catch(e){
   if(e.code==='STOPPED'||e.code==='MESSAGE_TIMEOUT')throw e;
   if(await recoverMissingContent(run,command,e,n+1)){lastConnectionError=e;continue;}
   lastConnectionError=e;if(n===attempts-1)throw failure('PAGE_CONNECTION_FAILED','页面扩展连接失效：'+e.message,{command,attempt:n+1,maxAttempts:attempts});
  }
  if(result?.pagePath)run.currentPath=result.pagePath;
  if(result?.error)throw failure('PAGE_REJECTED',result.error,{command,attempt:n+1,maxAttempts:attempts});
  if(command==='scan'&&await recoverEmptyScanShell(run,result,n+1))continue;
  if(command==='chatReady'&&result?.conversationSelected)data.allowConversationSelection=false;
  if(result&&!result.wait){run.lastRead={command,attempt:n+1,maxAttempts:attempts,budgetMs,elapsedMs:Math.max(0,Date.now()-started),lastWaitReason:null};return result;}
  run.lastRead={command,attempt:n+1,maxAttempts:attempts,budgetMs,elapsedMs:Math.max(0,Date.now()-started),lastWaitReason:result?.reason||lastConnectionError?.message||null};
  const waitMs=Math.min(1000,Math.max(0,budgetMs-(Date.now()-started)));if(n<attempts-1&&waitMs>0)await wait(run,waitMs);
 }
 const lastReason=result?.reason||lastConnectionError?.message||'页面结构未识别';
 const label=command==='chatReady'?`聊天页就绪等待超时（总上限 ${Math.ceil(budgetMs/1000)} 秒）：${lastReason}。已停止；不会自动重试建立沟通或发送消息`:`${command} 页面读取超时：${lastReason}。已停止，请导出记录`;
 throw failure(command==='chatReady'?'CHAT_READY_TIMEOUT':'READ_TIMEOUT',label,{command,attempt:completedAttempts,maxAttempts:attempts,budgetMs,elapsedMs:Math.max(0,Date.now()-started),lastWaitReason:lastReason});
}
async function sendOnce(run,data){
 await check(run);
 try{
  const result=await call(run,'send',{...data,expiresAt:Date.now()+5000},TIMEOUTS.sendCall);
  if(result?.error)throw Error(result.error);
  if(!result||result.wait)throw Error(result?.reason||'聊天页面在发送前失去就绪状态');
  return result;
 }catch(e){
  const error=failure('SEND_UNKNOWN','发送命令结果不明，已停止且不会自动重试：'+e.message,{causeCode:e.code||null});throw error;
 }
}
function directedChatUrl(job){
 if(!job?.communicationTarget?.directionSufficient)return null;
 try{
  const url=new URL(job.chatUrl);
  if(url.origin!=='https://www.zhipin.com'||url.pathname!=='/web/geek/chat')return null;
  return url.href;
 }catch{return null;}
}
function canContinueWithPartialScan(run,error,queue){
 const reason=error?.details?.lastWaitReason||'';
 const counts=reason.match(/^识别到 (\d+) 张卡片；缺详情链接 0，缺城市 0，其他城市 (\d+)/);
 const safelyRejectedStaleCity=run.contentRecovery?.command==='scan'&&['single-empty-shell-reload','single-stale-city-reload'].includes(run.contentRecovery?.method)&&counts&&Number(counts[1])>0&&counts[1]===counts[2];
 return !run.pending&&!run.lastSafety&&queue.length>0&&error?.code==='READ_TIMEOUT'&&error?.details?.command==='scan'&&(/^没有识别到岗位卡片/.test(reason)||safelyRejectedStaleCity);
}
async function currentTab(run,timeoutMs=TIMEOUTS.tabGet){return bounded(run,chrome.tabs.get(run.tab),timeoutMs,'TAB_STATE_TIMEOUT','工作标签状态读取');}
async function enterDirectedChat(run,job){
 run.expectedChatPath='/web/geek/chat';
 const jobKey=BossCore.key(job?.url)||run.currentJob?.key||null;
 await phase(run,'chat-navigation',run.verifyOnly?'正在用该岗位的官方地址验证已建立会话；不会点击沟通或发送…':'已建立一次沟通请求；正在确认该岗位的官方聊天目标…');
 // Wait for a committed native chat route or the same detail button's public
 // established state before using its directed URL. Never interrupt pending
 // establishment merely because a click call returned.
 let tab,current,openConfirmed=!!run.verifyOnly,lastOpenReason=null;const nativeDeadline=Date.now()+TIMEOUTS.openConfirmation,nativeAttempts=run.verifyOnly?1:31;
 for(let attempt=0;attempt<nativeAttempts;attempt++){
  const remaining=Math.max(0,nativeDeadline-Date.now());if(!remaining&&attempt>0)break;
  tab=await currentTab(run,Math.max(1,Math.min(TIMEOUTS.tabGet,remaining||1)));current=safePath(tab.url);run.currentPath=current;
  if(current==='/web/geek/chat'){
   run.navigation={method:'site-click',sourcePath:'/job_detail/',targetPath:'/web/geek/chat',outcome:'chat-route'};
   return;
  }
  if(!run.verifyOnly&&!openConfirmed&&jobKey&&current===jobKey){
   try{
    const state=await call(run,'openReady',{key:jobKey},Math.min(TIMEOUTS.diagnosticCall,Math.max(1,remaining||1)));
    if(state?.error)throw failure('PAGE_REJECTED',state.error);
    if(state?.opened){openConfirmed=true;lastOpenReason=null;}
    lastOpenReason=state?.reason||null;
   }catch(e){if(e.code==='STOPPED'||e.code==='MESSAGE_TIMEOUT'||e.code==='PAGE_REJECTED')throw e;lastOpenReason=e.message;}
  }
  const waitMs=Math.min(500,Math.max(0,nativeDeadline-Date.now()));if(attempt<nativeAttempts-1&&waitMs>0)await wait(run,waitMs);
 }
 if(safePath(tab?.pendingUrl)==='/web/geek/chat'){
  await waitForCommittedNavigation(run,'https://www.zhipin.com/web/geek/chat','网站原生聊天导航');
  run.navigation={method:'site-click',sourcePath:'/job_detail/',targetPath:'/web/geek/chat',outcome:'chat-route'};
  return;
 }
 if(!openConfirmed){
  run.navigation={method:'site-click',sourcePath:current,targetPath:job?.communicationTarget?.redirectPath||null,outcome:'open-unconfirmed'};
  throw failure('OPEN_NOT_CONFIRMED',`“立即沟通”已点击一次，但网站在 ${Math.ceil(TIMEOUTS.openConfirmation/1000)} 秒内未公开确认已建立沟通：${lastOpenReason||'按钮未变为继续沟通'}。已停止，不会导航聊天或发送消息`);
 }
 const target=directedChatUrl(job);
 if(!target){
  run.navigation={method:'none',sourcePath:current,targetPath:job?.communicationTarget?.redirectPath||null,outcome:'unsafe-or-generic-target'};
  throw failure('CHAT_TARGET_UNSAFE',run.verifyOnly?'当前已建立会话缺少足以定向到该岗位/招聘者的公开字段。验证已停止，没有点击沟通或发送消息':'“立即沟通”已调用一次，但网站没有切换任务标签；按钮地址缺少足以定向到该岗位/招聘者的公开字段。已停止，不会切换旧聊天标签、重复建立沟通或发送消息',{communicationTarget:job?.communicationTarget||null});
 }
 run.navigation={method:'official-directed-url',sourcePath:current,targetPath:'/web/geek/chat',outcome:'requested'};
 await bounded(run,chrome.tabs.update(run.tab,{url:target,active:true}),TIMEOUTS.tabUpdate,'CHAT_NAVIGATION_TIMEOUT','定向聊天页导航');
 tab=await waitForCommittedNavigation(run,target,'定向聊天页导航');run.navigation.outcome='navigated';
 current=safePath(tab.url);run.currentPath=current;
 if(current!=='/web/geek/chat')throw failure('CHAT_NAVIGATION_MISMATCH',`定向聊天页导航后仍停留在 ${current||'未知路径'}，已停止且不会发送消息`,{currentPath:current});
}
async function diagnosticReadTab(tabId){
 let result;
 for(let n=0;n<20;n++){
  result=undefined;
  try{result=await passiveBounded(chrome.tabs.sendMessage(tabId,{command:'detail'}),TIMEOUTS.diagnosticCall,'岗位核对页响应');}catch{}
  if(result?.error)throw Error(result.error);
  if(result&&!result.wait)return result;
  await pause(500);
 }
 throw Error(result?.reason||'岗位核对页未能加载');
}
async function diagnoseChatBinding(tab,diagnostic,expectedMessage){
 const all=Object.entries(await records()).filter(([,r])=>r&&(r.status==='unknown'||r.status==='reserved')).sort((a,b)=>String(b[1].time||'').localeCompare(String(a[1].time||'')));
 if(!all.length)return {...diagnostic,jobBinding:{checked:false,reason:'没有可用于核对的未确认岗位记录'}};
 const [key,record]=all[0];
 let detailTabId=null,created=false;
 try{
  const tabs=await chrome.tabs.query({});const existing=tabs.find(current=>current.id!==tab.id&&BossCore.key(current.url||current.pendingUrl||'')===key);
  if(existing)detailTabId=existing.id;else{const createdTab=await chrome.tabs.create({url:`https://www.zhipin.com${key}`,active:false});detailTabId=createdTab.id;created=true;}
  const detail=await diagnosticReadTab(detailTabId);
  const detailMatched=BossCore.key(detail.url)===key&&BossCore.norm(detail.title)===BossCore.norm(record.title)&&detail.city===record.city&&detail.companyKey===BossCore.companyKey(record.company);
  if(!detailMatched)throw Error('核对标签的职位、城市或公司与最近未确认记录不一致');
  if(!detail.salary||!detail.recruiterName||!detail.recruiterCompany||!detail.recruiterRole)throw Error('岗位详情缺少薪资或招聘者公开身份字段');
  const data={key,title:detail.title,city:detail.city,salary:detail.salary,company:detail.company,companyKey:detail.companyKey,companyAliases:detail.companyAliases,recruiterName:detail.recruiterName,recruiterCompany:detail.recruiterCompany,recruiterRole:detail.recruiterRole};
  const ready=await passiveBounded(chrome.tabs.sendMessage(tab.id,{command:'chatReady',...data}),TIMEOUTS.diagnosticCall,'聊天核对响应');
  if(ready?.error)throw Error(ready.error);
  const acceptedMethods=new Set(['job-link','title-company','public-fingerprint']);
  if(!ready?.ready||!acceptedMethods.has(ready.method))throw Error('当前聊天未通过可接受的公开岗位身份核对');
  const after=await passiveBounded(chrome.tabs.sendMessage(tab.id,{command:'diagnose',expectedMessage}),TIMEOUTS.diagnosticCall,'聊天诊断响应');
  const beforeFingerprint=JSON.stringify([diagnostic?.selectedJob?.controlText||[],diagnostic?.selectedConversationEntry||null]);
  const afterFingerprint=JSON.stringify([after?.selectedJob?.controlText||[],after?.selectedConversationEntry||null]);
  const headerStable=beforeFingerprint===afterFingerprint;
  if(!headerStable)throw Error('核对期间当前聊天对象发生变化');
  const fields=ready.method==='job-link'?{jobPath:true}:ready.method==='title-company'?{title:true,company:true}:{title:true,city:true,salary:true,recruiterName:true,recruiterCompany:true,recruiterRole:true};
  return {...after,jobBinding:{checked:true,matched:true,expectedJobPath:key,detailMatched:true,headerStable:true,method:ready.method,fields,editorReady:after?.counts?.['#chat-input']===1,substantiveOutgoing:after?.outgoingShape?.substantive||0},note:'只读的当前聊天公开身份绑定诊断；从精确历史岗位详情读取公开字段，并使用与发送前相同的岗位链接、标题与公司、或完整公开身份指纹规则核对当前会话。未建立沟通、未填写草稿、未发送消息，且不含 Cookie、LocalStorage、聊天正文、联系人列表或 URL 查询参数。'};
 }catch(e){
  return {...diagnostic,jobBinding:{checked:true,matched:false,expectedJobPath:key,reason:e.message},note:'只读的当前聊天公开身份绑定诊断；可能打开精确历史岗位详情进行核对。未建立沟通、未填写草稿或发送消息，且不含 Cookie、LocalStorage、聊天正文、联系人列表或 URL 查询参数。'};
 }finally{
  if(created&&detailTabId!==null){try{await chrome.tabs.remove(detailTabId);}catch{}}
  try{await chrome.tabs.update(tab.id,{active:true});}catch{}
 }
}
async function verifyExistingChat(tab){
 const key=BossCore.key(tab.url||tab.pendingUrl||'');if(!key)throw Error('请在已建立沟通的精确岗位详情页运行验证');
 if(activeRun)throw Error('已有任务或验证正在运行');
 const run={id:`verify-${crypto.randomUUID()}`,running:true,dry:true,verifyOnly:true,tab:tab.id,pending:null,currentJob:{key,title:null},lastSafety:null,lastSafetyCandidate:null,phase:'verify-preflight',phaseStarted:Date.now()};ensureCancellation(run);activeRun=run;
 try{
  await status('正在核对受保护记录和岗位详情；不会点击沟通或发送',true,run);
  const record=(await bounded(run,records(),TIMEOUTS.diagnosticCall,'VERIFY_PREFLIGHT_TIMEOUT','受保护记录读取'))[key];if(!record||!['unknown','reserved'].includes(record.status))throw Error('当前岗位没有受保护的 unknown/reserved 记录，不能运行已建立会话验证');
  const detail=await call(run,'detail',{},TIMEOUTS.diagnosticCall);if(detail?.error)throw Error(detail.error);run.currentJob.title=detail.title;
  const matched=BossCore.key(detail.url)===key&&BossCore.norm(detail.title)===BossCore.norm(record.title)&&detail.city===record.city&&detail.companyKey===BossCore.companyKey(record.company);
  if(!matched)throw Error('当前详情的岗位、城市或公司与受保护记录不一致');
  if(!detail.talked)throw Error('当前岗位未显示已沟通；验证不会点击“立即沟通”');
  if(!directedChatUrl(detail))throw Error('当前岗位没有包含明确岗位定向字段的官方聊天地址');
  if(!detail.salary||!detail.recruiterName||!detail.recruiterCompany||!detail.recruiterRole)throw Error('岗位详情缺少完整公开身份字段，不能验证聊天对象');
  await enterDirectedChat(run,detail);
  await phase(run,'verify-existing-chat','只读核对已建立会话：不会点击沟通或发送');
  const data={key,title:detail.title,city:detail.city,salary:detail.salary,company:detail.company,companyKey:detail.companyKey,companyAliases:detail.companyAliases,recruiterName:detail.recruiterName,recruiterCompany:detail.recruiterCompany,recruiterRole:detail.recruiterRole};
  const ready=await read(run,'chatReady',data);const chat=await call(run,'diagnose',{},TIMEOUTS.diagnosticCall);
  if(chat?.error)throw Error(chat.error);
  const diagnostic={version:'0.1.10',pagePath:run.currentPath,verification:{checked:true,matched:true,expectedJobPath:key,method:ready.method,navigation:run.navigation,editorReady:chat?.counts?.['#chat-input']===1,substantiveOutgoing:chat?.outgoingShape?.substantive||0,openCommands:0,sendCommands:0,recordStatusUnchanged:record.status},communicationTarget:detail.communicationTarget,note:'已建立会话的定向导航与公开身份只读验证；仅适用于当前详情与本地未确认记录精确匹配且页面已显示继续沟通的岗位。没有点击立即沟通、没有填写草稿、没有发送消息、没有修改历史记录；不含聊天地址参数值、Cookie、LocalStorage、聊天正文或联系人列表。'};
  await chrome.storage.local.set({lastVerification:{time:new Date().toISOString(),ok:true,...diagnostic}});
  if(activeRun===run)await status(`只读验证通过：已定向并核对 ${detail.title}\n没有建立新沟通或发送消息；${record.status} 记录保持不变。`,false,run);
  return diagnostic;
 }catch(e){
  const originalStopped=e.code==='STOPPED'||!run.running;cancel(run);cancelContent(run);
  const diagnostic=runDiagnostic(run,{errorCode:e.code||'VERIFY_FAILED',errorDetails:e.details||null,stopped:originalStopped});
  await chrome.storage.local.set({lastVerification:{time:new Date().toISOString(),ok:false,reason:e.message,diagnostic,note:'已建立会话只读验证失败；没有调用 open/send，历史 records 未修改。'}});
  if(activeRun===run)await status(`只读验证停止：${e.message}\n没有建立新沟通或发送消息；历史记录未修改。`,false,run);
  const error=failure(e.code||'VERIFY_FAILED',e.message,{diagnostic});throw error;
 }finally{run.running=false;if(activeRun===run)activeRun=null;}
}
async function execute(run){
 try{
  const c=run.config, queue=[], seen=new Set();let preview=[];run.startedAt=Date.now();await chrome.storage.local.set({preview});
  const prior=await records();
  scanLoop:for(const keyword of c.keywords){for(const city of Object.keys(BossCore.CITIES)){
   await check(run);run.phase='scan';run.phaseStarted=Date.now();await status(`查找：${city} / ${keyword}\n${run.dry?'预览，不发消息':'正在准备投递队列'}`,true,run);
   const url=new URL('https://www.zhipin.com/web/geek/jobs');url.searchParams.set('query',keyword);url.searchParams.set('city',BossCore.CITIES[city]);
   let out;
   try{
    await scanPage(run,url.href);
    out=await read(run,'scan',{city});
   }catch(e){
    if(!canContinueWithPartialScan(run,e,queue))throw e;
    run.scanPartial={errorCode:e.code,skippedCity:city,skippedKeyword:keyword,availableCandidates:queue.length};
    await log(`${city} / ${keyword}：列表读取失败（${e.code}），停止后续预扫描；使用此前 ${queue.length} 个已解析候选继续逐个详情核验`);
    await status(`部分列表未读取：${city} / ${keyword}\n将使用此前 ${queue.length} 个候选继续；仍会逐个核对详情、身份和发送回执`,true,run);
    break scanLoop;
   }
   for(const job of out.jobs){const key=BossCore.key(job.url);if(key&&!seen.has(key)&&!prior[key]){seen.add(key);queue.push({...job,key,searchCity:city});}}
   await log(`${city} / ${keyword}：读取 ${out.jobs.length} 条，累计候选 ${queue.length}`);await wait(run,1500);
  }}
  let processed=0, sent=0, attempted=0;const cityCounts={上海:0,深圳:0,珠海:0,杭州:0};const thisBatch=[];
  while(queue.length && (run.dry?processed<c.limit:attempted<c.limit)){
   await check(run);
   queue.sort((a,b)=>{const rank=j=>j.city==='杭州'?(BossCore.hzAllowed(thisBatch,c.hangzhouPercent)?-1:100000):(cityCounts[j.city]||0);return rank(a)-rank(b);});
   const candidate=queue.shift();
   run.currentJob={key:candidate.key,title:candidate.title};
   if(candidate.city==='杭州'&&!BossCore.hzAllowed(thisBatch,c.hangzhouPercent)){await log('杭州：本批比例不足，跳过剩余杭州候选');continue;}
   if((await records())[candidate.key])continue;
   run.phase='detail';run.phaseStarted=Date.now();await status(`${run.dry?'预览':'筛选'}：${candidate.title}（${candidate.city}）\n本批页面确认已发 ${sent}，已尝试 ${attempted}/${c.limit}`,true,run);
   await page(run,candidate.url);const job=await read(run,'detail');
   if(BossCore.key(job.url)!==candidate.key)throw Error('岗位详情跳转不一致，已停止');
   run.currentJob={key:candidate.key,title:job.title||candidate.title};
   if(job.city!==candidate.city){await log(`跳过 ${candidate.title}：详情城市不一致或无法确认`);run.currentJob=null;continue;}
   const decision=BossCore.fit(job.title,job.jd);
   if(!decision.ok||job.talked){await log(`跳过 ${job.title}：${job.talked?'已沟通过':decision.reason}`);run.currentJob=null;continue;}
   if(!job.company||!job.companyKey)throw Error(job.companyIssue||'公司名称缺失，无法核对收件人，已停止');
   processed++;preview.push({...candidate,title:job.title,company:job.company,reason:decision.reason});await chrome.storage.local.set({preview});
   if(run.dry){cityCounts[job.city]++;thisBatch.push({city:job.city,status:'reserved'});await log(`符合：${job.city} / ${job.title} / ${job.company}`);continue;}
   if(!job.salary||!job.recruiterName||!job.recruiterCompany||!job.recruiterRole)throw Error('岗位详情缺少薪资或招聘者公开身份字段，无法安全核对聊天对象，已停止');
   if(!validUrl(job.chatUrl,'/web/geek/chat'))throw Error('未识别该岗位的官方聊天链接，已停止');
   if(!directedChatUrl(job))throw failure('CHAT_TARGET_UNSAFE','岗位按钮只提供通用聊天地址或含义不足的参数，无法确认它能定向到当前岗位/招聘者。未点击“立即沟通”，未发送消息',{communicationTarget:job.communicationTarget||null});
   // Persist BEFORE any external effect. Unknown/reserved attempts are never retried automatically.
   await put(candidate.key,{status:'reserved',runId:run.id,city:job.city,title:job.title,company:job.company,url:candidate.url,communicationTarget:job.communicationTarget});
   run.pending={key:candidate.key,title:job.title,company:job.company};attempted++;cityCounts[job.city]++;thisBatch.push({city:job.city,status:'reserved'});
   await check(run);
   await phase(run,'open-conversation',`正在为该岗位建立一次沟通：${job.title}\n此动作只调用一次，结果不明不会重试`);
   try{const opened=await call(run,'open',{key:candidate.key,runId:run.id,expiresAt:Date.now()+3500},TIMEOUTS.openCall);if(opened?.error)throw Error(opened.error);}catch(e){
    // A navigation can close the message port. Other errors are fatal.
    if(!/message port closed|channel closed|frame was removed|port is disconnected/i.test(e.message))throw e;
   }
   const sendData={key:candidate.key,runId:run.id,title:job.title,city:job.city,salary:job.salary,company:job.company,companyKey:job.companyKey,companyAliases:job.companyAliases,recruiterName:job.recruiterName,recruiterCompany:job.recruiterCompany,recruiterRole:job.recruiterRole,message:c.message,allowConversationSelection:false};
   // If the site's own click leaves the dedicated task tab on the detail page,
   // use the button's pre-validated directed URL once in that same tab. Never
   // pick an older generic chat tab, where another recruiter may be selected.
   await enterDirectedChat(run,job);
   // A full directed reload can render a selected-looking header/editor before
   // the site's public conversation click has initialized its send state. For
   // that fallback only, click one exact recruiter tuple once, then re-run all
   // existing job/recipient checks. Native site navigation needs no extra click.
   sendData.allowConversationSelection=run.navigation?.method==='official-directed-url';
   await phase(run,'chat-readiness','正在核对该岗位聊天对象和输入区域；不会发送到未核对对象');
   await read(run,'chatReady',sendData);
   await phase(run,'send-once',`聊天对象已核对；正在执行一次原话术发送：${job.title}`);
   const result=await sendOnce(run,sendData);
   if(result.status==='sent'){await put(candidate.key,{status:'sent',receipt:result.receipt,confirmation:'fresh-connected-bubble+cleared-editor+explicit-public-receipt'});sent++;await log(`页面确认${result.receipt==='read'?'已读':'送达'}：${job.city} / ${job.title}`);}
   else if(result.status==='existing'){await put(candidate.key,{status:'existing',reason:'会话中已经存在完整的当前原话术，未重复发送'});await log(`未重复：${job.title}，会话中已存在完整原话术`);}
   else if(result.status==='existing-other'){await put(candidate.key,{status:'existing',reason:'会话中已有其他我方消息，未追加原话术'});await log(`未追加：${job.title}，会话中已有其他我方消息`);}
   else{await put(candidate.key,{status:'unknown',reason:result.reason||'发送回执不明'});throw Error(result.reason||'发送回执不明，已停止且不会自动重发');}
   run.pending=null;run.currentJob=null;await wait(run,c.interval*1000);
  }
  await status(`${run.dry?'预览结束':'本批结束'}：筛选符合 ${processed}，页面确认已发 ${sent}，已尝试 ${attempted}。${run.scanPartial?'\n部分后续列表因纯读取失败未纳入；已使用此前候选完成本批。':''}\n详细结果可导出；页面确认不等于对方已读。`,false,run);
 }catch(e){
  const stopped=e.code==='STOPPED'||!run.running;
  // Revoke authorization before any diagnostic/storage work. This preserves the
  // original failure classification while preventing a late content response
  // from advancing into open/send during catch cleanup.
  cancel(run);cancelContent(run);
  const safetyDiagnostic=stopped?null:run.lastSafety?{version:'0.1.10',safety:run.lastSafety,candidate:run.lastSafetyCandidate||null}:await captureSafetyContext(run);
  const baseReason=stopped?'已停止：已撤销仍在等待的页面读取和后续发送授权；已经点击的“立即沟通”或发送动作无法撤回。':e.message;
  const reason=safetyDiagnostic?`${baseReason}\n已记录安全诊断：${safetyDiagnostic.safety.source} ${safetyDiagnostic.safety.pathname}；该记录不表示账号已退出。`:baseReason;
  const diagnostic=runDiagnostic(run,{errorCode:e.code||'UNCLASSIFIED',errorDetails:e.details||null,stopped});
  if(run.pending)await put(run.pending.key,{status:'unknown',reason,diagnostic,safetyDiagnostic:safetyDiagnostic||undefined});
  await chrome.storage.local.set({lastFailure:{time:new Date().toISOString(),reason,diagnostic,safetyDiagnostic:safetyDiagnostic||null,currentJob:run.currentJob||null}});
  await log(reason);if(activeRun===run)await status(reason,false,run);
 }
 finally{run.running=false;if(activeRun===run)activeRun=null;}
}
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
 if(msg.type==='authorize'){
  const r=activeRun;respond({ok:!!r&&r.running&&!r.dry&&sender.tab?.id===r.tab&&msg.runId===r.id&&msg.key===r.pending?.key});return;
 }
 if(sender.tab){respond({error:'此操作只能从扩展面板发起'});return;}
 (async()=>{
  if(msg.type==='diagnose'){
   if(activeRun)return {error:'请先停止并等待当前任务结束，再诊断'};
   const tabs=await chrome.tabs.query({active:true,currentWindow:true});const t=tabs[0];
   if(!t||!validUrl(t.url,'/'))return {error:'请切换到 BOSS 页面后再点页面诊断'};
   try{const {config=null}=await chrome.storage.local.get('config');const expectedMessage=typeof config?.message==='string'?config.message:undefined;let diagnostic=await passiveBounded(chrome.tabs.sendMessage(t.id,{command:'diagnose',expectedMessage}),TIMEOUTS.diagnosticCall,'页面诊断');if(t.url.startsWith('https://www.zhipin.com/web/geek/chat'))diagnostic=await diagnoseChatBinding(t,diagnostic,expectedMessage);const {lastFailure=null,lastVerification=null}=await chrome.storage.local.get(['lastFailure','lastVerification']);return {diagnostic:{...diagnostic,lastFailure,lastVerification}};}catch(e){return {error:`页面诊断失败：${e.message}。请刷新 BOSS 页面后重试`};}
  }
  if(msg.type==='verifyExistingChat'){
   if(activeRun)return {error:'请先停止并等待当前任务结束，再验证已建立会话'};
   const tabs=await chrome.tabs.query({active:true,currentWindow:true});const t=tabs[0];
   if(!t||!BossCore.key(t.url||t.pendingUrl||''))return {error:'请切换到受保护记录对应的岗位详情页后再验证'};
   try{const operation=verifyExistingChat(t);if(activeRun)activeRun.done=operation;return {diagnostic:await operation};}catch(e){return {error:`已建立会话验证失败：${e.message}`};}
  }
  if(msg.type==='stop'){
   const r=activeRun;
   if(!r){await status('已停止；当前没有运行中的任务。',false);return {ok:true,alreadyStopped:true};}
   cancel(r);
   // Best-effort local revocation covers a content-side authorization response
   // that was already in flight. The background cancellation remains authoritative.
   cancelContent(r);
   await status('正在停止：已撤销后续页面等待和发送授权；已点击的动作无法撤回。',false,r);
   if(r.done)try{await passiveBounded(r.done,2000,'停止清理');}catch{}
   if(activeRun===r)activeRun=null;
   await status('已停止：不会继续读取、建立沟通或发送；已点击的动作无法撤回。',false,r);
   return {ok:true};
  }
  if(msg.type==='start'){
   if(activeRun)return {error:'上一批尚未结束，请等待停止完成'};
   const c=msg.config;
   if(!c||typeof c.message!=='string'||!c.message.trim()||!Array.isArray(c.keywords)||!c.keywords.length||c.keywords.length>20||!c.keywords.every(k=>typeof k==='string'&&k.length<=80)||!Number.isInteger(c.limit)||c.limit<1||c.limit>100||!Number.isFinite(c.interval)||c.interval<5||c.interval>300)return {error:'配置不合法'};
   c.hangzhouPercent=10;await chrome.storage.local.set({config:c});
   const firstCity=Object.keys(BossCore.CITIES)[0],initialUrl=new URL('https://www.zhipin.com/web/geek/jobs');initialUrl.searchParams.set('query',c.keywords[0]);initialUrl.searchParams.set('city',BossCore.CITIES[firstCity]);
   const t=await passiveBounded(chrome.tabs.create({url:initialUrl.href,active:true}),TIMEOUTS.tabUpdate,'工作标签创建');
   const r={id:crypto.randomUUID(),running:true,config:c,dry:!!msg.dry,tab:t.id,initialScanUrl:initialUrl.href,initialScanUrlUsed:false,pending:null,currentJob:null,lastSafety:null,lastSafetyCandidate:null};activeRun=r;
   ensureCancellation(r);await status('准备中…',true,r);r.done=execute(r);return {ok:true};
  }
  return {error:'未知操作'};
 })().then(respond).catch(e=>respond({error:e.message}));return true;
});
// Worker/browser restart never silently resumes a job or a pending send.
chrome.storage.local.get('state').then(async({state})=>{if(state?.running&&!activeRun)await status('上次任务已中断，请检查记录后重新启动；未确认的消息不自动重发',false);});
