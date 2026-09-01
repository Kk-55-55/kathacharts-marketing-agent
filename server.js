const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3100);
const SITE = process.env.KATHACHARTS_URL || 'https://kathacharts.com';
const MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const DB = process.env.DATA_FILE || path.join(__dirname, 'agent-data.json');
const PUB = path.join(__dirname, 'public');
const ADMIN_KEY = process.env.AGENT_ADMIN_KEY || '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const HUNT_INTERVAL_MINUTES = Math.max(10, Number(process.env.HUNT_INTERVAL_MINUTES || 30));

function emptyDb(){ return {
  drafts: [], leads: [],
  metrics: { visitors: 0, clicks: 0, leads: 0 },
  finance: { revenue: 0, operatingCost: 0, monthlyTarget: 5000, updatedAt: null },
  opportunities: [], revenueActions: [], revenueEvents: []
}; }

function load(){
  if(!fs.existsSync(DB)) return emptyDb();
  try{
    const d=JSON.parse(fs.readFileSync(DB,'utf8')); const e=emptyDb();
    return {...e,...d,
      metrics:{...e.metrics,...(d.metrics||{})},
      finance:{...e.finance,...(d.finance||{})},
      opportunities:Array.isArray(d.opportunities)?d.opportunities:[],
      revenueActions:Array.isArray(d.revenueActions)?d.revenueActions:[],
      revenueEvents:Array.isArray(d.revenueEvents)?d.revenueEvents:[]
    };
  }catch{return emptyDb();}
}
function save(db){
  const dir=path.dirname(DB);
  if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
  const tmp=DB+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(db,null,2));
  fs.renameSync(tmp,DB);
}
function json(res,code,data){
  res.writeHead(code,{
    'Content-Type':'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'Content-Type, X-Admin-Key',
    'Cache-Control':'no-store'
  });
  res.end(JSON.stringify(data));
}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>1000000)req.destroy();});req.on('end',()=>{try{resolve(s?JSON.parse(s):{});}catch(e){reject(e);}});req.on('error',reject);});}
function money(n){return '₹'+Number(n||0).toLocaleString('en-IN');}
function authorized(req){
  if(!IS_PRODUCTION && !ADMIN_KEY) return true;
  if(!ADMIN_KEY) return false;
  const provided=Buffer.from(String(req.headers['x-admin-key']||''));
  const expected=Buffer.from(String(ADMIN_KEY));
  if(provided.length!==expected.length)return false;
  return crypto.timingSafeEqual(provided,expected);
}
function mutationGuard(req,res){
  if(authorized(req)) return true;
  json(res,401,{error:'Admin authorization required. Set AGENT_ADMIN_KEY and enter it in the dashboard.'});
  return false;
}

function survival(db){
  const r=Number(db.finance.revenue||0), c=Number(db.finance.operatingCost||0), t=Math.max(5000,Number(db.finance.monthlyTarget||5000));
  const ratio=c>0?r/c:(r>0?Infinity:0);
  let state='CRITICAL';
  if(r>=t && ratio>=5) state='HIGH GROWTH';
  else if(r>=t) state='STABLE';
  return {
    revenue:r,operatingCost:c,target:t,
    ratio:Number.isFinite(ratio)?Number(ratio.toFixed(2)):null,
    state,
    urgency:state==='CRITICAL'?'HIGH':state==='STABLE'?'NORMAL':'GROWTH',
    gap:Math.max(0,t-r),
    neverStopHunting:true
  };
}

