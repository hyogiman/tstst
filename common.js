// 쎄뇨라유 스페인어 — 학생 화면(index.html)과 강사 화면(admin.html)이 함께 쓰는 코드입니다.
// 공통 기능은 이 파일 한 곳만 고치면 두 화면에 모두 반영됩니다.
// 불러오는 쪽: import { … } from './common.js?v=날짜'  (배포할 때 ?v= 값을 함께 올려 브라우저 캐시를 갱신하세요)
// ES module이므로 HTML 파일을 더블클릭(file://)으로 열면 동작하지 않습니다. 로컬에서는 정적 서버로 여세요(README 참고).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-storage.js';

// Firebase 웹 앱 설정(두 화면 공통). API key는 비밀 키가 아니며 보안은 Rules가 담당합니다.
export const firebaseConfig = {
  apiKey: "AIzaSyBVNCSbB4Bmrcc2lEgjvZirVNhJNce7r8E",
  authDomain: "senora-c9b84.firebaseapp.com",
  projectId: "senora-c9b84",
  storageBucket: "senora-c9b84.firebasestorage.app",
  messagingSenderId: "89833541051",
  appId: "1:89833541051:web:db34c49bc76f536c32c89e"
};
export const CONFIGURED = !firebaseConfig.apiKey.startsWith('PASTE_') && !firebaseConfig.projectId.startsWith('PASTE_');
export const app = CONFIGURED ? initializeApp(firebaseConfig) : null;
export const auth = CONFIGURED ? getAuth(app) : null;
export const db = CONFIGURED ? getFirestore(app) : null;
export const storage = CONFIGURED ? getStorage(app) : null;
export const $ = (s, el=document)=>el.querySelector(s);
export const $$ = (s, el=document)=>Array.from(el.querySelectorAll(s));
export const esc = v => String(v??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt = ts => { if (!ts) return '기록 없음'; let d = ts.toDate?.() ?? new Date(ts); return Number.isNaN(+d)?'기록 없음':new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short'}).format(d); };
export const ex = e => { console.error(e); const c=e?.code||''; return ({'auth/invalid-credential':'이메일 또는 비밀번호를 확인해 주세요.','auth/email-already-in-use':'이미 가입된 이메일입니다.','auth/weak-password':'비밀번호는 6자 이상으로 설정해 주세요.','auth/invalid-email':'올바른 이메일을 입력해 주세요.','auth/unauthorized-domain':'Firebase Authentication에서 현재 도메인을 승인해 주세요.','auth/too-many-requests':'로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.','permission-denied':'접근 권한이 없습니다. 보안 규칙 또는 계정 권한을 확인해 주세요.','storage/unauthorized':'파일 저장 권한이 없습니다. Storage 보안 규칙을 확인해 주세요.','storage/quota-exceeded':'Storage 사용량 또는 요금제 제한을 확인해 주세요.'})[c] || e?.message || '처리 중 오류가 발생했습니다.'; };
let toastTimer; export function toast(message,bad=false){const box=$('#toast');if(!box)return;box.textContent=message;box.className='toast show'+(bad?' bad':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.className='toast',4200)}
export function loading(el){el.classList.add('loading');el.textContent='불러오는 중입니다'}
export function loaded(el,html){if(!el)return;el.classList.remove('loading');el.innerHTML=html}
export function empty(title,detail=''){return `<div class="empty"><span class="symbol" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M9 41C17 31 26 21 39 9" stroke="#56781f" stroke-width="2.2" stroke-linecap="round"/><ellipse cx="19" cy="28" rx="7.5" ry="3.1" transform="rotate(-52 19 28)" fill="#8ba65a"/><ellipse cx="27" cy="20" rx="7.5" ry="3.1" transform="rotate(-38 27 20)" fill="#a7c072"/><ellipse cx="16" cy="34.5" rx="6.2" ry="2.7" transform="rotate(18 16 34.5)" fill="#a7c072"/><ellipse cx="31" cy="25.5" rx="6.2" ry="2.7" transform="rotate(24 31 25.5)" fill="#8ba65a"/><circle cx="35" cy="13.5" r="3.6" fill="#3f5f14"/></svg></span><strong>${esc(title)}</strong><p>${esc(detail)}</p></div>`;}
export function makeId(){return (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));}
export const enId = (uid,cid)=>`${uid}_${cid}`;
export const isMedia = (file,kind) => kind==='audio'?file.type.startsWith('audio/'):kind==='image'?file.type.startsWith('image/'):kind==='video'?file.type.startsWith('video/'):true;
export const sizeLimit={audio:15*1024*1024,image:8*1024*1024,video:2*1024*1024*1024,file:20*1024*1024};
export async function uploadMedia(file,path,kind,progressEl){
  if(!file)throw Error('파일을 선택해 주세요.');
  if(!isMedia(file,kind))throw Error('선택한 파일 형식을 확인해 주세요.');
  if(file.size>sizeLimit[kind])throw Error(`파일 크기 제한을 초과했습니다. (${Math.round(sizeLimit[kind]/1024/1024)}MB)`);
  const r=storageRef(storage,path);
  return new Promise((resolve,reject)=>{
    const task=uploadBytesResumable(r,file,{contentType:file.type||'application/octet-stream'});
    task.on('state_changed',snap=>{if(progressEl)progressEl.textContent=`업로드 ${Math.round(snap.bytesTransferred/snap.totalBytes*100)}%`},reject,()=>{if(progressEl)progressEl.textContent='업로드 완료';resolve(path)});
  });
}
export async function urlFor(path){try{return path?await getDownloadURL(storageRef(storage,path)):null}catch(e){console.warn('파일을 열 수 없습니다.',e);return null}}
export function useMediaPaths(container){
  if(!container)return;
  $$('[data-media-path]',container).forEach(async el=>{
    const path=el.dataset.mediaPath;
    if(!path)return;
    try{
      // <audio src="Firebase 다운로드 URL">로 바로 재생: getBlob()·CORS 수동 설정 불필요.
      // 다운로드 URL을 가진 사람은 링크를 공유할 수 있으므로 유료/고보안 음성 보호에는 적합하지 않습니다.
      const url=await urlFor(path);
      if(!el.isConnected || !el.closest('body'))return;
      if(!url)throw Error('파일 주소가 없습니다.');
      if(el.tagName==='A'){
        el.href=url;el.target='_blank';el.rel='noopener noreferrer';
      }else{
        el.src=url;
        if(el.tagName==='AUDIO')el.preload='none';
        if(el.tagName==='VIDEO'){el.addEventListener('contextmenu',ev=>ev.preventDefault());el.setAttribute('controlsList','nodownload noremoteplayback');}
      }
    }catch(e){
      console.warn('미디어 주소 확인 실패',path,e);
      if(el.isConnected){
        const message=document.createElement('span');
        message.className='error';message.textContent='파일을 불러오지 못했습니다. 저장 경로 또는 파일 권한을 확인해 주세요.';
        el.replaceWith(message);
      }
    }
  });
}
export function sanitizeRich(html){
  const parsed=new DOMParser().parseFromString(`<div>${html||''}</div>`,'text/html');
  const allowed=new Set(['P','DIV','BR','STRONG','B','EM','I','U','S','UL','OL','LI','H1','H2','H3','H4','BLOCKQUOTE','SPAN','FONT','A']);
  const styleKeys=new Set(['color','background-color','font-size','font-family','font-weight','text-align','font-style','text-decoration']);
  function safeNode(node){
    if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent);
    if(node.nodeType!==Node.ELEMENT_NODE)return document.createDocumentFragment();
    const tag=node.tagName; const el=allowed.has(tag)?document.createElement(tag.toLowerCase()):document.createDocumentFragment();
    if(el.nodeType===Node.ELEMENT_NODE){
      if(tag==='A'){const href=node.getAttribute('href')||'';if(/^https?:\/\//i.test(href)){el.setAttribute('href',href);el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer')}}
      if(tag==='FONT'){
        const sz=node.getAttribute('size');if(sz&&/^[1-7]$/.test(sz))el.setAttribute('size',sz);
        const color=node.getAttribute('color');if(color&&/^(#[0-9a-f]{3,8}|[a-z]{3,16}|rgb\([\d\s,%.]+\))$/i.test(color))el.setAttribute('color',color);
        const face=node.getAttribute('face');if(face&&/^[\w가-힣 ,'-]{1,65}$/.test(face))el.setAttribute('face',face);
      }
      const style=node.getAttribute('style');if(style){
        style.split(';').forEach(item=>{const [k,...v]=item.split(':');const key=k?.trim().toLowerCase(), val=v.join(':').trim();if(styleKeys.has(key)&&/^[\w\s#(),.%'-]{1,75}$/.test(val)&&!/(url|expression|behavior|javascript)/i.test(val))el.style.setProperty(key,val)})
      }
    }
    Array.from(node.childNodes).forEach(child=>el.appendChild(safeNode(child)));return el;
  }
  const wrapper=document.createElement('div');Array.from(parsed.body.firstElementChild?.childNodes||[]).forEach(n=>wrapper.appendChild(safeNode(n)));return wrapper.innerHTML;
}
export async function ensureProfile(user){
  const r=doc(db,'users',user.uid),snap=await getDoc(r);
  if(snap.exists()){
    const profile=snap.data();
    // 구버전 가입 경쟁 상태로 기본 이름 '수강생'이 저장된 계정을 복구합니다.
    const authName=(user.displayName||'').trim();
    if(profile.role==='student' && (!profile.displayName || profile.displayName==='수강생') && authName && authName!=='수강생'){
      await updateDoc(r,{displayName:authName,updatedAt:serverTimestamp()});
      return {...profile,displayName:authName};
    }
    return profile;
  }
  const firstName=(user.displayName||'').trim()||'수강생';
  const data={displayName:firstName,realName:firstName,nickname:'',email:user.email||'',role:'student',createdAt:serverTimestamp()};
  await setDoc(r,data);
  return data;
}
export function signedOut(variant='student'){return `<div class="auth-shell"><div class="auth-hero"><div class="brand"><span class="logo"><img src="senorayu-mark-white.svg" alt="쎄뇨라유 스페인어 로고"></span><div><strong>쎄뇨라유 스페인어</strong><small>ESPAÑOL · LEARNING SPACE</small></div></div><div><div class="eyebrow">Mi pequeño universo</div>${variant==='admin'?'<h1>오늘의 스페인어가<br>내일의 일상이 되도록.</h1>':'<h1 class="senorayu-opening"><span class="senorayu-opening-intro">오늘의 스페인어가</span><span class="senorayu-opening-main">내일의 일상이</span><span class="senorayu-opening-end">되도록<span class="opening-dot">.</span></span></h1>'}<p>과제를 제출하고, 단어를 복습하고, 다음 수업을 준비하세요. 수업이 끝난 뒤에도 배움은 이어집니다.</p></div><footer>Aprender juntos, crecer juntos. ✨</footer></div><div class="auth-right"><div class="auth-card"><div class="eyebrow">WELCOME BACK</div><h2>반갑습니다 👋</h2><p>학습 공간에 로그인해 주세요.</p><div id="setup-note" class="setup-warning ${CONFIGURED?'hide':''}">Firebase 설정이 비어 있습니다. 두 HTML에 동일한 firebaseConfig를 입력해 주세요.</div><form id="login-form" class="stack"><div class="field"><label>이메일</label><input name="email" type="email" autocomplete="email" required placeholder="name@example.com"></div><div class="field"><label>비밀번호</label><input name="password" type="password" autocomplete="current-password" required placeholder="비밀번호"></div><button class="btn full" type="submit">로그인 →</button></form><div class="auth-links"><button id="auth-alt" class="linkbutton" type="button">회원가입</button><button id="forgot-password" class="linkbutton" type="button">비밀번호 재설정</button></div><div id="login-message" class="error" style="margin-top:15px"></div></div></div></div>`}
export function mountAuth(root,opts={signup:true}){
  root.innerHTML=signedOut(opts.variant); const alt=$('#auth-alt');if(!opts.signup)alt.classList.add('hide');
  let mode='login';alt?.addEventListener('click',()=>{mode=mode==='login'?'signup':'login';const form=$('#login-form');form.innerHTML=mode==='login'?`<div class="field"><label>이메일</label><input name="email" type="email" required autocomplete="email"></div><div class="field"><label>비밀번호</label><input name="password" type="password" required autocomplete="current-password"></div><button class="btn full" type="submit">로그인 →</button>`:`<div class="field"><label>이름</label><input name="name" type="text" required maxlength="35" autocomplete="name" placeholder="강사에게 알린 실제 이름"></div><div class="field"><label>이메일</label><input name="email" type="email" required autocomplete="email"></div><div class="field"><label>비밀번호 (6자 이상)</label><input name="password" type="password" required minlength="6" autocomplete="new-password"></div><button class="btn full" type="submit">수강생 계정 만들기</button>`;alt.textContent=mode==='login'?'회원가입':'로그인으로 돌아가기';$('#login-message').textContent='';});
  $('#login-form').addEventListener('submit',async e=>{e.preventDefault();if(!CONFIGURED){toast('Firebase 설정을 먼저 입력해 주세요.',true);return} const form=e.currentTarget;const data=new FormData(form);const btn=$('button[type="submit"]',form);btn.disabled=true;try{if(mode==='login')await signInWithEmailAndPassword(auth,String(data.get('email')).trim(),String(data.get('password')));else{const cred=await createUserWithEmailAndPassword(auth,String(data.get('email')).trim(),String(data.get('password')));await updateProfile(cred.user,{displayName:String(data.get('name')).trim()});await ensureProfile(cred.user);await updateDoc(doc(db,'users',cred.user.uid),{displayName:String(data.get('name')).trim(),realName:String(data.get('name')).trim(),nickname:'',updatedAt:serverTimestamp()});} }catch(err){$('#login-message').textContent=ex(err)}finally{btn.disabled=false}});
  $('#forgot-password').addEventListener('click',async()=>{if(!CONFIGURED){toast('Firebase 설정이 필요합니다.',true);return}const email=$('input[name="email"]')?.value?.trim();if(!email){toast('먼저 이메일을 입력해 주세요.',true);return}try{await sendPasswordResetEmail(auth,email);toast('비밀번호 재설정 메일을 발송했습니다.')}catch(e){toast(ex(e),true)}});
}
// 녹음은 한 번에 하나만 합니다. 녹음 결과는 '녹음을 시작한 대상'에만 저장되고,
// 화면을 옮기면 자동으로 멈춰 마이크를 끕니다(P0-02). 파일 선택 업로드도 대안으로 제공합니다.
let activeRecorder=null;
export const formatDuration=sec=>`${Math.floor(sec/60)}:${String(Math.round(sec)%60).padStart(2,'0')}`;
export async function recordStart(onFile,onStatus,label=''){
  if(activeRecorder)throw Error('현재 녹음 중인 항목을 먼저 종료해 주세요.');
  if(!navigator.mediaDevices?.getUserMedia||!globalThis.MediaRecorder)throw Error('이 브라우저에서 음성 녹음을 지원하지 않습니다. 음성 파일을 선택해 주세요.');
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  const options=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg'].find(t=>MediaRecorder.isTypeSupported(t));
  let recorder;try{recorder=options?new MediaRecorder(stream,{mimeType:options}):new MediaRecorder(stream)}catch(err){stream.getTracks().forEach(t=>t.stop());throw err}
  const chunks=[],startedAt=Date.now();
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  recorder.onstop=()=>{
    stream.getTracks().forEach(t=>t.stop());
    activeRecorder=null;
    const mime=recorder.mimeType||'audio/webm';
    const ext=mime.includes('mp4')?'m4a':mime.includes('ogg')?'ogg':'webm';
    const file=new File(chunks,`recording-${Date.now()}.${ext}`,{type:mime});
    // webm 녹음은 길이 정보가 비어 있는 경우가 있어 시작·종료 시각으로 계산합니다.
    file.durationSec=Math.max(1,Math.round((Date.now()-startedAt)/1000));
    onFile(file);
    onStatus(`녹음 완료 · ${formatDuration(file.durationSec)}`);
  };
  recorder.start();
  activeRecorder={recorder,stream,label};
  onStatus('● 녹음 중입니다. 종료 버튼을 눌러 주세요.');
}
export function recordStop(){if(activeRecorder?.recorder.state==='recording')activeRecorder.recorder.stop()}
export function isRecording(){return !!activeRecorder}
// 화면 전환·로그아웃 때 호출합니다. 녹음 중이면 멈추고 마이크를 끄며, 결과는 녹음을 시작한 대상의 초안으로 보관됩니다.
export function stopRecordingForNavigation(){
  if(!activeRecorder)return false;
  const {recorder,stream,label}=activeRecorder;
  if(recorder.state==='recording')recorder.stop();
  stream.getTracks().forEach(t=>t.stop());
  toast(label?`녹음을 멈췄어요. ${label} 초안에 보관했어요.`:'녹음을 멈췄어요.');
  return true;
}
export function makeMediaUi(kind,label){return `<div class="stack media-ui"><div class="record-controls"><button class="btn soft small" type="button" data-record-start><span aria-hidden="true">●</span> 녹음 시작</button><button class="btn secondary small" type="button" data-record-stop><span aria-hidden="true">■</span> 녹음 종료</button><span class="file-note" data-rec-status role="status"></span></div><div class="field"><label>${esc(label||'또는 음성 파일 선택')}</label><input type="file" accept="audio/*" data-audio-input></div><div class="media-draft hide" data-media-draft><audio controls data-local-audio></audio><div class="media-draft-meta"><span data-media-draft-name></span><button type="button" class="btn ghost small" data-record-clear>첨부 취소</button></div></div><p class="hint">마이크 권한과 HTTPS 연결이 필요합니다. 음성 파일은 최대 15MB입니다.</p></div>`}
// onFile(file|null): 선택·녹음한 파일을 해당 대상의 초안에 저장(null이면 첨부 취소). initialFile: 보관된 초안 복원
export function wireMediaUi(container,onFile,{label='',initialFile=null}={}){
  const status=$('[data-rec-status]',container),player=$('[data-local-audio]',container),draft=$('[data-media-draft]',container),name=$('[data-media-draft-name]',container),input=$('[data-audio-input]',container);
  const show=(file,prefix)=>{
    if(player.dataset.blob){URL.revokeObjectURL(player.dataset.blob);delete player.dataset.blob}
    if(!file){player.removeAttribute('src');draft.classList.add('hide');return}
    const url=URL.createObjectURL(file);player.dataset.blob=url;player.src=url;
    name.textContent=`${prefix}: ${file.name}${file.durationSec?` · ${formatDuration(file.durationSec)}`:''}`;
    draft.classList.remove('hide');
  };
  const onSelected=file=>{if(!file)return;onFile(file);if(container.isConnected){show(file,'첨부할 음성');status.textContent=''}};
  $('[data-record-start]',container)?.addEventListener('click',async()=>{try{await recordStart(onSelected,t=>{if(status.isConnected)status.textContent=t},label)}catch(e){toast(ex(e),true)}});
  $('[data-record-stop]',container)?.addEventListener('click',recordStop);
  input?.addEventListener('change',e=>onSelected(e.target.files[0]));
  $('[data-record-clear]',container)?.addEventListener('click',()=>{onFile(null);show(null);if(input)input.value='';status.textContent='첨부를 취소했어요.'});
  if(initialFile)show(initialFile,'보관된 음성');
}
// 실시간 갱신 안내 띠(P0-10): 작업 중에는 화면을 다시 그리지 않고 이 띠로 알립니다.
export function showLiveNotice(host,message,actionText,onAction){
  if(!host)return;
  let bar=host.querySelector(':scope > .live-notice');
  if(!bar){bar=document.createElement('div');bar.className='live-notice';bar.setAttribute('role','status');host.prepend(bar)}
  bar.innerHTML=`<span>${esc(message)}</span><button type="button" class="btn small">${esc(actionText)}</button>`;
  bar.querySelector('button').onclick=()=>{bar.remove();onAction()};
}


// 모든 확인/수정은 브라우저 기본 팝업 대신 접근 가능한 앱 내부 모달로 처리합니다.
export function modalDialog({title='확인',message='',value=null,choices=null,placeholder='',danger=false,confirmText='확인',verify=null,multiline=false,allowEmpty=false}={}){
  return new Promise(resolve=>{
    document.querySelector('.app-modal-backdrop')?.remove();
    const layer=document.createElement('div');layer.className='app-modal-backdrop';
    layer.innerHTML=`<section class="app-modal" role="dialog" aria-modal="true" aria-labelledby="app-modal-title"><div class="app-modal-head"><div><span class="eyebrow">쎄뇨라유 · 안내</span><h2 id="app-modal-title">${esc(title)}</h2></div><button type="button" class="app-modal-x" aria-label="닫기">×</button></div><p class="app-modal-message">${esc(message)}</p>${choices?`<div class="field"><label>선택</label><select class="input app-modal-input">${choices.map(x=>`<option value="${esc(x.value)}">${esc(x.label)}</option>`).join('')}</select></div>`:value!==null?`<div class="field"><label>${verify?'삭제할 반 이름':'입력'}</label>${multiline?`<textarea class="input app-modal-input" rows="7" maxlength="500" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`:`<input class="input app-modal-input" maxlength="1000" placeholder="${esc(placeholder)}" value="${esc(value)}" ${verify?'autocomplete="off"':''}>`}</div>`:''}${verify?`<p class="app-modal-verify">확인을 위해 <strong>${esc(verify)}</strong>을(를) 정확히 입력해 주세요.</p>`:''}<div class="app-modal-actions"><button type="button" class="btn secondary app-modal-cancel">취소</button><button type="button" class="btn ${danger?'danger-solid':''} app-modal-ok">${esc(confirmText)}</button></div></section>`;
    document.body.appendChild(layer);document.body.classList.add('modal-open');const input=layer.querySelector('.app-modal-input'),ok=layer.querySelector('.app-modal-ok');
    if(verify)ok.disabled=true;
    const done=v=>{document.removeEventListener('keydown',keyHandler);layer.remove();document.body.classList.remove('modal-open');resolve(v)};
    function keyHandler(e){if(e.key==='Escape'){e.preventDefault();done(null)}if(e.key==='Enter'&&document.activeElement===input){e.preventDefault();if(!ok.disabled)ok.click()}}
    document.addEventListener('keydown',keyHandler);
    layer.querySelector('.app-modal-cancel').onclick=()=>done(null);layer.querySelector('.app-modal-x').onclick=()=>done(null);
    layer.onclick=e=>{if(e.target===layer)done(null)};
    input?.addEventListener('input',()=>{if(verify)ok.disabled=input.value.trim()!==verify});
    ok.onclick=()=>{if(input&&value!==null&&!verify&&!allowEmpty&&!input.value.trim()){input.focus();return}done(input?input.value:true)};
    requestAnimationFrame(()=>{(input||ok).focus();if(input&&value!==null&&!verify)input.select()});
  });
}
export async function modalConfirm(message){return !!(await modalDialog({title:'변경사항 확인',message,confirmText:'진행하기'}));}
export async function modalInput(message,value=''){return await modalDialog({title:'정보 수정',message,value,confirmText:'저장하기'});}
