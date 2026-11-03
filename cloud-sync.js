/* SalesPulse RPM Cloud Sync — Firestore, document-per-PLU/day, member-only team workspace.
   Cloud sync is optional; without Firebase settings the original dashboard stays local.
   No passcodes or secrets are stored in this file. */
const $ = s => document.querySelector(s);
const el = {
  dialog:$('#cloudDialog'),open:$('#cloudOpen'),close:$('#cloudClose'),badge:$('#cloudBadge'),
  status:$('#cloudStatus'),form:$('#cloudLogin'),loginBtn:$('#cloudLoginBtn'),
  email:$('#cloudEmail'),password:$('#cloudPassword'),logged:$('#cloudAuthed'),
  user:$('#cloudUser'),logout:$('#cloudLogout'),upload:$('#cloudUploadLocal')
};
const message=(msg,level='warn')=>{el.status.textContent=msg;el.status.dataset.level=level;el.badge.textContent=level==='ok'?'Cloud: Aktif':level==='error'?'Cloud: Error': 'Cloud: Lokal';};
el.open.addEventListener('click',()=>el.dialog.showModal());
el.close.addEventListener('click',()=>el.dialog.close());
el.dialog.addEventListener('click',e=>{if(e.target===el.dialog)el.dialog.close()});
const config = window.RPM_FIREBASE || {};
const valid = typeof config.apiKey==='string' && !config.apiKey.startsWith('ISI_') &&
  typeof config.projectId==='string' && !config.projectId.startsWith('ISI_') &&
  typeof config.appId==='string' && !config.appId.startsWith('ISI_') &&
  /^[a-zA-Z0-9_-]{3,60}$/.test(config.workspaceId||'');