function opportunitySeed(){return [
 {type:'b2b',name:'Pitch a writer/page promotion package',why:'Direct paid-revenue offer for creators who want additional visibility',speed:5,probability:4,revenue:5,cost:1,action:'Prepare a personalized promotion offer and send it only after approval.'},
 {type:'creator',name:'Offer a paid creator visibility service',why:'Package discovery, profile placement and campaign support into a paid service',speed:4,probability:4,revenue:5,cost:1,action:'Create a service package, pricing options and a qualified lead list.'},
 {type:'sponsor',name:'Build a sponsored discovery package',why:'Higher-value sponsorship opportunity for relevant brands or communities',speed:3,probability:3,revenue:5,cost:1,action:'Draft a sponsorship one-pager and identify suitable public prospects.'},
 {type:'conversion',name:'Improve landing-page conversion',why:'Turn existing visitors into measurable actions and monetizable leads',speed:5,probability:4,revenue:4,cost:1,action:'Prepare a conversion test plan using current funnel evidence.'},
 {type:'partnership',name:'Reach relevant writer communities',why:'Qualified awareness can create both traffic and promotion leads',speed:4,probability:3,revenue:4,cost:1,action:'Build a small, relevant public-community outreach list and drafts.'},
 {type:'content',name:'Repurpose winning multilingual content',why:'Increase qualified traffic without proportional production cost',speed:4,probability:4,revenue:3,cost:1,action:'Repurpose the strongest content into Marathi, Hindi and English variants.'},
 {type:'seo',name:'Publish high-intent discovery content',why:'Compounding organic acquisition can create future monetizable demand',speed:2,probability:3,revenue:4,cost:1,action:'Draft high-intent SEO topics and approval-ready content.'},
 {type:'referral',name:'Design a referral/partner acquisition offer',why:'Turn existing readers and creators into qualified acquisition channels',speed:3,probability:3,revenue:4,cost:1,action:'Design a simple referral proposition and measurement plan.'}
];}

function scoreOpportunities(db){
 const s=survival(db);
 const mode={
  CRITICAL:{revenue:3.2,speed:1.7,probability:1.25,cost:.65,traffic:.25},
  STABLE:{revenue:2,speed:1.25,probability:1.15,cost:.8,traffic:.65},
  'HIGH GROWTH':{revenue:2,speed:1,probability:1,cost:1,traffic:1.05}
 }[s.state];
 return opportunitySeed().map(x=>{
   const direct=['b2b','creator','sponsor'].includes(x.type);
   const traffic=['content','seo','partnership','referral'].includes(x.type);
   const base=x.speed*x.probability*x.revenue/(x.cost||1);
   let mult=mode.revenue;
   if(direct)mult*=1.4;
   if(traffic)mult*=mode.traffic;
   const score=base*mult*mode.speed*mode.probability/(mode.cost||1);
   const estimatedRevenue={b2b:7500,creator:5000,sponsor:15000,conversion:3000,partnership:2500,content:1500,seo:4000,referral:3500}[x.type];
   return {...x,score:Number(score.toFixed(1)),estimatedRevenue,priority:direct?'DIRECT REVENUE':traffic?'GROWTH':'CONVERSION',state:s.state,status:'candidate'};
 }).sort((a,b)=>b.score-a.score);
}

