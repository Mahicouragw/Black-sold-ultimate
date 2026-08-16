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
            console.log('New version available, updating...');
            window.location.reload();
          }
        });
      });
    }).catch(error=>console.warn('PWA service worker:',error.message)));
  }
})();
