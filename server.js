const express=require("express");
const http=require("http");
const {Server}=require("socket.io");
const path=require("path");

const app=express();
const server=http.createServer(app);
const io=new Server(server);
app.use(express.static(path.join(__dirname,"public")));

const rooms=new Map();
const rank={A:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13};

function stateFor(room,viewerId){
  const viewer=room.players.find(p=>p.id===viewerId);
  return {
    code:room.code,
    players:room.players.map(p=>({
      id:p.id,name:p.name,ready:p.ready,setupDone:p.setupDone,connected:p.connected,
      tokens:p.id===viewerId?p.tokens:null,
      lowTokens:p.tokens<=5
    })),
    phase:room.phase,round:room.round,
    active:room.active,message:room.message,questionResult:room.questionResult,
    lastQuestion:room.lastQuestion,winner:room.winner,
    myCards:viewer?.cards||[],
    myBidSubmitted:Object.prototype.hasOwnProperty.call(room.bids,viewerId)
  };
}
function emitRoom(room){
  for(const p of room.players){io.to(p.id).emit("state",stateFor(room,p.id));}
}
function both(room){return room.players.length===2;}
function getPlayer(room,id){return room.players.find(p=>p.id===id);}
function opponent(room,id){return room.players.find(p=>p.id!==id);}
function findRoom(id){return [...rooms.values()].find(r=>r.players.some(p=>p.id===id));}

function validSetup(cards){
  if(!Array.isArray(cards)||cards.length!==8)return false;
  const seen=new Set();
  for(const c of cards){
    if(!c||!rank[c.value]||!["♠","♥","♦","♣"].includes(c.suit))return false;
    const key=c.suit+c.value;if(seen.has(key))return false;seen.add(key);
  }
  // Reihenfolge ist vom Spieler frei wählbar. Die Auswahlansicht ist nur sortiert.
  return true;
}
function answer(cards,q){
  const values=cards.map(c=>rank[c.value]);
  if(q.type==="sum_positions")return q.positions.map(x=>rank[cards[x].value]).reduce((a,b)=>a+b,0);
  if(q.type==="sum_suit")return cards.filter(c=>c.suit===q.suit).reduce((a,c)=>a+rank[c.value],0);
  if(q.type==="sum_face")return cards.filter(c=>["A","J","Q","K"].includes(c.value)).reduce((a,c)=>a+rank[c.value],0);
  if(q.type==="sum_number")return cards.filter(c=>!["A","J","Q","K"].includes(c.value)).reduce((a,c)=>a+rank[c.value],0);
  if(q.type==="count_face")return cards.filter(c=>["A","J","Q","K"].includes(c.value)).length;
  if(q.type==="count_number")return cards.filter(c=>!["A","J","Q","K"].includes(c.value)).length;
  if(q.type==="count_value")return cards.filter(c=>c.value===q.value).length;
  if(q.type==="positions_suit")return cards.map((c,i)=>c.suit===q.suit?i+1:null).filter(Boolean);
  if(q.type==="positions_same"){const groups={};cards.forEach((c,i)=>(groups[c.value]??=[]).push(i+1));return Object.entries(groups).filter(([,p])=>p.length>1).map(([v,p])=>`${v}: ${p.join(", ")}`).join(" | ")||"Keine";}
  if(q.type==="positions_consecutive"){const out=[];for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++)if(Math.abs(rank[cards[i].value]-rank[cards[j].value])===1)out.push(`${i+1}-${j+1}`);return out.length?[...new Set(out)].join(", "):"Keine";}
  if(q.type==="positions_high_low"){const max=Math.max(...values),min=Math.min(...values);return {highest:cards.map((c,i)=>rank[c.value]===max?i+1:null).filter(Boolean),lowest:cards.map((c,i)=>rank[c.value]===min?i+1:null).filter(Boolean)};}
}

