(() => {
  let installPrompt=null;const button=document.getElementById('btn-install-app');
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;button.hidden=false;});
  button.addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;button.hidden=true;});
  window.addEventListener('appinstalled',()=>{button.hidden=true;});
  if('serviceWorker'in navigator){
    window.addEventListener('load',()=>navigator.serviceWorker.register(new URL('sw.js',document.baseURI)).then(reg=>{
      reg.addEventListener('updatefound',()=>{
        const newSW=reg.installing;
        if(newSW)newSW.addEventListener('statechange',()=>{
          if(newSW.state==='installed'&&navigator.serviceWorker.controller){
            // Never force-reload an active battle or discard in-memory UI state.
            // The activated worker serves the new cache on the next normal app
            // launch/navigation; localStorage/IndexedDB saves are untouched.
            console.log('New version cached. It will be used on the next normal app restart.');
            const status=document.getElementById('online-status');
            if(status)status.textContent='Game update ready — restart the app when convenient';
            window.dispatchEvent(new CustomEvent('black-sword-update-ready'));
          }
        });
      });
    }).catch(error=>console.warn('PWA service worker:',error.message)));
  }
})();
