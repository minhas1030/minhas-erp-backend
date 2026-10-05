const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const els = {
  mic: $('#mainMic'), micLabel: $('.mic-label'), mute: $('#muteBtn'), share: $('#shareBtn'),
  caption: $('#captionText'), captionWho: $('#captionWho'), statusPill: $('#statusPill'), statusText: $('#statusText'),
  avatar: $('#yaarAvatar'), character: $('#characterWrap'), mouth: $('#mouthGroup'), teeth: $('#teeth'), smirk: $('#smirk'),
  text: $('#textInput'), send: $('#sendText'), toast: $('#toast'), settings: $('#settingsSheet'), backdrop: $('#sheetBackdrop'),
  name: $('#nameInput'), voice: $('#voiceSelect'), remoteAudio: $('#remoteAudio'),
  xp: $('#xpNum'), xpBar: $('#xpBar'), fixes: $('#fixNum'), streak: $('#streakNum'), daily: $('#dailyChallenge'), install: $('#installBtn')
};

let state = {
  pc:null, dc:null, localStream:null, remoteStream:null, audioCtx:null, remoteAnalyser:null, localAnalyser:null,
  live:false, connecting:false, muted:false, mode:'freetalk', roast:'savage', voice:'ash', name:'',
  userBuffer:'', aiBuffer:'', userTimer:null, aiTimer:null, lastUser:'', lastAI:'', installPrompt:null,
  xp:0, fixes:0, streak:1
};

const dailyChallenges = [
  'Convince Yaar that pineapple belongs on pizza — in English.',
  'Explain your job without using the word “work”.',
  'Sell Yaar a completely useless product in 30 seconds.',
  'Tell a story using “actually”, “however”, and “fair enough” correctly.',
  'Complain about Monday like a dramatic British person.',
  'Ask for a salary raise without sounding scared.',
  'Explain cricket to someone who has never seen it.'
];

const fallbackRoasts = [
  'Bro confidence 4K tha, tense 144p kyun? 😭', 'Kela kyun kha rahe ho, sentence complete karo pehle 💀',
  'Verb bechara kis baat ki saza kaat raha hai? 😂', 'English seedhi thi, tumne uski biryani bana di.',
  'Oxford walay group chat mein tumhara screenshot bhej rahe hain 💀', 'Idea clear hai; grammar ka tyre puncture hai bas.',
  'Sentence London se nikla tha, Gujranwala mein emergency landing kar gaya 😭', 'Acha ji, nayi tense launch kar di? Patent bhi file karwa dein?',
  'Autocorrect ne ye sun ke annual leave apply kar di.', 'Grammar police ko location bhejun ya khud surrender karoge?',
  'Ye sentence tha ya plot twist? Main bhi confuse, verb bhi confuse.', 'Bro word order ko rickshaw route kyun bana diya?',
  'Confidence dekh ke TED Talk laga; grammar sun ke beta test nikla.', 'Cambridge walon ne kaha “hum is bande ko nahi jaante.”',
  'Bhai literal translation ka thela band karo, natural bolo.', 'Tense ko itna mat ghumaao, chakkar aa jayega usko.',
  'Aaj grammar ki qismat hi kharab thi jo tum mil gaye.', 'Sentence ko saans lene do ustad, sab words ek dusre pe charh gaye.'
];

