(() => {
  let installPrompt=null;const button=document.getElementById('btn-install-app');
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;button.hidden=false;});
  button.addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;button.hidden=false;});
  window.addEventListener('appinstalled',()=>{button.hidden=true;});
  if('serviceWorker'in navigator){
    window.addEventListener('load',()=>navigator.serviceWorker.register(new URL('sw.js',document.baseURI)).then(reg=>{
      // Force immediate activation of any waiting service worker.
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      reg.addEventListener('updatefound',()=>{
        const newSW=reg.installing;
        if(newSW)newSW.addEventListener('statechange',()=>{
          if(newSW.state==='installed'&&navigator.serviceWorker.controller){
            newSW.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
      // Only reload ONCE after a new service worker activates (not on every page load).
      // The game auto-resumes from localStorage, so reload is safe.
      let controllerChanged = false;
      const currentController = navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (currentController && !controllerChanged) {
          controllerChanged = true;
          // Mark that we're reloading for an update so the game can auto-resume
          sessionStorage.setItem('bsu-updated', '1');
          location.reload();
        }
      });
    }).catch(error=>console.warn('PWA service worker:',error.message)));
    // Listen for the skip-waiting message from the service worker.
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data && event.data.type === 'RELOAD_FOR_UPDATE') {
        sessionStorage.setItem('bsu-updated', '1');
        location.reload();
      }
    });
  }
})();
