(() => {
  let installPrompt=null;const button=document.getElementById('btn-install-app');
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;button.hidden=false;});
  button.addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;button.hidden=true;});
  window.addEventListener('appinstalled',()=>{button.hidden=true;});
  if('serviceWorker'in navigator){
    window.addEventListener('load',()=>navigator.serviceWorker.register(new URL('sw.js',document.baseURI)).then(reg=>{
      // Force immediate activation of any waiting service worker so the new
      // cache takes effect on this very page load — not the next restart.
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      reg.addEventListener('updatefound',()=>{
        const newSW=reg.installing;
        if(newSW)newSW.addEventListener('statechange',()=>{
          if(newSW.state==='installed'&&navigator.serviceWorker.controller){
            // Send skip-waiting message so the new worker activates immediately
            // and takes control of this page without waiting for a restart.
            newSW.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
      // If a new worker activated and claimed this page, reload once to pick
      // up the fresh cache. Guard against reload loops with sessionStorage.
      if (navigator.serviceWorker.controller && !sessionStorage.getItem('bsu-reloaded')) {
        sessionStorage.setItem('bsu-reloaded', '1');
        setTimeout(() => location.reload(), 500);
      }
    }).catch(error=>console.warn('PWA service worker:',error.message)));
    // Listen for the skip-waiting message from the service worker.
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data && event.data.type === 'RELOAD_FOR_UPDATE') {
        sessionStorage.setItem('bsu-reloaded', '1');
        location.reload();
      }
    });
  }
})();
