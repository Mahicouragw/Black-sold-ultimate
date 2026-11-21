(() => {
  let installPrompt=null;const button=document.getElementById('btn-install-app');
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;button.hidden=false;});
  button.addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;button.hidden=false;});
  window.addEventListener('appinstalled',()=>{button.hidden=true;});
  if('serviceWorker'in navigator){
    const download=document.getElementById('download-soundtrack'), status=document.getElementById('soundtrack-status');
    const check=document.getElementById('check-soundtrack');
    const remove=document.getElementById('remove-soundtrack');
    const available=()=>{remove.hidden=check.hidden=download.hidden=!navigator.serviceWorker.controller;};
    available(); navigator.serviceWorker.addEventListener('controllerchange',available);
    function soundtrack(action){
      const checkOnly=action==='check';
      const worker=navigator.serviceWorker.controller;
      if(!worker)return;
      const channel=new MessageChannel();
      remove.disabled=check.disabled=download.disabled=true; status.textContent=action==='remove'?'Removing downloaded music…':checkOnly?'Checking saved tracks…':'Preparing the offline soundtrack…';
      let timer;
      const stop=()=>{clearTimeout(timer);channel.port1.close();remove.disabled=check.disabled=download.disabled=false;};
      const watch=()=>{clearTimeout(timer);timer=setTimeout(()=>{stop();status.textContent='No response. Check the offline soundtrack again.';},120000);};
      channel.port1.onmessage=({data:{done,saved,total,error}})=>{
        if(error){stop();status.textContent='Could not access soundtrack storage. Try again.';return;}
        if(done){stop();status.textContent=action==='remove'?'No downloaded soundtrack remains. Your offline game and gameplay cues are unchanged.':checkOnly
          ? `${saved} of ${total} tracks saved. ${saved===total?'Soundtrack ready offline.':'Use Download offline soundtrack while online to save missing tracks.'}`
          : saved===total?'Soundtrack ready offline.':`${saved} of ${total} tracks saved. Check your connection and storage, then retry.`;}
        else {watch();status.textContent=`${saved} of ${total} tracks saved.`;}
      };
      watch();
      try {worker.postMessage(`${action}-soundtrack`,[channel.port2]);}
      catch {stop();status.textContent='Offline controls unavailable. Reload the game and try again.';}
    }
    download.onclick=()=>soundtrack('download');
    check.onclick=()=>soundtrack('check');
    remove.onclick=()=>{
      if(window.confirm('Remove the downloaded soundtrack from this device? Your heroes, saves, and offline gameplay sounds will stay.')) soundtrack('remove');
    };
    window.addEventListener('load',()=>navigator.serviceWorker.register(new URL('sw.js',document.baseURI)).then(reg=>{
      // Let the service worker update naturally — no forced SKIP_WAITING or reload.
      // New cached files will be used on next page load/refresh.
      // The game auto-resumes from localStorage, so refreshes are seamless.
      console.log('PWA: service worker registered, cache version active.');
    }).catch(error=>console.warn('PWA service worker:',error.message)));
  }
})();