const simpleRules = [
  {rx:/\bi\s+am\s+agree\b/i, fix:'I agree with you.', natural:'Yeah, I agree with you.'},
  {rx:/\bdidn[’']?t\s+went\b/i, fix:"I didn't go.", natural:"Nah, I didn't go."},
  {rx:/\byesterday\b.*\b(?:am\s+)?go\b/i, fix:'I went to the market yesterday.', natural:'I went to the market yesterday.'},
  {rx:/\bmore\s+better\b/i, fix:'This is better.', natural:'This is way better.'},
  {rx:/\bdiscuss\s+about\b/i, fix:'I will discuss this with him.', natural:"I'll talk to him about it."},
  {rx:/\breturn\s+back\b/i, fix:'I will return tomorrow.', natural:"I'll be back tomorrow."},
  {rx:/\bwhen\s+you\s+will\b/i, fix:'When will you make the payment?', natural:'When can we expect the payment?'}
];

function loadStats(){
  try {
    const d = JSON.parse(localStorage.getItem('boloyaar_stats') || '{}');
    state.xp = Number(d.xp||0); state.fixes=Number(d.fixes||0); state.streak=Number(d.streak||1);
    const today = new Date().toISOString().slice(0,10); const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
    if (d.lastDay && d.lastDay !== today && d.lastDay !== yesterday) state.streak=1;
  } catch {}
  renderStats();
}
function saveStats(){
  localStorage.setItem('boloyaar_stats', JSON.stringify({xp:state.xp, fixes:state.fixes, streak:state.streak, lastDay:new Date().toISOString().slice(0,10)}));
}
function renderStats(){els.xp.textContent=state.xp;els.fixes.textContent=state.fixes;els.streak.textContent=state.streak;els.xpBar.style.width=`${Math.min(100,(state.xp%100))}%`;}
function reward(points=5, fix=false){state.xp+=points;if(fix)state.fixes++;saveStats();renderStats();}

function toast(msg, ms=4500){els.toast.textContent=msg;els.toast.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>els.toast.classList.remove('show'),ms)}
function status(kind, text){els.statusPill.classList.remove('listening','speaking');if(kind)els.statusPill.classList.add(kind);els.statusText.textContent=text;}
function avatarMode(mode){els.avatar.classList.remove('listening','speaking','roast');els.character.classList.remove('roast');if(mode)els.avatar.classList.add(mode);if(mode==='roast'){els.character.classList.add('roast');setTimeout(()=>{els.avatar.classList.remove('roast');els.character.classList.remove('roast')},1700)}}
function setCaption(who,text){els.captionWho.textContent=who;els.caption.textContent=text || '…';}

function detectLocalFix(text){for(const r of simpleRules){if(r.rx.test(text))return r}return null}
function finalizeUser(){
  const text=state.userBuffer.trim(); state.userBuffer=''; if(!text)return;
  state.lastUser=text; setCaption('YOU',text); reward(4,false);
  const r=detectLocalFix(text); if(r){reward(4,true);avatarMode('roast')}
}
function finalizeAI(){
  const text=state.aiBuffer.trim(); state.aiBuffer=''; if(!text)return;
  state.lastAI=text; setCaption('YAAR',text);
  if(/bro|oye|grammar|kela|ustad|💀|😂|😭|roast/i.test(text)) avatarMode('roast');
}

function handleEvent(ev){
  if(!ev||!ev.type)return;
  if(ev.type==='session.started'){state.live=true;state.connecting=false;els.mic.classList.remove('connecting');els.mic.classList.add('live');els.micLabel.textContent='END LIVE';status('listening','SUN RAHA HUN');avatarMode('listening');setCaption('YAAR','Haan ji, aa gaye. English bolo — grammar ki zimmedari meri, beizzati ki zimmedari bhi meri.');toast('Live Yaar connected ✅');}
  if(ev.type==='session.input_transcript.delta'){
    state.userBuffer += ev.delta || ''; clearTimeout(state.userTimer); state.userTimer=setTimeout(finalizeUser,900);
    setCaption('YOU',state.userBuffer.trim()); status('listening','SUN RAHA HUN');avatarMode('listening');
  }
  if(ev.type==='session.output_transcript.delta'){
    state.aiBuffer += ev.delta || ''; clearTimeout(state.aiTimer); state.aiTimer=setTimeout(finalizeAI,1100);
    setCaption('YAAR',state.aiBuffer.trim()); status('speaking','YAAR BOL RAHA HAI');avatarMode('speaking');
  }
  if(ev.type==='session.closed'){cleanupLive(false);}
  if(ev.type==='error'){console.warn(ev);toast(ev.error?.message || 'Live AI ne scene off kar diya. Dobara try karo.',6500);}
}

function waitIce(pc){return new Promise(resolve=>{if(pc.iceGatheringState==='complete')return resolve();const f=()=>{if(pc.iceGatheringState==='complete'){pc.removeEventListener('icegatheringstatechange',f);resolve()}};pc.addEventListener('icegatheringstatechange',f);setTimeout(resolve,2500)})}

async function startLive(){
  if(state.live||state.connecting){return endLive()}
  if(!window.isSecureContext){toast('Phone par content:// ya file:// se mic nahi chalega. Real mic ke liye HTTPS website ya localhost kholo.',7000);return}
  if(!navigator.mediaDevices?.getUserMedia){toast('Is browser mein microphone API available nahi. Latest Chrome/Edge/Safari use karo.');return}
  state.connecting=true;els.mic.classList.add('connecting');els.micLabel.textContent='CONNECTING…';status('','AI JAG RAHA HAI');
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    state.localStream=stream;
    const pc=new RTCPeerConnection();state.pc=pc;
    stream.getAudioTracks().forEach(t=>pc.addTrack(t,stream));
    const remote=new MediaStream();state.remoteStream=remote;els.remoteAudio.srcObject=remote;
    pc.ontrack=e=>{e.streams[0]?.getTracks().forEach(t=>remote.addTrack(t));setupRemoteAnalyser(remote)};
    pc.onconnectionstatechange=()=>{if(['failed','disconnected','closed'].includes(pc.connectionState)&&state.live)cleanupLive(false)};
    const dc=pc.createDataChannel('oai-events');state.dc=dc;dc.onmessage=e=>{try{handleEvent(JSON.parse(e.data))}catch{}};dc.onerror=()=>toast('Live event channel error.');
    const offer=await pc.createOffer();await pc.setLocalDescription(offer);await waitIce(pc);
    const payload={sdp:pc.localDescription.sdp, mode:state.mode, roast:state.roast, voice:state.voice, name:state.name};
    let r=await fetch('/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    let data=await r.json().catch(()=>({}));
    if(r.status===503){
      try{
        const hr=await fetch('/api/health',{cache:'no-store'});
        const h=await hr.json();
        if(h?.liveConfigured){
          toast('Server just refreshed — retrying live brain…',2500);
          await new Promise(x=>setTimeout(x,1200));
          r=await fetch('/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
          data=await r.json().catch(()=>({}));
        }
      }catch{}
    }
    if(!r.ok){
      const detail = data?.error?.message || data?.error || data?.detail || `Live session failed (${r.status})`;
      throw new Error(String(detail));
    }
    await pc.setRemoteDescription({type:'answer',sdp:data.transport.sdp});
    setupLocalAnalyser(stream);
  }catch(e){console.error(e);cleanupLive(false);toast(e.message||'Mic/live connection failed.',7000)}
}

function endLive(){
  try{if(state.dc?.readyState==='open')state.dc.send(JSON.stringify({type:'session.close'}))}catch{}
  setTimeout(()=>cleanupLive(false),500);
}
function cleanupLive(show=true){
  state.live=false;state.connecting=false;try{state.dc?.close()}catch{};try{state.pc?.close()}catch{};try{state.localStream?.getTracks().forEach(t=>t.stop())}catch{};
  state.pc=state.dc=state.localStream=state.remoteStream=null;els.remoteAudio.srcObject=null;els.mic.classList.remove('live','connecting');els.micLabel.textContent='START LIVE';status('','READY TO ROAST');avatarMode('');if(show)toast('Live session ended.');
}

function setupRemoteAnalyser(stream){
  try{const ctx=state.audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();const src=ctx.createMediaStreamSource(stream);const an=ctx.createAnalyser();an.fftSize=256;src.connect(an);state.remoteAnalyser=an;animateFace()}catch(e){console.warn(e)}
}
function setupLocalAnalyser(stream){try{const ctx=state.audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();const src=ctx.createMediaStreamSource(stream);const an=ctx.createAnalyser();an.fftSize=256;src.connect(an);state.localAnalyser=an}catch{}}
let animating=false;
function animateFace(){if(animating)return;animating=true;const data=new Uint8Array(128);function tick(){if(!state.remoteAnalyser){animating=false;return}state.remoteAnalyser.getByteFrequencyData(data);let sum=0;for(let i=0;i<32;i++)sum+=data[i];const v=sum/(32*255);const sy=0.5+Math.min(1.15,v*4.4);els.mouth.style.transform=`scaleY(${sy})`;els.teeth.style.opacity=v>.12?'.95':'.45';requestAnimationFrame(tick)}tick()}

function appendInstruction(content){if(state.dc?.readyState==='open'){state.dc.send(JSON.stringify({type:'session.instructions.append',content,delegation_id:null}))}}
function updateLiveVibe(){appendInstruction(`From now on, the active mode is ${state.mode} and roast level is ${state.roast}. Follow the newest setting even if earlier settings differ. Keep roasts fresh and non-repetitive.`)}

async function sendText(){
  const text=els.text.value.trim();if(!text)return;els.text.value='';state.lastUser=text;setCaption('YOU',text);avatarMode('listening');status('','SOCH RAHA HAI');reward(4,false);
  try{
    const r=await fetch('/api/text',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,mode:state.mode,roast:state.roast,name:state.name})});
    const data=await r.json();if(!r.ok)throw new Error(data.error||'Text AI unavailable');
    state.lastAI=data.text;setCaption('YAAR',data.text);avatarMode(/bro|oye|grammar|kela|💀|😂|😭/i.test(data.text)?'roast':'speaking');status('speaking','YAAR BOL RAHA HAI');speakFallback(data.text);const fix=detectLocalFix(text);if(fix)reward(5,true);
  }catch(e){
    const fix=detectLocalFix(text);const roast=fallbackRoasts[Math.floor(Math.random()*fallbackRoasts.length)];const out=fix?`${roast} Say it like this: “${fix.natural}”`:`${roast} Meaning samajh aa gaya. Ab isay thora cleaner aur natural bolne ki practice karo.`;state.lastAI=out;setCaption('YAAR · DEMO',out);avatarMode('roast');speakFallback(out);if(fix)reward(5,true);if(/OPENAI_API_KEY/i.test(e.message))toast('Server API key is missing. This is a server configuration issue.',7000);
  }
}
function speakFallback(text){if(!('speechSynthesis'in window))return;const u=new SpeechSynthesisUtterance(text.replace(/[💀😂😭]/g,''));u.rate=1.05;u.pitch=.98;u.onstart=()=>avatarMode('speaking');u.onend=()=>{avatarMode('');status('','READY TO ROAST')};speechSynthesis.cancel();speechSynthesis.speak(u)}

