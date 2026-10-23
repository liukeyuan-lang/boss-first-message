const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const C=require('./extension/core.js');
(async()=>{
assert(C.fit('AI 产品经理','负责 AI 产品需求和原型').ok);
assert(C.fit('FDE','企业现场 AI 应用交付').ok);
assert(C.fit('AI解决方案顾问','客户需求分析').ok);
assert(C.fit('AIGC 视频制作','负责短视频生成和剪辑').ok);
assert(!C.fit('算法工程师','负责大模型训练').ok);
assert(!C.fit('产品经理','负责商超货品销售').ok);
assert(!C.fit('AI产品经理','').ok);
assert.equal(C.key('https://evil.test/job_detail/a.html'),null);
assert.equal(C.key('https://www.zhipin.com/job_detail/a.html?x=1'),'/job_detail/a.html');
assert.equal(C.cityOf('上海/杭州'),null);
assert.equal(C.companyKey('星河示例科技有限公司'),C.companyKey('星河示例科技'));
assert.notEqual(C.companyKey('星河示例科技'),C.companyKey('星河示例网络技术'));
const seq=[];for(let n=0;n<20;n++){seq.push({city:C.hzAllowed(seq,10)?'杭州':'上海',status:'reserved'});assert(seq.filter(x=>x.city==='杭州').length/seq.length<=.1);}
assert.equal(seq.filter(x=>x.city==='杭州').length,2);
// A server-painted detail button must not be clicked before the site's deferred
// page scripts have reached DOMContentLoaded.
const earlyDom=new JSDOM('<div class="job-banner"><h1>AI产品经理</h1></div><div class="job-sec-text">负责AI产品需求</div><button class="btn-startchat">立即沟通</button>',{url:'https://www.zhipin.com/job_detail/early.html',runScripts:'outside-only'});
const ew=earlyDom.window;let interactiveListener,earlyClicks=0;const nativeAdd=ew.document.addEventListener.bind(ew.document);
Object.defineProperty(ew.document,'readyState',{get:()=> 'loading'});
ew.document.addEventListener=(name,fn,options)=>name==='DOMContentLoaded'?(interactiveListener=fn):nativeAdd(name,fn,options);
Object.defineProperty(ew.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});ew.HTMLElement.prototype.getClientRects=()=>[{width:100,height:30}];
ew.listeners=[];ew.chrome={runtime:{id:'early',onMessage:{addListener:fn=>ew.listeners.push(fn)},sendMessage:async()=>({ok:true})}};
ew.document.querySelector('button').onclick=()=>earlyClicks++;
ew.eval(fs.readFileSync(path.resolve(__dirname,'extension/core.js'),'utf8'));ew.eval(fs.readFileSync(path.resolve(__dirname,'extension/content.js'),'utf8'));
const earlyRead=command=>new Promise(resolve=>ew.listeners[0]({command,key:'/job_detail/early.html',runId:'early'},{id:'early'},resolve));
assert.match((await earlyRead('detail')).reason,/初始化页面交互/);assert.match((await earlyRead('open')).error,/交互尚未初始化/);assert.equal(earlyClicks,0);
interactiveListener();assert.equal((await earlyRead('detail')).title,'AI产品经理');assert.equal((await earlyRead('open')).ok,true);assert.equal(earlyClicks,1);earlyDom.window.close();
const dom=new JSDOM('<body></body>',{url:'https://www.zhipin.com/web/geek/chat',runScripts:'outside-only'});
const w=dom.window;
Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;},set(v){this.textContent=v;}});
w.HTMLElement.prototype.getClientRects=function(){return this.style.display==='none'?[]:[{width:100,height:30}];};
w.eval("window.listeners=[];window.clicked=0;window.chrome={runtime:{id:'test',onMessage:{addListener:f=>listeners.push(f)},sendMessage:async()=>({ok:true})}};");
w.eval(fs.readFileSync(path.resolve(__dirname,'extension/core.js'),'utf8'));
w.eval(fs.readFileSync(path.resolve(__dirname,'extension/content.js'),'utf8'));
const page={evaluate:async(fn,arg)=>w.eval('('+fn.toString()+')')(arg),setContent:async html=>{const match=html.match(/<title>([\s\S]*?)<\/title>/i);if(match)w.document.title=match[1];w.document.body.innerHTML=html;}};
const send=async(company='测试公司',extra={})=>page.evaluate(({message,company,extra})=>new Promise(resolve=>listeners[0]({command:'send',key:'/job_detail/a.html',runId:'test',title:'AI产品经理',city:'上海',company,companyKey:BossCore.companyKey(company),companyAliases:[company],message,...extra},{id:'test'},resolve)),{message:C.MESSAGE,company,extra});
const chatReady=async(company='测试公司',extra={})=>page.evaluate(({message,company,extra})=>new Promise(resolve=>listeners[0]({command:'chatReady',key:'/job_detail/a.html',runId:'test',title:'AI产品经理',city:'上海',company,companyKey:BossCore.companyKey(company),companyAliases:[company],message,...extra},{id:'test'},resolve)),{message:C.MESSAGE,company,extra});
const chatReadyAliases=async(company,companyAliases)=>page.evaluate(({message,company,companyAliases})=>new Promise(resolve=>listeners[0]({command:'chatReady',key:'/job_detail/a.html',runId:'test',title:'AI产品经理',city:'上海',company,companyKey:BossCore.companyKey(company),companyAliases,message},{id:'test'},resolve)),{message:C.MESSAGE,company,companyAliases});
const safetyDiagnostic=async candidate=>page.evaluate(candidate=>new Promise(resolve=>listeners[0]({command:'safetyDiagnostic',candidate},{id:'test'},resolve)),candidate);
const attachSend=()=>page.evaluate(()=>document.querySelector('.btn-send').onclick=()=>{clicked++;const input=document.querySelector('#chat-input');const el=document.createElement('div');el.className='item-myself';const msg=document.createElement('div');msg.className='message-content';const inner=document.createElement('span');inner.className='text';inner.textContent=input.textContent;const receipt=document.createElement('i');receipt.className='message-status status-delivery';msg.append(inner);el.append(msg,receipt);document.querySelector('.chat-message').append(el);input.textContent='';});
const fixture=`<div ka="geek_chat_job_detail"><span>AI产品经理</span><span>测试公司</span></div><div class="chat-message"></div><div id="chat-input" contenteditable="true"></div><button class="btn-send">发送</button>`;
await page.setContent(fixture);
await attachSend();
assert.equal((await chatReady()).ready,true);
assert.equal((await send()).status,'sent');assert.equal(await page.evaluate(()=>clicked),1);
assert.equal(await page.evaluate(()=>document.querySelector('#chat-input').textContent),'');
assert.equal((await send()).status,'existing');assert.equal(await page.evaluate(()=>clicked),1);
// The live site can split one multi-line message into sibling `.text` nodes
// (prose and the website link). Match the whole public message container, while
// preserving exact normalized equality with the complete configured greeting.
await page.setContent(fixture);await page.evaluate(()=>clicked=0);
const splitMessage='您好，这是一段虚构的多行测试话术。\n示例链接：https://example.com/';
await page.evaluate(()=>document.querySelector('.btn-send').onclick=()=>{clicked++;const input=document.querySelector('#chat-input');const value=input.textContent;const splitAt=value.indexOf('https://');const el=document.createElement('div');el.className='item-myself';const msg=document.createElement('div');msg.className='message-content';for(const part of [value.slice(0,splitAt),value.slice(splitAt)]){const segment=document.createElement('span');segment.className='text';segment.textContent=part;msg.append(segment);}const receipt=document.createElement('i');receipt.className='message-status status-delivery';el.append(msg,receipt);document.querySelector('.chat-message').append(el);input.textContent='';});
assert.equal((await send('测试公司',{message:splitMessage})).status,'sent');assert.equal(await page.evaluate(()=>clicked),1);
const splitDiagnostic=await page.evaluate(message=>new Promise(resolve=>listeners[0]({command:'diagnose',expectedMessage:message},{id:'test'},resolve)),splitMessage);const splitReceipt=splitDiagnostic.outgoingShape.receiptShape[0];assert.equal(splitReceipt.exactExpectedMessage,true);assert.equal(splitReceipt.textSegmentCount,2);assert.equal(splitReceipt.textSegmentNormalizedLengths.length,2);assert.equal(splitReceipt.messageContentNormalizedLength,splitReceipt.expectedMessageNormalizedLength);assert.equal(splitReceipt.joinedSegmentsExactExpectedMessage,true);assert(!JSON.stringify(splitDiagnostic).includes(splitMessage));
// The live page places its public delivery-status node inside the same `.text`
// element as the message. Remove that explicit DOM node from a clone before
// exact comparison; never remove the characters “送达” from the body string.
await page.setContent(fixture);await page.evaluate(()=>clicked=0);
await page.evaluate(()=>document.querySelector('.btn-send').onclick=()=>{clicked++;const input=document.querySelector('#chat-input');const el=document.createElement('div');el.className='item-myself';const msg=document.createElement('div');msg.className='message-content';const segment=document.createElement('span');segment.className='text';const receipt=document.createElement('i');receipt.className='message-status status-delivery';receipt.textContent='送达';segment.append(receipt,document.createTextNode(input.textContent));msg.append(segment);el.append(msg);document.querySelector('.chat-message').append(el);input.textContent='';});
assert.equal((await send()).status,'sent');assert.equal(await page.evaluate(()=>clicked),1);
const nestedReceiptDiagnostic=await page.evaluate(message=>new Promise(resolve=>listeners[0]({command:'diagnose',expectedMessage:message},{id:'test'},resolve)),C.MESSAGE);const nestedReceipt=nestedReceiptDiagnostic.outgoingShape.receiptShape[0];assert.equal(nestedReceipt.rawExactExpectedMessage,false);assert.equal(nestedReceipt.exactExpectedMessage,true);assert.equal(nestedReceipt.exactAfterRemovingReceiptNodes,true);assert.equal(nestedReceipt.receiptNodesWithinMessageContent,true);assert.equal(nestedReceipt.receiptNodeCountWithinMessageContent,1);assert.equal(nestedReceipt.rawMessageContentNormalizedLength,nestedReceipt.expectedMessageNormalizedLength+2);assert.equal(nestedReceipt.messageContentNormalizedLength,nestedReceipt.expectedMessageNormalizedLength);assert.equal(nestedReceipt.rawFirstNormalizedDifference.actualCodePoint,'U+9001');assert.equal(nestedReceipt.rawFirstNormalizedDifference.expectedCodePoint,'U+60A8');assert.equal(nestedReceipt.firstNormalizedDifference,null);assert(!JSON.stringify(nestedReceiptDiagnostic).includes(C.MESSAGE));
await page.setContent(fixture.replace('测试公司','别的公司'));assert.match((await send()).error,/核对/);assert.equal(await page.evaluate(()=>clicked),1);

