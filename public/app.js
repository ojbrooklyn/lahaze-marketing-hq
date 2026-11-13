(function(){
"use strict";
var STORES=["All stores","LaHaze (Cheboygan)","Lighthouse (Traverse City)","Parc (Alpena)","Newity"];
var COMPANIES=["LaHaze","Newity"];
var AREAS=["Campaigns","Brand","Web & digital","Retail","Content","Merch","Planning"];
var CATS=["Direct marketing","Digital marketing","Operations","Membership","Subscriptions","Collaboration","Refresh website & GBP"];
var CATHINT={"Direct marketing":"Billboards, radio, text marketing, paid ads","Digital marketing":"Content, social, SEO, GEO","Operations":"Dutchie, AlpineIQ, software"};
var PRIOS=["High","Medium","Low"], PRANK={"High":0,"Medium":1,"Low":2}, PTONE={"High":"bad","Medium":"warn","Low":"mute"};
function prioTag(p){return p.priority&&PRANK[p.priority]!=null?'<span class="pill prio" style="--c:var(--'+PTONE[p.priority]+')">'+esc(p.priority)+" priority</span>":""}
function byPrio(a,b){var x=PRANK[a.priority],y=PRANK[b.priority];x=x==null?3:x;y=y==null?3:y;return x-y||(a.order||999)-(b.order||999)}
var PSTATUS=["Not set","Planned","In progress","In review","Blocked","Ongoing","Shipped"];
var PCOLOR={"Not set":"var(--mute)","Planned":"var(--mute)","In progress":"var(--info)","In review":"var(--warn)","Blocked":"var(--bad)","Ongoing":"var(--teal)","Shipped":"var(--ok)"};
var TONE={"Shipped":"ok","Approved":"ok","Done":"ok","Decided":"ok","Closed":"mute","In progress":"info","Accepted":"info","Scheduled":"info","Waiting on them":"info","Ongoing":"teal","In review":"warn","Waiting":"warn","New":"warn","Waiting on us":"warn","Blocked":"bad","Declined":"bad","Planned":"mute"};
var SCHEMA={
  projects:{one:"project",fields:[["name","Project name","text",1],["category","Category","select",CATS.concat(["Uncategorized"])],["priority","Priority","select",["Not set"].concat(PRIOS)],["company","Company","select",COMPANIES],["area","Type of work","select",AREAS],["store","Store","select",STORES],["status","Status","select",PSTATUS],["due","Due date","date"],["next","Next step","text"],["note","Notes","textarea"],["link","Link to the work (https://…)","url"],["result","Result leadership can read (a number or outcome)","text"],["budget","Budget ($)","number"],["spend","Spent so far ($)","number"],["shippedAt","Shipped on","date"]]},
  decisions:{one:"approval",fields:[["title","What needs a decision","text",1],["type","Type","select",["Approval","Decision","Budget"]],["project","Project","project"],["ask","The ask, in a sentence or two","textarea"],["from","Who decides","text"],["neededBy","Needed by","date"],["status","Status","select",["Waiting","Approved","Declined","Decided"]],["outcome","Outcome","textarea"],["decidedOn","Decided on","date"]]},
  requests:{one:"request",fields:[["title","What do you need?","text",1],["from","Your name","text"],["store","Store","select",STORES],["detail","Details","textarea"],["priority","Priority","select",["Normal","Urgent","Whenever"]],["neededBy","Needed by","date"],["status","Status","select",["New","Accepted","In progress","Done","Declined"]],["reply","Reply from marketing","textarea"]]},
  updates:{one:"update",fields:[["date","Date","date"],["project","Project","project"],["kind","Kind","select",["Progress","Shipped","Blocked","Heads up"]],["text","Update","textarea",1]]},
  vendors:{one:"vendor thread",fields:[["vendor","Vendor or partner","text",1],["contact","Contact person","text"],["topic","Topic","text"],["project","Project","project"],["status","Status","select",["Waiting on them","Waiting on us","Scheduled","Closed"]],["lastContact","Last contact","date"],["next","Next step","text"]]},
  dates:{one:"key date",fields:[["name","Name","text",1],["date","Date","date",1],["note","Note","text"]]}
};
var COLS=Object.keys(SCHEMA);
var TABS=[["board","Board"],["overview","Briefing"],["approvals","Approvals"],["requests","Requests"],["updates","Updates"],["vendors","Vendors"]];
var S={}; COLS.forEach(function(c){S[c]=[]});
var db=null, canWrite=false, loaded=false, problem="", filt={status:"All",store:"All",area:"All",cat:"All",prio:"All",mode:"board"};
var mode={storage:false,needsKey:false,key:""};
try{var sv=JSON.parse(localStorage.getItem("hq-filt")||"null"); if(sv&&sv.store&&sv.mode) filt=Object.assign(filt,sv);}catch(e){}
try{mode.key=localStorage.getItem("hq-key")||""}catch(e){}

var $=function(s){return document.querySelector(s)};
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function today(){var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function diff(iso){return Math.round((Date.parse(iso+"T00:00:00")-Date.parse(today()+"T00:00:00"))/864e5)}
function fmt(iso){if(!iso)return"";var d=new Date(iso+"T00:00:00");var o={month:"short",day:"numeric"};if(d.getFullYear()!==new Date().getFullYear())o.year="numeric";return d.toLocaleDateString("en-US",o)}
function rel(iso){var n=diff(iso);return n===0?"today":n===1?"tomorrow":n>0?"in "+n+" days":n===-1?"yesterday":(-n)+" days ago"}
function usd(n){return "$"+Math.round(Number(n)||0).toLocaleString("en-US")}
function pname(id){var p=S.projects.find(function(x){return x.id===id});return p?p.name:""}
function pill(st){if(!st||st==="Not set")return '<span class="pill unset">Status not set</span>';return '<span class="pill" style="--c:var(--'+(TONE[st]||"mute")+')">'+esc(st)+'</span>'}
function when(iso,done){if(!iso)return"";var late=!done&&diff(iso)<0;return '<span class="when'+(late?" late":"")+'">'+esc(fmt(iso))+" · "+esc(rel(iso))+"</span>"}
var quiet=false;
function editBtn(col,id,force){return canWrite&&db&&(force||!quiet)?'<button class="btn ghost sm" data-edit="'+col+":"+esc(id)+'">Edit</button>':""}
function addBtn(col,label){return canWrite&&db?'<button class="btn" data-add="'+col+'">'+esc(label)+"</button>":""}
function safeUrl(u){return typeof u==="string"&&/^https:\/\//i.test(u)?u:""}
function by(k,dir){return function(a,b){var x=a[k]||"",y=b[k]||"";if(!x&&y)return 1;if(x&&!y)return -1;return (x<y?-1:x>y?1:0)*(dir||1)}}
function view(){var h=location.hash.replace("#","");if(h.indexOf("p/")===0&&S.projects.some(function(p){return p.id===decodeURIComponent(h.slice(2))}))return "project";if(h.indexOf("p/")===0&&!loaded)return "project";return TABS.some(function(t){return t[0]===h})?h:"board"}
function pid(){return decodeURIComponent(location.hash.replace("#","").slice(2))}
function plink(p){return '<a href="#p/'+encodeURIComponent(p.id)+'">'+esc(p.name)+"</a>"}

/* ---------- rows ---------- */
function projRow(p){
  var u=safeUrl(p.link);
  var sub=[p.next?"Next: "+p.next:"",p.note||""].filter(Boolean).join(" · ");
  if(p.result) sub=(sub?sub+" · ":"")+"Result: "+p.result;
  return '<div class="row"><div class="main"><div class="t">'+plink(p)+'</div>'+(sub?'<div class="s">'+esc(sub)+"</div>":"")+'</div><div class="side">'+prioTag(p)+(p.store&&p.store!=="All stores"?'<span class="tag">'+esc(p.store)+"</span>":"")+(p.status==="Shipped"?(p.shippedAt?'<span class="when">Shipped '+esc(fmt(p.shippedAt))+"</span>":""):when(p.due))+pill(p.status)+editBtn("projects",p.id)+"</div></div>";
}
function decRow(d){
  var open=d.status==="Waiting"||!d.status;
  var sub=[d.ask,pname(d.project)?"Project: "+pname(d.project):"",d.from?"Decides: "+d.from:"",!open&&d.outcome?"Outcome: "+d.outcome:""].filter(Boolean).join(" · ");
  return '<div class="row"><div class="main"><div class="t">'+esc(d.title)+'</div>'+(sub?'<div class="s">'+esc(sub)+"</div>":"")+'</div><div class="side">'+(d.type?'<span class="tag">'+esc(d.type)+"</span>":"")+(open?when(d.neededBy):(d.decidedOn?'<span class="when">'+esc(fmt(d.decidedOn))+"</span>":""))+pill(d.status||"Waiting")+editBtn("decisions",d.id)+"</div></div>";
}
function reqRow(r){
  var open=["Done","Declined"].indexOf(r.status)<0;
  var sub=[r.detail,r.from?"From: "+r.from:"",r.reply?"Reply: "+r.reply:""].filter(Boolean).join(" · ");
  return '<div class="row"><div class="main"><div class="t">'+esc(r.title)+'</div>'+(sub?'<div class="s">'+esc(sub)+"</div>":"")+'</div><div class="side">'+(r.priority==="Urgent"?'<span class="pill" style="--c:var(--bad)">Urgent</span>':"")+(r.store&&r.store!=="All stores"?'<span class="tag">'+esc(r.store)+"</span>":"")+(open?when(r.neededBy):"")+pill(r.status||"New")+editBtn("requests",r.id)+"</div></div>";
}
var KIND={"Progress":"info","Shipped":"ok","Blocked":"bad","Heads up":"warn"};
function updRow(u){
  return '<div class="row"><div class="main"><div class="t">'+esc(pname(u.project)||"General")+'</div><div class="s">'+esc(u.text)+'</div></div><div class="side"><span class="when">'+esc(fmt(u.date))+"</span>"+(u.kind?'<span class="pill" style="--c:var(--'+(KIND[u.kind]||"mute")+')">'+esc(u.kind)+"</span>":"")+editBtn("updates",u.id)+"</div></div>";
}
function venRow(v){
  var sub=[v.topic,v.contact?"Contact: "+v.contact:"",pname(v.project)?"Project: "+pname(v.project):"",v.next?"Next: "+v.next:""].filter(Boolean).join(" · ");
  return '<div class="row"><div class="main"><div class="t">'+esc(v.vendor)+'</div>'+(sub?'<div class="s">'+esc(sub)+"</div>":"")+'</div><div class="side">'+(v.lastContact?'<span class="when">Last contact '+esc(fmt(v.lastContact))+"</span>":"")+pill(v.status||"Waiting on them")+editBtn("vendors",v.id)+"</div></div>";
}
function list(rows,empty){return rows.length?'<div class="list">'+rows.join("")+"</div>":'<p class="empty">'+empty+"</p>"}
function head(title,sub,btn){return '<div class="head"><div><h2>'+esc(title)+"</h2><p>"+esc(sub)+"</p></div>"+(btn||"")+"</div>"}

/* ---------- views ---------- */
function overview(){quiet=true;try{return overviewBody()}finally{quiet=false}}
function overviewBody(){
  var P=S.projects, n=P.length||1, html="";
  var counts=PSTATUS.map(function(s){return [s,P.filter(function(p){return (p.status||"Not set")===s}).length]}).filter(function(c){return c[1]>0});
  html+='<section class="statusbar" aria-label="Projects by status"><div class="bar">'+counts.map(function(c){return '<span style="width:'+(c[1]/n*100)+"%;background:"+PCOLOR[c[0]]+'" title="'+esc(c[0])+": "+c[1]+'"></span>'}).join("")+'</div><div class="legend">'+counts.map(function(c){return '<span><i class="sw" style="background:'+PCOLOR[c[0]]+'"></i>'+esc(c[0]==="Not set"?"Status not set":c[0])+" <b>"+c[1]+"</b></span>"}).join("")+"</div></section>";

  var wait=S.decisions.filter(function(d){return !d.status||d.status==="Waiting"}).sort(by("neededBy"));
  var ev=[];
  S.dates.forEach(function(d){if(d.date&&diff(d.date)>=0)ev.push({d:d.date,t:d.name,s:d.note||"Key date",id:d.id})});
  P.forEach(function(p){if(p.due&&p.status!=="Shipped"&&diff(p.due)>=-30)ev.push({d:p.due,t:p.name,s:diff(p.due)<0?"Project overdue":"Project due",st:p.status})});
  S.requests.forEach(function(r){if(r.neededBy&&["Done","Declined"].indexOf(r.status)<0)ev.push({d:r.neededBy,t:r.title,s:diff(r.neededBy)<0?"Request overdue":"Request needed"})});
  ev.sort(by("d")); ev=ev.slice(0,8);
  var shipped=P.filter(function(p){return p.status==="Shipped"}).sort(by("shippedAt",-1));
  var bud=P.filter(function(p){return Number(p.budget)>0||Number(p.spend)>0});
  var tb=bud.reduce(function(a,p){return a+(Number(p.budget)||0)},0), ts=bud.reduce(function(a,p){return a+(Number(p.spend)||0)},0);
  var ups=S.updates.slice().sort(by("date",-1)).slice(0,5);

  html+='<div class="grid">';
  html+='<section class="panel"><p class="q">What needs leadership</p><h3>Waiting on a decision <a href="#approvals">All approvals</a></h3>'+list(wait.slice(0,5).map(decRow),"Nothing is waiting on leadership. Approvals, budget asks and blockers show up here the moment they are logged.")+"</section>";
  html+='<section class="panel"><p class="q">Dates and deadlines</p><h3>Coming up '+(canWrite&&db?'<a href="#" data-add="dates">Add a date</a>':"")+"</h3>"+list(ev.map(function(e){return '<div class="row"><div class="main"><div class="t">'+esc(e.t)+'</div><div class="s">'+esc(e.s)+'</div></div><div class="side">'+when(e.d)+(e.id?editBtn("dates",e.id,true):"")+"</div></div>"}),"No dates yet. Project due dates, request deadlines and key retail dates appear here in order.")+"</section>";
  var top=P.filter(function(p){return p.status!=="Shipped"&&PRANK[p.priority]!=null}).sort(byPrio).slice(0,6);
  html+='<section class="panel"><p class="q">What matters most</p><h3>Top priorities <a href="#board">Project board</a></h3>'+list(top.map(projRow),"No priorities set yet. Set High, Medium or Low on any project and the most important open work shows here.")+"</section>";
  html+='<section class="panel"><p class="q">What has shipped</p><h3>Finished work</h3>'+list(shipped.slice(0,6).map(projRow),"Shipped projects appear here with a link to the work and the result.")+"</section>";
  html+='<section class="panel"><p class="q">Results and spend</p><h3>Budget</h3>'+(bud.length?'<p class="big">'+usd(ts)+" <small>spent of "+usd(tb)+" budgeted</small></p>"+bud.map(function(p){var b=Number(p.budget)||0,s=Number(p.spend)||0,w=b?Math.min(100,s/b*100):100;return '<div class="money"><div class="lab"><span>'+esc(p.name)+"</span><span>"+usd(s)+(b?" / "+usd(b):" (no budget set)")+'</span></div><div class="track"><span class="'+(b&&s>b?"over":"")+'" style="width:'+w+'%"></span></div></div>'}).join(""):'<p class="empty">No budgets entered yet. Add a budget and spend to any project and the totals appear here.</p>')+"</section>";
  html+="</div>";
  html+='<section class="panel"><p class="q">Status updates</p><h3>Latest from marketing <a href="#updates">All updates</a></h3>'+list(ups.map(updRow),"No updates posted yet. A short weekly note per project keeps this section current.")+"</section>";
  return html;
}
function card(p){
  var ask=S.decisions.some(function(d){return d.project===p.id&&(!d.status||d.status==="Waiting")});
  var tags=[p.category&&p.category!=="Uncategorized"?'<span class="tag">'+esc(p.category)+"</span>":"",p.store&&p.store!=="All stores"?'<span class="tag">'+esc(p.store)+"</span>":""].join("");
  var nd=docsOf(p).length, nr=relatedOf(p).length;
  return '<article class="card" data-card="'+esc(p.id)+'" tabindex="0" role="link" aria-label="Open '+esc(p.name)+'"'+(canWrite&&db?' draggable="true"':"")+'><div class="t">'+esc(p.name)+"</div>"+(p.next?'<div class="s">Next: '+esc(p.next)+"</div>":"")+(p.result&&p.status==="Shipped"?'<div class="s">Result: '+esc(p.result)+"</div>":"")+(p.priority&&PRANK[p.priority]!=null?'<div class="m">'+prioTag(p)+"</div>":"")+'<div class="m">'+tags+"</div>"+(nd||nr?'<div class="m">'+[nd?nd+(nd===1?" doc":" docs"):"",nr?nr+" linked":""].filter(Boolean).map(function(x){return '<span class="tag">'+x+"</span>"}).join("")+"</div>":"")+((p.due&&p.status!=="Shipped")||ask||(p.status==="Shipped"&&p.shippedAt)?'<div class="m">'+(p.status==="Shipped"?'<span class="when">Shipped '+esc(fmt(p.shippedAt))+"</span>":when(p.due))+(ask?'<span class="pill" style="--c:var(--warn)">Needs leadership</span>':"")+"</div>":"")+"</article>";
}
function projects(){
  var P=S.projects.slice().sort(function(a,b){return (a.order||999)-(b.order||999)||String(a.name).localeCompare(String(b.name))});
  var isList=filt.mode==="list";
  var html=head("Project board",P.length+" projects across LaHaze and Newity."+(canWrite&&db&&!isList?" Drag a card to another column to change its status, or up and down to set its order. Open a card to see its docs and history.":""),addBtn("projects","Add a project"));
  html+='<div class="filters"><button class="chip" aria-pressed="'+!isList+'" data-mode="board">Board</button><button class="chip" aria-pressed="'+isList+'" data-mode="list">List</button><select class="f" id="f-store" aria-label="Filter by store"><option value="All">All stores</option>'+STORES.slice(1).map(function(x){return "<option"+(filt.store===x?" selected":"")+">"+esc(x)+"</option>"}).join("")+'</select><select class="f" id="f-cat" aria-label="Filter by category"><option value="All">All categories</option>'+CATS.concat(["Uncategorized"]).map(function(x){return "<option"+(filt.cat===x?" selected":"")+">"+esc(x)+"</option>"}).join("")+'</select><select class="f" id="f-prio" aria-label="Filter by priority"><option value="All">Any priority</option>'+PRIOS.map(function(x){return '<option value="'+x+'"'+(filt.prio===x?" selected":"")+">"+x+" priority</option>"}).join("")+'<option value="none"'+(filt.prio==="none"?" selected":"")+">No priority set</option></select></div>";
  var catOf=function(p){return CATS.indexOf(p.category)>=0?p.category:"Uncategorized"};
  var F=P.filter(function(p){return (filt.cat==="All"||catOf(p)===filt.cat)&&(filt.prio==="All"||(filt.prio==="none"?PRANK[p.priority]==null:p.priority===filt.prio))&&(filt.store==="All"||p.store===filt.store||(p.store==="All stores"&&filt.store!=="Newity"))});
  if(!P.length) return html+'<p class="empty">'+(loaded?"No projects yet.":"")+'</p>';
  if(isList){
    if(!F.length) return html+'<p class="empty">No projects match these filters.</p>';
    CATS.concat(["Uncategorized"]).forEach(function(a){
      var g=F.filter(function(p){return catOf(p)===a}).sort(byPrio);
      if(g.length) html+='<section class="group"><h3>'+esc(a)+(CATHINT[a]?' <span class="hint">'+esc(CATHINT[a])+"</span>":"")+"</h3>"+('<div class="list">'+g.map(projRow).join("")+"</div>")+"</section>";
    });
    return html;
  }
  var cols=PSTATUS.filter(function(st){return st!=="Not set"||F.some(function(p){return !p.status||p.status==="Not set"})});
  html+='<div class="board">'+cols.map(function(st){
    var g=F.filter(function(p){return (p.status||"Not set")===st});
    if(st==="Shipped")g.sort(by("shippedAt",-1)); else g.sort(function(a,b){return (a.order||999)-(b.order||999)});
    return '<section class="col" data-col="'+esc(st)+'"><h3><i class="sw" style="background:'+PCOLOR[st]+'"></i>'+esc(st==="Not set"?"To sort":st)+"<b>"+g.length+"</b></h3>"+(g.length?g.map(card).join(""):'<p class="colempty">'+(canWrite&&db?"Drop a card here":"Nothing here")+"</p>")+"</section>";
  }).join("")+"</div>";
  return html;
}
function move(id,st,beforeId){
  var p=S.projects.find(function(x){return x.id===id}); if(!p||!db||beforeId===id)return;
  var same=(p.status||"Not set")===st;
  var colCards=S.projects.filter(function(q){return (q.status||"Not set")===st&&q.id!==id}).sort(function(a,b){return (a.order||999)-(b.order||999)});
  var u={updatedAt:today()}, ord;
  var i=beforeId?colCards.findIndex(function(q){return q.id===beforeId}):-1;
  if(i>=0){var nxt=colCards[i].order||999, prv=i>0?(colCards[i-1].order||999):nxt-1; ord=(prv+nxt)/2}
  else ord=colCards.reduce(function(m,q){return Math.max(m,q.order||0)},0)+1;
  if(same&&st==="Shipped")return;
  if(same&&ord===p.order)return;
  u.order=ord;
  if(!same){u.status=st; if(st==="Shipped"&&!p.shippedAt)u.shippedAt=today();}
  db.collection("projects").doc(id).update(u).catch(function(){problem="That card could not be moved. Check your connection and try again.";render()});
}
function approvals(){
  var open=S.decisions.filter(function(d){return !d.status||d.status==="Waiting"}).sort(by("neededBy"));
  var done=S.decisions.filter(function(d){return d.status&&d.status!=="Waiting"}).sort(by("decidedOn",-1));
  return head("Approvals and decisions","What is waiting on leadership, and a permanent record of what was decided.",addBtn("decisions","Log a decision"))+
    '<section class="group"><h3>Waiting</h3>'+list(open.map(decRow),"Nothing is waiting. Log an approval, a budget ask or a decision you need and it lands on the briefing.")+"</section>"+
    '<section class="group"><h3>Decision log</h3>'+list(done.map(decRow),"Decided items move here with the outcome and date, so nobody has to dig through texts or email.")+"</section>";
}
function requests(){
  var open=S.requests.filter(function(r){return ["Done","Declined"].indexOf(r.status)<0}).sort(by("neededBy"));
  var done=S.requests.filter(function(r){return ["Done","Declined"].indexOf(r.status)>=0}).sort(by("updatedAt",-1));
  return head("Requests","Ask marketing for something and follow it here: signage, a promo, a post, a menu change.",addBtn("requests","Submit a request"))+
    '<section class="group"><h3>Open</h3>'+list(open.map(reqRow),"No open requests. Store managers and leadership can submit one here, and each request shows its status and a reply.")+"</section>"+
    (done.length?'<section class="group"><h3>Closed</h3>'+list(done.map(reqRow),"")+"</section>":"");
}
function updates(){
  var U=S.updates.slice().sort(by("date",-1));
  return head("Status updates","Short notes per project, newest first. Readable in two minutes.",addBtn("updates","Post an update"))+list(U.map(updRow),"No updates yet. Post what moved, what shipped and what is blocked.");
}
function vendors(){
  var open=S.vendors.filter(function(v){return v.status!=="Closed"}).sort(by("lastContact"));
  var done=S.vendors.filter(function(v){return v.status==="Closed"});
  return head("Vendors and partners","Printers, POS and menu providers, agencies and suppliers: who we are talking to and where each thread stands.",addBtn("vendors","Add a thread"))+
    '<section class="group"><h3>Open threads</h3>'+list(open.map(venRow),"No vendor threads yet. Add one per conversation, with the last contact date and the next step.")+"</section>"+
    (done.length?'<section class="group"><h3>Closed</h3>'+list(done.map(venRow),"")+"</section>":"");
}
var VIEWS={project:projectPage,board:projects,overview:overview,approvals:approvals,requests:requests,updates:updates,vendors:vendors};

function render(){
  var v=view(), P=S.projects;
  var w=S.decisions.filter(function(d){return !d.status||d.status==="Waiting"}).length;
  var nr=S.requests.filter(function(r){return !r.status||r.status==="New"}).length;
  $("#tabs").innerHTML=TABS.map(function(t){var c=t[0]==="approvals"?w:t[0]==="requests"?nr:0;return '<a href="#'+t[0]+'"'+(v===t[0]||(v==="project"&&t[0]==="board")?' aria-current="page"':"")+">"+t[1]+(c?'<span class="count">'+c+"</span>":"")+"</a>"}).join("");
  if(loaded&&P.length){
    var live=P.filter(function(p){return ["In progress","In review","Ongoing"].indexOf(p.status)>=0}).length, sh=P.filter(function(p){return p.status==="Shipped"}).length;
    var lu="";COLS.forEach(function(c){S[c].forEach(function(x){if(x.updatedAt&&x.updatedAt>lu)lu=x.updatedAt})});
    var nx=S.dates.filter(function(d){return d.date&&diff(d.date)>=0}).sort(by("date"))[0];
    $("#brief").innerHTML="<b>"+P.length+" projects</b> across Cheboygan, Traverse City and Alpena. <b>"+sh+"</b> shipped, <b>"+live+"</b> in motion, <b>"+w+"</b> waiting on leadership"+(nx?". Next key date: <b>"+esc(nx.name)+"</b>, "+esc(rel(nx.date)):"")+"."+(lu?" Last updated "+esc(rel(lu))+".":"");
  }
  var top=problem?'<p class="notice">'+esc(problem)+"</p>":"";
  if(!loaded&&!problem) top='<p class="empty">Loading the tracker…</p>';
  $("#app").innerHTML=top+VIEWS[v]();
  var f="";
  if(loaded){
    if(!mode.storage) f="Preview mode: storage is not connected yet, so changes save in this browser only.";
    else if(canWrite) f="Changes save for everyone as you make them."+(mode.needsKey?' <button class="linkbtn" id="lock">Lock editing on this device</button>':"");
    else f='You are viewing a read-only copy. Send requests and approvals to the marketing manager. <button class="linkbtn" id="unlock">Unlock editing</button>';
  }
  $("#foot").innerHTML=f;
}

/* ---------- project page: docs, email threads, linked projects and everything logged against the project ---------- */
var DOCKINDS=["Doc","File","Design","Email thread","Deck","Sheet","Other"];
function docsOf(p){var f=Array.isArray(p.files)?p.files.slice():[];var u=safeUrl(p.link);if(u&&!f.some(function(x){return x.url===u}))f.push({title:"Link to the work",url:u,kind:"Doc",_legacy:true});return f}
function sortedDocs(p){return docsOf(p).map(function(d,i){return Object.assign({_i:d._legacy?"":String(i)},d)}).sort(function(a,b){return (b.date||"").localeCompare(a.date||"")})}
function relatedOf(p){var ids={};(p.related||[]).forEach(function(i){ids[i]=1});S.projects.forEach(function(q){if((q.related||[]).indexOf(p.id)>=0)ids[q.id]=1});delete ids[p.id];return S.projects.filter(function(q){return ids[q.id]})}
function docRow(pr,d,latest,showEdit){
  var u=safeUrl(d.url), meta=[d.kind,d.date?fmt(d.date):"",d.note].filter(Boolean).join(" · ");
  return '<div class="row"><div class="main"><div class="t">'+(u?'<a href="'+esc(u)+'" target="_blank" rel="noopener">'+esc(d.title||u)+"</a>":esc(d.title))+(latest?' <span class="pill" style="--c:var(--ok)">Latest</span>':"")+"</div>"+(meta?'<div class="s">'+esc(meta)+"</div>":"")+'</div><div class="side">'+(showEdit&&canWrite&&db&&d._i!==""?'<button class="btn ghost sm" data-doc="'+esc(pr.id)+"|"+d._i+'">Edit</button>':"")+"</div></div>";
}
function projectPage(){
  var p=S.projects.find(function(x){return x.id===pid()});
  if(!p)return loaded?'<p class="empty">That project is not on the board any more. <a href="#board">Back to the board</a></p>':"";
  var D=sortedDocs(p), docs=D.filter(function(d){return d.kind!=="Email thread"}), mail=D.filter(function(d){return d.kind==="Email thread"});
  var rel=relatedOf(p);
  var U=S.updates.filter(function(u){return u.project===p.id}).sort(by("date",-1));
  var Dc=S.decisions.filter(function(d){return d.project===p.id}).sort(by("neededBy"));
  var V=S.vendors.filter(function(v){return v.project===p.id});
  var facts=[["Next step",p.next],["Notes",p.note],["Result",p.result],["Due",p.due&&p.status!=="Shipped"?fmt(p.due)+" · "+rel_(p.due):""],["Shipped",p.shippedAt?fmt(p.shippedAt):""],["Budget",(Number(p.budget)||Number(p.spend))?usd(p.spend)+" spent of "+usd(p.budget):""],["Company",p.company],["Last updated",p.updatedAt?fmt(p.updatedAt):""]].filter(function(f){return f[1]});
  var w=canWrite&&db;
  var h='<p><a class="back" href="#board">← Project board</a></p>';
  h+='<div class="head"><div><h2>'+esc(p.name)+'</h2><p class="m">'+pill(p.status)+prioTag(p)+(p.category?' <span class="tag">'+esc(p.category)+"</span>":"")+(p.area?' <span class="tag">'+esc(p.area)+"</span>":"")+(p.store&&p.store!=="All stores"?' <span class="tag">'+esc(p.store)+"</span>":"")+"</p></div>"+(w?'<div class="acts"><button class="btn ghost" data-edit="projects:'+esc(p.id)+'">Edit project</button><button class="btn ghost" data-relate="'+esc(p.id)+'">Link a project</button><button class="btn" data-doc="'+esc(p.id)+'|">Add a doc or link</button></div>':"")+"</div>";
  h+='<div class="grid">';
  h+='<section class="panel"><p class="q">Docs and files</p><h3>Latest work</h3>'+list(docs.map(function(d,i){return docRow(p,d,i===0&&docs.length>1,true)}),"No docs attached yet."+(w?" Add the latest version of anything this project uses: briefs, decks, designs, PDFs, Drive or Canva links.":""))+"</section>";
  h+='<section class="panel"><p class="q">Linked projects</p><h3>Related work</h3>'+list(rel.map(function(q){var ld=sortedDocs(q).filter(function(d){return d.kind!=="Email thread"});var top=ld[0];return '<div class="row"><div class="main"><div class="t">'+plink(q)+'</div>'+(top?'<div class="s">Latest: '+(safeUrl(top.url)?'<a href="'+esc(safeUrl(top.url))+'" target="_blank" rel="noopener">'+esc(top.title||top.url)+"</a>":esc(top.title))+(top.date?" · "+esc(fmt(top.date)):"")+"</div>":'<div class="s">No docs attached yet</div>')+'</div><div class="side">'+pill(q.status)+(w&&(p.related||[]).indexOf(q.id)>=0?'<button class="btn ghost sm" data-unlink="'+esc(p.id)+"|"+esc(q.id)+'">Unlink</button>':w&&(q.related||[]).indexOf(p.id)>=0?'<button class="btn ghost sm" data-unlink="'+esc(q.id)+"|"+esc(p.id)+'">Unlink</button>':"")+"</div></div>"}),"No linked projects. Link one when this project depends on another's work, like a plan that follows the brand guidelines.")+"</section>";
  h+='<section class="panel"><p class="q">Email</p><h3>Email threads</h3>'+list(mail.map(function(d){return docRow(p,d,false,true)}),"No email threads attached. Add a link to a thread (for example from Gmail) with the type set to Email thread.")+"</section>";
  h+='<section class="panel"><p class="q">The project</p><h3>Details</h3>'+(facts.length?'<div class="list">'+facts.map(function(f){return '<div class="row"><div class="main"><div class="s">'+esc(f[0])+'</div><div class="t">'+esc(f[1])+"</div></div></div>"}).join("")+"</div>":'<p class="empty">No details yet.</p>')+"</section>";
  h+="</div>";
  h+='<section class="panel"><p class="q">History</p><h3>Status updates</h3>'+list(U.map(updRow),"No updates posted for this project yet.")+"</section>";
  if(Dc.length)h+='<section class="panel"><p class="q">Decisions</p><h3>Approvals and decisions</h3>'+list(Dc.map(decRow),"")+"</section>";
  if(V.length)h+='<section class="panel"><p class="q">Vendors</p><h3>Vendor threads</h3>'+list(V.map(venRow),"")+"</section>";
  return h;
}
function rel_(iso){return rel(iso)}
function openDoc(projId,idx){
  var p=S.projects.find(function(x){return x.id===projId});if(!p)return;
  var d=idx==null?{kind:"Doc",date:today()}:(p.files||[])[idx]||{};
  cur={col:"__doc",pid:projId,idx:idx,armed:false};
  $("#frm").innerHTML="<h2>"+(idx==null?"Add a doc or link":"Edit doc or link")+'</h2><p class="sub">'+esc(p.name)+'</p><div class="fields"><div class="fld wide"><label for="d-title">Title (required)</label><input id="d-title" value="'+esc(d.title||"")+'" placeholder="LaHaze Brand Guidelines v3"></div><div class="fld wide"><label for="d-url">Link (https://…) (required)</label><input id="d-url" value="'+esc(d.url||"")+'" placeholder="Google Drive, Canva, Gmail, Dropbox…"></div><div class="fld"><label for="d-kind">Type</label><select id="d-kind">'+DOCKINDS.map(function(k){return "<option"+(k===d.kind?" selected":"")+">"+k+"</option>"}).join("")+'</select></div><div class="fld"><label for="d-date">Version date</label><input id="d-date" type="date" value="'+esc(d.date||"")+'"></div><div class="fld wide"><label for="d-note">Note</label><input id="d-note" value="'+esc(d.note||"")+'" placeholder="Version, what changed, who sent it"></div></div><p class="sub">The newest dated doc shows as Latest. Anyone with the board link can see this list, but the files themselves keep their own sharing settings.</p><p class="err" id="f-err" hidden></p><div class="actions">'+(idx!=null?'<button type="button" class="btn danger" id="f-del">Remove</button>':"")+'<span class="sp"></span><button type="button" class="btn ghost" id="f-cancel">Cancel</button><button type="submit" class="btn" id="f-save">Save</button></div>';
  $("#dlg").showModal();
}
function openRelate(projId){
  var p=S.projects.find(function(x){return x.id===projId});if(!p)return;
  var taken={};relatedOf(p).forEach(function(q){taken[q.id]=1});
  var opts=S.projects.filter(function(q){return q.id!==p.id&&!taken[q.id]}).sort(by("name"));
  cur={col:"__relate",pid:projId};
  $("#frm").innerHTML='<h2>Link a project</h2><p class="sub">Linked projects show on each other\'s page, with their latest doc.</p><div class="fields"><div class="fld wide"><label for="r-p">Project</label><select id="r-p">'+opts.map(function(q){return '<option value="'+esc(q.id)+'">'+esc(q.name)+"</option>"}).join("")+'</select></div></div><p class="err" id="f-err" hidden></p><div class="actions"><span class="sp"></span><button type="button" class="btn ghost" id="f-cancel">Cancel</button><button type="submit" class="btn" id="f-save"'+(opts.length?"":" disabled")+'>Link</button></div>';
  $("#dlg").showModal();
}
function saveSpecial(){
  var p=S.projects.find(function(x){return x.id===cur.pid});if(!p)return;
  var err=function(m){var el=$("#f-err");el.textContent=m;el.hidden=false};
  if(cur.col==="__doc"){
    var d={title:$("#d-title").value.trim(),url:$("#d-url").value.trim(),kind:$("#d-kind").value,date:$("#d-date").value,note:$("#d-note").value.trim()};
    if(!d.title)return err("Title is required.");
    if(!safeUrl(d.url))return err("The link must start with https://");
    var fl=(p.files||[]).slice(); if(cur.idx==null)fl.push(d); else fl[cur.idx]=d;
    $("#f-save").disabled=true;
    db.collection("projects").doc(p.id).update({files:fl,updatedAt:today()}).then(function(){$("#dlg").close()},fail);
  } else {
    var id=$("#r-p").value; if(!id)return;
    var r=(p.related||[]).filter(function(x){return x!==id}).concat([id]);
    $("#f-save").disabled=true;
    db.collection("projects").doc(p.id).update({related:r,updatedAt:today()}).then(function(){$("#dlg").close()},fail);
  }
}
function unlink(fromId,toId){
  var p=S.projects.find(function(x){return x.id===fromId});if(!p||!db)return;
  db.collection("projects").doc(p.id).update({related:(p.related||[]).filter(function(x){return x!==toId}),updatedAt:today()}).catch(function(){problem="That link could not be removed. Try again.";render()});
}

/* ---------- data layer: talks to /api/data, or to this browser when storage is not connected ---------- */
var LOCAL="hq-local";
function saveLocal(){try{localStorage.setItem(LOCAL,JSON.stringify(S))}catch(e){}}
function apiErr(r,j){var e=new Error((j&&j.error)||("http "+r.status));e.status=r.status;e.code=j&&j.error;return e}
function send(body){
  if(!mode.storage){saveLocal();return Promise.resolve({ok:true})}
  return fetch("/api/data",{method:"POST",headers:{"Content-Type":"application/json","X-Edit-Key":mode.key||""},body:JSON.stringify(body)})
    .then(function(r){return r.json().catch(function(){return {}}).then(function(j){if(!r.ok)throw apiErr(r,j);return j})});
}
function find(col,id){return S[col].findIndex(function(x){return x.id===id})}
function rollback(e){refresh();throw e}
function makeDb(){
  return {collection:function(col){
    return {
      doc:function(id){return {
        update:function(u){var i=find(col,id);if(i>=0)S[col][i]=Object.assign({},S[col][i],u);render();return send({op:"update",col:col,id:id,doc:u}).catch(rollback)},
        set:function(m){var i=find(col,id),d=Object.assign({},m,{id:id});if(i>=0)S[col][i]=d;else S[col].push(d);render();return send({op:"set",col:col,id:id,doc:m}).catch(rollback)},
        delete:function(){var i=find(col,id);if(i>=0)S[col].splice(i,1);render();return send({op:"delete",col:col,id:id}).catch(rollback)}
      }},
      add:function(d){
        if(!mode.storage){var id="local-"+Date.now().toString(36);S[col].push(Object.assign({},d,{id:id}));render();saveLocal();return Promise.resolve({id:id})}
        return send({op:"add",col:col,doc:d}).then(function(j){S[col].push(j.doc);render();return j});
      }
    };
  }};
}
var busy=false;
function refresh(){
  if(busy)return Promise.resolve(); busy=true;
  return fetch("/api/data",{cache:"no-store"}).then(function(r){if(!r.ok)throw new Error("http "+r.status);return r.json()}).then(function(j){
    mode.storage=!!j.storage; mode.needsKey=!!j.needsKey;
    var data=j.data||{};
    if(!mode.storage){try{var loc=JSON.parse(localStorage.getItem(LOCAL)||"null");if(loc&&loc.projects)data=loc}catch(e){}}
    COLS.forEach(function(c){S[c]=Array.isArray(data[c])?data[c]:[]});
    canWrite=!mode.storage||!mode.needsKey||!!mode.key;
    db=makeDb(); loaded=true; problem="";
    if(!$("#dlg").open&&!dragId)render();
  }).catch(function(){
    if(!loaded){problem="The tracker data can't be reached right now. Reload the page to try again.";render()}
  }).then(function(){busy=false});
}

/* ---------- forms ---------- */
var cur=null;
var HIDE_NEW={decisions:["outcome","decidedOn"],requests:["status","reply"],projects:["shippedAt","result","spend"]};
function openForm(col,id){
  var sc=SCHEMA[col], ex=id?S[col].find(function(x){return x.id===id}):null, d=ex||{};
  if(!ex){ if(col==="projects"){d={status:"Planned",company:"LaHaze",store:"All stores",area:"Campaigns",category:"Direct marketing",order:S.projects.reduce(function(m,q){return Math.max(m,q.order||0)},0)+1}} if(col==="updates"){d={date:today(),kind:"Progress"}} if(col==="decisions"){d={status:"Waiting",type:"Approval"}} if(col==="requests"){d={status:"New",priority:"Normal",store:"All stores"}} if(col==="vendors"){d={status:"Waiting on them",lastContact:today()}} }
  cur={col:col,id:id,ex:ex,armed:false,defaults:ex?{}:d};
  var h="<h2>"+(ex?"Edit ":"New ")+esc(sc.one)+'</h2><div class="fields">';
  sc.fields.forEach(function(f){
    if(!ex&&(HIDE_NEW[col]||[]).indexOf(f[0])>=0)return;
    var k=f[0], v=d[k]==null?"":d[k], idn="f-"+col+"-"+k, inp;
    if(f[2]==="textarea") inp='<textarea id="'+idn+'">'+esc(v)+"</textarea>";
    else if(f[2]==="select") inp='<select id="'+idn+'">'+f[3].map(function(o){return "<option"+(o===v||(f[3].indexOf(v)<0&&(o==="Uncategorized"||o==="Not set"))?" selected":"")+">"+esc(o)+"</option>"}).join("")+"</select>";
    else if(f[2]==="project") inp='<select id="'+idn+'"><option value="">None / general</option>'+S.projects.slice().sort(by("name")).map(function(p){return '<option value="'+esc(p.id)+'"'+(p.id===v?" selected":"")+">"+esc(p.name)+"</option>"}).join("")+"</select>";
    else inp='<input id="'+idn+'" type="'+(f[2]==="number"?"number":f[2]==="date"?"date":"text")+'"'+(f[2]==="number"?' min="0" step="1"':"")+' value="'+esc(v)+'">';
    h+='<div class="fld'+(["select","date","number"].indexOf(f[2])<0?" wide":"")+'"><label for="'+idn+'">'+esc(f[1])+(f[3]===1?" (required)":"")+"</label>"+inp+"</div>";
  });
  h+='</div><p class="err" id="f-err" hidden></p><div class="actions">'+(ex?'<button type="button" class="btn danger" id="f-del">Delete</button>':"")+'<span class="sp"></span><button type="button" class="btn ghost" id="f-cancel">Cancel</button><button type="submit" class="btn" id="f-save">Save</button></div>';
  $("#frm").innerHTML=h; $("#dlg").showModal();
}
function openUnlock(){
  cur={col:"__unlock"};
  $("#frm").innerHTML='<h2>Unlock editing</h2><p class="sub">Enter the edit passcode from the marketing manager. It is remembered on this device.</p><div class="fields"><div class="fld wide"><label for="f-key">Edit passcode</label><input id="f-key" type="password" autocomplete="current-password"></div></div><p class="err" id="f-err" hidden></p><div class="actions"><span class="sp"></span><button type="button" class="btn ghost" id="f-cancel">Cancel</button><button type="submit" class="btn" id="f-save">Unlock</button></div>';
  $("#dlg").showModal(); $("#f-key").focus();
}
function fail(e){var m=e&&e.status===401?"The edit passcode was not accepted. Lock and unlock editing again with the right passcode.":e&&e.code==="too_big"?"That entry is too long. Shorten the notes and try again.":"Could not save. Check your connection and try again.";var el=$("#f-err");if(!el)return;el.textContent=m;el.hidden=false;$("#f-save").disabled=false}
$("#frm").addEventListener("submit",function(e){
  e.preventDefault(); if(!cur)return;
  if(cur.col==="__unlock"){
    var k=$("#f-key").value.trim(); if(!k)return; $("#f-save").disabled=true;
    fetch("/api/data",{method:"POST",headers:{"Content-Type":"application/json","X-Edit-Key":k},body:'{"op":"check"}'}).then(function(r){
      if(!r.ok){var el=$("#f-err");el.textContent="That passcode is not right.";el.hidden=false;$("#f-save").disabled=false;return}
      mode.key=k;try{localStorage.setItem("hq-key",k)}catch(x){} canWrite=true; $("#dlg").close(); render();
    },function(){fail()});
    return;
  }
  if(!db)return;
  if(cur.col==="__doc"||cur.col==="__relate"){saveSpecial();return}
  var sc=SCHEMA[cur.col], out=Object.assign({},cur.defaults), bad="";
  sc.fields.forEach(function(f){var el=document.getElementById("f-"+cur.col+"-"+f[0]);if(!el)return;var v=el.value.trim(); if(f[3]===1&&!v&&!bad)bad=f[1]; if(f[2]==="number"){if(v!=="")out[f[0]]=Number(v)}else out[f[0]]=v});
  if(bad){var el=$("#f-err");el.textContent=bad+" is required.";el.hidden=false;return}
  if(out.link&&!safeUrl(out.link)){var e2=$("#f-err");e2.textContent="The link must start with https://";e2.hidden=false;return}
  if(cur.col==="projects"&&out.priority==="Not set")out.priority="";
  if(cur.col==="projects"&&out.status==="Shipped"&&!out.shippedAt)out.shippedAt=today();
  if(cur.col==="decisions"&&out.status!=="Waiting"&&!out.decidedOn)out.decidedOn=today();
  out.updatedAt=today(); $("#f-save").disabled=true;
  var c=db.collection(cur.col), p;
  if(cur.ex){var m=Object.assign({},cur.ex,out);delete m.id; if(!("budget" in out))delete m.budget; if(!("spend" in out))delete m.spend; p=c.doc(cur.id).set(m)}
  else{out.createdAt=today(); p=c.add(out)}
  p.then(function(){$("#dlg").close()},fail);
});
$("#frm").addEventListener("click",function(e){
  if(e.target.id==="f-cancel")$("#dlg").close();
  if(e.target.id==="f-del"&&cur&&db&&cur.col==="__doc"){if(!cur.armed){cur.armed=true;e.target.textContent="Click again to remove";return}var p0=S.projects.find(function(x){return x.id===cur.pid});var fl=(p0.files||[]).slice();fl.splice(cur.idx,1);db.collection("projects").doc(cur.pid).update({files:fl,updatedAt:today()}).then(function(){$("#dlg").close()},fail);return}
  if(e.target.id==="f-del"&&cur&&db){ if(!cur.armed){cur.armed=true;e.target.textContent="Click again to delete for everyone";return} db.collection(cur.col).doc(cur.id).delete().then(function(){$("#dlg").close()},fail)}
});
$("#dlg").addEventListener("close",function(){render()});
document.addEventListener("click",function(e){
  if(e.target.id==="unlock"){openUnlock();return}
  if(e.target.id==="lock"){mode.key="";try{localStorage.removeItem("hq-key")}catch(x){}canWrite=false;render();return}
  var t=e.target.closest("[data-edit],[data-add]");
  if(t){ if(t.dataset.add){e.preventDefault();openForm(t.dataset.add,null)} else {var a=t.dataset.edit.split(":");openForm(a[0],a.slice(1).join(":"))} return }
  var m=e.target.closest("[data-mode]"); if(m){filt.mode=m.dataset.mode;keep();render();return}
  var c=e.target.closest("[data-card]"); if(c){location.hash="#p/"+encodeURIComponent(c.dataset.card);return}
  var dd=e.target.closest("[data-doc]"); if(dd){var q=dd.dataset.doc.split("|");openDoc(q[0],q[1]===""?null:Number(q[1]));return}
  var rl=e.target.closest("[data-relate]"); if(rl){openRelate(rl.dataset.relate);return}
  var ul=e.target.closest("[data-unlink]"); if(ul){var u2=ul.dataset.unlink.split("|");unlink(u2[0],u2[1]);return}
});
document.addEventListener("keydown",function(e){var c=e.target.closest&&e.target.closest("[data-card]");if(c&&(e.key==="Enter"||e.key===" ")){e.preventDefault();location.hash="#p/"+encodeURIComponent(c.dataset.card)}});
var dragId="";
document.addEventListener("dragstart",function(e){var c=e.target.closest&&e.target.closest("[data-card]");if(!c)return;dragId=c.dataset.card;try{e.dataTransfer.setData("text/plain",dragId);e.dataTransfer.effectAllowed="move"}catch(x){}c.classList.add("drag")});
document.addEventListener("dragend",function(e){dragId="";var c=e.target.closest&&e.target.closest("[data-card]");if(c)c.classList.remove("drag");document.querySelectorAll(".col.over").forEach(function(x){x.classList.remove("over")})});
document.addEventListener("dragover",function(e){var col=e.target.closest&&e.target.closest("[data-col]");if(!col||!dragId)return;e.preventDefault();document.querySelectorAll(".col.over").forEach(function(x){if(x!==col)x.classList.remove("over")});col.classList.add("over");var t=e.target.closest("[data-card]");document.querySelectorAll(".card.before").forEach(function(x){if(x!==t)x.classList.remove("before")});if(t&&t.dataset.card!==dragId)t.classList.add("before")});
document.addEventListener("drop",function(e){var col=e.target.closest&&e.target.closest("[data-col]");if(!col||!dragId)return;e.preventDefault();var t=e.target.closest("[data-card]");var id=dragId;dragId="";document.querySelectorAll(".card.before").forEach(function(x){x.classList.remove("before")});move(id,col.dataset.col,t?t.dataset.card:null)});
document.addEventListener("change",function(e){if(e.target.id==="f-store"){filt.store=e.target.value;keep();render()}if(e.target.id==="f-cat"){filt.cat=e.target.value;keep();render()}if(e.target.id==="f-prio"){filt.prio=e.target.value;keep();render()}});
function keep(){try{localStorage.setItem("hq-filt",JSON.stringify(filt))}catch(e){}}
window.addEventListener("hashchange",function(){render();window.scrollTo(0,0)});

/* ---------- start: load now, then pick up teammates' changes every 20 seconds ---------- */
render();
refresh();
setInterval(function(){if(!document.hidden&&mode.storage)refresh()},20000);
document.addEventListener("visibilitychange",function(){if(!document.hidden&&mode.storage)refresh()});
})();