function openSettings(){els.backdrop.hidden=false;requestAnimationFrame(()=>els.settings.classList.add('open'));els.settings.setAttribute('aria-hidden','false')}
function closeSettings(){els.settings.classList.remove('open');els.settings.setAttribute('aria-hidden','true');setTimeout(()=>els.backdrop.hidden=true,320)}

function shareMoment(){
  const text=`BoloYaar cooked me 😭\n\nMe: “${state.lastUser||'…'}”\nYaar: “${state.lastAI||'Abhi roast hi nahi hua bro.'}”\n\nSpeak. Get roasted. Get better.`;
  if(navigator.share){navigator.share({title:'My BoloYaar roast',text}).catch(()=>{})}else{navigator.clipboard?.writeText(text);toast('Roast copied — TikTok/WhatsApp pe phenk do 😂')}
}

function blink(){const l=$('#eyeL'),r=$('#eyeR');l.setAttribute('ry','3');r.setAttribute('ry','3');setTimeout(()=>{l.setAttribute('ry','22');r.setAttribute('ry','22')},110)}
setInterval(()=>{if(Math.random()<.68)blink()},2500);
window.addEventListener('pointermove',e=>{const rect=els.avatar.getBoundingClientRect();const dx=Math.max(-6,Math.min(6,(e.clientX-(rect.left+rect.width/2))/40));const dy=Math.max(-4,Math.min(4,(e.clientY-(rect.top+rect.height/2))/50));$('#pupilL').style.transform=`translate(${dx}px,${dy}px)`;$('#pupilR').style.transform=`translate(${dx}px,${dy}px)`});

