const socket=io();let code=null,state=null,me=null,selected=[],setupCards=[],suits=["♠","♥","♦","♣"],vals=["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const screen=document.querySelector("#screen"); const err=e=>alert(e); socket.on("error",err);
socket.on("joined",x=>{code=x.code;me=socket.id;render();});socket.on("state",s=>{state=s;me=socket.id;render();});
function lobby(){screen.innerHTML=`<div class=box><h2>Online spielen</h2><input id=name placeholder="Dein Name"><button onclick="create()">Raum erstellen</button><hr><input id=code placeholder="Raumcode"><button onclick="join()">Raum beitreten</button></div>`}
function create(){socket.emit("create",{name:document.querySelector("#name").value})}function join(){socket.emit("join",{code:document.querySelector("#code").value,name:document.querySelector("#name").value})}
function render(){if(!state){lobby();return}let p=state.players.find(x=>x.id===me),other=state.players.find(x=>x.id!==me);let head=`<div class=box><b>Raumcode:</b> <span class=big>${code}</span><br><span class=muted>${state.message}</span><div class=players>${state.players.map(x=>`<div><b>${x.name}</b><br>🪙 ${x.tokens} Tokens ${x.id===me?"(Du)":""}</div>`).join("")}</div></div>`;
if(state.phase==="lobby" && state.players.length<2)
    screen.innerHTML=head+`<div class=box>Warte auf zweiten Spieler…</div>`;
else if(!p.setupDone)
    setup(head);
else if(state.phase==="bidding")
    bid(head,p);
                  
else if(state.phase==="bidding") bid(head,p);
else if(state.phase==="choice") choice(head);
else if(state.phase==="result") result(head);
else if(state.phase==="finished") screen.innerHTML=head+`<div class=box><h2>🏆 Spiel beendet!</h2><p>${state.message}</p></div>`;
else screen.innerHTML=head+`<div class=box>Warte auf den anderen Spieler…</div>`;
}
function setup(head){let deck=suits.flatMap(s=>vals.map(v=>({s,v})));screen.innerHTML=head+`<div class=box><h2>Lege 8 geheime Karten</h2><p>Regel: Karten derselben Farbe müssen von links nach rechts aufsteigend sein.</p><div class=row>${deck.map((c,i)=>`<div class="card ${selected.includes(i)?"sel":""} ${c.s==="♥"||c.s==="♦"?"red":""}" onclick="pick(${i})">${c.s}<br>${c.v}</div>`).join("")}</div><h3>Deine Reihe (${selected.length}/8):</h3><div class=row>${selected.map(i=>`<div class=card>${deck[i].s} ${deck[i].v}</div>`).join("")}</div><button onclick="sendSetup()">Bestätigen</button></div>`;window._deck=deck}
function pick(i){if(selected.includes(i))selected=selected.filter(x=>x!==i);else if(selected.length<8)selected.push(i);render()}
function sendSetup(){if(selected.length!==8)return err("Bitte genau 8 Karten wählen.");socket.emit("setup",selected.map(i=>({suit:_deck[i].s,value:_deck[i].v})))}
function bid(head,p){screen.innerHTML=head+`<div class=box><h2>🪙 Gebot</h2><input id=bid type=number min=0 max=${p.tokens} value=0><button onclick="socket.emit('bid',Number(document.querySelector('#bid').value))">Gebot abgeben</button></div>`}
function choice(head){let active=state.active===me;screen.innerHTML=head+(active?`<div class=box><h2>Du hast gewonnen – wähle!</h2><button onclick="questions()">❓ Frage</button> <button class=danger onclick="truth()">🟥 Wahrheit</button><div id=actions></div></div>`:`<div class=box>Dein Gegner entscheidet…</div>`)}
function questions(){document.querySelector("#actions").innerHTML=`<h3>Alle Fragen</h3>${[
["sum_positions","Summe von 3 Positionen","3 Positionen"],["sum_suit","Summe einer Farbe","Farbe"],["sum_face","Summe aller A/J/Q/K",""],["sum_number","Summe aller Zahlenkarten",""],["count_face","Anzahl aller A/J/Q/K",""],["count_number","Anzahl aller Zahlenkarten",""],["count_value","Wie oft kommt ein bestimmter Wert vor?","Wert"],["positions_suit","Positionen einer Farbe","Farbe"],["positions_same","Positionen gleicher Werte",""],["positions_consecutive","Positionen aufeinanderfolgender Werte",""],["positions_high_low","Position der höchsten und niedrigsten Karte",""]
].map((q,i)=>`<button class=question onclick="ask('${q[0]}','${q[2]}')">${i+1}. ${q[1]}</button>`).join("")}`}
function ask(type,arg){let q={type};if(type==="sum_positions"){let x=prompt("3 Positionen, z.B. 1,4,7");let a=x?.split(",").map(Number);if(!a||a.length!==3)return;q.positions=a.map(n=>n-1)}else if(arg==="Farbe"){let s=prompt("♠ ♥ ♦ oder ♣");if(!s)return;q.suit=s}else if(arg==="Wert"){let v=prompt("A, 2-10, J, Q oder K");if(!v)return;q.value=v};socket.emit("ask",q)}
function truth(){let html=`<h3>Rate die 8 Werte in Reihenfolge</h3><div class=row>${Array.from({length:8},(_,i)=>`<select id=g${i}>${vals.map(v=>`<option>${v}</option>`).join("")}</select>`).join("")}</div><button class=danger onclick="sendGuess()">Wahrheit sagen</button>`;document.querySelector("#actions").innerHTML=html}
function sendGuess(){socket.emit("guess",Array.from({length:8},(_,i)=>document.querySelector("#g"+i).value))}
function result(head){let r=state.questionResult;if(typeof r==="object")r=`Höchste Position(en): ${r.highest.join(", ")} | Niedrigste Position(en): ${r.lowest.join(", ")}`;screen.innerHTML=head+`<div class=box><h2>Antwort</h2><div class=result>${r}</div><br><button onclick="socket.emit('next')">Nächste Runde (+2 Tokens)</button></div>`}
render();
