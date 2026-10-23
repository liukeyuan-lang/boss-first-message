'use strict';
(()=>{
const C=BossCore;let sending=false;const cancelledRuns=new Set(),conversationSelectionRuns=new Set();
// The receiver is installed at document_start, before the site's deferred
// scripts bind its visible SSR controls. A painted button is not interactive yet.
let documentInteractive=document.readyState!=='loading';
document.addEventListener('DOMContentLoaded',()=>{documentInteractive=true;},{once:true});
const visible=e=>{for(let node=e;node&&node.nodeType===Node.ELEMENT_NODE;node=node.parentElement){const style=getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden')return false;}return !!e&&e.getClientRects().length>0;};
const text=e=>e?.innerText?.trim()||'';
const one=s=>[...document.querySelectorAll(s)].find(visible);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const safePath=()=>location.pathname;
const blockingClass=e=>typeof e.className==='string'?e.className.split(/\s+/).filter(Boolean).slice(0,4).join(' '):'';
function safetyState(){
 const path=safePath();
 const loginRoute=/^\/(?:web\/user(?:\/|$)|web\/login(?:\/|$)|login(?:\/|$))/.test(path);
 const verificationRoute=/^\/(?:web\/)?(?:security|captcha|verify)(?:\/|$)/.test(path);
 const candidates=[...document.querySelectorAll('[role="dialog"],.dialog-container,.dialog-wrap,.verify-wrap,.captcha-container,.login-dialog,.sign-wrap,.error-page,.exception-page,.security-page')].filter(visible);
 const types=new Set();
 for(const modal of candidates){
  const value=text(modal);
  if(/验证码|滑块|安全验证|人机验证|操作频繁|异常访问/.test(value))types.add('verification-dialog');
  if(/登录|注册/.test(value))types.add('login-dialog');
  if(/今日.*上限|沟通.*上限/.test(value))types.add('platform-limit-dialog');
 }
 const verificationControl=one('iframe[src*="captcha"],iframe[src*="verify"],#nc_1_wrapper');
 if(verificationControl)types.add('verification-control');
 // Safety text is read only from purpose-built visible safety containers above,
 // never from job descriptions, chats, drafts, resumes, or hidden SPA templates.
 if(candidates.some(modal=>/访问异常|访问被拒绝|操作过于频繁|请完成安全验证|今日沟通人数已达上限/.test(text(modal))))types.add('platform-block-page');
 const errorHeadings=[...document.querySelectorAll('h1,h2,[role="alert"]')].filter(e=>visible(e)&&!e.closest('.chat-message,#chat-input,[contenteditable="true"],.job-sec-text,.job-description,.resume'));
 const errorBlocks=errorHeadings.filter(e=>/^(?:访问异常|访问被拒绝|操作过于频繁|请完成安全验证|今日沟通人数已达上限)$/.test(text(e)));
 if(errorBlocks.length)types.add('platform-block-page');
 const source=loginRoute?'login-route':verificationRoute?'verification-route':types.has('login-dialog')?'login-dialog':types.has('verification-dialog')||types.has('verification-control')?'verification-ui':types.has('platform-limit-dialog')||types.has('platform-block-page')?'platform-limit-ui':null;
 if(!source)return null;
 return {pathname:path,source,routeType:loginRoute?'login':verificationRoute?'verification':null,visibleBlockingTypes:[...types],visibleBlockingElementCount:candidates.length+(verificationControl?1:0)+errorBlocks.length,visibleBlockingClasses:[...new Set(candidates.concat(errorBlocks).map(blockingClass).filter(Boolean))].slice(0,12)};
}
function canonicalJobPath(value){try{return C.key(new URL(String(value||''),location.origin).href);}catch{return null;}}
function communicationTarget(value){
 const invalid={redirectPath:null,queryParamNames:[],genericChatPath:false,trackingParamNames:[],targetParamNames:[],targetFieldPresent:false,directionSufficient:false,issue:'没有可解析的官方聊天地址'};
 let url;try{url=new URL(String(value||''),location.origin);}catch{return invalid;}
 if(url.origin!=='https://www.zhipin.com')return {...invalid,redirectPath:url.pathname||null,issue:'聊天地址不是 BOSS 官方域名'};
 const queryParamNames=[...new Set([...url.searchParams.keys()])].sort();
 const trackingNames=new Set(['ka','from','source','src','channel','scene','traceid','sessionid']);
 const strongTargetNames=new Set(['jobid','encryptjobid','bossid','encryptbossid','recruiterid','encryptrecruiterid','userid','encryptuserid']);
 const targetLikeNames=new Set([...strongTargetNames,'id','uid','lid','securityid']);
 const trackingParamNames=queryParamNames.filter(name=>trackingNames.has(name.toLowerCase()));
 const targetParamNames=queryParamNames.filter(name=>targetLikeNames.has(name.toLowerCase()));
 const strongTargetParamNames=targetParamNames.filter(name=>strongTargetNames.has(name.toLowerCase()));
 const genericChatPath=url.pathname==='/web/geek/chat';
 const directionSufficient=genericChatPath&&strongTargetParamNames.length>0;
 return {redirectPath:url.pathname,queryParamNames,genericChatPath,trackingParamNames,targetParamNames,targetFieldPresent:targetParamNames.length>0,strongTargetParamNames,directionSufficient,issue:!genericChatPath?'聊天地址路径不是标准聊天页':directionSufficient?null:targetParamNames.length?'只有含义不够明确的可能定向字段，不能据此自动定位收件人':'只有通用聊天路径或追踪字段，不能据此自动定位收件人'};
}
function safetyDiagnostic(m={}){
 const safety=safetyState();
 return {version:'0.1.10',safety:safety||{pathname:safePath(),source:null,routeType:null,visibleBlockingTypes:[],visibleBlockingElementCount:0,visibleBlockingClasses:[]},candidate:m?.candidate?{jobPath:canonicalJobPath(m.candidate.jobPath),title:String(m.candidate.title||'').slice(0,160)}:null,note:'只读安全诊断：仅保存路径（不含查询参数或片段）、路由/可见阻断类型、可见元素计数和 CSS 类名；不读取输入框、账号、密码、验证码、Cookie、LocalStorage 或聊天内容。没有点击或发送。'};
}
function guard(){
 const safety=safetyState();if(!safety)return;
 const label=safety.source==='login-route'?'检测到登录页路由':safety.source==='verification-route'?'检测到安全验证路由':safety.source==='login-dialog'?'检测到可见登录弹窗':safety.source==='verification-ui'?'检测到可见验证控件或弹窗':'检测到可见平台限制';
 const error=Error(`${label}（${safety.pathname}），已停止。该记录不表示账号已退出；可在页面诊断中导出最小只读上下文。`);error.safety=safety;throw error;
}
function fresh(m){if(Number.isFinite(m.expiresAt)&&Date.now()>=m.expiresAt)throw Error('命令已过期，已停止且不会执行迟到动作');}
async function allowed(m){guard();fresh(m);if(cancelledRuns.has(m.runId))throw Error('任务已停止或当前会话未获授权');const a=await chrome.runtime.sendMessage({type:'authorize',key:m.key,runId:m.runId});fresh(m);if(cancelledRuns.has(m.runId)||!a?.ok)throw Error('任务已停止或当前会话未获授权');}
function cancelRun(m){if(typeof m.runId==='string'){cancelledRuns.add(m.runId);conversationSelectionRuns.delete(m.runId);while(cancelledRuns.size>50)cancelledRuns.delete(cancelledRuns.values().next().value);}return {ok:true};}
function outgoing(){return [...document.querySelectorAll('.chat-message .item-myself')].filter(visible);}
function outgoingBody(bubble){return bubble?.querySelector('.message-content')||null;}
const RECEIPT_CLASS=/(?:^|\s)(?:message-status|status-(?:delivery|read|unread|sending|fail|error)|send-(?:success|fail|error)|retry)(?:\s|$)/;
const allowedReceiptLabel=value=>/^(?:送达|已送达|已读|未读|发送中|发送失败|重试|delivered|read|unread|sending|failed|retry)$/i.test(String(value||'').trim());
function isReceiptNode(node){
 const cls=typeof node?.className==='string'?node.className:'';
 return RECEIPT_CLASS.test(cls)||['aria-label','title','data-status'].some(attribute=>allowedReceiptLabel(node?.getAttribute?.(attribute)));
}
function receiptNodesWithin(root){return root?[...root.querySelectorAll('*')].filter(isReceiptNode):[];}
function bodyTextWithoutReceiptNodes(bubble){
 const body=outgoingBody(bubble);if(!body)return '';
 const clone=body.cloneNode(true);receiptNodesWithin(clone).forEach(node=>node.remove());
 return clone.innerText?.trim()||clone.textContent?.trim()||'';
}
const isFormatCharacter=value=>typeof value==='string'&&/^\p{Cf}$/u.test(value);
const codePointLabel=value=>typeof value==='string'&&value?`U+${value.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')}`:null;
function formatCharacterCounts(value){
 const counts=new Map();
 for(const character of String(value||'')){if(isFormatCharacter(character))counts.set(codePointLabel(character),(counts.get(codePointLabel(character))||0)+1);}
 return [...counts].slice(0,4).map(([codePoint,count])=>({codePoint,count}));
}
function withoutFormatCharacters(value){return C.norm(value).replace(/\p{Cf}/gu,'');}
function firstNormalizedDifference(actual,expected){
 const left=[...C.norm(actual)],right=[...C.norm(expected)],length=Math.max(left.length,right.length);
 for(let index=0;index<length;index++){
  if(left[index]===right[index])continue;
  return {index,actualCodePoint:codePointLabel(left[index]),expectedCodePoint:codePointLabel(right[index]),actualIsFormatCharacter:isFormatCharacter(left[index]),expectedIsFormatCharacter:isFormatCharacter(right[index])};
 }
 return null;
}
function outgoingMessage(message){
 const expected=C.norm(message);
 return outgoing().find(e=>{
  // BOSS may render one sent message as several sibling `.text` nodes (for
  // example, prose plus a linked URL). The whole message-content container is
  // the public body of that single bubble. Matching only its first `.text`
  // node makes a successfully delivered multi-part message look unknown.
  const body=outgoingBody(e);
  return body&&C.norm(bodyTextWithoutReceiptNodes(e))===expected;
 });
}
function failedOutgoing(bubble){return !!bubble?.querySelector('.send-fail,.send-error,.retry,.error,.status-fail,.status-error');}
function outgoingReceipt(bubble){
 if(!bubble?.isConnected||!visible(bubble))return null;
 const classes=[...bubble.querySelectorAll('*')].map(e=>typeof e.className==='string'?e.className:'');
 if(classes.some(value=>/(?:^|\s)status-read(?:\s|$)/.test(value)))return 'read';
 if(classes.some(value=>/(?:^|\s)status-delivery(?:\s|$)/.test(value)))return 'delivered';
 const labels=[bubble,...bubble.querySelectorAll('[aria-label],[title],[data-status]')].flatMap(e=>[e.getAttribute?.('aria-label'),e.getAttribute?.('title'),e.getAttribute?.('data-status')]).filter(Boolean).map(value=>String(value).trim());
 const leaves=[...bubble.querySelectorAll('*')].filter(e=>!e.children.length).map(text);
 if(labels.concat(leaves).some(value=>/^(?:已读|read)$/i.test(value)))return 'read';
 if(labels.concat(leaves).some(value=>/^(?:送达|已送达|delivered)$/i.test(value)))return 'delivered';
 return null;
}
function genuineOutgoing(){
 return outgoing().filter(e=>{
  // The observed BOSS competition-analysis card is rendered on the "my" side
  // but is not a sent message. Unknown empty nodes, images, files and other rich
  // content remain genuine so they still block an automatic first-message append.
  const knownSystem=!e.querySelector('.message-content')&&/你与该职位竞争者PK情况/.test(text(e));
  return !knownSystem;
 });
}
const CARD_SELECTOR='.job-card-box,.job-card-wrapper,.job-card-item';
const COMPANY_SELECTORS=[
 '.sider-company .company-info a',
 '.sider-company .company-info h3',
 '.sider-company .company-info .name',
 '.sider-company .company-name',
 '.job-sider .company-info .company-name',
 '.job-detail-company .company-name',
 '[ka="job-detail-company_custompage"]',
 '[ka="job-detail-company"]'
].join(',');
function locationCity(card){
 // Current BOSS list cards put the city in this footer element. Keep the older
 // location fields for compatible markup and require one unambiguous target city.
 const area=card.querySelector('.job-area,.job-area-wrapper,.job-info .area,.job-location,.job-address,.job-card-footer .area,.job-card-footer .company-location');
 const known=C.cityOf(text(area));if(known)return known;
 // A company name such as “上海某科技” is not evidence of the job's city.
 const locationTexts=[text(card),...[...card.querySelectorAll('*')].filter(e=>!e.children.length&&visible(e)).map(text)];
 const matches=locationTexts.flatMap(t=>[...t.matchAll(/(?:^|[\n\r\t ])(上海|深圳|珠海|杭州)(?=[·・•\s]|$)/g)].map(m=>m[1]));
 const unique=[...new Set(matches)];return unique.length===1?unique[0]:null;
}
function cardSummary(cards){
 const cities={};let noLink=0,noCity=0;
 for(const card of cards){
  const candidates=[card,...card.querySelectorAll('a[href]')];
  if(!candidates.some(e=>e instanceof HTMLAnchorElement&&C.key(e.href))){noLink++;continue;}
  const city=locationCity(card);if(city)cities[city]=(cities[city]||0)+1;else noCity++;
 }
 return {cards:cards.length,withDetailLink:cards.length-noLink,missingDetailLink:noLink,missingCity:noCity,cities};
}
function scan(m){
 guard();const cards=[...document.querySelectorAll(CARD_SELECTOR)].filter(visible);
 if(!cards.length){if(/暂无相关职位|没有找到相关职位|暂无职位/.test(text(document.body)))return {jobs:[]};return {wait:true,scanState:{kind:'empty-shell',cards:0},reason:'没有识别到岗位卡片。请在此列表页点“页面诊断”，将文件发给我适配'};}
 const jobs=[],stats={cards:cards.length,noLink:0,noCity:0,otherCity:0};
 for(const card of cards){
  // The card may itself be the anchor; querySelector does not include self.
  const candidates=[card,...card.querySelectorAll('a[href]')];
  const a=candidates.find(e=>e instanceof HTMLAnchorElement&&C.key(e.href));
  if(!a){stats.noLink++;continue;}
  const title=text(card.querySelector('.job-name,.job-title,.job-title-text'))||text(a);
  const city=locationCity(card);if(!city){stats.noCity++;continue;}if(city!==m.city){stats.otherCity++;continue;}
  jobs.push({title,city,url:a.href});
 }
 if(!jobs.length){
  // An all-other-city page is a search-state mismatch, never a reason to loosen the filter.
  const kind=stats.otherCity===stats.cards&&stats.noLink===0&&stats.noCity===0?'all-other-city':'unusable-cards';
  return {wait:true,scanState:{kind,...stats},reason:`识别到 ${stats.cards} 张卡片；缺详情链接 ${stats.noLink}，缺城市 ${stats.noCity}，其他城市 ${stats.otherCity}。请点“页面诊断”导出；未发送消息`};
 }
 return {jobs,stats};
}
function cleanCompany(value){
 const name=String(value||'').replace(/\s+/g,' ').trim().replace(/^公司名称\s*(?:[:：]\s*)?/,'').trim();
 if(!name||name.length>100||/^(公司基本信息|公司介绍|工商信息|公司名称|查看全部|暂无)$/.test(name))return null;
 return C.companyKey(name)?name:null;
}
function jsonLdCompanies(){
 const names=[];
 for(const script of document.querySelectorAll('script[type="application/ld+json"]')){
  let root;try{root=JSON.parse(script.textContent);}catch{continue;}
  const visit=value=>{
   if(Array.isArray(value)){value.forEach(visit);return;}
   if(!value||typeof value!=='object')return;
   const types=[value['@type']].flat();
   if(types.includes('JobPosting')){
    const org=value.hiringOrganization;
    if(Array.isArray(org))org.forEach(x=>names.push(cleanCompany(x?.name)));
    else names.push(cleanCompany(org?.name));
   }
   if(Array.isArray(value['@graph']))value['@graph'].forEach(visit);
  };
  visit(root);
 }
 return names.filter(Boolean);
}
function labelledCompanies(){
 const names=[];
 for(const label of document.querySelectorAll('dt,th,label,span,p,div')){
  if(label.children.length||text(label)!=='公司名称'||!visible(label))continue;
  const value=label.nextElementSibling;
  if(value&&visible(value))names.push(cleanCompany(text(value)));
 }
 return names.filter(Boolean);
}
function titleCompany(){
 const match=document.title.match(/[_｜|]\s*([^_｜|]+?)招聘(?:\s*[-_｜|].*)?$/);
 return cleanCompany(match?.[1]);
}
function uniqueCompanies(values){
 const byKey=new Map();
 for(const value of values){const name=cleanCompany(value);const key=C.companyKey(name);if(key&&!byKey.has(key))byKey.set(key,name);}
 return byKey;
}
function companyContainer(el){
 const root=el?.closest('.sider-company,.job-detail-company,.company-info');
 if(!root)return null;
 const classes=typeof root.className==='string'?root.className.trim().split(/\s+/).filter(Boolean).slice(0,3):[];
 return `${root.tagName.toLowerCase()}${classes.map(name=>'.'+name).join('')}`;
}
function companyHrefPath(el){
 if(!(el instanceof HTMLAnchorElement)||!el.href)return null;
 try{const url=new URL(el.href,location.origin);return url.origin==='https://www.zhipin.com'?url.pathname:null;}catch{return null;}
}
function primaryCompanyLinks(){
 const links=[];
 for(const el of document.querySelectorAll('.sider-company .company-info a,.sider-company .company-info h3,.sider-company .company-info .name,[ka="job-detail-company_custompage"],[ka="job-detail-company"]')){
  if(!visible(el))continue;
  const name=cleanCompany(text(el));const hrefPath=companyHrefPath(el);
  // A logo has no public company-name text and is not identity evidence. A
  // visible name without a company href remains conflict evidence, but cannot
  // establish the brand-to-legal alias relation below.
  if(name)links.push({name,key:C.companyKey(name),source:'primary-company-link',container:companyContainer(el),hrefPath});
 }
 return links;
}
function registeredCompanyNames(){
 const names=[];
 for(const el of document.querySelectorAll('.job-detail-company .company-name')){
  if(!visible(el))continue;
  const name=cleanCompany(text(el));
  if(name)names.push({name,key:C.companyKey(name),source:'registered-company-name',container:companyContainer(el),hrefPath:null});
 }
 return names;
}
function evidenceMap(records){return uniqueCompanies(records.map(record=>record.name));}
function companyConflict(candidates,issue,evidence=[]){return {company:null,companyCandidates:[...new Set(candidates)],companyIssue:issue,companyEvidence:evidence};}
function companyIdentity(){
 // Only read the detail page's primary company card and its registered-name
 // field. Do not aggregate generic company-looking nodes from recommendations.
 const links=primaryCompanyLinks(),registered=registeredCompanyNames();
 const brands=evidenceMap(links),legalNames=evidenceMap(registered);
 const structured=uniqueCompanies(jsonLdCompanies());
 const evidence=[...links,...registered,...jsonLdCompanies().map(name=>({name,key:C.companyKey(name),source:'structured-data',container:null,hrefPath:null}))];
 const candidates=[...brands.values(),...legalNames.values(),...structured.values()];
 if(structured.size>1)return companyConflict(candidates,'岗位结构化数据出现多个不一致的公司名称，无法核对收件人，已停止',evidence);
 if(brands.size>1||legalNames.size>1)return companyConflict(candidates,'页面主公司模块出现多个不一致的公司名称，无法核对收件人，已停止',evidence);
 const brand=[...brands.entries()][0],legal=[...legalNames.entries()][0],structuredEntry=[...structured.entries()][0];
 const title=titleCompany(),titleKey=C.companyKey(title);
 if(brand&&legal&&brand[0]!==legal[0]){
  const linkPaths=[...new Set(links.map(record=>record.hrefPath).filter(Boolean))];
  // A brand and a legal name are aliases only when the title, the named company
  // card and one public company target all identify the same primary employer.
  // This is deliberately not a suffix or substring rule.
  const brandRecords=links.filter(record=>record.key===brand[0]);
  const bound=titleKey===brand[0]&&linkPaths.length===1&&linkPaths[0].startsWith('/gongsi/')&&brandRecords.length>0&&brandRecords.every(record=>record.hrefPath===linkPaths[0])&&(!structuredEntry||structuredEntry[0]===legal[0]||structuredEntry[0]===brand[0]);
  if(!bound)return companyConflict(candidates,'页面公司名称关系无法由主公司模块核对，已停止',evidence);
  const aliases=[brand[1],legal[1],...(structuredEntry?[structuredEntry[1]]:[])];
  return {company:brand[1],companyKey:brand[0],companyAliases:[...new Set(aliases)],companyCandidates:[...new Set(aliases)],companySource:'primary-company-link+registered-name',companyAliasReason:'标题、主公司链接和工商公司名称已公开关联',companyEvidence:evidence};
 }
 const selected=brand||legal||structuredEntry;
 if(!selected){
  const fromTitle=uniqueCompanies([title]);
  if(fromTitle.size!==1)return companyConflict([],'公司名称缺失，无法核对收件人，已停止',evidence);
  const [key,company]=[...fromTitle.entries()][0];
  return {company,companyKey:key,companyAliases:[company],companyCandidates:[company],companySource:'page-title',companyEvidence:evidence};
 }
 if(structuredEntry&&structuredEntry[0]!==selected[0])return companyConflict(candidates,'页面公司名称与岗位结构化数据不一致，无法核对收件人，已停止',evidence);
 const aliases=[...new Set(evidence.filter(record=>record.key===selected[0]).map(record=>record.name))];
 return {company:selected[1],companyKey:selected[0],companyAliases:[...new Set(aliases)],companyCandidates:[...new Set(aliases)],companySource:brand?'primary-company-link':legal?'registered-company-name':'structured-data',companyEvidence:evidence};
}
function diagnose(m={}){
 const safety=safetyState();if(safety)return safetyDiagnostic();
 if(location.pathname.startsWith('/web/geek/chat'))return diagnoseChat(m);
 if(!/^\/(?:web\/geek\/jobs?|job_detail)(?:\/|$)/.test(location.pathname))throw Error('请在岗位列表、详情或聊天页诊断');
 const selectors=[CARD_SELECTOR,'.job-name','.job-area','.job-area-wrapper','.job-location','.job-address','.company-location','.job-sec-text','.btn-startchat'];
 const allCards=[...document.querySelectorAll(CARD_SELECTOR)].filter(visible);
 // Keep the structural sample small and privacy-safe, but count the whole list.
 const cards=allCards.slice(0,3);
 const candidates=cards.length?cards:[...document.querySelectorAll('[class*="job"][class*="card"]')].filter(visible).slice(0,3);
 function tree(e,depth=0,budget={n:0}){
  if(!visible(e)||depth>5||budget.n++>100||/^(SCRIPT|STYLE|INPUT|TEXTAREA|IFRAME)$/.test(e.tagName))return null;
  const out={tag:e.tagName,class:typeof e.className==='string'?e.className:'',role:e.getAttribute('role')||undefined};
  if(e instanceof HTMLAnchorElement){try{const u=new URL(e.href);if(u.origin==='https://www.zhipin.com')out.hrefPath=u.pathname;}catch{}}
  if(!e.children.length)out.text=text(e).slice(0,80);
  out.children=[...e.children].map(c=>tree(c,depth+1,budget)).filter(Boolean);return out;
 }
 const identity=location.pathname.startsWith('/job_detail/')?companyIdentity():null;
 function publicDetailTree(e,depth=0,budget={n:0}){
  if(!e||!visible(e)||depth>6||budget.n++>100||/^(SCRIPT|STYLE|INPUT|TEXTAREA|IFRAME)$/.test(e.tagName))return null;
  const out={tag:e.tagName,class:typeof e.className==='string'?e.className:'',ka:e.getAttribute('ka')||undefined};if(!e.children.length)out.text=text(e).slice(0,120);
  out.children=[...e.children].map(child=>publicDetailTree(child,depth+1,budget)).filter(Boolean);return out;
 }
 const bossRoot=location.pathname.startsWith('/job_detail/')?one('.job-boss-info,.job-detail-boss,.job-boss-container'):null;
 const salary=location.pathname.startsWith('/job_detail/')?text(one('.job-banner .salary,.job-primary .salary,.job-banner .job-salary,.job-primary .job-salary'))||null:undefined;
 const startChat=location.pathname.startsWith('/job_detail/')?one('.btn-startchat'):null;
 const target=location.pathname.startsWith('/job_detail/')?communicationTarget(startChat?.getAttribute('redirect-url')):undefined;
 const companySelectorCounts=location.pathname.startsWith('/job_detail/')?Object.fromEntries(COMPANY_SELECTORS.split(',').map(x=>[x,document.querySelectorAll(x).length])):undefined;
 return {version:'0.1.10',pagePath:location.pathname,counts:Object.fromEntries(selectors.map(x=>[x,document.querySelectorAll(x).length])),scan:cardSummary(allCards),companySelectorCounts,cards:candidates.map(e=>({city:locationCity(e),structure:tree(e)})),company:identity?{name:identity.company||null,candidates:identity.companyCandidates||[],source:identity.companySource||null,aliasReason:identity.companyAliasReason||null,issue:identity.companyIssue||null,evidence:identity.companyEvidence||[]}:undefined,jobPublic:bossRoot?{salary,recruiterStructure:publicDetailTree(bossRoot),communicationTarget:target}:undefined,note:'只读的岗位卡片与公司及招聘者公开字段识别结果，不含 Cookie、LocalStorage、密码、聊天记录或 URL 查询参数。聊天地址只输出路径和参数名分类，不输出参数值或完整查询串；公司证据只含公开名称、来源容器和公司链接路径。没有点击或发送。'};
}

function diagnoseChat(m={}){
 const selectors=['#chat-input','.btn-send','.chat-message','.chat-message .item-myself','[ka="geek_chat_job_detail"]','a[href*="/job_detail/"]'];
 const attr=e=>e?{
  tag:e.tagName,
  id:e.id||undefined,
  class:typeof e.className==='string'?e.className||undefined:undefined,
  ka:e.getAttribute('ka')||undefined,
  role:e.getAttribute('role')||undefined,
  contenteditable:e.getAttribute('contenteditable')||undefined,
  disabled:'disabled' in e?!!e.disabled:undefined,
  ariaDisabled:e.getAttribute('aria-disabled')||undefined
 }:null;
 function shell(e){
  if(!e)return null;const ancestors=[];let p=e;
  for(let n=0;p&&n<4;n++,p=p.parentElement)ancestors.push(attr(p));
  return {node:attr(e),ancestors};
 }
 const header=[...document.querySelectorAll('[ka="geek_chat_job_detail"]')].filter(visible);
 const headerRoots=[...new Set(header.flatMap(e=>[e,e.parentElement]).filter(Boolean))];
 const jobLinks=[...new Set(headerRoots.flatMap(root=>[...root.querySelectorAll('a[href*="/job_detail/"]')]).map(a=>C.key(a.href)).filter(Boolean))];
 const exactHeaderText=[...new Set(header.map(text).filter(Boolean).map(x=>x.slice(0,160)))];
 const input=one('#chat-input'),sendButton=one('.btn-send');
 const outgoingNodes=[...document.querySelectorAll('.chat-message .item-myself')].filter(visible);
 const receiptShape=outgoingNodes.map(node=>{
  const statusNodes=receiptNodesWithin(node);
  const labels=statusNodes.flatMap(e=>['aria-label','title','data-status'].map(attr=>({attr,value:e.getAttribute(attr)}))).filter(item=>allowedReceiptLabel(item.value));
  const body=outgoingBody(node);
  const bodyReceiptNodes=receiptNodesWithin(body);
  const segments=body?[...body.querySelectorAll('.text')].filter(visible):[];
  const expectedNorm=typeof m.expectedMessage==='string'?C.norm(m.expectedMessage):null;
  const rawBodyText=body?text(body):'';
  const bodyText=body?bodyTextWithoutReceiptNodes(node):'';
  const bodyNorm=C.norm(bodyText);
  const rawBodyNorm=C.norm(rawBodyText);
  const joinedSegmentsNorm=C.norm(segments.map(text).join(''));
  return {
   connected:node.isConnected,
   exactExpectedMessage:expectedNorm!==null&&!!body&&bodyNorm===expectedNorm,
   rawExactExpectedMessage:expectedNorm!==null&&!!body&&rawBodyNorm===expectedNorm,
   exactAfterRemovingReceiptNodes:expectedNorm!==null&&!!body&&bodyNorm===expectedNorm,
   hasMessageContent:!!body,
   hasTextNode:segments.length>0,
   textSegmentCount:segments.length,
   textSegmentNormalizedLengths:segments.slice(0,20).map(segment=>C.norm(text(segment)).length),
   rawMessageContentNormalizedLength:rawBodyNorm.length,
   messageContentNormalizedLength:bodyNorm.length,
   expectedMessageNormalizedLength:expectedNorm?.length,
   joinedSegmentsExactExpectedMessage:expectedNorm!==null&&segments.length>0&&joinedSegmentsNorm===expectedNorm,
   receiptNodeCountWithinMessageContent:bodyReceiptNodes.length,
   receiptNodesWithinMessageContent:bodyReceiptNodes.length>0,
   actualFormatCharacterCounts:formatCharacterCounts(bodyText),
   expectedFormatCharacterCounts:typeof m.expectedMessage==='string'?formatCharacterCounts(m.expectedMessage):[],
   exactAfterRemovingFormatCharacters:typeof m.expectedMessage==='string'&&!!body&&withoutFormatCharacters(bodyText)===withoutFormatCharacters(m.expectedMessage),
   rawFirstNormalizedDifference:typeof m.expectedMessage==='string'&&!!body?firstNormalizedDifference(rawBodyText,m.expectedMessage):null,
   firstNormalizedDifference:typeof m.expectedMessage==='string'&&!!body?firstNormalizedDifference(bodyText,m.expectedMessage):null,
   receipt:outgoingReceipt(node),failed:failedOutgoing(node),statusClasses:[...new Set(statusNodes.map(e=>typeof e.className==='string'?e.className:'').filter(Boolean))].slice(0,12),labels:labels.slice(0,12)
  };
 });
 function publicTree(e,depth=0,budget={n:0}){
  if(!e||!visible(e)||depth>6||budget.n++>120||/^(SCRIPT|STYLE|INPUT|TEXTAREA|IFRAME)$/.test(e.tagName))return null;
  const out=attr(e);if(!e.children.length)out.text=text(e).slice(0,120);
  out.children=[...e.children].map(child=>publicTree(child,depth+1,budget)).filter(Boolean);return out;
 }
 const selectedTop=header.length===1?header[0].closest('.top-info-content'):null;
 const selectedEntry=one('.friend-content.selected');
 function selectedEntryTree(e,depth=0,budget={n:0}){
  if(!e||!visible(e)||depth>6||budget.n++>100||/^(SCRIPT|STYLE|INPUT|TEXTAREA|IFRAME)$/.test(e.tagName))return null;
  const cls=typeof e.className==='string'?e.className:'';
  if(/(?:^|\s)(?:last-msg|message|time)(?:\s|$)/.test(cls))return null;
  const out=attr(e);if(!e.children.length)out.text=text(e).slice(0,120);
  out.children=[...e.children].map(child=>selectedEntryTree(child,depth+1,budget)).filter(Boolean);return out;
 }
 const all=[...document.querySelectorAll('*')];
 const editables=all.filter(e=>visible(e)&&(e instanceof HTMLTextAreaElement||e instanceof HTMLInputElement||e.getAttribute('contenteditable')==='true'));
 const sendControls=all.filter(e=>visible(e)&&/^(发送|发送消息)$/.test(text(e))&&/^(BUTTON|A|SPAN|DIV)$/.test(e.tagName));
 const structural=all.filter(e=>{
  const value=[e.id,typeof e.className==='string'?e.className:'',e.getAttribute('ka'),e.getAttribute('role')].filter(Boolean).join(' ');
  return visible(e)&&/(?:chat|message|msg|editor|input|send|job|position|conversation|contact|friend|boss)/i.test(value);
 }).slice(0,100).map(attr);
 const frames=[...document.querySelectorAll('iframe')].map(frame=>{
  let srcPath=null;try{const u=new URL(frame.src,location.origin);srcPath=u.origin===location.origin?u.pathname:`${u.origin}${u.pathname}`;}catch{}
  return {...attr(frame),srcPath};
 });
 return {
  version:'0.1.10',pagePath:location.pathname,
  counts:Object.fromEntries(selectors.map(x=>[x,document.querySelectorAll(x).length])),
  input:shell(input),sendButton:shell(sendButton),jobDetailControls:header.map(control=>({...shell(control),viewAction:shell(jobViewAction(control))})),
  selectedJob:{controlText:exactHeaderText,jobPaths:jobLinks},
  selectedPublicHeader:selectedTop?publicTree(selectedTop):null,
  selectedConversationEntry:selectedEntry?selectedEntryTree(selectedEntry):null,
  outgoingShape:{total:outgoingNodes.length,genuine:genuineOutgoing().length,substantive:genuineOutgoing().length,withMessageContent:outgoingNodes.filter(e=>e.querySelector('.message-content')).length,withTextNode:outgoingNodes.filter(e=>e.querySelector('.message-content .text')).length,withSystemCard:outgoingNodes.filter(e=>!e.querySelector('.message-content')&&/你与该职位竞争者PK情况/.test(text(e))).length,receiptShape},
  discovery:{readyState:document.readyState,totalElements:all.length,bodyChildren:document.body?.children.length||0,editables:editables.slice(0,20).map(shell),sendControls:sendControls.slice(0,20).map(shell),structural,frames,openShadowHosts:all.filter(e=>e.shadowRoot).slice(0,20).map(attr)},
  note:'只读的当前聊天结构诊断；只包含控件结构、选中职位公开字段、消息类型计数，以及我方气泡是否匹配当前原话术与送达状态的白名单结构，不含 Cookie、LocalStorage、草稿、聊天正文、联系人列表或 URL 查询参数。没有点击或发送。'
 };
}

function detail(){
 guard();if(!documentInteractive)return {wait:true,reason:'岗位详情仍在初始化页面交互'};const title=text(one('.job-banner h1,.job-primary h1,.name h1'));const jd=text(one('.job-sec-text'));if(!title||!jd)return {wait:true,reason:'岗位详情内容尚未加载'};
 const city=C.cityOf(text(one('.job-banner .text-city,.job-primary .text-city,.job-banner .job-area,.job-primary .job-area')));
 const salary=text(one('.job-banner .salary,.job-primary .salary,.job-banner .job-salary,.job-primary .job-salary'))||null;
 const bossRoot=one('.job-boss-info,.job-detail-boss,.job-boss-container');
 const recruiterNameNode=bossRoot?.querySelector('h2.name,.boss-name,.name');
 const directName=recruiterNameNode?[...recruiterNameNode.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join(' ').replace(/\s+/g,' ').trim():'';
 const recruiterName=(directName||text(recruiterNameNode)).replace(/(?:\s+)?(?:在线|今日活跃|刚刚活跃|本周活跃|近期活跃)$/,'').trim()||null;
 const recruiterMeta=text(bossRoot?.querySelector('.boss-info-attr,.boss-attr,.recruiter-attr')).split(/[·・•]/).map(x=>x.trim()).filter(Boolean);
 const recruiterCompany=recruiterMeta.length===2?recruiterMeta[0]:null;
 const recruiterRole=recruiterMeta.length===2?recruiterMeta[1]:null;
 const identity=companyIdentity();
 const btn=one('.btn-startchat');const chatUrl=btn?.getAttribute('redirect-url');let full=null;try{if(chatUrl)full=new URL(chatUrl,location.origin).href;}catch{}
 return {title,jd,city,salary,recruiterName,recruiterCompany,recruiterRole,...identity,url:location.href,talked:btn?.dataset.isfriend==='true'||/继续沟通/.test(text(btn)),chatUrl:full,communicationTarget:communicationTarget(full)};
}
async function open(m){await allowed(m);if(!documentInteractive)throw Error('岗位详情交互尚未初始化，未点击沟通');if(C.key(location.href)!==m.key)throw Error('详情页与待投岗位不符');const btn=one('.btn-startchat');if(!btn||text(btn)!=='立即沟通')throw Error('未找到唯一的立即沟通按钮或岗位已沟通');if(btn.dataset.isfriend==='true')throw Error('该岗位已沟通过');await allowed(m);fresh(m);btn.click();return {ok:true};}
function openReady(m){
 guard();
 if(C.key(location.href)!==m.key)return {wait:true,reason:'任务标签正在离开岗位详情',pagePath:safePath()};
 const btn=one('.btn-startchat');
 if(!btn)return {wait:true,reason:'沟通按钮尚未加载',pagePath:safePath()};
 const opened=btn.dataset.isfriend==='true'||/继续沟通/.test(text(btn));
 return opened?{opened:true,pagePath:safePath()}:{wait:true,reason:'网站尚未公开确认已建立沟通',pagePath:safePath()};
}
function identityParts(root){
 const parts=[];const add=value=>String(value||'').split(/[\n\r\t·・•｜|]+/).map(x=>x.trim()).filter(Boolean).forEach(x=>parts.push(x));
 add(text(root));
 for(const el of root.querySelectorAll('*'))if(!el.children.length&&visible(el))add(text(el));
 return [...new Set(parts)];
}
function jobTitleKey(value){return C.norm(String(value||'').normalize('NFKC').replace(/[（(]猎头职位[）)]$/,'').trim());}
function jobViewAction(control){
 const exact=[...control.querySelectorAll('*')].filter(e=>visible(e)&&text(e)==='查看职位');
 const deepest=exact.filter(e=>![...e.querySelectorAll('*')].some(child=>visible(child)&&text(child)==='查看职位'));
 return deepest.length===1?deepest[0]:null;
}
function scopedChatIdentity(m){
 const controls=[...document.querySelectorAll('[ka="geek_chat_job_detail"]')].filter(visible);
 if(!controls.length)return {wait:true,reason:'当前聊天的职位控件尚未加载'};
 if(controls.length!==1)throw Error('当前聊天出现多个职位控件，无法唯一核对，已停止');
 const top=controls[0].closest('.top-info-content');
 const roots=[...new Set(controls.flatMap(e=>[e,e.parentElement,e.parentElement?.parentElement,top]).filter(Boolean))];
 const anchors=[];
 for(const control of controls){
  if(control instanceof HTMLAnchorElement)anchors.push(control);
  const closest=control.closest('a[href]');if(closest)anchors.push(closest);
  anchors.push(...control.querySelectorAll('a[href]'));
  if(control.parentElement)anchors.push(...control.parentElement.querySelectorAll('a[href]'));
 }
 const jobKeys=[...new Set(anchors.map(a=>C.key(a.href)).filter(Boolean))];
 const parts=[...new Set(roots.flatMap(identityParts))];
 const aliases=Array.isArray(m.companyAliases)?m.companyAliases:[m.company];
 const companyKeys=[...new Set(aliases.map(C.companyKey).filter(Boolean))];
 const titleMatch=parts.some(part=>jobTitleKey(part)===jobTitleKey(m.title));
 // Legal names and display brands are accepted only when detail() recorded both
 // as exact, page-bound aliases. This compares normalized whole names, never
 // prefixes or substrings.
 const companyMatch=parts.some(part=>companyKeys.includes(C.companyKey(part)));
 const cityMatch=parts.some(part=>part===m.city);
 // Keep the full compensation field intact: identityParts splits the middle
 // dot in values such as 30-55K·15薪, which otherwise makes equal pay fail.
 const salaryNodes=[...controls[0].querySelectorAll('.salary,.job-salary')].filter(visible);
 const salaryMatch=!!m.salary&&salaryNodes.length===1&&C.norm(text(salaryNodes[0]))===C.norm(m.salary);
 const exactJobMatch=jobKeys.length===1&&jobKeys[0]===m.key;
 // An exact job-detail path is stronger than a company label: hunter jobs show
 // the recruiting agency in chat while the job detail names an anonymous client.
 if(exactJobMatch)return {ok:true,token:`job:${m.key}`,jobKeys,method:'job-link'};
 if(jobKeys.length&&(!exactJobMatch||jobKeys.length!==1))throw Error('当前聊天的职位链接与待投岗位不一致，已停止（不会向不明对象发送）');
 if(companyKeys.includes(m.companyKey)&&titleMatch&&companyMatch)return {ok:true,token:`identity:${jobTitleKey(m.title)}:${[...companyKeys].sort().join('+')}`,jobKeys,method:'title-company'};
 const selectedEntries=[...document.querySelectorAll('.friend-content.selected')].filter(visible);
 const entryBox=selectedEntries.length===1?selectedEntries[0].querySelector('.title-box .name-box'):null;
 const entryName=text(entryBox?.querySelector('.name-text'));
 const entryValues=entryBox?[...entryBox.querySelectorAll(':scope > span')].map(text).filter(Boolean):[];
 const entryCompany=entryValues.find(value=>value!==entryName&&value!==m.recruiterRole)||null;
 const entryRole=entryValues.find(value=>value===m.recruiterRole)||null;
 const headerName=text(top?.querySelector('.user-info .name-text'));
 const headerRole=text(top?.querySelector('.user-info .base-title'));
 const recruiterReady=[m.recruiterName,m.recruiterCompany,m.recruiterRole].every(value=>typeof value==='string'&&value.trim());
 const recruiterMatch=recruiterReady&&entryName===m.recruiterName&&entryCompany===m.recruiterCompany&&entryRole===m.recruiterRole&&headerName===m.recruiterName&&headerRole===m.recruiterRole;
 if(titleMatch&&cityMatch&&salaryMatch&&recruiterMatch){
  const token=[jobTitleKey(m.title),C.norm(m.salary),m.city,m.recruiterName,m.recruiterCompany,m.recruiterRole].join(':');
  return {ok:true,token:`public:${token}`,jobKeys,method:'public-fingerprint'};
 }
 const missing=[!titleMatch&&'岗位名称',!cityMatch&&'城市',!salaryMatch&&'薪资',!recruiterReady&&'详情招聘者字段',recruiterReady&&!recruiterMatch&&'招聘者姓名/机构/身份'].filter(Boolean).join('、');
 throw Error(`聊天对象公开身份核对失败（${missing||'公司或职位'}），已停止（不会向不明对象发送）`);
}
function conversationEntryIdentity(entry){
 const box=entry.querySelector('.title-box .name-box');
 if(!box)return null;
 const name=text(box.querySelector('.name-text'));
 const values=[...box.querySelectorAll(':scope > span')].map(text).filter(Boolean);
 const company=values.find(value=>value!==name)||null;
 return {name,company,role:values.find(value=>value!==name&&value!==company)||null};
}
async function selectExactConversation(m){
 if(!m.allowConversationSelection||typeof m.runId!=='string')return {wait:true,reason:'聊天输入框或消息区域尚未加载'};
 if(conversationSelectionRuns.has(m.runId))return {wait:true,reason:'已按招聘者公开身份选择一次会话，仍在等待输入区域加载'};
 const expected=[m.recruiterName,m.recruiterCompany,m.recruiterRole];
 if(!expected.every(value=>typeof value==='string'&&value.trim()))return {wait:true,reason:'缺少招聘者公开身份字段，不能选择会话'};
 const matches=[...document.querySelectorAll('.friend-content')].filter(visible).filter(entry=>{
  const identity=conversationEntryIdentity(entry);
  return identity&&identity.name===m.recruiterName&&identity.company===m.recruiterCompany&&identity.role===m.recruiterRole;
 });
 if(matches.length!==1)return {wait:true,reason:matches.length?'招聘者公开身份对应多个会话，不能唯一选择':'尚未出现与招聘者公开身份完全一致的会话'};
 await allowed(m);guard();
 const currentMatches=[...document.querySelectorAll('.friend-content')].filter(visible).filter(entry=>{
  const identity=conversationEntryIdentity(entry);
  return identity&&identity.name===m.recruiterName&&identity.company===m.recruiterCompany&&identity.role===m.recruiterRole;
 });
 if(currentMatches.length!==1)return {wait:true,reason:'授权后招聘者公开身份不再唯一，未选择会话'};
 conversationSelectionRuns.add(m.runId);while(conversationSelectionRuns.size>50)conversationSelectionRuns.delete(conversationSelectionRuns.values().next().value);
 fresh(m);currentMatches[0].click();
 return {wait:true,conversationSelected:true,reason:'已按招聘者姓名、机构和身份唯一选择新会话，正在等待岗位与输入区域加载'};
}
async function chatReady(m){
 guard();
 if(!location.pathname.startsWith('/web/geek/chat'))return {wait:true,reason:'任务标签尚未进入聊天路径',pagePath:safePath()};
 if(m.allowConversationSelection&&!conversationSelectionRuns.has(m.runId))return {...await selectExactConversation(m),pagePath:safePath()};
 const input=one('#chat-input'),history=one('.chat-message');
 if(!input||!history)return {...await selectExactConversation(m),pagePath:safePath()};
 const identity=scopedChatIdentity(m);if(identity.wait)return {...identity,pagePath:safePath()};
 return {ready:true,method:identity.method,identityToken:identity.token,pagePath:safePath()};
}
async function send(m){
 guard();if(sending)throw Error('已在处理此会话，不允许重复触发');
 const input=one('#chat-input');const history=one('.chat-message');
 if(!input||!history)return {wait:true,reason:'聊天页面尚未加载，或页面结构不兼容'};
 const initialIdentity=scopedChatIdentity(m);if(initialIdentity.wait)return initialIdentity;
 sending=true;
 try{
  await allowed(m);await sleep(1200);guard();
  if(outgoingMessage(m.message))return {status:'existing'};
  if(genuineOutgoing().length)return {status:'existing-other'};
  const stableIdentity=()=>scopedChatIdentity(m).token;
  if(stableIdentity()!==initialIdentity.token)throw Error('聊天对象发生变化，已停止');
  // Standard editable DOM events only. No private API, cookie, token or protocol interception.
  input.focus();if(input instanceof HTMLTextAreaElement||input instanceof HTMLInputElement){const proto=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,m.message);}else{input.textContent=m.message;}
  input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:m.message}));input.dispatchEvent(new Event('change',{bubbles:true}));await sleep(300);
  await allowed(m);if(outgoingMessage(m.message))return {status:'existing'};
  if(genuineOutgoing().length)return {status:'existing-other'};
  if(stableIdentity()!==initialIdentity.token)throw Error('发送前聊天对象变化，已停止');
  const btn=one('.btn-send');if(!btn||btn.disabled||btn.getAttribute('aria-disabled')==='true'||/disabled/.test(btn.className))throw Error('发送按钮不可用，已停止');
  const draft=input instanceof HTMLTextAreaElement||input instanceof HTMLInputElement?input.value:input.textContent;if(draft!==m.message)throw Error('编辑框内容与原话术不一致，已停止');
  fresh(m);btn.click();
  let stableReceipt=null,stableReceiptReads=0;
  for(let n=0;n<24;n++){
   await sleep(500);guard();
   if(stableIdentity()!==initialIdentity.token)return {status:'unknown',reason:'发出后聊天对象变化，无法确认结果'};
   // Re-query on every pass. BOSS can optimistically insert a bubble and then
   // replace/remove it; retaining that detached node caused a false "sent".
   const bubble=outgoingMessage(m.message);
   if(!bubble?.isConnected){stableReceipt=null;stableReceiptReads=0;continue;}
   if(failedOutgoing(bubble))return {status:'unknown',reason:'消息出现失败标记，请手动核对'};
   const currentInput=one('#chat-input');
   if(!currentInput?.isConnected){stableReceipt=null;stableReceiptReads=0;continue;}
   const currentDraft=currentInput instanceof HTMLTextAreaElement||currentInput instanceof HTMLInputElement?currentInput.value:currentInput.textContent;
   const receipt=outgoingReceipt(bubble);
   if(C.norm(currentDraft)||!receipt){stableReceipt=null;stableReceiptReads=0;continue;}
   stableReceiptReads=receipt===stableReceipt?stableReceiptReads+1:1;stableReceipt=receipt;
   if(stableReceiptReads>=2)return {status:'sent',receipt};
  }
  return {status:'unknown',reason:'未能同时确认完整消息、编辑框清空和公开送达/已读状态，不自动重发'};
 }finally{sending=false;}
}
chrome.runtime.onMessage.addListener((m,sender,respond)=>{if(sender.id!==chrome.runtime.id)return;const f={scan,detail,open,openReady,chatReady,send,diagnose,safetyDiagnostic,cancel:cancelRun}[m.command];if(!f)return;Promise.resolve().then(()=>f(m)).then(respond).catch(e=>respond({error:e.message,safety:e.safety||undefined}));return true;});
})();
