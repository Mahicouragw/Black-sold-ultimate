(() => {
  let installPrompt=null;const button=document.getElementById('btn-install-app');
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;button.hidden=false;});
  button.addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;button.hidden=false;});
  window.addEventListener('appinstalled',()=>{button.hidden=true;});
  if('serviceWorker'in navigator){
    window.addEventListener('load',()=>navigator.serviceWorker.register(new URL('sw.js',document.baseURI)).then(reg=>{
      // Let the service worker update naturally — no forced SKIP_WAITING or reload.
      // New cached files will be used on next page load/refresh.
      // The game auto-resumes from localStorage, so refreshes are seamless.
      console.log('PWA: service worker registered, cache version active.');
    }).catch(error=>console.warn('PWA service worker:',error.message)));
  }
})();