function link(source='campaign',medium='social'){
 return `${SITE}?utm_source=${encodeURIComponent(source)}&utm_medium=${encodeURIComponent(medium)}&utm_campaign=kathacharts_awareness`;
}
const FALLBACK={
 marathi:{headline:'तुमची कथा चांगली आहे. आता ती वाचकांपर्यंत पोहोचू द्या.',posts:[`📚 तुमची कथा आधीच लिहून झाली आहे. आता योग्य वाचकांना ती शोधू द्या.\n\nKathaCharts वर भारतीय कथा आणि लेखक एका discovery space मध्ये भेटतात.\n\n🔗 ${link('marathi','social')}\n\n#KathaCharts #मराठीलेखक #मराठीकथा #वाचक`,`👀 तुमच्या कथेचा पुढचा वाचक कुठेतरी तुमच्यासारखीच कथा शोधत असेल.\n\nKathaCharts वरील discovery मुळे वाचकांना नवीन कथा आणि लेखक शोधता येतात.\n\n🔗 ${link('marathi','social')}\n\n#मराठीकथा #लेखन #KathaCharts`,`✍️ लेखकांनो, फक्त योगायोगावर discovery सोडू नका.\n\nतुमची original story/profile KathaCharts वर नोंदवा. नंतर हवे असल्यास visibility promotion निवडा.\n\n🔗 ${link('marathi','social')}\n\n#मराठीलेखक #लेखक #KathaCharts`]},
 hindi:{headline:'आपकी कहानी लिखी जा चुकी है। अब उसे सही पाठकों तक पहुँचने दें.',posts:[`📚 आपकी कहानी पहले ही लिखी जा चुकी है। अब उसे सही पाठकों तक खोजने योग्य बनाइए।\n\nKathaCharts भारतीय कहानियों और लेखकों के लिए एक discovery space है।\n\n🔗 ${link('hindi','social')}\n\n#KathaCharts #HindiWriters #HindiStories #Readers`,`👀 हो सकता है आपका अगला पाठक अभी आपकी जैसी कहानी खोज रहा हो।\n\nKathaCharts पाठकों को नई कहानियाँ और नए लेखक खोजने में मदद करता है।\n\n🔗 ${link('hindi','social')}\n\n#HindiStories #WritingCommunity #KathaCharts`,`✍️ लेखकों, अपनी कहानी की discovery को सिर्फ किस्मत पर मत छोड़िए।\n\nअपनी original story/profile को KathaCharts पर register करें। Promotion बाद में, जब आपको जरूरत हो।\n\n🔗 ${link('hindi','social')}\n\n#HindiWriters #Authors #KathaCharts`]},
 english:{headline:'Your story is written. Now let readers discover it.',posts:[`📚 Your story is already written. Now help the right readers discover it.\n\nKathaCharts is a discovery space for Indian stories and writers.\n\n🔗 ${link('english','social')}\n\n#KathaCharts #IndianWriters #IndianStories #Readers`,`👀 What if your next reader is already looking for a story like yours?\n\nKathaCharts helps readers discover new stories and writers.\n\n🔗 ${link('english','social')}\n\n#IndianStories #WritingCommunity #KathaCharts`,`✍️ Writers, don't leave discovery to chance.\n\nRegister your original story/profile on KathaCharts. Promotion can come later when you want extra visibility.\n\n🔗 ${link('english','social')}\n\n#Writers #Authors #KathaCharts`]}
};
function fallback(topic='KathaCharts awareness'){
 return {objective:'traffic-first awareness',topic,site:SITE,languages:['marathi','hindi','english'],headline:FALLBACK.english.headline,postsByLanguage:FALLBACK,cta:'Discover KathaCharts →',
 trafficPlan:['Create curiosity-led posts that send readers to KathaCharts.','Repurpose each idea in Marathi, Hindi and English.','Use community-appropriate hashtags and never mass-spam.','Review clicks and visitors before increasing writer outreach.'],
 seoTopics:['Indian story discovery platform','How new writers can get discovered online','Where Indian readers discover new stories','How Marathi writers can reach more readers','How Hindi writers can build story visibility'],
 leadOutreach:{marathi:'तुमच्या कथा/लेखनासाठी discovery वाढवण्याचा एक नवीन मार्ग पाहा — KathaCharts. तुमची original profile/story free register करता येते.',hindi:'अपने लेखन की discovery बढ़ाने का एक नया तरीका देखें — KathaCharts. आपकी original profile/story free में register की जा सकती है.',english:'Try a new discovery route for your writing — KathaCharts. You can register your original story/profile for free.'}
 };
}
async function aiGenerate(topic,languages){
 if(!process.env.OPENAI_API_KEY)return fallback(topic);
 const requested=Array.isArray(languages)&&languages.length?languages:['marathi','hindi','english'];
 const prompt=`You are the ethical growth-marketing agent for KathaCharts, an Indian story-discovery platform. Primary objective is qualified traffic and legitimate revenue. Generate a 7-day organic campaign in exactly these languages: ${requested.join(', ')}. Return JSON only with objective, topic, site, languages, headline, postsByLanguage (each with headline and 3 short posts), cta, trafficPlan (4), seoTopics (5), leadOutreach (one compliant template per language). Do not spam, scrape private data, impersonate, promise guaranteed fame/traffic, or violate platform rules. Use exact site URL ${SITE}. Topic: ${topic||'KathaCharts awareness'}.`;
 const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:MODEL,messages:[{role:'user',content:prompt}],temperature:.7,response_format:{type:'json_object'}})});
 if(!r.ok)throw new Error(`AI request failed: ${r.status}`);
 const d=await r.json();
 return JSON.parse(d.choices?.[0]?.message?.content||'{}');
}

