(function(){
"use strict";
var $=function(s){return document.getElementById(s)};
var hist=[], busy=false;
var SUGGEST=["What's due before Thanksgiving?","What has shipped so far?","What's waiting on leadership?","Which projects have no status yet?"];
function add(role,text,dim){var d=document.createElement("div");d.className="msg "+(role==="user"?"me":"bot")+(dim?" dim":"");d.textContent=text;$("ask-log").appendChild(d);$("ask-log").scrollTop=1e9;return d}
function intro(){
  add("assistant","Hi. Ask me anything about the marketing projects, requests, approvals, vendors or key dates on this board.");
  var h=document.createElement("div");h.className="hint";
  SUGGEST.forEach(function(q){var b=document.createElement("button");b.type="button";b.textContent=q;b.onclick=function(){h.remove();ask(q)};h.appendChild(b)});
  $("ask-log").appendChild(h);
}
function ask(q){
  q=q.trim(); if(!q||busy)return; busy=true; $("ask-send").disabled=true;
  add("user",q); hist.push({role:"user",content:q});
  var wait=add("assistant","Thinking…",true);
  fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:hist.slice(-12)})})
    .then(function(r){return r.json().catch(function(){return {}}).then(function(j){return {ok:r.ok,status:r.status,j:j}})})
    .then(function(x){
      var t;
      if(x.ok&&x.j.reply){t=x.j.reply;hist.push({role:"assistant",content:t})}
      else{hist.pop();t=x.status===429?"You've asked a lot in the last hour. Try again a little later.":"I couldn't answer just now. Try again in a moment."}
      wait.className="msg bot";wait.textContent=t;
    },function(){hist.pop();wait.className="msg bot";wait.textContent="I couldn't reach the server. Check your connection and try again."})
    .then(function(){busy=false;$("ask-send").disabled=false;$("ask-log").scrollTop=1e9});
}
function open(){$("chat").hidden=false;$("ask-open").hidden=true;if(!$("ask-log").childElementCount)intro();$("ask-in").focus()}
function close(){$("chat").hidden=true;$("ask-open").hidden=false}
$("ask-open").onclick=open; $("ask-close").onclick=close;
$("ask-form").addEventListener("submit",function(e){e.preventDefault();var v=$("ask-in").value;$("ask-in").value="";ask(v)});
$("ask-in").addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("ask-form").requestSubmit()}});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!$("chat").hidden)close()});
fetch("/api/chat",{cache:"no-store"}).then(function(r){return r.json()}).then(function(j){if(j.enabled)$("ask-open").hidden=false}).catch(function(){});
})();