// An optimistic bubble may carry a transient delivery class and then be
// removed by the SPA. Re-querying must classify that outcome as unknown rather
// than retaining the detached element and recording a false sent result.
await page.setContent(fixture);await page.evaluate(()=>clicked=0);
await page.evaluate(()=>document.querySelector('.btn-send').onclick=()=>{clicked++;const input=document.querySelector('#chat-input');const el=document.createElement('div');el.className='item-myself';el.innerHTML=`<div class="message-content"><span class="text"></span></div><i class="message-status status-delivery"></i>`;el.querySelector('.text').textContent=input.textContent;document.querySelector('.chat-message').append(el);input.textContent='';setTimeout(()=>el.remove(),600);});
const originalWindowSetTimeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>originalWindowSetTimeout(fn,Math.max(0,ms/100),...args);
let detachedResult;try{detachedResult=await send();}finally{w.setTimeout=originalWindowSetTimeout;}
assert.equal(detachedResult.status,'unknown');assert.match(detachedResult.reason,/送达\/已读/);assert.equal(await page.evaluate(()=>clicked),1);

// A directed chat reload may hydrate the conversation list without selecting a
// recipient. Select exactly one public recruiter tuple once, then retain the
// existing strict job/company identity check before declaring the chat ready.
await page.setContent(`<div class="friend-content"><div class="title-box"><span class="name-box"><span class="name-text">测试乙先生</span><span>星河示例科技</span><span>总经理</span></span></div></div>`);
await page.evaluate(()=>{clicked=0;document.querySelector('.friend-content').onclick=()=>{clicked++;document.body.insertAdjacentHTML('beforeend','<div ka="geek_chat_job_detail"><span>AI产品经理</span><span>星河示例科技</span></div><div class="chat-message"></div><div id="chat-input" contenteditable="true"></div><button class="btn-send">发送</button>');};});
const selectData={runId:'select-exact-once',allowConversationSelection:true,recruiterName:'测试乙先生',recruiterCompany:'星河示例科技',recruiterRole:'总经理'};
const selectedOnce=await chatReady('星河示例科技',selectData);assert.equal(selectedOnce.wait,true);assert.match(selectedOnce.reason,/唯一选择/);assert.equal(await page.evaluate(()=>clicked),1);assert.match((await chatReady('星河示例科技',selectData)).reason,/身份字段稳定/);assert.equal((await chatReady('星河示例科技',selectData)).ready,true);
await page.setContent(`<div class="friend-content"><div class="title-box"><span class="name-box"><span class="name-text">测试乙先生</span><span>星河示例科技</span><span>总经理</span></span></div></div><div class="friend-content"><div class="title-box"><span class="name-box"><span class="name-text">测试乙先生</span><span>星河示例科技</span><span>总经理</span></span></div></div>`);await page.evaluate(()=>clicked=0);
const ambiguousSelection=await chatReady('星河示例科技',{...selectData,runId:'select-ambiguous'});assert.equal(ambiguousSelection.wait,true);assert.match(ambiguousSelection.reason,/多个会话/);assert.equal(await page.evaluate(()=>clicked),0);
// The selected recruiter can paint before BOSS replaces the previous job
// header. A mismatch remains non-actionable during a bounded settling window,
// and the new public identity must itself be stable twice before readiness.
const hydratingEntry=`<div class="friend-content"><div class="title-box"><span class="name-box"><span class="name-text">测试丙女士</span><span>青岚示例商务</span><span>行政</span></span></div></div>`;
const staleHeader=`<div class="top-info-content"><div class="user-info"><span class="name-text">测试丙女士</span><span class="base-title">行政</span></div><div ka="geek_chat_job_detail"><span class="position-name">ai产品经理</span><span class="salary">8-12K</span><span class="city">上海</span></div></div><div class="chat-message"></div><div id="chat-input" contenteditable="true"></div><button class="btn-send">发送</button>`;
const hydratingData={runId:'hydrate-then-match',allowConversationSelection:true,salary:'11-20K',recruiterName:'测试丙女士',recruiterCompany:'青岚示例商务',recruiterRole:'行政'};
await page.setContent(hydratingEntry);await page.evaluate(staleHeader=>{document.querySelector('.friend-content').onclick=function(){this.classList.add('selected');document.body.insertAdjacentHTML('beforeend',staleHeader);};},staleHeader);
assert.match((await chatReady('匿名示例雇主',hydratingData)).reason,/唯一选择/);
assert.match((await chatReady('匿名示例雇主',hydratingData)).reason,/身份字段稳定/);
assert.match((await chatReady('匿名示例雇主',hydratingData)).reason,/仍在水合/);
await page.evaluate(()=>{document.querySelector('.salary').textContent='11-20K';});
assert.match((await chatReady('匿名示例雇主',hydratingData)).reason,/身份字段稳定/);
const hydratedReady=await chatReady('匿名示例雇主',hydratingData);assert.equal(hydratedReady.ready,true);assert.equal(hydratedReady.method,'public-fingerprint');
const mismatchData={...hydratingData,runId:'stable-mismatch'};
await page.setContent(hydratingEntry);await page.evaluate(staleHeader=>{document.querySelector('.friend-content').onclick=function(){this.classList.add('selected');document.body.insertAdjacentHTML('beforeend',staleHeader);};},staleHeader);
assert.match((await chatReady('匿名示例雇主',mismatchData)).reason,/唯一选择/);
assert.match((await chatReady('匿名示例雇主',mismatchData)).reason,/身份字段稳定/);
assert.match((await chatReady('匿名示例雇主',mismatchData)).reason,/仍在水合/);
const nativeNow=w.Date.now;w.Date.now=()=>nativeNow()+6000;
let stableMismatch;try{stableMismatch=await chatReady('匿名示例雇主',mismatchData);}finally{w.Date.now=nativeNow;}
assert.match(stableMismatch.error,/薪资/);assert.equal(stableMismatch.identityDiagnostic.salaryComparison.current,'8-12K');assert.equal(stableMismatch.identityDiagnostic.salaryComparison.expected,'11-20K');assert.equal(stableMismatch.identityDiagnostic.salaryComparison.nodeCount,1);assert.equal(stableMismatch.identityDiagnostic.salaryComparison.normalizedMatch,false);assert(stableMismatch.identityDiagnostic.selectionElapsedMs>=5000);
const freshNavigationData={...hydratingData,runId:'fresh-navigation',allowConversationSelection:false,requireIdentityStability:true};
await page.setContent(hydratingEntry.replace('friend-content','friend-content selected')+staleHeader);
assert.match((await chatReady('匿名示例雇主',freshNavigationData)).reason,/新聊天页.*稳定/);
assert.match((await chatReady('匿名示例雇主',freshNavigationData)).reason,/仍在水合/);
await page.evaluate(()=>{document.querySelector('.salary').textContent='11-20K';});
assert.match((await chatReady('匿名示例雇主',freshNavigationData)).reason,/新聊天页.*稳定/);
const freshReady=await chatReady('匿名示例雇主',freshNavigationData);assert.equal(freshReady.ready,true);assert.equal(freshReady.method,'public-fingerprint');
const freshMismatchData={...freshNavigationData,runId:'fresh-navigation-mismatch'};
await page.setContent(hydratingEntry.replace('friend-content','friend-content selected')+staleHeader);
assert.match((await chatReady('匿名示例雇主',freshMismatchData)).reason,/新聊天页.*稳定/);
assert.match((await chatReady('匿名示例雇主',freshMismatchData)).reason,/仍在水合/);
const nativeNowFresh=w.Date.now;w.Date.now=()=>nativeNowFresh()+6000;
let freshMismatch;try{freshMismatch=await chatReady('匿名示例雇主',freshMismatchData);}finally{w.Date.now=nativeNowFresh;}
assert.match(freshMismatch.error,/薪资/);assert.equal(freshMismatch.identityDiagnostic.identitySettleSource,'fresh-navigation');assert(freshMismatch.identityDiagnostic.identitySettleElapsedMs>=5000);assert.equal(freshMismatch.identityDiagnostic.selectionElapsedMs,null);
await page.setContent(fixture+'<div role="dialog">请完成安全验证</div>');assert.match((await send()).error,/验证/);
// Only visible, purpose-built security UI stops work. Hidden templates and
// ordinary conversation/draft text are neither inspected nor treated as a block.
await page.setContent(fixture+'<div class="login-dialog" style="display:none">登录</div><div style="display:none"><div class="verify-wrap">安全验证</div></div>');assert.equal((await chatReady()).ready,true);
await page.setContent(fixture.replace('<div class="chat-message"></div>','<div class="chat-message">请完成安全验证</div>').replace('<div id="chat-input" contenteditable="true"></div>','<div id="chat-input" contenteditable="true">登录 验证码</div>'));assert.equal((await chatReady()).ready,true);
await page.setContent(fixture+'<h1>访问异常</h1>');assert.match((await send()).error,/平台限制/);
await page.setContent(fixture);await page.evaluate(()=>history.replaceState({},'', '/web/user?private=token'));const routeStop=await send();assert.match(routeStop.error,/登录页路由/);assert.equal(routeStop.safety.pathname,'/web/user');assert.equal(routeStop.safety.source,'login-route');const routeDiagnostic=await safetyDiagnostic({jobPath:'/job_detail/a.html?private=query',title:'AI产品经理'});assert.equal(routeDiagnostic.candidate.jobPath,'/job_detail/a.html');assert(!JSON.stringify(routeDiagnostic).includes('private=query'));
await page.evaluate(()=>history.replaceState({},'', '/web/geek/chat'));
await page.setContent(fixture);await page.evaluate(()=>chrome.runtime.sendMessage=async()=>({ok:false}));assert.match((await send()).error,/停止/);assert.equal(await page.evaluate(()=>clicked),0);
await page.evaluate(()=>chrome.runtime.sendMessage=async()=>({ok:true}));
await page.setContent('<div class="job-card-box"><a class="job-name" href="https://www.zhipin.com/job_detail/a.html">AI产品经理</a><span class="job-area">上海·浦东</span></div><div class="job-card-box"><a class="job-name" href="https://www.zhipin.com/job_detail/b.html">AI产品经理</a><span class="job-area">北京·海淀</span></div>');
const scan=await page.evaluate(()=>new Promise(resolve=>listeners[0]({command:'scan',city:'上海'},{id:'test'},resolve)));assert.equal(scan.jobs.length,1);assert.equal(scan.jobs[0].city,'上海');
await page.setContent('<a class="job-card-box" href="https://www.zhipin.com/job_detail/self.html"><span class="job-name">AI产品经理</span><span>上海·徐汇区</span></a>');
const selfAnchor=await page.evaluate(()=>new Promise(resolve=>listeners[0]({command:'scan',city:'上海'},{id:'test'},resolve)));assert.equal(selfAnchor.jobs[0].url,'https://www.zhipin.com/job_detail/self.html');assert.equal(selfAnchor.jobs[0].city,'上海');
await page.setContent('<div class="job-card-box"><a href="https://www.zhipin.com/job_detail/company-city.html">上海某科技公司 AI产品经理</a></div>');
const fakeCity=await page.evaluate(()=>new Promise(resolve=>listeners[0]({command:'scan',city:'上海'},{id:'test'},resolve)));assert.equal(fakeCity.wait,true);assert.match(fakeCity.reason,/缺城市 1/);
await page.setContent('<div class="job-card-box"><a href="https://www.zhipin.com/job_detail/old-city-a.html">AI产品经理</a><span class="job-area">珠海·香洲</span></div><div class="job-card-box"><a href="https://www.zhipin.com/job_detail/old-city-b.html">AI产品经理</a><span class="job-area">珠海·横琴</span></div>');
const staleCity=await page.evaluate(()=>new Promise(resolve=>listeners[0]({command:'scan',city:'杭州'},{id:'test'},resolve)));assert.equal(staleCity.wait,true);assert.equal(staleCity.scanState.kind,'all-other-city');assert.equal(staleCity.scanState.otherCity,2);
await page.setContent('<div class="job-card-box"><span class="job-area">上海·浦东</span></div>');
const missingLink=await page.evaluate(()=>new Promise(resolve=>listeners[0]({command:'scan',city:'上海'},{id:'test'},resolve)));assert.match(missingLink.reason,/缺详情链接 1/);
// BOSS populates this list after the document reports complete. The first read
// deliberately waits; once the real card structure arrives, a later read is safe.
await page.setContent('<main id="jobs"></main>');
const beforeHydration=await page.evaluate(()=>new Promise(resolve=>listeners[0]({command:'scan',city:'上海'},{id:'test'},resolve)));assert.equal(beforeHydration.wait,true);
await page.setContent('<ul><li class="job-card-box"><div class="job-info"><div class="job-title"><a class="job-name" href="https://www.zhipin.com/job_detail/live-sh.html">AI产品经理</a></div></div><div class="job-card-footer"><span class="company-location">上海</span></div></li><li class="job-card-box"><div class="job-info"><div class="job-title"><a class="job-name" href="https://www.zhipin.com/job_detail/live-sz.html">AI产品经理</a></div></div><div class="job-card-footer"><span class="company-location">深圳</span></div></li><li class="job-card-box"><a class="job-name" href="https://www.zhipin.com/job_detail/live-sh-2.html">AI产品经理</a><div class="job-card-footer"><span class="company-location">上海</span></div></li><li class="job-card-box"><a class="job-name" href="https://www.zhipin.com/job_detail/live-sz-2.html">AI产品经理</a><div class="job-card-footer"><span class="company-location">深圳</span></div></li></ul>');
const hydratedScan=await page.evaluate(()=>new Promise(resolve=>listeners[0]({command:'scan',city:'上海'},{id:'test'},resolve)));assert.equal(hydratedScan.jobs.length,2);assert.equal(hydratedScan.jobs[0].url,'https://www.zhipin.com/job_detail/live-sh.html');
await page.evaluate(()=>history.replaceState({},'', '/web/geek/jobs'));
const hydratedDiagnostic=await page.evaluate(()=>new Promise(resolve=>listeners[0]({command:'diagnose'},{id:'test'},resolve)));assert.equal(JSON.stringify(hydratedDiagnostic.scan),JSON.stringify({cards:4,withDetailLink:4,missingDetailLink:0,missingCity:0,cities:{上海:2,深圳:2}}));assert.equal(hydratedDiagnostic.cards.length,3);
const detail=async()=>page.evaluate(()=>new Promise(resolve=>listeners[0]({command:'detail'},{id:'test'},resolve)));
const openReady=async key=>page.evaluate(key=>new Promise(resolve=>listeners[0]({command:'openReady',key},{id:'test'},resolve)),key);
await page.setContent(`<title>「ai产品经理招聘」_星河示例科技招聘-BOSS直聘</title>
 <div class="job-banner"><h1>ai产品经理</h1><span class="text-city">上海</span><span class="salary">30-55K·15薪</span></div>
 <div class="job-sec-text">负责 AI Agent 产品</div>
 <div class="sider-company"><div class="company-info"><a href="/gongsi/logo"><img alt=""></a><a ka="job-detail-company_custompage" href="/gongsi/company">星河示例科技</a></div></div>
 <div class="job-detail-company"><div class="company-name"><span>公司名称</span> 星河示例科技有限公司</div></div>
 <script type="application/ld+json">{"@type":"JobPosting","hiringOrganization":{"@type":"Organization","name":"星河示例科技有限公司"}}</script>
 <div class="job-boss-info"><h2 class="name">测试甲先生<i class="icon-vip"></i></h2><div class="boss-info-attr">上海示例人才服务<em>·</em>猎头顾问</div></div>
 <button class="btn-startchat" redirect-url="/web/geek/chat?ka=job-detail-chat&amp;jobId=private-job-target&amp;securityId=private-security-target">立即沟通</button>`);