function makeAction(o){
 const id='RA-'+crypto.randomUUID().split('-')[0].toUpperCase();
 const pitch=o.type==='b2b'
  ? `Subject: KathaCharts visibility opportunity\n\nHi {{name}},\nI came across your public writing profile and thought your work could be a fit for KathaCharts. We can prepare a paid visibility/promotion package focused on discovery. If useful, I can share the package and pricing for your review.\n\nKathaCharts: ${SITE}`
  : o.type==='creator'
  ? `Creator visibility offer\n\nWe can package KathaCharts discovery, profile placement and campaign support into a paid visibility service.\n\nNext step: qualify the creator, share the offer and request approval before any outreach.`
  : `Revenue action brief\n\n${o.name}\n${o.action}\n\nKathaCharts: ${SITE}`;
 return {
   id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
   opportunityType:o.type,name:o.name,priority:o.priority,score:o.score,estimatedRevenue:o.estimatedRevenue,
   state:o.state,status:'PROPOSED',approvalRequired:true,action:o.action,pitch,
   attempts:0,maxAttempts:3,nextFollowUpAt:null,lastExecutionAt:null,outcome:null,
   notes:'Prepared only. No external message, publishing, spending or commitment has occurred.',
   guardrails:{approvalRequired:true,publicOrConsentedProspectOnly:true,noBulkSpam:true,noSpendWithoutApproval:true,noImpersonation:true}
 };
}
function revenueSummary(db){
 const s=survival(db);
 const count=status=>db.revenueActions.filter(x=>x.status===status).length;
 const realized=db.revenueEvents.reduce((a,x)=>a+Number(x.amount||0),0);
 const pipeline=db.revenueActions.filter(x=>['PROPOSED','APPROVED','IN_PROGRESS'].includes(x.status)).reduce((a,x)=>a+Number(x.estimatedRevenue||0),0);
 return {...s,proposed:count('PROPOSED'),approved:count('APPROVED'),inProgress:count('IN_PROGRESS'),won:count('WON'),
  lost:db.revenueActions.filter(x=>['LOST','REJECTED'].includes(x.status)).length,
  realizedRevenue:realized,activePipeline:pipeline,totalRevenuePotential:realized+pipeline,
  executionMode:'CONTROLLED_AGGRESSIVE',huntingActive:true};
}
function ensureHunt(db,limit=5){
 const ranked=scoreOpportunities(db);
 const existing=new Set(db.revenueActions.filter(x=>['PROPOSED','APPROVED','IN_PROGRESS'].includes(x.status)).map(x=>x.opportunityType));
 const created=[];
 for(const o of ranked){
   if(created.length>=limit)break;
   if(existing.has(o.type))continue;
   const a=makeAction(o); db.revenueActions.unshift(a); created.push(a);
 }
 db.opportunities=ranked;
 return created;
}
function prepareExecution(a){
 if(a.status!=='APPROVED')return {ok:false,error:'Approve the action first.'};
 a.status='IN_PROGRESS'; a.attempts=(Number(a.attempts)||0)+1;
 a.lastExecutionAt=new Date().toISOString();
 a.execution={preparedAt:new Date().toISOString(),channel:['b2b','creator'].includes(a.opportunityType)?'direct outreach':'content/partnership',
  message:a.pitch,requiresHumanSend:true,nextStep:a.action};
 a.notes='Execution package prepared. Human send/approval gate remains active.';
 return {ok:true,action:a};
}
function prepareFollowUp(a){
 if(a.status!=='IN_PROGRESS')return {ok:false,error:'Start the action before preparing a follow-up.'};
 if((Number(a.attempts)||0)>=Number(a.maxAttempts||3))return {ok:false,error:'Maximum follow-up attempts reached.'};
 a.nextFollowUpAt=new Date(Date.now()+48*60*60*1000).toISOString();
 a.notes='Follow-up prepared; human send gate remains active.';
 return {ok:true,action:a};
}