els.mic.addEventListener('click',startLive);els.send.addEventListener('click',sendText);els.text.addEventListener('keydown',e=>{if(e.key==='Enter')sendText()});
els.mute.addEventListener('click',()=>{state.muted=!state.muted;state.localStream?.getAudioTracks().forEach(t=>t.enabled=!state.muted);els.mute.textContent=state.muted?'🔇':'🔊';toast(state.muted?'Mic muted':'Mic unmuted')});
els.share.addEventListener('click',shareMoment);$('#settingsBtn').addEventListener('click',openSettings);$('#closeSettings').addEventListener('click',closeSettings);els.backdrop.addEventListener('click',closeSettings);
$$('.mode').forEach(b=>b.addEventListener('click',()=>{$$('.mode').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.mode=b.dataset.mode;updateLiveVibe();toast(`Mode: ${b.textContent.trim()}`)}));
$$('.roast-choice').forEach(b=>b.addEventListener('click',()=>{$$('.roast-choice').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.roast=b.dataset.roast}));
$('#applySettings').addEventListener('click',()=>{state.name=els.name.value.trim();state.voice=els.voice.value;updateLiveVibe();closeSettings();toast(`Vibe applied: ${state.roast.toUpperCase()} 💀`)});

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.installPrompt=e;els.install.hidden=false});els.install.addEventListener('click',async()=>{if(state.installPrompt){state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;els.install.hidden=true}});
if('serviceWorker'in navigator){navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});}

async function init(){
  loadStats();els.daily.textContent=dailyChallenges[new Date().getDate()%dailyChallenges.length];
  try{
    const r=await fetch('/api/health',{cache:'no-store'});
    const d=await r.json();
    if(!d.liveConfigured) $('#hintText').textContent='Live brain is not connected on the server yet.';
    else $('#hintText').textContent='Live brain connected ✅ Tap START LIVE and allow microphone.';
  }catch{}
  if(!window.isSecureContext)$('#hintText').textContent='Downloaded HTML/content:// cannot use mic. Use START_BOLOYAAR.bat on desktop or deploy to HTTPS.';
}
init();