io.on("connection",socket=>{
  socket.on("create",({name})=>{
    const code=Math.random().toString(36).slice(2,7).toUpperCase();
    const room={code,players:[{id:socket.id,name:name||"Spieler 1",ready:false,setupDone:false,tokens:10,connected:true,cards:null}],phase:"lobby",round:1,bids:{},active:null,message:"Warte auf zweiten Spieler…",questionResult:null,lastQuestion:null,winner:null};
    rooms.set(code,room);socket.join(code);socket.emit("joined",{code});emitRoom(room);
  });
  socket.on("join",({code,name})=>{
    const room=rooms.get((code||"").trim().toUpperCase());
    if(!room||room.players.length>=2){socket.emit("error","Raum nicht verfügbar.");return;}
    room.players.push({id:socket.id,name:name||"Spieler 2",ready:false,setupDone:false,tokens:10,connected:true,cards:null});
    socket.join(room.code);room.phase="setup";room.message="Beide Spieler da – legt eure 8 geheimen Karten fest.";
    socket.emit("joined",{code:room.code});emitRoom(room);
  });
  socket.on("setup",cards=>{
    const room=findRoom(socket.id);if(!room)return;
    const p=getPlayer(room,socket.id);
    if(!validSetup(cards)){socket.emit("error","Ungültige Kartenauswahl.");return;}
    p.cards=cards;p.setupDone=true;
    if(both(room)&&room.players.every(x=>x.setupDone)){room.phase="bidding";room.message="Runde 1: Gebote abgeben.";}
    else room.message="Eine Auswahl wurde bestätigt – warte auf den anderen Spieler…";
    emitRoom(room);
  });
  socket.on("bid",amount=>{
    const room=findRoom(socket.id);if(!room||room.phase!=="bidding")return;
    const p=getPlayer(room,socket.id);
    if(Object.prototype.hasOwnProperty.call(room.bids,socket.id)){socket.emit("error","Du hast für diese Runde bereits geboten.");return;}
    amount=Number(amount);
    if(!Number.isInteger(amount)||amount<0||amount>p.tokens){socket.emit("error","Ungültiges Gebot.");return;}
    // Jeder gesetzte Token ist sofort ausgegeben – unabhängig davon, wer die Runde gewinnt.
    p.tokens-=amount;
    room.bids[socket.id]=amount;
    if(Object.keys(room.bids).length===2){
      const [a,b]=room.players;
      const bidA=room.bids[a.id],bidB=room.bids[b.id];
      if(bidA===bidB){room.bids={};room.message="Gleichstand! Beide Einsätze sind ausgegeben. Neu bieten.";}
      else{const win=bidA>bidB?a:b;room.active=win.id;room.phase="choice";room.message=`${win.name} hat das Gebot gewonnen und wählt Frage oder Wahrheit.`;room.bids={};}
    }
    emitRoom(room);
  });
  socket.on("ask",q=>{
    const room=findRoom(socket.id);if(!room||room.phase!=="choice"||room.active!==socket.id)return;
    const opp=opponent(room,socket.id);const result=answer(opp.cards,q);
    room.lastQuestion=q;room.questionResult=result;room.phase="result";room.message="Frage beantwortet.";emitRoom(room);
  });
  socket.on("guess",guess=>{
    const room=findRoom(socket.id);if(!room||room.phase!=="choice"||room.active!==socket.id)return;
    const opp=opponent(room,socket.id);
    const ok=Array.isArray(guess)&&guess.length===8&&guess.every((v,i)=>v===opp.cards[i].value);
    if(ok){room.winner=socket.id;room.phase="finished";room.message=`${getPlayer(room,socket.id).name} gewinnt das Spiel!`;}
    else{room.questionResult="Falsch geraten – weiter geht's.";room.phase="result";room.message="Die Wahrheit war nicht korrekt geraten.";}
    emitRoom(room);
  });
  socket.on("next",()=>{
    const room=findRoom(socket.id);if(!room||room.phase!=="result")return;
    room.players.forEach(p=>p.tokens+=2);room.round++;room.phase="bidding";room.message=`Runde ${room.round}: Gebote abgeben.`;room.questionResult=null;room.lastQuestion=null;room.active=null;room.bids={};emitRoom(room);
  });
  socket.on("restart",()=>{
    const room=findRoom(socket.id);
    // Neu starten ist nur nach einem beendeten Spiel erlaubt.
    if(!room||room.phase!=="finished")return;
    room.players.forEach(p=>{
      p.ready=false;
      p.setupDone=false;
      p.tokens=10;
      p.cards=null;
    });
    room.phase="setup";
    room.round=1;
    room.bids={};
    room.active=null;
    room.message="Neues Spiel – beide Spieler legen wieder ihre 8 geheimen Karten fest.";
    room.questionResult=null;
    room.lastQuestion=null;
    room.winner=null;
    emitRoom(room);
  });
  socket.on("disconnect",()=>{for(const room of rooms.values()){const p=getPlayer(room,socket.id);if(p){p.connected=false;emitRoom(room);}}});
});
server.listen(process.env.PORT||3000,()=>console.log("http://localhost:3000"));