function startBackgroundHunt(){
 const run=()=>{
   try{
     const db=load();
     const created=ensureHunt(db,5);
     if(created.length)save(db);
   }catch(e){console.error('Background hunt failed:',e.message);}
 };
 setTimeout(run,5000);
 setInterval(run,HUNT_INTERVAL_MINUTES*60*1000);
}

const server=http.createServer(async(req,res)=>{
 try{
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, X-Admin-Key'});return res.end();}
  const u=new URL(req.url,`http://${req.headers.host}`);
  const db=load();

  if(req.method==='GET'&&u.pathname==='/api/health')
   return json(res,200,{ok:true,site:SITE,ai:Boolean(process.env.OPENAI_API_KEY),authorized:!IS_PRODUCTION||Boolean(ADMIN_KEY),
    version:'V3.2 FINAL',objective:'traffic + continuous legitimate revenue + controlled execution',
    huntIntervalMinutes:HUNT_INTERVAL_MINUTES});

  if(req.method==='GET'&&u.pathname==='/api/state')
   return json(res,200,{...db,survival:survival(db),revenueSummary:revenueSummary(db),opportunities:scoreOpportunities(db)});

  if(req.method==='GET'&&u.pathname==='/api/survival')
   return json(res,200,{...survival(db),opportunities:scoreOpportunities(db)});

  if(req.method==='GET'&&u.pathname==='/api/revenue/actions')
   return json(res,200,{actions:db.revenueActions,summary:revenueSummary(db)});

  if(req.method==='POST'){
   if(!mutationGuard(req,res))return;
   if(u.pathname==='/api/finance'){
    const b=await body(req); db.finance.revenue=Math.max(0,Number(b.revenue||0)); db.finance.operatingCost=Math.max(0,Number(b.operatingCost||0));
    db.finance.monthlyTarget=Math.max(5000,Number(b.monthlyTarget||5000)); db.finance.updatedAt=new Date().toISOString(); save(db);
    return json(res,200,{finance:db.finance,survival:survival(db),summary:revenueSummary(db)});
   }
   if(u.pathname==='/api/opportunities'){
    db.opportunities=scoreOpportunities(db); save(db); return json(res,200,{opportunities:db.opportunities,survival:survival(db)});
   }
   if(u.pathname==='/api/revenue/hunt'||u.pathname==='/api/revenue/plan'){
    const b=await body(req); const limit=Math.min(8,Math.max(1,Number(b.limit||5)));
    const created=ensureHunt(db,limit); save(db);
    return json(res,200,{created,summary:revenueSummary(db),opportunities:scoreOpportunities(db),actions:db.revenueActions});
   }
   if(u.pathname==='/api/revenue/execute'){
    const b=await body(req); const a=db.revenueActions.find(x=>x.id===b.id);
    if(!a)return json(res,404,{error:'Revenue action not found'});
    const result=prepareExecution(a); if(!result.ok)return json(res,400,result); save(db);
    return json(res,200,{action:a,summary:revenueSummary(db)});
   }
   if(u.pathname==='/api/revenue/followup'){
    const b=await body(req); const a=db.revenueActions.find(x=>x.id===b.id);
    if(!a)return json(res,404,{error:'Revenue action not found'});
    const result=prepareFollowUp(a); if(!result.ok)return json(res,400,result); save(db);
    return json(res,200,{action:a,summary:revenueSummary(db)});
   }
   if(u.pathname==='/api/revenue/action'){
    const b=await body(req); const a=db.revenueActions.find(x=>x.id===b.id);
    if(!a)return json(res,404,{error:'Revenue action not found'});
    const allowed=['PROPOSED','APPROVED','IN_PROGRESS','LOST','REJECTED'];
    if(!allowed.includes(b.status))return json(res,400,{error:'Use the dedicated execution/revenue endpoints for this transition.'});
    if(b.status==='APPROVED'&&a.approvalRequired!==true)return json(res,400,{error:'Approval gate required'});
    if(b.status==='IN_PROGRESS'){const result=prepareExecution(a);if(!result.ok)return json(res,400,result);}
    else a.status=b.status;
    a.updatedAt=new Date().toISOString(); if(b.notes)a.notes=String(b.notes); save(db);
    return json(res,200,{action:a,summary:revenueSummary(db)});
   }
   if(u.pathname==='/api/revenue/event'){
    const b=await body(req); const amount=Math.max(0,Number(b.amount||0)); if(!amount)return json(res,400,{error:'Revenue amount must be greater than 0'});
    const event={id:'EV-'+Date.now().toString(36).toUpperCase(),createdAt:new Date().toISOString(),amount,source:b.source||'manual',actionId:b.actionId||'',note:b.note||''};
    db.revenueEvents.unshift(event); db.finance.revenue+=amount; db.finance.updatedAt=new Date().toISOString();
    if(b.actionId){const a=db.revenueActions.find(x=>x.id===b.actionId);if(a){a.status='WON';a.realizedRevenue=(Number(a.realizedRevenue)||0)+amount;a.updatedAt=new Date().toISOString();}}
    save(db); return json(res,200,{event,finance:db.finance,summary:revenueSummary(db)});
   }
   if(u.pathname==='/api/generate'){
    const b=await body(req); const langs=Array.isArray(b.languages)&&b.languages.length?b.languages:['marathi','hindi','english'];
    const result=await aiGenerate(b.topic||'KathaCharts awareness',langs);
    const draft={id:'MK-'+Date.now().toString(36).toUpperCase(),createdAt:new Date().toISOString(),status:'draft',topic:b.topic||'',languages:langs,...result};
    db.drafts.unshift(draft); save(db); return json(res,200,{draft});
   }
   if(u.pathname==='/api/leads'){
    const b=await body(req); if(!b.name&&!b.handle)return json(res,400,{error:'Name or handle required'});
    const lead={id:'LD-'+Date.now().toString(36).toUpperCase(),createdAt:new Date().toISOString(),status:'new',name:b.name||'',handle:b.handle||'',platform:b.platform||'',niche:b.niche||'',notes:b.notes||''};
    db.leads.unshift(lead);db.metrics.leads=db.leads.length;save(db);return json(res,200,{lead});
   }
   if(u.pathname==='/api/draft/status'){
    const b=await body(req); const d=db.drafts.find(x=>x.id===b.id); if(!d)return json(res,404,{error:'Draft not found'});
    d.status=['draft','approved','published'].includes(b.status)?b.status:d.status;save(db);return json(res,200,{draft:d});
   }
   if(u.pathname==='/api/metrics'){
    const b=await body(req); for(const k of ['visitors','clicks'])db.metrics[k]+=Number(b[k]||0);save(db);return json(res,200,{metrics:db.metrics});
   }
  }

  let file=u.pathname==='/'?'/index.html':u.pathname;
  const full=path.join(PUB,path.normalize(file));
  if(full.startsWith(PUB)&&fs.existsSync(full)&&fs.statSync(full).isFile()){
    const ext=path.extname(full);
    const type={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'}[ext]||'text/plain; charset=utf-8';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':ext==='.html'?'no-store':'public, max-age=3600'});return res.end(fs.readFileSync(full));
  }
  return json(res,404,{error:'Not found'});
 }catch(e){console.error(e);return json(res,500,{error:e.message||'Server error'});}
});

server.listen(PORT,'0.0.0.0',()=>{console.log(`KathaCharts Marketing Agent V3.2 FINAL running at http://localhost:${PORT}`);startBackgroundHunt();});
