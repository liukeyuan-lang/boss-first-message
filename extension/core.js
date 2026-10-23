(function(root){
'use strict';
const MESSAGE='您好，我对这个岗位很感兴趣，也具备与岗位要求相关的经验。方便的话，希望进一步了解团队和工作内容，谢谢！';
const CITIES={上海:'101020100',深圳:'101280600',珠海:'101280700',杭州:'101210100'};
const DEFAULTS={message:MESSAGE,keywords:['AI 产品经理','FDE','AI 解决方案','AIGC'],limit:20,interval:10,hangzhouPercent:10};
const norm=s=>String(s||'').toLowerCase().replace(/\s+/g,'');
const companyText=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s·・•,，.。:：;；'"“”‘’()（）【】\[\]<>《》_-]+/g,'');
function companyKey(name){
 let value=companyText(name);
 // Registered-company suffixes may be shown on the business-info card but omitted
 // from the job header. Only remove exact legal suffixes; do not fuzzy-match names.
 value=value.replace(/(?:有限责任公司|有限公司)$/,'');
 return value.length>=2?value:null;
}
function fit(title,jd){
 const t=norm(title), d=norm(jd), both=t+' '+d;
 if(!t||!d)return {ok:false,reason:'岗位名称或职责缺失'};
 if(/算法工程师|算法研究|模型训练工程师|模型研发|纯销售|电话销售|招生|保险代理/.test(t))return {ok:false,reason:'不在目标岗位方向'};
 const ai=/ai|人工智能|大模型|智能体|aigc/.test(both);
 if((/产品经理|产品助理|产品策划/.test(t)&&ai)||/\bfde\b|forwarddeployed|前沿部署|前线部署/.test(t)||(/解决方案|方案顾问|方案工程师|售前/.test(t)&&ai)||(/aigc/.test(t)&&!/算法|研发工程师/.test(t)))return {ok:true,reason:'命中目标方向'};
 return {ok:false,reason:'标题和职责未明确命中目标方向'};
}
function key(url){try{const u=new URL(url);if(u.origin!=='https://www.zhipin.com'||!/^\/job_detail\/[^/]+\.html$/.test(u.pathname))return null;return u.pathname;}catch{return null;}}
function cityOf(text){const found=Object.keys(CITIES).filter(c=>String(text||'').includes(c));return found.length===1?found[0]:null;}
function hzAllowed(records,pct){const relevant=records.filter(r=>r.status==='sent'||r.status==='unknown'||r.status==='reserved');const hz=relevant.filter(r=>r.city==='杭州').length;return (hz+1)/(relevant.length+1)<=pct/100;}
const api={MESSAGE,CITIES,DEFAULTS,norm,companyText,companyKey,fit,key,cityOf,hzAllowed};root.BossCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