await page.evaluate(()=>history.replaceState({},'', '/job_detail/a.html'));
const job=await detail();assert.equal(job.company,'星河示例科技');assert.equal(job.companyKey,C.companyKey('星河示例科技有限公司'));assert.deepEqual(Array.from(job.companyAliases),['星河示例科技','星河示例科技有限公司']);assert.equal(job.companySource,'primary-company-link');assert.equal(job.salary,'30-55K·15薪');assert.equal(job.recruiterName,'测试甲先生');assert.equal(job.recruiterCompany,'上海示例人才服务');assert.equal(job.recruiterRole,'猎头顾问');
assert.equal((await openReady('/job_detail/a.html')).wait,true);await page.evaluate(()=>{const btn=document.querySelector('.btn-startchat');btn.dataset.isfriend='true';btn.textContent='继续沟通';});assert.equal((await openReady('/job_detail/a.html')).opened,true);
assert.deepEqual(Array.from(job.communicationTarget.queryParamNames),['jobId','ka','securityId']);assert.deepEqual(Array.from(job.communicationTarget.strongTargetParamNames),['jobId']);assert.equal(job.communicationTarget.directionSufficient,true);
const targetDiagnostic=await page.evaluate(()=>new Promise(resolve=>listeners[0]({command:'diagnose'},{id:'test'},resolve)));const targetDiagnosticJson=JSON.stringify(targetDiagnostic);assert.equal(targetDiagnostic.jobPublic.communicationTarget.redirectPath,'/web/geek/chat');assert.equal(targetDiagnostic.jobPublic.communicationTarget.directionSufficient,true);assert(!targetDiagnosticJson.includes('private-job-target'));assert(!targetDiagnosticJson.includes('private-security-target'));assert(!targetDiagnosticJson.includes('job-detail-chat'));
await page.evaluate(()=>document.querySelector('.job-boss-info h2.name').innerHTML='测试乙先生<span>在线</span>');assert.equal((await detail()).recruiterName,'测试乙先生');
// On the live page the display brand is in the primary company card while the
// legal name is in the registered-information card. They are aliases only with
// a matching title and one public /gongsi/ target; query strings never escape
// the diagnostic evidence.
await page.setContent(`<title>「AI产品经理招聘」_云舟示例招聘-BOSS直聘</title><div class="job-banner"><h1>AI产品经理</h1><span class="text-city">深圳</span></div><div class="job-sec-text">负责 AI 产品</div><div class="sider-company"><div class="company-info"><a href="/gongsi/dc3545e791fdff7f03F82dW6GVY~.html?private=query">云舟示例</a><a href="/gongsi/dc3545e791fdff7f03F82dW6GVY~.html">云舟示例</a></div></div><div class="job-detail-company"><div class="company-name"><span>公司名称</span>云舟示例科技（深圳）有限公司</div></div><aside class="recommended-company"><a href="/gongsi/unrelated.html">不相关推荐公司</a></aside><script type="application/ld+json">{"@type":"JobPosting","hiringOrganization":{"name":"云舟示例科技（深圳）有限公司"}}</script><button class="btn-startchat">立即沟通</button>`);
await page.evaluate(()=>history.replaceState({},'', '/job_detail/a.html'));
const aliasJob=await detail();assert.equal(aliasJob.company,'云舟示例');assert.deepEqual(Array.from(aliasJob.companyAliases),['云舟示例','云舟示例科技（深圳）有限公司']);assert.equal(aliasJob.companySource,'primary-company-link+registered-name');assert.match(aliasJob.companyAliasReason,/公开关联/);assert.equal(aliasJob.companyEvidence.filter(item=>item.source==='primary-company-link').length,2);assert.equal(aliasJob.companyEvidence[0].hrefPath,'/gongsi/dc3545e791fdff7f03F82dW6GVY~.html');
const aliasDiagnostic=await page.evaluate(()=>new Promise(resolve=>listeners[0]({command:'diagnose'},{id:'test'},resolve)));assert.equal(aliasDiagnostic.version,'0.1.11');assert.equal(aliasDiagnostic.company.evidence[0].hrefPath,'/gongsi/dc3545e791fdff7f03F82dW6GVY~.html');assert(!JSON.stringify(aliasDiagnostic).includes('private=query'));
await page.evaluate(()=>history.replaceState({},'', '/web/geek/chat'));
await page.setContent(fixture.replace('测试公司','云舟示例科技（深圳）有限公司'));assert.equal((await chatReadyAliases('云舟示例',['云舟示例','云舟示例科技（深圳）有限公司'])).method,'title-company');
await page.setContent(`<title>「AI产品经理招聘」_甲科技招聘-BOSS直聘</title><div class="job-banner"><h1>AI产品经理</h1><span class="text-city">上海</span></div><div class="job-sec-text">负责 AI 产品</div><div class="sider-company"><div class="company-info"><a href="/gongsi/a.html">甲科技</a><a href="/gongsi/b.html">乙科技</a></div></div><button class="btn-startchat">立即沟通</button>`);
const ambiguous=await detail();assert.equal(ambiguous.company,null);assert.match(ambiguous.companyIssue,/多个不一致/);
await page.setContent(`<title>「AI产品经理招聘」_甲科技招聘-BOSS直聘</title><div class="job-banner"><h1>AI产品经理</h1><span class="text-city">上海</span></div><div class="job-sec-text">负责 AI 产品</div><div class="sider-company"><div class="company-info"><a>甲科技</a></div></div><script type="application/ld+json">{"@type":"JobPosting","hiringOrganization":{"name":"乙科技有限公司"}}</script><button class="btn-startchat">立即沟通</button>`);
const structuredConflict=await detail();assert.equal(structuredConflict.company,null);assert.match(structuredConflict.companyIssue,/不一致/);
await page.setContent(`<title>「AI产品经理招聘」_甲科技招聘-BOSS直聘</title><div class="job-banner"><h1>AI产品经理</h1><span class="text-city">上海</span></div><div class="job-sec-text">负责 AI 产品</div><div class="sider-company"><div class="company-info"><a href="/gongsi/a.html">甲科技</a></div></div><div class="job-detail-company"><div class="company-name">公司名称 乙科技有限公司</div></div><button class="btn-startchat">立即沟通</button>`);
await page.setContent(`<title>「AI产品经理招聘」_乙科技招聘-BOSS直聘</title><div class="job-banner"><h1>AI产品经理</h1><span class="text-city">上海</span></div><div class="job-sec-text">负责 AI 产品</div><div class="sider-company"><div class="company-info"><a href="/gongsi/a.html">甲科技</a></div></div><div class="job-detail-company"><div class="company-name">公司名称 乙科技有限公司</div></div><button class="btn-startchat">立即沟通</button>`);
const unboundLegalName=await detail();assert.equal(unboundLegalName.company,null);assert.match(unboundLegalName.companyIssue,/关系无法由主公司模块核对/);
await page.setContent(`<title>「AI产品经理招聘」_云舟示例招聘-BOSS直聘</title><div class="job-banner"><h1>AI产品经理</h1><span class="text-city">深圳</span></div><div class="job-sec-text">负责 AI 产品</div><div class="sider-company"><div class="company-info"><a href="/gongsi/a.html">云舟示例</a><a href="/gongsi/b.html">云舟示例</a></div></div><div class="job-detail-company"><div class="company-name">公司名称 云舟示例科技（深圳）有限公司</div></div><button class="btn-startchat">立即沟通</button>`);
const multipleCompanyPaths=await detail();assert.equal(multipleCompanyPaths.company,null);assert.match(multipleCompanyPaths.companyIssue,/关系无法由主公司模块核对/);
await page.setContent(`<title>「AI产品经理招聘」_云舟示例招聘-BOSS直聘</title><div class="job-banner"><h1>AI产品经理</h1><span class="text-city">深圳</span></div><div class="job-sec-text">负责 AI 产品</div><div class="sider-company"><div class="company-info"><a href="/generic-info/company">云舟示例</a></div></div><div class="job-detail-company"><div class="company-name">公司名称 云舟示例科技（深圳）有限公司</div></div><button class="btn-startchat">立即沟通</button>`);
const nonCompanyPath=await detail();assert.equal(nonCompanyPath.company,null);assert.match(nonCompanyPath.companyIssue,/关系无法由主公司模块核对/);
// A platform/system card or generic greeting is not the user's requested text.
// A newly opened, exactly bound chat must still send the full custom message.
await page.setContent(fixture.replace('测试公司','星河示例科技有限公司').replace('<div class="chat-message"></div>','<div class="chat-message"><div class="item-myself"><div class="system-card">你与该职位竞争者PK情况</div></div></div>'));await page.evaluate(()=>clicked=0);await attachSend();assert.equal((await send('星河示例科技')).status,'sent');assert.equal(await page.evaluate(()=>clicked),1);
await page.setContent(fixture.replace('测试公司','星河示例科技有限公司').replace('<div class="chat-message"></div>','<div class="chat-message"><div class="item-myself"><div class="message-content"><span class="text">您好</span></div></div></div>'));await page.evaluate(()=>clicked=0);await attachSend();assert.equal((await send('星河示例科技')).status,'existing-other');assert.equal(await page.evaluate(()=>clicked),0);
await page.setContent(fixture.replace('测试公司','星河示例科技有限公司').replace('<div class="chat-message"></div>','<div class="chat-message"><div class="item-myself"><img src="attachment.png"></div></div>'));await page.evaluate(()=>clicked=0);await attachSend();assert.equal((await send('星河示例科技')).status,'existing-other');assert.equal(await page.evaluate(()=>clicked),0);
await page.setContent(fixture.replace('测试公司','星河示例科技服务'));assert.match((await send('星河示例科技')).error,/核对/);
// Hunter chats identify the agency rather than the anonymous employer. An exact
// selected job-detail link safely binds the conversation even when those names differ.
const hunterFixture=`<div><a ka="geek_chat_job_detail" href="https://www.zhipin.com/job_detail/a.html?from=chat">ai产品经理（猎头职位）</a><span>上海示例人才服务</span></div><div class="chat-message"></div><div id="chat-input" contenteditable="true"></div><button class="btn-send">发送</button>`;
await page.evaluate(()=>history.replaceState({},'', '/web/geek/chat'));
await page.setContent(hunterFixture);await page.evaluate(()=>clicked=0);await attachSend();assert.equal((await chatReady('某大型知名互联网金融公司')).method,'job-link');assert.equal((await send('某大型知名互联网金融公司')).status,'sent');assert.equal(await page.evaluate(()=>clicked),1);
await page.setContent(hunterFixture.replace('/a.html','/different.html'));assert.match((await chatReady('某大型知名互联网金融公司')).error,/职位链接与待投岗位不一致/);
const hunterNoLink=`<div class="top-info-content"><div class="user-info"><span class="name-text">测试甲先生</span><span class="base-title">猎头顾问</span></div><div class="chat-position-content"><div class="position-main"><div class="position-content" ka="geek_chat_job_detail"><span class="position-name">AI产品经理（猎头职位）</span><span class="salary">30-55K·15薪</span><span class="city">上海</span></div></div></div></div><div class="friend-content selected"><div class="title-box"><div class="name-box"><span class="name-text">测试甲先生</span><span>上海示例人才服务</span><i class="vline"></i><span>猎头顾问</span></div></div><div class="last-msg">private-history</div></div><div class="chat-message"></div><div id="chat-input" contenteditable="true"></div><button class="btn-send">发送</button>`;
const recruiter={salary:'30-55K·15薪',recruiterName:'测试甲先生',recruiterCompany:'上海示例人才服务',recruiterRole:'猎头顾问'};
await page.setContent(hunterNoLink);await page.evaluate(()=>clicked=0);await attachSend();const hunterReady=await chatReady('某大型知名互联网金融公司',recruiter);assert.equal(hunterReady.method,'public-fingerprint');assert.equal((await send('某大型知名互联网金融公司',recruiter)).status,'sent');assert.equal(await page.evaluate(()=>clicked),1);
await page.setContent(hunterNoLink.replace('30-55K·15薪','30-55K·13薪'));assert.match((await chatReady('某大型知名互联网金融公司',recruiter)).error,/薪资/);
await page.setContent(hunterNoLink.replace('30-55K·15薪','\uE0010-55K·15薪'));const unreadableSalary=await chatReady('某大型知名互联网金融公司',recruiter);assert.equal(unreadableSalary.wait,true);assert.match(unreadableSalary.reason,/不可直接读取/);assert.equal(unreadableSalary.identityDiagnostic.salaryComparison.currentHasPrivateUseCharacters,true);
await page.setContent(hunterNoLink.replace('上海示例人才服务</span>','别的猎头公司</span>'));assert.match((await chatReady('某大型知名互联网金融公司',recruiter)).error,/核对/);
// A delayed authorization response cannot revive an expired command, and a
// content-side Stop revocation wins over an already queued positive response.
await page.setContent(fixture);await page.evaluate(()=>clicked=0);await attachSend();
await page.evaluate(()=>{chrome.runtime.sendMessage=()=>new Promise(resolve=>{window.resolveLateAuthorization=resolve;});});
const expiringSend=page.evaluate(({message,expiresAt})=>new Promise(resolve=>listeners[0]({command:'send',key:'/job_detail/a.html',runId:'late-expiry',title:'AI产品经理',city:'上海',company:'测试公司',companyKey:BossCore.companyKey('测试公司'),companyAliases:['测试公司'],message,expiresAt},{id:'test'},resolve)),{message:C.MESSAGE,expiresAt:Date.now()+10});
let lateAuthorizationReady=false;for(let n=0;n<20&&!lateAuthorizationReady;n++){lateAuthorizationReady=await page.evaluate(()=>typeof window.resolveLateAuthorization==='function');if(!lateAuthorizationReady)await new Promise(resolve=>setTimeout(resolve,5));}assert.equal(lateAuthorizationReady,true);await new Promise(resolve=>setTimeout(resolve,25));await page.evaluate(()=>resolveLateAuthorization({ok:true}));assert.match((await expiringSend).error,/过期/);assert.equal(await page.evaluate(()=>clicked),0);
const cancelledSend=page.evaluate(({message,expiresAt})=>new Promise(resolve=>listeners[0]({command:'send',key:'/job_detail/a.html',runId:'late-cancel',title:'AI产品经理',city:'上海',company:'测试公司',companyKey:BossCore.companyKey('测试公司'),companyAliases:['测试公司'],message,expiresAt},{id:'test'},resolve)),{message:C.MESSAGE,expiresAt:Date.now()+5000});
await new Promise(resolve=>setImmediate(resolve));await page.evaluate(()=>new Promise(resolve=>listeners[0]({command:'cancel',runId:'late-cancel'},{id:'test'},resolve)));await page.evaluate(()=>resolveLateAuthorization({ok:true}));assert.match((await cancelledSend).error,/停止|授权/);assert.equal(await page.evaluate(()=>clicked),0);await page.evaluate(()=>chrome.runtime.sendMessage=async()=>({ok:true}));
await page.setContent('<input value="private-secret"><div class="job-card-box"><a href="https://www.zhipin.com/job_detail/a.html?private=query">AI产品经理</a><span class="job-area">上海·浦东</span></div>');await page.evaluate(()=>history.replaceState({},'', '/web/geek/jobs?private=query'));
const diagnostic=await page.evaluate(()=>new Promise(resolve=>listeners[0]({command:'diagnose'},{id:'test'},resolve)));const diagnosticJson=JSON.stringify(diagnostic);assert(!diagnosticJson.includes('private-secret'));assert(!diagnosticJson.includes('private=query'));assert.equal(diagnostic.pagePath,'/web/geek/jobs');
await page.evaluate(()=>history.replaceState({},'', '/web/geek/chat'));
await page.setContent(`<div><a ka="geek_chat_job_detail" href="https://www.zhipin.com/job_detail/a.html?private=query">查看职位</a></div><div class="chat-message"><div class="item-myself"><div class="message-content"><span class="text">private-transcript</span></div><i class="message-status status-delivery" title="送达"></i></div></div><div id="chat-input" contenteditable="true">private-draft</div><button class="btn-send" disabled>发送</button>`);
const chatDiagnostic=await page.evaluate(()=>new Promise(resolve=>listeners[0]({command:'diagnose',expectedMessage:'private-transcript'},{id:'test'},resolve)));const chatDiagnosticJson=JSON.stringify(chatDiagnostic);assert.equal(chatDiagnostic.selectedJob.jobPaths[0],'/job_detail/a.html');assert.equal(chatDiagnostic.outgoingShape.withTextNode,1);assert.equal(chatDiagnostic.outgoingShape.receiptShape[0].connected,true);assert.equal(chatDiagnostic.outgoingShape.receiptShape[0].exactExpectedMessage,true);assert.equal(chatDiagnostic.outgoingShape.receiptShape[0].receipt,'delivered');assert.deepEqual(Array.from(chatDiagnostic.outgoingShape.receiptShape[0].statusClasses),['message-status status-delivery']);assert.deepEqual(JSON.parse(JSON.stringify(chatDiagnostic.outgoingShape.receiptShape[0].labels)),[{attr:'title',value:'送达'}]);assert(!chatDiagnosticJson.includes('private-transcript'));assert(!chatDiagnosticJson.includes('private-draft'));assert(!chatDiagnosticJson.includes('private=query'));
await page.setContent(`<div class="chat-message"><div class="item-myself"><div class="message-content"><span class="text">private-\u200Btranscript\u200B</span></div><i class="message-status status-delivery"></i></div></div><div id="chat-input" contenteditable="true"></div><button class="btn-send">发送</button>`);
const formatDiagnostic=await page.evaluate(()=>new Promise(resolve=>listeners[0]({command:'diagnose',expectedMessage:'private-transcript'},{id:'test'},resolve)));const formatReceipt=formatDiagnostic.outgoingShape.receiptShape[0];assert.equal(formatReceipt.exactExpectedMessage,false);assert.deepEqual(JSON.parse(JSON.stringify(formatReceipt.actualFormatCharacterCounts)),[{codePoint:'U+200B',count:2}]);assert.deepEqual(Array.from(formatReceipt.expectedFormatCharacterCounts),[]);assert.equal(formatReceipt.exactAfterRemovingFormatCharacters,true);assert.deepEqual(JSON.parse(JSON.stringify(formatReceipt.firstNormalizedDifference)),{index:8,actualCodePoint:'U+200B',expectedCodePoint:'U+0074',actualIsFormatCharacter:true,expectedIsFormatCharacter:false});assert(!JSON.stringify(formatDiagnostic).includes('private-transcript'));
function backgroundHarness(reply){
 let calls=0;
 const context={console,URL,BossCore:C,crypto:{randomUUID:()=> 'test-run'},importScripts:()=>{},onPause:null};
 context.setTimeout=(fn,ms)=>{if(ms<3000){context.onPause?.();fn();}return {fn,ms};};context.clearTimeout=()=>{};
 context.chrome={storage:{local:{get:async()=>({}),set:async()=>{}}},tabs:{sendMessage:async()=>{calls++;return reply(calls);},get:async()=>({id:1,url:'https://www.zhipin.com/job_detail/a.html'}),update:async()=>({status:'loading'}),reload:async()=>({status:'loading'})},runtime:{onMessage:{addListener:()=>{}}}};
 context.globalThis=context;
 const source=fs.readFileSync(path.resolve(__dirname,'extension/background.js'),'utf8')+'\nglobalThis.__read=read;globalThis.__sendOnce=sendOnce;globalThis.__page=page;globalThis.__scanPage=scanPage;globalThis.__sameNavigationTarget=sameNavigationTarget;globalThis.__cancel=cancel;globalThis.__directedChatUrl=directedChatUrl;globalThis.__enterDirectedChat=enterDirectedChat;globalThis.__canContinueWithPartialScan=canContinueWithPartialScan;globalThis.__setActiveRun=r=>{activeRun=r};';
 vm.runInNewContext(source,context,{filename:'background.js'});
 const run={running:true};context.__setActiveRun(run);
 return {read:(command='scan')=>context.__read(run,command),sendOnce:data=>context.__sendOnce(run,data),page:url=>context.__page(run,url),run,context,calls:()=>calls};
}
// The old 12-read window failed before a slow list hydrated. The 14th read now
// succeeds, while a permanently empty list remains bounded and Stop interrupts it.
const delayedBackground=backgroundHarness(n=>n<14?{wait:true,reason:'加载中'}:{jobs:[{city:'上海'}]});
assert.deepEqual(await delayedBackground.read(),{jobs:[{city:'上海'}]});assert.equal(delayedBackground.calls(),14);
const transientMissingReceiver=backgroundHarness(n=>{if(n<3)throw Error('Could not establish connection. Receiving end does not exist.');return {jobs:[{city:'上海'}]};});let transientReloads=0;transientMissingReceiver.context.chrome.tabs.reload=async()=>{transientReloads++;return {status:'loading'};};assert.deepEqual(await transientMissingReceiver.read(),{jobs:[{city:'上海'}]});assert.equal(transientReloads,0);
const missingReceiver=backgroundHarness(n=>{if(n<=5)throw Error('Could not establish connection. Receiving end does not exist.');return {jobs:[{city:'上海'}]};});let recoveryReloads=0;missingReceiver.context.chrome.tabs.reload=async()=>{recoveryReloads++;return {status:'loading'};};assert.deepEqual(await missingReceiver.read(),{jobs:[{city:'上海'}]});assert.equal(recoveryReloads,1);assert.equal(missingReceiver.run.contentRecovery.method,'single-safe-tab-reload');
const emptyShell=backgroundHarness(n=>n<=5?{wait:true,scanState:{kind:'empty-shell',cards:0},reason:'没有识别到岗位卡片。请在此列表页点“页面诊断”，将文件发给我适配'}:{jobs:[{city:'深圳'}]});let emptyShellReloads=0;emptyShell.context.chrome.tabs.reload=async()=>{emptyShellReloads++;return {status:'loading'};};assert.deepEqual(await emptyShell.read(),{jobs:[{city:'深圳'}]});assert.equal(emptyShellReloads,1);assert.equal(emptyShell.run.contentRecovery.method,'single-empty-shell-reload');
const staleCityShell=backgroundHarness(n=>n<=5?{wait:true,scanState:{kind:'all-other-city',cards:15,noLink:0,noCity:0,otherCity:15},reason:'识别到 15 张卡片；缺详情链接 0，缺城市 0，其他城市 15。请点“页面诊断”导出；未发送消息'}:{jobs:[{city:'杭州'}]});let staleCityReloads=0;staleCityShell.context.chrome.tabs.reload=async()=>{staleCityReloads++;return {status:'loading'};};assert.deepEqual(await staleCityShell.read(),{jobs:[{city:'杭州'}]});assert.equal(staleCityReloads,1);assert.equal(staleCityShell.run.contentRecovery.method,'single-stale-city-reload');
const partialDecision=backgroundHarness(()=>({}));const priorQueue=[{key:'/job_detail/sh.html',city:'上海'}];const pureScanTimeout={code:'READ_TIMEOUT',details:{command:'scan',lastWaitReason:'没有识别到岗位卡片。请在此列表页点“页面诊断”，将文件发给我适配'}};assert.equal(partialDecision.context.__canContinueWithPartialScan({pending:null,lastSafety:null},pureScanTimeout,priorQueue),true);assert.equal(partialDecision.context.__canContinueWithPartialScan({pending:null,lastSafety:null},pureScanTimeout,[]),false);assert.equal(partialDecision.context.__canContinueWithPartialScan({pending:null,lastSafety:{source:'verification-ui'}},pureScanTimeout,priorQueue),false);assert.equal(partialDecision.context.__canContinueWithPartialScan({pending:null,lastSafety:null},{code:'PAGE_CONNECTION_FAILED',details:{command:'scan',lastWaitReason:pureScanTimeout.details.lastWaitReason}},priorQueue),false);assert.equal(partialDecision.context.__canContinueWithPartialScan({pending:null,lastSafety:null},{code:'READ_TIMEOUT',details:{command:'scan',lastWaitReason:'其他加载错误'}},priorQueue),false);assert.equal(partialDecision.context.__canContinueWithPartialScan({pending:{key:'/job_detail/pending.html'},lastSafety:null},pureScanTimeout,priorQueue),false);
const allOtherTimeout={code:'READ_TIMEOUT',details:{command:'scan',lastWaitReason:'识别到 15 张卡片；缺详情链接 0，缺城市 0，其他城市 15。请点“页面诊断”导出；未发送消息'}};assert.equal(partialDecision.context.__canContinueWithPartialScan({pending:null,lastSafety:null,contentRecovery:{command:'scan',method:'single-stale-city-reload'}},allOtherTimeout,priorQueue),true);assert.equal(partialDecision.context.__canContinueWithPartialScan({pending:null,lastSafety:null,contentRecovery:{command:'scan',method:'single-empty-shell-reload'}},allOtherTimeout,priorQueue),true);assert.equal(partialDecision.context.__canContinueWithPartialScan({pending:null,lastSafety:null},allOtherTimeout,priorQueue),false);
const boundedBackground=backgroundHarness(()=>({wait:true,reason:'加载中'}));
await assert.rejects(()=>boundedBackground.read(),/加载中/);assert.equal(boundedBackground.calls(),50);
const chatWaitBackground=backgroundHarness(()=>({wait:true,reason:'正在进入聊天页面'}));
await assert.rejects(()=>chatWaitBackground.read('chatReady'),error=>error.code==='CHAT_READY_TIMEOUT'&&/聊天页就绪等待超时/.test(error.message)&&!/^[正在进入聊天页面]+$/.test(error.message));assert.equal(chatWaitBackground.calls(),40);
const identityFailure={mismatchFields:['薪资'],salaryComparison:{expected:'11-20K',current:'8-12K',nodeCount:1,normalizedMatch:false},selectionElapsedMs:5001,stableSnapshotReads:6,stableSnapshotReady:true};
const rejectedIdentity=backgroundHarness(()=>({error:'聊天对象公开身份核对失败（薪资）',identityDiagnostic:identityFailure}));
await assert.rejects(()=>rejectedIdentity.read('chatReady'),error=>error.code==='PAGE_REJECTED'&&JSON.stringify(error.details.identityDiagnostic)===JSON.stringify(identityFailure));
const unreadableIdentity=backgroundHarness(()=>({wait:true,reason:'当前聊天薪资公开文本仍含不可直接读取的页面字体字形',identityDiagnostic:identityFailure}));
await assert.rejects(()=>unreadableIdentity.read('chatReady'),error=>error.code==='CHAT_READY_TIMEOUT'&&JSON.stringify(error.details.identityDiagnostic)===JSON.stringify(identityFailure));
const stoppedBackground=backgroundHarness(()=>({wait:true,reason:'加载中'}));let pauses=0;stoppedBackground.context.onPause=()=>{if(++pauses===3)stoppedBackground.run.running=false;};
await assert.rejects(()=>stoppedBackground.read(),/已停止/);assert.equal(stoppedBackground.calls(),1);
const sendPortBackground=backgroundHarness(()=>{throw Error('message port closed');});
await assert.rejects(()=>sendPortBackground.sendOnce({}),/不会自动重试/);assert.equal(sendPortBackground.calls(),1);
assert.equal(sendPortBackground.context.__directedChatUrl({chatUrl:'https://www.zhipin.com/web/geek/chat?ka=x',communicationTarget:{directionSufficient:false}}),null);
assert.equal(sendPortBackground.context.__directedChatUrl({chatUrl:'https://www.zhipin.com/web/geek/chat?jobId=private',communicationTarget:{directionSufficient:true}}),'https://www.zhipin.com/web/geek/chat?jobId=private');
// Streaming chat tabs need not report complete: navigation returns after its
// bounded grace period and DOM readiness is handled by chatReady.
const streamingPage=backgroundHarness(()=>({}));let streamingCurrent='https://www.zhipin.com/job_detail/a.html';streamingPage.context.chrome.tabs.update=async(id,options)=>{streamingCurrent=options.url;return {status:'loading',url:options.url};};streamingPage.context.chrome.tabs.get=async()=>({id:1,url:streamingCurrent,status:'loading'});await streamingPage.page('https://www.zhipin.com/web/geek/chat?id=1');
const initialScanPage=backgroundHarness(()=>({}));const firstSearch='https://www.zhipin.com/web/geek/jobs?query=AI+%E4%BA%A7%E5%93%81%E7%BB%8F%E7%90%86&city=101020100';let initialScanUpdates=0;initialScanPage.context.chrome.tabs.update=async()=>{initialScanUpdates++;};initialScanPage.context.chrome.tabs.get=async()=>({id:1,url:firstSearch,status:'loading'});initialScanPage.run.initialScanUrl=firstSearch;initialScanPage.run.initialScanUrlUsed=false;await initialScanPage.context.__scanPage(initialScanPage.run,firstSearch);assert.equal(initialScanUpdates,0);assert.equal(initialScanPage.run.initialScanUrlUsed,true);
const delayedCommit=backgroundHarness(()=>({}));const delayedTarget='https://www.zhipin.com/web/geek/jobs?query=FDE&city=101280600';let commitReads=0;delayedCommit.context.chrome.tabs.update=async()=>({status:'loading'});delayedCommit.context.chrome.tabs.get=async()=>({id:1,url:++commitReads<4?'https://www.zhipin.com/web/geek/jobs?query=FDE&city=101020100':delayedTarget,pendingUrl:commitReads<4?delayedTarget:undefined,status:'loading'});await delayedCommit.page(delayedTarget);assert.equal(commitReads,4);assert.equal(delayedCommit.context.__sameNavigationTarget('https://www.zhipin.com/web/geek/jobs?city=101020100&query=AI%20%E4%BA%A7%E5%93%81%E7%BB%8F%E7%90%86',firstSearch),true);
const navigationJob={url:'https://www.zhipin.com/job_detail/a.html',chatUrl:'https://www.zhipin.com/web/geek/chat?id=private-id&jobId=private-job&lid=private-lid&securityId=private-security',communicationTarget:{redirectPath:'/web/geek/chat',queryParamNames:['id','jobId','lid','securityId'],directionSufficient:true}};
const nativeRoute=backgroundHarness(()=>({}));let nativeGets=0,nativeUpdates=0;nativeRoute.context.chrome.tabs.get=async()=>({url:++nativeGets>=3?'https://www.zhipin.com/web/geek/chat':'https://www.zhipin.com/job_detail/a.html'});nativeRoute.context.chrome.tabs.update=async()=>{nativeUpdates++;};await nativeRoute.context.__enterDirectedChat(nativeRoute.run,navigationJob);assert.equal(nativeUpdates,0);assert.equal(nativeRoute.run.navigation.method,'site-click');
const pendingNativeRoute=backgroundHarness(()=>({}));let pendingNativeGets=0,pendingNativeUpdates=0;pendingNativeRoute.context.chrome.tabs.get=async()=>({url:++pendingNativeGets>=4?'https://www.zhipin.com/web/geek/chat':'https://www.zhipin.com/job_detail/a.html',pendingUrl:'https://www.zhipin.com/web/geek/chat?jobId=private-pending'});pendingNativeRoute.context.chrome.tabs.sendMessage=async(id,msg)=>msg.command==='openReady'?{opened:true}:{};pendingNativeRoute.context.chrome.tabs.update=async()=>{pendingNativeUpdates++;};await pendingNativeRoute.context.__enterDirectedChat(pendingNativeRoute.run,navigationJob);assert.equal(pendingNativeUpdates,0);assert.equal(pendingNativeRoute.run.navigation.method,'site-click');assert.equal(pendingNativeGets,4);
const directedRoute=backgroundHarness(()=>({}));let directedCurrent='https://www.zhipin.com/job_detail/a.html',directedUpdates=[];directedRoute.context.chrome.tabs.get=async()=>({url:directedCurrent});directedRoute.context.chrome.tabs.sendMessage=async(id,msg)=>{if(msg.command==='openReady'){assert.equal(msg.key,'/job_detail/a.html');return {opened:true};}return {};};directedRoute.context.chrome.tabs.update=async(id,options)=>{directedUpdates.push(options.url);directedCurrent=options.url;return {url:options.url};};await directedRoute.context.__enterDirectedChat(directedRoute.run,navigationJob);assert.deepEqual(directedUpdates,[navigationJob.chatUrl]);assert.equal(directedRoute.run.navigation.method,'official-directed-url');assert(!JSON.stringify(directedRoute.run.navigation).includes('private-'));
const unconfirmedOpen=backgroundHarness(()=>({wait:true,reason:'网站尚未公开确认已建立沟通'}));let unsafeDirectedUpdates=0;unconfirmedOpen.context.chrome.tabs.get=async()=>({url:'https://www.zhipin.com/job_detail/a.html'});unconfirmedOpen.context.chrome.tabs.update=async()=>{unsafeDirectedUpdates++;};await assert.rejects(()=>unconfirmedOpen.context.__enterDirectedChat(unconfirmedOpen.run,navigationJob),error=>error.code==='OPEN_NOT_CONFIRMED'&&/未公开确认/.test(error.message));assert.equal(unsafeDirectedUpdates,0);assert.equal(unconfirmedOpen.run.navigation.outcome,'open-unconfirmed');
// A pending chrome.tabs.sendMessage is bounded. Stop and timeout both reject the
// chain, and resolving chatReady afterwards must never invoke send.
function pendingReadHarness(){
 let resolveReady,sendCalls=0;const timers=[];
 const context={console,URL,crypto:{randomUUID:()=> 'pending-run'},importScripts:()=>{}};
 context.setTimeout=(fn,ms)=>{const timer={fn,ms,active:true};timers.push(timer);return timer;};context.clearTimeout=timer=>{if(timer)timer.active=false;};
 context.chrome={storage:{local:{get:async()=>({}),set:async()=>{}}},tabs:{sendMessage:async(id,msg)=>{if(msg.command==='chatReady')return new Promise(resolve=>{resolveReady=resolve;});if(msg.command==='send'){sendCalls++;return {status:'sent'};}throw Error('unexpected');}},runtime:{onMessage:{addListener:()=>{}}}};
 context.globalThis=context;vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'extension/background.js'),'utf8')+'\nglobalThis.__read=read;globalThis.__sendOnce=sendOnce;globalThis.__cancel=cancel;globalThis.__setActiveRun=r=>{activeRun=r};',context,{filename:'background-pending.js'});
 const run={running:true,tab:1,id:'pending-run'};context.__setActiveRun(run);
 const chain=(async()=>{await context.__read(run,'chatReady',{});return context.__sendOnce(run,{runId:run.id});})();
 return {context,run,chain,timers,resolve:result=>resolveReady(result),sendCalls:()=>sendCalls};
}
const stoppedPending=pendingReadHarness();await new Promise(resolve=>setImmediate(resolve));stoppedPending.context.__cancel(stoppedPending.run);await assert.rejects(stoppedPending.chain,/已停止/);stoppedPending.resolve({ready:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(stoppedPending.sendCalls(),0);
const timedOutPending=pendingReadHarness();await new Promise(resolve=>setImmediate(resolve));const readTimeout=timedOutPending.timers.find(timer=>timer.active&&timer.ms===5000);assert(readTimeout);readTimeout.fn();await assert.rejects(timedOutPending.chain,/响应.*超时/);timedOutPending.resolve({ready:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(timedOutPending.sendCalls(),0);
// The explicit existing-chat verifier may navigate an exact protected record,
// but its dry run never issues open/send and never writes records.
{
 const key='/job_detail/a.html',record={status:'unknown',title:'AI产品经理',city:'上海',company:'测试公司'};let currentUrl=`https://www.zhipin.com${key}`,commands=[],updates=[],writes=[];
 const context={console,URL,BossCore:C,crypto:{randomUUID:()=> 'verify-run'},importScripts:()=>{},setTimeout:(fn,ms)=>{if(ms<3000)fn();return {fn,ms};},clearTimeout:()=>{}};
 context.chrome={storage:{local:{get:async name=>name==='records'?{records:{[key]:record}}:{},set:async value=>{writes.push(value);}}},tabs:{sendMessage:async(id,msg)=>{commands.push(msg.command);if(msg.command==='detail')return {url:currentUrl,title:'AI产品经理',city:'上海',salary:'30-55K',company:'测试公司',companyKey:C.companyKey('测试公司'),companyAliases:['测试公司'],recruiterName:'测试丙女士',recruiterCompany:'示例平台公司',recruiterRole:'HR',talked:true,chatUrl:'https://www.zhipin.com/web/geek/chat?id=private&jobId=private-job&lid=private-lid&securityId=private-security',communicationTarget:{redirectPath:'/web/geek/chat',queryParamNames:['id','jobId','lid','securityId'],targetParamNames:['id','jobId','lid','securityId'],strongTargetParamNames:['jobId'],directionSufficient:true}};if(msg.command==='chatReady'){assert.equal(msg.runId,'verify-verify-run');assert.equal(msg.requireIdentityStability,true);return {ready:true,method:'public-fingerprint',pagePath:'/web/geek/chat'};}if(msg.command==='diagnose'){assert.equal(msg.expectedSalary,'30-55K');assert.equal(msg.runId,'verify-verify-run');return {counts:{'#chat-input':1},outgoingShape:{substantive:0}};}if(msg.command==='cancel')return {ok:true};throw Error(`unexpected ${msg.command}`);},get:async()=>({id:1,url:currentUrl}),update:async(id,options)=>{updates.push(options.url);currentUrl=options.url;return {id,url:currentUrl};}},runtime:{onMessage:{addListener:()=>{}}}};context.globalThis=context;
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'extension/background.js'),'utf8')+'\nglobalThis.__verifyExistingChat=verifyExistingChat;',context,{filename:'background-verify.js'});
 const verified=await context.__verifyExistingChat({id:1,url:`https://www.zhipin.com${key}`});assert.equal(verified.verification.matched,true);assert.equal(verified.verification.sendCommands,0);assert.equal(verified.verification.recordStatusUnchanged,'unknown');assert.deepEqual(commands.filter(command=>command==='open'||command==='send'),[]);assert.equal(updates.length,1);assert(!writes.some(value=>Object.hasOwn(value,'records')));assert(!JSON.stringify(verified).includes('private-'));
}
// The read-only diagnostic opens the exact protected record URL in an inactive
// tab, compares its full public tuple to the current chat, and closes only that tab.
{
 let removed=[];
 const key='/job_detail/a.html',record={status:'unknown',time:'2026-10-23T00:00:00Z',title:'AI产品经理',city:'上海',company:'测试公司'};
 const diagnostic={selectedJob:{controlText:['AI产品经理（猎头职位）\n上海']},selectedConversationEntry:{tag:'DIV',class:'friend-content selected'},counts:{'#chat-input':1},outgoingShape:{substantive:0}};
 const context={console,URL,BossCore:C,crypto:{randomUUID:()=> 'test-run'},importScripts:()=>{},setTimeout:(fn,ms)=>{if(ms<3000)fn();return {fn,ms};},clearTimeout:()=>{}};
 context.chrome={storage:{local:{get:async name=>name==='records'?{records:{[key]:record}}:{},set:async()=>{}}},tabs:{query:async()=>[{id:10,url:'https://www.zhipin.com/web/geek/chat'}],create:async()=>({id:11,url:'https://www.zhipin.com/job_detail/a.html'}),sendMessage:async(id,msg)=>{if(id===11&&msg.command==='detail')return {url:'https://www.zhipin.com/job_detail/a.html?private=x',title:'AI产品经理',city:'上海',salary:'30-55K·15薪',company:'测试公司',companyKey:C.companyKey('测试公司'),companyAliases:['测试公司'],recruiterName:'测试甲先生',recruiterCompany:'上海示例人才服务',recruiterRole:'猎头顾问'};if(id===10&&msg.command==='chatReady')return {ready:true,method:'public-fingerprint',identityToken:'public:x'};if(id===10&&msg.command==='diagnose')return diagnostic;throw Error('unexpected message');},remove:async id=>{removed.push(id);},update:async()=>{}},runtime:{onMessage:{addListener:()=>{}}}};
 context.globalThis=context;
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'extension/background.js'),'utf8')+'\nglobalThis.__diagnoseChatBinding=diagnoseChatBinding;',context,{filename:'background.js'});
 const bound=await context.__diagnoseChatBinding({id:10},diagnostic);assert.equal(bound.jobBinding.matched,true);assert.equal(bound.jobBinding.method,'public-fingerprint');assert.deepEqual(removed,[11]);assert(!JSON.stringify(bound).includes('private=x'));
}
// A later normal-page diagnostic exposes only the stored historical failure;
// an older run with no snapshot remains explicitly null rather than guessed.
{
 let listener;const historical={time:'2026-10-23T06:34:00.000Z',reason:'历史停止',safetyDiagnostic:{version:'0.1.6',safety:{pathname:'/web/user',source:'login-route'},candidate:{jobPath:'/job_detail/a.html',title:'AI产品经理'}},currentJob:{key:'/job_detail/a.html',title:'AI产品经理'}};
 const context={console,URL,crypto:{randomUUID:()=> 'test-run'},importScripts:()=>{},setTimeout:(fn,ms)=>{if(ms<3000)fn();return {fn,ms};},clearTimeout:()=>{}};
 context.chrome={storage:{local:{get:async key=>Array.isArray(key)?{lastFailure:historical}:key==='lastFailure'?{lastFailure:historical}:{},set:async()=>{}}},tabs:{query:async()=>[{id:7,url:'https://www.zhipin.com/job_detail/a.html?private=query'}],sendMessage:async()=>({version:'0.1.6',pagePath:'/job_detail/a.html',note:'normal diagnostic'})},runtime:{onMessage:{addListener:f=>{listener=f;}}}};context.globalThis=context;
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'extension/background.js'),'utf8'),context,{filename:'background.js'});
 const result=await new Promise(resolve=>listener({type:'diagnose'},{},resolve));assert.equal(result.diagnostic.lastFailure.safetyDiagnostic.safety.pathname,'/web/user');assert.equal(result.diagnostic.lastFailure.safetyDiagnostic.candidate.jobPath,'/job_detail/a.html');assert(!JSON.stringify(result).includes('private=query'));
}
w.close();console.log('PASS: matching, city restriction, 10% quota, exact draft/custom-message deduplication, system-card vs substantive-outgoing handling, delayed real-card hydration/self-anchor/text-city scans, privacy-safe chat-target classification, bounded read/navigation/stop, pending-promise timeout and late-result suppression, expiring authorization and content cancellation, native-route wait and one directed same-tab fallback, zero-send existing-chat verification with unchanged records, single-attempt open/send, exact-record public-identity diagnostic and created-tab cleanup, company extraction/legal aliases/ambiguity/prefix collision, exact-link and verified no-link hunter binding, wrong recipient and verification stop; fixture-only, no live messages.');
})().catch(e=>{console.error(e);process.exit(1)});