if(!valid){
  message('☁ Belum tersambung. Admin perlu mengisi firebase-config.js dan mengaktifkan Firebase Authentication + Firestore. Dashboard lokal tetap berfungsi.');
  el.loginBtn.disabled=true;
  el.form.addEventListener('submit',e=>e.preventDefault());
}else{
 try{
  // Using official modular Firebase browser SDK. PWA's offline app shell does not cache Firebase CDN scripts.
  const VERSION='12.5.0';
  const [{initializeApp},{getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut},
    {getFirestore,doc,collection,getDoc,onSnapshot,writeBatch,serverTimestamp}]=await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${VERSION}/firebase-firestore.js`)
    ]);
  const app=initializeApp({apiKey:config.apiKey,authDomain:config.authDomain,projectId:config.projectId,appId:config.appId});
  const auth=getAuth(app),db=getFirestore(app),wid=config.workspaceId;
  let unsub=null,ready=false,canEditCloud=false,initial=false,remote=new Map(),baseline=new Map(),queued=new Map(),inflight=new Map(),timer=null,busy=false,retryTimer=null;
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const pack=model=>{
    const m=new Map();
    for(const p of model.products||[])if(p.id&&p.name)m.set('b_'+p.id,{type:'brand',id:String(p.id),name:String(p.name),description:String(p.description||''),targetQty:Number(p.targetQty)||0,targetNS:Number(p.targetNS)||0});
    for(const [week,rows] of Object.entries(model.catalog||{}))for(const p of rows||[])if(p.id)m.set('c_'+week+'_'+p.id,{type:'plu',week,id:p.id,productId:p.productId||'',plu:String(p.plu||''),description:String(p.description||''),hpp:Number(p.hpp)||0});
    for(const [week,values] of Object.entries(model.targets||{}))for(const [brandId,t] of Object.entries(values||{}))m.set('t_'+week+'_'+brandId,{type:'target',week,brandId,qty:Number(t.qty)||0,ns:Number(t.ns)||0});
    for(const [date,rows] of Object.entries(model.sales||{}))for(const p of rows||[])if(p.id&&Number(p.qty)>0)m.set('s_'+date+'_'+p.id,{type:'sale',date,id:p.id,productId:p.productId||'',qty:Number(p.qty)||0});
    const t=model.customText&&typeof model.customText==='object'?model.customText:{};
    m.set('x_dashboard',{type:'text',value:t});
    return m;
  };
  const overlay=()=>{const m=new Map(remote);for(const [k,v] of inflight){if(v===null)m.delete(k);else m.set(k,v)}for(const [k,v] of queued){if(v===null)m.delete(k);else m.set(k,v)}return m};
  const receive=()=>{
    const records=overlay();baseline=new Map(records);
    window.rpmCloudImport?.([...records.values()]);
  };
  function disconnect(){if(unsub){unsub();unsub=null}if(timer)clearTimeout(timer);if(retryTimer)clearTimeout(retryTimer);ready=false;canEditCloud=false;initial=false;remote.clear();baseline.clear();queued.clear();inflight.clear();el.upload.hidden=true;el.logged.hidden=true;el.form.hidden=false;}
  function setConnected(email){el.logged.hidden=false;el.form.hidden=true;el.user.textContent='👤 '+email+' · Ruang kerja: '+wid;}
  function displayReady(){if(!navigator.onLine){message('📶 Offline: tersimpan di HP. Data yang tertunda dikirim ketika internet kembali.','warn');return}if(queued.size||inflight.size||busy){message('⏳ Mengirim perubahan ke cloud…','warn');return}message('✅ Cloud aktif · perubahan otomatis terlihat pada semua HP yang login.','ok')}
  function schedule(){if(!canEditCloud||!ready)return;if(timer)clearTimeout(timer);timer=setTimeout(flush,550);displayReady()}
  async function flush(){
    if(!ready||!canEditCloud||busy||!queued.size)return;
    busy=true;const entries=[...queued.entries()].slice(0,350);for(const [k,v] of entries){queued.delete(k);inflight.set(k,v)}
    const batch=writeBatch(db);for(const [id,value] of entries){const ref=doc(db,'workspaces',wid,'records',id);if(value===null)batch.delete(ref);else batch.set(ref,{...value,editedBy:auth.currentUser?.email||'',updatedAt:serverTimestamp()})}
    displayReady();try{await batch.commit();for(const [k] of entries)inflight.delete(k);if(queued.size)schedule();else displayReady()}
    catch(err){for(const [k,v] of entries){inflight.delete(k);if(!queued.has(k))queued.set(k,v)}message('⚠ Belum berhasil kirim data: '+(err.code||err.message||'periksa koneksi')+'. Data lokal tetap tersimpan.','error');clearTimeout(retryTimer);retryTimer=setTimeout(()=>{busy=false;schedule()},6000)}
    finally{busy=false}
  }
  window.addEventListener('online',()=>{if(ready){schedule();displayReady()}});
  window.addEventListener('offline',()=>{if(ready)displayReady()});
  window.addEventListener('rpm:localSaved',e=>{
    if(!ready||!canEditCloud)return;
    const fresh=pack(e.detail||{});
    for(const [k,v] of fresh)if(!same(v,baseline.get(k)))queued.set(k,v);
    for(const k of baseline.keys())if(!fresh.has(k))queued.set(k,null);
    baseline=new Map(fresh);schedule();
  });
  async function start(user){
    disconnect();setConnected(user.email||'Pengguna');message('⏳ Memeriksa akses tim…','warn');
    try{
      const membership=await getDoc(doc(db,'workspaces',wid,'members',user.uid));
      if(!membership.exists()){message('⛔ Akun belum menjadi anggota tim. Admin harus membuat dokumen members/'+user.uid+' di Firestore.','error');return}
      message('⏳ Mengunduh data tim…','warn');
      unsub=onSnapshot(collection(db,'workspaces',wid,'records'),{includeMetadataChanges:true},snap=>{
        // An empty local cache is not authoritative. Wait for the backend's first snapshot.
        if(!initial && snap.metadata.fromCache){message('⏳ Menunggu data terbaru dari server…','warn');return}
        if(!initial){
          initial=true;remote=new Map(snap.docs.map(x=>[x.id,stripMeta(x.data())]));
          ready=true;
          const local=window.rpmCloudExport?.()||{},hasLocal=(local.products?.length||Object.keys(local.sales||{}).length||Object.keys(local.catalog||{}).length);
          if(!remote.size&&hasLocal){
            canEditCloud=false;el.upload.hidden=false;
            message('☁ Cloud masih kosong. Data lokal di HP ini tersedia. Klik “Unggah data lokal ke tim” hanya dari SATU HP untuk memulai.','warn');
          }else{canEditCloud=true;el.upload.hidden=true;receive();displayReady()}
        }else{
          remote=new Map(snap.docs.map(x=>[x.id,stripMeta(x.data())]));
          if(canEditCloud){receive();displayReady()}
        }
      },err=>message('❌ Gagal membaca cloud: '+(err.code||err.message)+'. Periksa Firestore Rules.','error'));
    }catch(err){message('❌ Tidak dapat bergabung: '+(err.code||err.message),'error')}
  }
  function stripMeta(obj){const {updatedAt,editedBy,...rest}=obj||{};return rest}
  el.upload.addEventListener('click',()=>{
    if(!ready||canEditCloud||remote.size)return;
    if(!confirm('Unggah SELURUH master, PLU, target, dan riwayat dari HP ini ke cloud bersama? Pastikan HP lain belum mengunggah data. Lanjutkan?'))return;
    canEditCloud=true;el.upload.hidden=true;
    const current=pack(window.rpmCloudExport?.()||{});for(const [id,v] of current)queued.set(id,v);baseline=new Map(current);schedule();
  });
  el.form.addEventListener('submit',async e=>{
    e.preventDefault();el.loginBtn.disabled=true;message('⏳ Login Firebase…','warn');
    try{await signInWithEmailAndPassword(auth,el.email.value.trim(),el.password.value);el.password.value=''}
    catch(err){message('❌ Login gagal: '+(err.code||err.message),'error')}
    finally{el.loginBtn.disabled=false}
  });
  el.logout.addEventListener('click',async()=>{if(queued.size||inflight.size){alert('Masih ada perubahan yang belum terkirim. Tunggu sampai status Cloud aktif.');return}await signOut(auth)});
  onAuthStateChanged(auth,user=>{if(user)start(user);else{disconnect();message('🔒 Belum login · semua perubahan hanya tersimpan di HP ini.','warn')}});
 }catch(err){message('❌ Modul Firebase tidak dapat dibuka. Periksa koneksi internet / versi SDK: '+err.message,'error');el.loginBtn.disabled=true}
}
